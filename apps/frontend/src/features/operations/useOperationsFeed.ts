// Phase 9b M3-A — operations live feed (data layer).
//
// `useOperationsFeed` is the keystone of the Job Center data layer. It owns
// the single browser-tab `EventSource` against
// `GET /api/v1/operations/events`, applies snapshot / transition / resync
// frames, runs the SSE -> polling fallback ladder, and exposes a stable
// `cancelOperation` callback. Consumers (M3-B `JobCenter` + M3-C `App`) read
// the returned map and treat its key set as the authoritative cross-section
// of "what the backend says about every still-relevant operation".
//
// Wire contract reference: `components/operations/src/sse.rs` +
// `apps/backend/src/http_api.rs::operations_events`. Three named SSE event
// types are emitted:
//   - `snapshot` — initial replay of non-terminal + most-recent-50 terminal
//     rows. No `id:` field on the wire; this hook never advances
//     `lastEventSeq` on snapshot frames.
//   - `transition` — live row update. Carries an `id:` field equal to the
//     monotonic broadcaster `seq`. This hook advances `lastEventSeq`.
//   - `resync` — broadcaster lagged or `Last-Event-ID` fell outside the
//     200-entry ring buffer. The frame's `data:` is a free-form reason
//     STRING (not JSON). This hook drops the local map, re-fetches via
//     `GET /api/v1/operations`, and re-primes from the response.
//
// Dedupe rule: snapshot rows + live transitions can carry the same
// `operation.id`. Last-write-wins by id is correct because the broadcaster
// publishes ONLY after the store commits (M2-B commit-then-publish
// invariant, `apps/backend/src/http_api.rs::operations_events` lines 184–
// 191), so a later live transition always reflects a fresher state than an
// earlier snapshot row.
//
// Reconnect protocol: on `EventSource.onerror`, we close the source, advance
// a backoff ladder (1 s → 2 s → 5 s → 10 s → 30 s, then 30 s for ever), and
// schedule a fresh `new EventSource(url)`. The native `EventSource` API
// does NOT attach `Last-Event-ID` on the `new EventSource(url)` path —
// the header only fires on the *implicit* automatic reconnect (which only
// happens when the previous connection had id'd events AND the browser
// itself decided to retry). Manual reconnects (this hook's backoff ladder)
// therefore pass the last observed seq via the `?last_event_id=<seq>`
// query parameter; the backend accepts header OR query, header wins when
// both are present (see `apps/backend/src/http_api.rs::operations_events`).
//
// Polling fallback: when the 5-step SSE backoff has fully elapsed (all
// five ladder slots have fired and failed; we're now scheduling the 6th
// retry — cumulative SSE outage ~48 s), we additionally start a 5 s
// `setInterval` polling `listOperations({ limit: 50 })`. The SSE retry
// loop keeps trying every 30 s in parallel. On the first successful SSE
// event (snapshot or transition) we tear the interval down and reset the
// backoff.
//
// React StrictMode safety: the lifecycle effect closes the EventSource +
// clears the timers on cleanup, so the dev-mode double-mount does not
// leak parallel connections.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  apiOperationsEventsUrl,
  cancelOperation as apiCancelOperation,
  listOperations,
} from "../../lib/api";
import type {
  Operation,
  OperationTransitionEvent,
} from "../../lib/contracts";

export type FeedStatus =
  | "connecting"
  | "streaming"
  | "polling"
  | "reconnecting";

export interface UseOperationsFeedReturn {
  operations: Record<string, Operation>;
  status: FeedStatus;
  lastEventSeq: number | null;
  cancelOperation: (id: string) => Promise<void>;
}

// SSE reconnect backoff in milliseconds. Order matches the Phase 9b spec
// §"Client side": 1 s → 2 s → 5 s → 10 s → 30 s. After reaching the
// terminal 30 s slot (`index >= BACKOFF_LADDER.length - 1`), every
// subsequent reconnect uses 30 s.
const BACKOFF_LADDER_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

