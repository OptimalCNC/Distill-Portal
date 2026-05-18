// Unit tests for `useOperationsFeed` — the Phase 9b M3-A data-layer
// keystone. The strategy is to stub `EventSource` and `fetch` so the test
// driver can synchronously trigger every state-machine path:
//
//   - snapshot frame populates the map without advancing `lastEventSeq`.
//   - transition frame merges by id + advances `lastEventSeq` monotonically.
//   - resync frame clears the map, re-fetches via `listOperations`, and
//     re-seeds.
//   - EventSource `onerror` advances the backoff ladder and schedules a
//     reconnect; after 5 consecutive failures the polling fallback engages
//     (`listOperations` on a 5 s interval, status flips to "polling").
//   - On the first successful SSE event after a polling window, the
//     interval tears down, backoff resets, status returns to "streaming".
//   - Unmount closes the EventSource, clears reconnect + poll timers, and
//     aborts any in-flight fetch.
//   - `cancelOperation` swallows 409 errors; other errors bubble.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "../../lib/api";
import type { Operation } from "../../lib/contracts";
import { useOperationsFeed } from "./useOperationsFeed";

type Listener = (event: MessageEvent<string> | Event) => void;

interface MockEventSource {
  url: string;
  withCredentials: boolean;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
  close: () => void;
  // Test-side helpers (not part of the real EventSource shape).
  __dispatch: (type: string, data: string) => void;
  __triggerError: () => void;
  __closed: boolean;
}

const eventSources: MockEventSource[] = [];

function installEventSourceMock(): void {
  eventSources.length = 0;
  const ctor = function (url: string): MockEventSource {
    const listeners = new Map<string, Set<Listener>>();
    const instance: MockEventSource = {
      url,
      withCredentials: false,
      readyState: 0,
      onopen: null,
      onmessage: null,
      onerror: null,
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener);
      },
      close() {
        instance.__closed = true;
        instance.readyState = 2;
      },
      __dispatch(type, data) {
        const event = new MessageEvent(type, { data });
        const bucket = listeners.get(type);
        if (bucket) {
          for (const listener of bucket) listener(event);
        }
        if (type === "message" && instance.onmessage) {
          instance.onmessage(event);
        }
      },
      __triggerError() {
        if (instance.onerror) instance.onerror(new Event("error"));
      },
      __closed: false,
    };
    eventSources.push(instance);
    return instance;
  };
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    ctor as unknown;
}

function latestEventSource(): MockEventSource {
  const last = eventSources[eventSources.length - 1];
  if (!last) throw new Error("no EventSource instances created");
  return last;
}

function makeOperation(overrides: Partial<Operation>): Operation {
  return {
    id: "op-1",
    kind: "import_sessions",
    status: "queued",
    canonical_params_hash: "hash",
    input_version: "input",
    params_json: {},
    result_json: null,
    error_json: null,
    submitted_at: "2026-04-22T00:00:00Z",
    started_at: null,
    finished_at: null,
    cancel_requested_at: null,
    ...overrides,
  };
}

const originalEventSource = (globalThis as { EventSource?: unknown }).EventSource;
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

interface ScheduledTimer {
  id: number;
  fn: () => void;
  delay: number;
  kind: "timeout" | "interval";
  active: boolean;
}

let timerCounter = 1;
let scheduled: ScheduledTimer[] = [];

function installFakeTimers(): void {
  timerCounter = 1;
  scheduled = [];
  (globalThis as unknown as { setTimeout: unknown }).setTimeout = ((
    fn: () => void,
    delay = 0,
  ) => {
    const id = timerCounter++;
    scheduled.push({ id, fn, delay, kind: "timeout", active: true });
    return id;
  }) as unknown;
  (globalThis as unknown as { clearTimeout: unknown }).clearTimeout = ((
    id: number,
  ) => {
    const entry = scheduled.find((t) => t.id === id);
    if (entry) entry.active = false;
  }) as unknown;
  (globalThis as unknown as { setInterval: unknown }).setInterval = ((
    fn: () => void,
    delay = 0,
  ) => {
    const id = timerCounter++;
    scheduled.push({ id, fn, delay, kind: "interval", active: true });
    return id;
  }) as unknown;
  (globalThis as unknown as { clearInterval: unknown }).clearInterval = ((
    id: number,
  ) => {
    const entry = scheduled.find((t) => t.id === id);
    if (entry) entry.active = false;
  }) as unknown;
}

function restoreTimers(): void {
  (globalThis as unknown as { setTimeout: unknown }).setTimeout =
    originalSetTimeout;
  (globalThis as unknown as { clearTimeout: unknown }).clearTimeout =
    originalClearTimeout;
  (globalThis as unknown as { setInterval: unknown }).setInterval =
    originalSetInterval;
  (globalThis as unknown as { clearInterval: unknown }).clearInterval =
    originalClearInterval;
}