// Polling fallback cadence — the spec pins 5 s for the secondary loop. The
// SSE retry loop keeps running at 30 s in parallel.
const POLL_FALLBACK_INTERVAL_MS = 5_000;

// Maximum number of recent operations the snapshot replay carries. Used as
// the `limit` for the polling-fallback `listOperations` call so the local
// map size stays bounded under sustained SSE outage.
const FALLBACK_LIST_LIMIT = 50;

// Number of consecutive SSE failures after which the steady 30 s retry
// loop has fully engaged and the polling fallback activates. Matches the
// spec §"Client side": the ladder is 5 slots (1, 2, 5, 10, 30 s); polling
// engages when we are scheduling the NEXT retry past the final slot — i.e.
// after the 30 s slot has fired and failed (cumulative SSE outage ~48 s).
const POLLING_ACTIVATION_THRESHOLD = BACKOFF_LADDER_MS.length;

function backoffDelayMs(failureIndex: number): number {
  const clamped = Math.min(failureIndex, BACKOFF_LADDER_MS.length - 1);
  return BACKOFF_LADDER_MS[clamped];
}

/**
 * Build the SSE URL for `new EventSource(...)`. When `lastEventSeq` is
 * non-null, append `?last_event_id=<seq>` so the backend can resume from
 * the broadcaster's ring buffer — the native EventSource API does NOT
 * forward `Last-Event-ID` on the `new EventSource(url)` path; the manual
 * reconnect ladder owns the resume protocol via this query parameter.
 *
 * The first connect (lastEventSeq === null) passes no query param, which
 * also matches the snapshot-only flow expected on a cold mount.
 */
function buildSseUrl(lastEventSeq: number | null): string {
  const base = apiOperationsEventsUrl();
  if (lastEventSeq === null) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}last_event_id=${lastEventSeq}`;
}

function buildOperationsMap(
  operations: readonly Operation[],
): Record<string, Operation> {
  const next: Record<string, Operation> = {};
  for (const op of operations) {
    next[op.id] = op;
  }
  return next;
}

/**
 * Subscribe the current React component tree to the operations live feed.
 *
 * Returns a stable view of:
 *   - `operations`  — map keyed by `operation.id`. Snapshot rows + live
 *                     transitions both write into the same map; the last
 *                     write wins (see commit-then-publish invariant above).
 *   - `status`      — feed state machine. Visible-UI consumers in 9b do not
 *                     surface this; reserved for Phase 10+ design.
 *   - `lastEventSeq` — monotonic broadcaster seq from the most recent
 *                     `transition` frame. Stays `null` while only snapshot
 *                     frames have arrived.
 *   - `cancelOperation(id)` — stable callback wrapping the existing
 *                     `DELETE /api/v1/operations/:id` API. Swallows 409
 *                     errors because the SSE channel emits the authoritative
 *                     terminal transition on the next frame; re-throws every
 *                     other error so consumers can surface it.
 */
export function useOperationsFeed(): UseOperationsFeedReturn {
  const [operations, setOperations] = useState<Record<string, Operation>>({});
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [lastEventSeq, setLastEventSeq] = useState<number | null>(null);

  // Mutable lifecycle state. Refs (not state) so updates inside listener
  // callbacks neither trigger re-renders nor capture stale closures.
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackAbortRef = useRef<AbortController | null>(null);
  const resyncAbortRef = useRef<AbortController | null>(null);
  const failureCountRef = useRef(0);
  const mountedRef = useRef(true);
  // Mirror of `lastEventSeq` state for read-time access inside the
  // EventSource constructor on manual reconnect (codex review fix #1).
  // The state setter feeds this ref synchronously alongside React's
  // commit so the resume URL always reflects the highest seq observed.
  const lastEventSeqRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (fallbackAbortRef.current !== null) {
      fallbackAbortRef.current.abort();
      fallbackAbortRef.current = null;
    }
  }, []);

  const cancelReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const cancelResyncFetch = useCallback(() => {
    if (resyncAbortRef.current !== null) {
      resyncAbortRef.current.abort();
      resyncAbortRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current !== null) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const startPollingLoop = useCallback(() => {
    if (pollIntervalRef.current !== null) return;
    const tick = async () => {
      if (!mountedRef.current) return;
      fallbackAbortRef.current?.abort();
      const controller = new AbortController();
      fallbackAbortRef.current = controller;
      try {
        const response = await listOperations(
          { limit: FALLBACK_LIST_LIMIT },
          controller.signal,
        );
        if (!mountedRef.current) return;
        setOperations(buildOperationsMap(response.operations));
      } catch (error) {
        // Swallow aborts (intentional teardown) and surface nothing else to
        // the UI in 9b — the polling loop will retry on the next tick.
        if ((error as DOMException)?.name === "AbortError") return;
      } finally {
        if (fallbackAbortRef.current === controller) {
          fallbackAbortRef.current = null;
        }
      }
    };
    // Kick off the first tick immediately so the user sees fresh rows
    // without waiting a full 5 s for the interval to fire.
    void tick();
    pollIntervalRef.current = setInterval(() => {
      void tick();
    }, POLL_FALLBACK_INTERVAL_MS);
  }, []);

  // Forward-declare via ref so connect() and handleError() can call each
  // other without TDZ headaches.
  const connectRef = useRef<() => void>(() => {});

  const handleSnapshotFrame = useCallback(() => {
    // A snapshot frame is a "sign of life" — it proves the EventSource is
    // up. We reset the backoff ladder + tear down any polling loop so the
    // next outage starts fresh, and flip status to `streaming`.
    //
    // Status semantics (codex review fix #2): `connecting` means "no data
    // received yet". Once ANY frame (snapshot OR transition) arrives we
    // ARE streaming. On a quiet system with only snapshot frames and no
    // live transitions, the old preserve-`connecting` behavior left the
    // hook stuck reporting `connecting` forever even though the stream
    // was working correctly.
    failureCountRef.current = 0;
    stopPolling();
    setStatus("streaming");
  }, [stopPolling]);

  const handleTransitionFrame = useCallback(() => {
    // Any transition frame proves the live tail is open. Reset backoff,
    // stop polling, and unconditionally flip the status to "streaming" —
    // see brief: "Status becomes 'streaming' if it was 'connecting' or
    // 'reconnecting'".
    failureCountRef.current = 0;
    stopPolling();
    setStatus("streaming");
  }, [stopPolling]);

  const handleResync = useCallback(async () => {
    cancelResyncFetch();
    const controller = new AbortController();
    resyncAbortRef.current = controller;
    setOperations({});
    setLastEventSeq(null);
    lastEventSeqRef.current = null;
    try {
      const response = await listOperations(
        { limit: FALLBACK_LIST_LIMIT },
        controller.signal,
      );
      if (!mountedRef.current) return;
      setOperations(buildOperationsMap(response.operations));
      setStatus("streaming");
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      // If the resync fetch failed, defer to the EventSource's own reconnect
      // path. The next snapshot frame will re-seed the map.
    } finally {
      if (resyncAbortRef.current === controller) {
        resyncAbortRef.current = null;
      }
    }
  }, [cancelResyncFetch]);

  const handleError = useCallback(() => {
    closeEventSource();
    const failureIndex = failureCountRef.current;
    failureCountRef.current = failureIndex + 1;
    const delay = backoffDelayMs(failureIndex);

    // Activate polling fallback only AFTER the full backoff ladder has
    // been exhausted (codex review fix #3). The ladder has 5 slots
    // (1, 2, 5, 10, 30 s). `failureIndex` is the 0-indexed slot we are
    // about to schedule: 0..=4 are ladder slots; once it reaches
    // `BACKOFF_LADDER_MS.length` (5) we are scheduling the 6th retry —
    // which means the 5th attempt (the 30 s slot) has already FIRED and
    // FAILED. Only at that point do we engage the polling loop; the
    // cumulative SSE outage at this moment is ~48 s, matching the spec's
    // "polling fallback engages after the 30 s slot has elapsed without
    // success".
    if (
      failureIndex >= POLLING_ACTIVATION_THRESHOLD &&
      pollIntervalRef.current === null
    ) {
      setStatus("polling");
      startPollingLoop();
    } else if (pollIntervalRef.current === null) {
      setStatus("reconnecting");
    }
    // If polling is already active, leave `status === "polling"` until the
    // next successful SSE event flips it back to "streaming".

    cancelReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!mountedRef.current) return;
      connectRef.current();
    }, delay);
  }, [
    cancelReconnectTimer,
    closeEventSource,
    startPollingLoop,
  ]);

  const connect = useCallback(() => {
    closeEventSource();
    // On manual reconnects we pass the last observed seq via the
    // `?last_event_id=<seq>` query param so the backend can resume from
    // the broadcaster's ring buffer (codex review fix #1). On the first
    // connect, `lastEventSeqRef.current` is null and no query is appended.
    const source = new EventSource(buildSseUrl(lastEventSeqRef.current));
    eventSourceRef.current = source;

    // Named events only — `EventSource.onmessage` handles unnamed events,
    // and the M2 wire emits THREE named types. Skipping the `addEventListener`
    // registration would silently drop every frame.
    source.addEventListener("snapshot", (event) => {
      if (!mountedRef.current) return;
      const messageEvent = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(messageEvent.data) as OperationTransitionEvent;
        setOperations((prev) => ({ ...prev, [payload.operation.id]: payload.operation }));
        handleSnapshotFrame();
      } catch {
        // A malformed snapshot frame is non-fatal. Keep the connection up;
        // the backlog/live tail will provide canonical state.
      }
    });

    source.addEventListener("transition", (event) => {
      if (!mountedRef.current) return;
      const messageEvent = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(messageEvent.data) as OperationTransitionEvent;
        setOperations((prev) => ({ ...prev, [payload.operation.id]: payload.operation }));
        setLastEventSeq((prev) => {
          if (prev === null) return payload.seq;
          return payload.seq > prev ? payload.seq : prev;
        });
        // Mirror to the ref so a subsequent manual reconnect can build
        // the resume URL synchronously (codex review fix #1). The ref
        // tracks the same monotonic max the state tracks.
        const prevRef = lastEventSeqRef.current;
        if (prevRef === null || payload.seq > prevRef) {
          lastEventSeqRef.current = payload.seq;
        }
        handleTransitionFrame();
      } catch {
        // See snapshot handler. A malformed transition frame is non-fatal.
      }
    });

    source.addEventListener("resync", () => {
      if (!mountedRef.current) return;
      // `data:` on resync is a free-form reason STRING, not JSON. We don't
      // surface it in 9b; the action is what matters.
      void handleResync();
    });

    source.onerror = () => {
      if (!mountedRef.current) return;
      handleError();
    };
  }, [
    closeEventSource,
    handleError,
    handleResync,
    handleSnapshotFrame,
    handleTransitionFrame,
  ]);

  // Keep the connect ref pointed at the latest closure so `handleError`'s
  // setTimeout can invoke a non-stale connect on reconnect.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    setStatus("connecting");
    connect();

    return () => {
      mountedRef.current = false;
      cancelReconnectTimer();
      stopPolling();
      cancelResyncFetch();
      closeEventSource();
    };
    // Intentionally empty dep array: the hook owns a single, long-lived
    // connection; React StrictMode's double-mount in dev tears the first
    // EventSource down via the cleanup return value above. Re-running on
    // every `connect` identity change would churn the live channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelOperation = useCallback(async (id: string): Promise<void> => {
    try {
      await apiCancelOperation(id);
    } catch (error) {
      // 409 means the worker won the race and the row is already terminal.
      // The SSE channel emits the authoritative state change on the next
      // transition frame, so swallowing is correct per Phase 9b §Risks
      // row 5 + checklist item 38. Any other failure (network, 5xx, etc.)
      // is the consumer's problem and must bubble.
      if (error instanceof ApiError && error.status === 409) return;
      throw error;
    }
  }, []);

  return { operations, status, lastEventSeq, cancelOperation };
}