function findPendingTimeout(): ScheduledTimer | undefined {
  return scheduled
    .filter((t) => t.active && t.kind === "timeout")
    .at(-1);
}

function findPendingInterval(): ScheduledTimer | undefined {
  return scheduled.find((t) => t.active && t.kind === "interval");
}

function fireTimeout(): void {
  const entry = findPendingTimeout();
  if (!entry) throw new Error("no pending timeout to fire");
  entry.active = false;
  entry.fn();
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  installEventSourceMock();
});

afterEach(() => {
  cleanup();
  mock.restore();
  globalThis.fetch = originalFetch;
  if (originalEventSource === undefined) {
    delete (globalThis as { EventSource?: unknown }).EventSource;
  } else {
    (globalThis as { EventSource?: unknown }).EventSource = originalEventSource;
  }
  restoreTimers();
});

describe("snapshot + transition + resync handling", () => {
  test("snapshot frames populate the map and flip status to streaming", async () => {
    const { result } = renderHook(() => useOperationsFeed());

    expect(result.current.status).toBe("connecting");
    expect(result.current.lastEventSeq).toBeNull();

    const source = latestEventSource();
    act(() => {
      source.__dispatch(
        "snapshot",
        JSON.stringify({ operation: makeOperation({ id: "op-A" }), seq: 7 }),
      );
    });

    await waitFor(() => {
      expect(result.current.operations["op-A"]?.id).toBe("op-A");
    });
    expect(result.current.lastEventSeq).toBeNull();
    // Codex review fix #2: `connecting` means "no data received yet". Any
    // frame (snapshot or transition) flips status to `streaming`. The
    // previous "preserve connecting until first transition" semantics
    // left the hook stuck on quiet systems that only emit snapshot rows.
    expect(result.current.status).toBe("streaming");
  });

  test("transition frames merge by id and advance lastEventSeq monotonically", async () => {
    const { result } = renderHook(() => useOperationsFeed());
    const source = latestEventSource();

    act(() => {
      source.__dispatch(
        "snapshot",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "queued" }),
          seq: 1,
        }),
      );
      source.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "running" }),
          seq: 12,
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.operations["op-A"]?.status).toBe("running");
    });
    expect(result.current.lastEventSeq).toBe(12);

    // Out-of-order older seq must NOT regress lastEventSeq.
    act(() => {
      source.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "succeeded" }),
          seq: 3,
        }),
      );
    });
    expect(result.current.lastEventSeq).toBe(12);
    expect(result.current.operations["op-A"]?.status).toBe("succeeded");
  });

  test("resync clears the map, re-fetches, and reseeds with listOperations", async () => {
    const fetchMock = mock(async () =>
      jsonResponse({
        operations: [makeOperation({ id: "op-Z", status: "succeeded" })],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());
    const source = latestEventSource();

    act(() => {
      source.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "running" }),
          seq: 5,
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastEventSeq).toBe(5);
    });

    act(() => {
      source.__dispatch("resync", "subscriber lagged; please re-fetch");
    });

    await waitFor(() => {
      expect(result.current.operations["op-Z"]?.id).toBe("op-Z");
    });
    expect(result.current.lastEventSeq).toBeNull();
    expect(result.current.operations["op-A"]).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("backoff + polling fallback", () => {
  test("an EventSource error closes the source and schedules a reconnect", () => {
    installFakeTimers();
    const { result } = renderHook(() => useOperationsFeed());
    const firstSource = latestEventSource();

    act(() => {
      firstSource.__triggerError();
    });

    expect(firstSource.__closed).toBe(true);
    const pending = findPendingTimeout();
    expect(pending?.delay).toBe(1_000);
    expect(result.current.status).toBe("reconnecting");

    act(() => {
      fireTimeout();
    });
    expect(eventSources).toHaveLength(2);
  });

  test("first connect carries no last_event_id query param", () => {
    // Codex review fix #1: when `lastEventSeqRef` is null (cold mount),
    // the EventSource URL has no `?last_event_id=` query.
    renderHook(() => useOperationsFeed());
    const source = latestEventSource();
    expect(source.url).not.toContain("last_event_id=");
  });

  test("manual reconnect after a seq'd transition includes last_event_id query param", () => {
    // Codex review fix #1: native `EventSource` does not auto-attach
    // `Last-Event-ID` on `new EventSource(url)`. The manual reconnect
    // path must therefore carry the last observed seq via the
    // `?last_event_id=<seq>` query so the backend resumes from the ring
    // buffer.
    installFakeTimers();
    renderHook(() => useOperationsFeed());
    const firstSource = latestEventSource();

    act(() => {
      firstSource.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "running" }),
          seq: 42,
        }),
      );
    });

    act(() => {
      firstSource.__triggerError();
    });
    act(() => {
      fireTimeout();
    });

    expect(eventSources).toHaveLength(2);
    const secondSource = eventSources[1]!;
    expect(secondSource.url).toContain("last_event_id=42");
  });

  test("polling fallback activates only after the full 5-step ladder has elapsed", async () => {
    installFakeTimers();
    const fetchMock = mock(async () =>
      jsonResponse({ operations: [makeOperation({ id: "op-P" })] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());

    // Cycle through ALL 5 ladder slots. On each iteration: trigger an
    // error → assert the scheduled backoff delay → fire the timeout. After
    // these 5 iterations, the 30 s slot has fired and the 6th reconnect
    // attempt is live but has not failed yet, so polling is NOT engaged
    // yet (status is still `reconnecting`, no interval scheduled). Codex
    // review fix #3: the engagement is gated on the 30 s slot having
    // ELAPSED without success — i.e. the SSE outage is cumulative ~48 s
    // (1+2+5+10+30) before polling kicks in.
    const expectedDelays = [1_000, 2_000, 5_000, 10_000, 30_000];
    for (let failure = 0; failure < expectedDelays.length; failure++) {
      const source = latestEventSource();
      act(() => {
        source.__triggerError();
      });
      const pending = findPendingTimeout();
      expect(pending?.delay).toBe(expectedDelays[failure]);
      // Polling must NOT engage until the FULL ladder has elapsed: even
      // on the 30 s scheduling step (failure index 4), there's no
      // interval yet.
      expect(findPendingInterval()).toBeUndefined();
      expect(result.current.status).toBe("reconnecting");
      act(() => {
        fireTimeout();
      });
    }

    // Now the 30 s slot has fired and the 6th EventSource is live but
    // has not yet succeeded or failed. Polling still NOT engaged.
    expect(result.current.status).toBe("reconnecting");
    expect(findPendingInterval()).toBeUndefined();

    // The 6th EventSource fails: this is the moment polling engages.
    const sixthSource = latestEventSource();
    act(() => {
      sixthSource.__triggerError();
    });

    expect(result.current.status).toBe("polling");
    const interval = findPendingInterval();
    expect(interval?.delay).toBe(5_000);
    // SSE retry continues every 30 s alongside polling.
    expect(findPendingTimeout()?.delay).toBe(30_000);

    await act(async () => {
      await flushPromises();
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.operations["op-P"]?.id).toBe("op-P");
  });

  test("the first SSE event after polling resets backoff and stops the interval", async () => {
    installFakeTimers();
    const fetchMock = mock(async () =>
      jsonResponse({ operations: [makeOperation({ id: "op-P" })] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());
    // Walk the 5-step ladder (fix #3): 5 errors + 5 fired timeouts gets us
    // to a 6th live EventSource. Polling has NOT engaged yet.
    for (let i = 0; i < 5; i++) {
      const source = latestEventSource();
      act(() => {
        source.__triggerError();
      });
      act(() => {
        fireTimeout();
      });
    }
    expect(findPendingInterval()).toBeUndefined();
    // The 6th EventSource also errors — now polling engages.
    const sixthSource = latestEventSource();
    act(() => {
      sixthSource.__triggerError();
    });
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.status).toBe("polling");
    const interval = findPendingInterval();
    expect(interval).toBeDefined();

    // Fire the 30 s SSE retry timer to construct the 7th EventSource,
    // which will receive the recovering live event.
    act(() => {
      fireTimeout();
    });

    const liveSource = latestEventSource();
    act(() => {
      liveSource.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "running" }),
          seq: 99,
        }),
      );
    });

    expect(result.current.status).toBe("streaming");
    expect(interval?.active).toBe(false);
  });
});

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("unmount cleanup", () => {
  test("closes the EventSource and clears scheduled timers on unmount", () => {
    installFakeTimers();
    const { unmount } = renderHook(() => useOperationsFeed());
    const source = latestEventSource();

    act(() => {
      source.__triggerError();
    });
    const pendingBefore = findPendingTimeout();
    expect(pendingBefore?.active).toBe(true);

    unmount();
    expect(source.__closed).toBe(true);
    expect(pendingBefore?.active).toBe(false);
  });
});

describe("cancelOperation", () => {
  test("swallows ApiError(409) silently", async () => {
    const fetchMock = mock(
      async () =>
        new Response("conflict", {
          status: 409,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());
    await act(async () => {
      await expect(result.current.cancelOperation("op-1")).resolves.toBeUndefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("rethrows non-409 ApiErrors so callers can surface them", async () => {
    const fetchMock = mock(
      async () =>
        new Response("nope", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());
    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.cancelOperation("op-1");
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(500);
  });
});
