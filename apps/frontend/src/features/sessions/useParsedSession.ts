// React hook that drives the per-session parser pipeline (M3b).
//
// `useParsedSession` ties the streaming consumer (`streamRawText`) to
// the per-tool parsers (`dispatchParser`, M3a) so the Skim and
// Transcript tabs can render typed messages without each owning their
// own fetch + parse + cache machinery.
//
// Architecture: the hook is the I/O front-end; the cache + epoch +
// in-flight coalescing all live in module-scoped state co-located in
// THIS file (per Q5 in the M3b plan — separating the cache into a
// sibling `_cacheState.ts` module would expand the public surface for
// no testability win and force consumers to import from two places).
//
// Cache shape (per `working/phase-5.md` lines 458-491):
//   - `cache: Map<string, ParsedSession>` keyed by `${storedSessionUid}::${tool}`.
//   - `inFlight: Map<string, Promise<ParsedSession>>` keyed identically.
//   - `inFlightControllers: Map<string, AbortController>` so a hard cache
//     reset can abort every pending fetch.
//   - `cacheEpoch: number` incremented on Rescan-success and Import-success
//     (App.tsx calls `bumpCacheEpoch()`); each in-flight fetch captures
//     `epochAtStart = cacheEpoch` and drops its result on resolve when
//     the epoch advanced mid-flight.
//   - LRU cap: `USE_PARSED_SESSION_CACHE_MAX = 5` most-recently-used
//     entries. Insertion-order Map → `delete(key); set(key, value)` on
//     hit moves to most-recent; `cache.keys().next().value` is the oldest.
//
// Order of operations (per spec lines 471-476):
//   1. row === null → state "idle". Skip everything.
//   2. row.storedSessionUid === null → state "no_raw". Skip fetch.
//   3. cache hit → bump LRU recency; return "success" / "truncated"
//      synchronously (this is the cache-hit-on-tab-switch path).
//   4. inFlight hit → return "loading"; the existing Promise resolves
//      both the original consumer and this one (in-flight coalescing).
//   5. Otherwise → start fresh fetch + parse, register in inFlight,
//      return "loading".
//
// Critical correctness items (each maps to a codex-blind-spot precedent):
//   - **Synchronous cache hit on first render**: `deriveInitialState`
//     reads the cache directly so a tab switch that re-mounts the hook
//     against a cached row returns "success" synchronously (NOT
//     "loading → success" via useEffect).
//   - **Per-hook-instance AbortController**: each consumer's effect
//     creates its own controller. The `inFlightControllers` map
//     captures the originator's controller so a hard cache reset can
//     abort the pending fetch even when the originator has unmounted.
//   - **Map insertion-order LRU**: `delete(key); set(key, value)` on
//     hit moves the entry to most-recent; eviction reads
//     `cache.keys().next().value` for the oldest.
//   - **Eviction loop uses `while`, not `if`**: defensive — a future
//     change that bumps multiple entries at once won't violate the cap.
//   - **Epoch race semantics**: gate the cache write AND the state
//     transition. If `bumpCacheEpoch()` lands mid-fetch, the controller
//     is already aborted (because `bumpCacheEpoch` aborts every in-flight
//     controller), so the resolution most often arrives via
//     `.catch(isAbortError)` (silent). The defensive
//     `cacheEpoch !== epochAtStart` check in `.then` covers the narrow
//     race where the abort hadn't propagated yet.
//   - **inFlight cleanup is gated on Map identity match**: prevents a
//     stale closure from deleting a fresh inFlight entry.
//
// @see working/phase-5.md:422-491 (useParsedSession hook)
// @see working/phase-5.md:1007-1025 (M3 DoD)
// @see working/phase-5.md:1110-1111 (Test obligations)
// @see working/phase-5.md:1158 (Resolved Decision #13: LRU + epoch)

import { useCallback, useEffect, useState } from "react";
import { dispatchParser } from "./parsers";
import type { ParsedSession } from "./parsers";
import { streamRawText } from "./streamRawText";
import type { SessionRow } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Discriminated state machine returned from `useParsedSession`.
 *
 * Spec lines 425-431:
 * - `idle`: row === null — caller has not selected anything.
 * - `no_raw`: row.storedSessionUid === null — source-only row, must be
 *   imported before raw bytes exist.
 * - `loading`: cache miss; fetch in flight (or inFlight-coalesced).
 * - `success`: parsed payload ready; not truncated.
 * - `truncated`: parsed payload ready; the streaming consumer hit the
 *   5 MB cap (parsed.truncated === true).
 * - `error`: network error or parse failure (parsers themselves are
 *   total — only an `ApiError` from `streamSessionRaw` reaches this
 *   branch in practice).
 */
export type UseParsedSessionState =
  | { state: "idle" }
  | { state: "no_raw"; reason: "source_only" }
  | { state: "loading" }
  | { state: "success"; parsed: ParsedSession }
  | { state: "truncated"; parsed: ParsedSession }
  | { state: "error"; error: Error };

/**
 * What the hook returns. `retry` is always present (no-op except in
 * the error state) so consumers can wire it to a button without
 * conditional rendering. Spec lines 433-435.
 */
export type UseParsedSessionResult = UseParsedSessionState & {
  /** Callable in the "error" state to re-trigger the fetch (skips cache; uses the same row). No-op in other states. */
  retry: () => void;
};

// ---------------------------------------------------------------------------
// Module-scoped cache state
// ---------------------------------------------------------------------------

/**
 * Cap on the resolved `cache`. Spec lines 462 + 1145-1146 + Resolved
 * Decision #13 (line 1158). The cap is exported so future configuration
 * phases can tune it without editing the hook.
 */
export const USE_PARSED_SESSION_CACHE_MAX = 5;

/**
 * Resolved-payload cache. JavaScript `Map` preserves insertion order, so
 * we implement LRU by re-setting on every read (move to most-recent)
 * and evicting `keys().next().value` (the oldest). Module-scoped so it
 * survives component unmount + remount.
 */
const cache = new Map<string, ParsedSession>();

/**
 * In-flight fetch coalescing. When a fetch for a given key is already
 * pending, a second invocation awaits the SAME Promise instead of
 * starting a duplicate fetch. Spec line 461.
 */
const inFlight = new Map<string, Promise<ParsedSession>>();

/**
 * Per-key AbortController so a hard cache reset (bumpCacheEpoch) can
 * abort every in-flight fetch promptly. The originator hook instance
 * owns its controller; coalesced sibling consumers do NOT register a
 * new controller (per Q3 in the M3b plan — accepted trade-off).
 */
const inFlightControllers = new Map<string, AbortController>();

/**
 * Cache epoch. Incremented on Rescan-success and Import-success (App.tsx
 * calls `bumpCacheEpoch()`). Each in-flight fetch captures
 * `epochAtStart = cacheEpoch` at dispatch and drops its result on
 * resolve if the epoch advanced. Spec lines 464-468.
 */
let cacheEpoch = 0;

/**
 * Increment `cacheEpoch`, abort + clear all in-flight fetches, and
 * clear the resolved cache.
 *
 * Called by `App.tsx` from the Rescan-success and Import-success
 * branches BEFORE `await refetchAll()`. Spec lines 465-466 + 468:
 * "Hard reset: clear-all `cache` AND `inFlight` AND increment
 * `cacheEpoch` on Rescan and on Import success."
 *
 * Order matters: bump epoch first so any concurrent `.then` that
 * happens to resolve before the abort propagates also drops its
 * result via the `cacheEpoch !== epochAtStart` gate.
 *
 * @see working/phase-5.md:464-468
 */
export function bumpCacheEpoch(): void {
  cacheEpoch += 1;
  cache.clear();
  for (const ctrl of inFlightControllers.values()) {
    ctrl.abort();
  }
  inFlightControllers.clear();
  inFlight.clear();
}

/**
 * Test-only helper. Co-located with the cache state per the M3a
 * `buildSkim` precedent (constants + helpers in the same file as the
 * consumer). Tests call this in `beforeEach` to start with empty
 * cache + epoch 0.
 *
 * The underscore prefix marks this as test-internal — production code
 * MUST NOT call it (cache invariants assume only `bumpCacheEpoch` and
 * the hook itself mutate cache state).
 */
export function _resetForTests(): void {
  cache.clear();
  inFlight.clear();
  inFlightControllers.clear();
  cacheEpoch = 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cache key shape: `${storedSessionUid}::${tool}`. Per spec line 460.
 * Source-only rows (storedSessionUid === null) never reach this helper
 * — the hook's order-of-operations check at step 2 returns `no_raw`
 * before any cache lookup.
 */
function makeKey(storedSessionUid: string, tool: SessionRow["tool"]): string {
  return `${storedSessionUid}::${tool}`;
}

/**
 * AbortError shape detector. The hook's `.catch` filters AbortError
 * silently (no transition to `state: "error"`) — unmount, row change,
 * and hard-reset abort all funnel through this branch. Spec line 484.
 */
function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Compute the initial state for `useState`. Reads cache directly so a
 * tab switch that re-mounts against a cached row renders "success"
 * synchronously (NOT "loading → success" via useEffect). This is the
 * cache-hit-on-tab-switch path (DoD line 1022).
 *
 * `useState` initializers MUST NOT dispatch fetches — for the
 * cache-miss path we return `loading` and let the `useEffect` drive
 * the actual fetch.
 */
function deriveInitialState(row: SessionRow | null): UseParsedSessionState {
  if (row === null) return { state: "idle" };
  if (row.storedSessionUid === null) {
    return { state: "no_raw", reason: "source_only" };
  }
  const key = makeKey(row.storedSessionUid, row.tool);
  const hit = cache.get(key);
  if (hit !== undefined) {
    // LRU recency bump on read.
    cache.delete(key);
    cache.set(key, hit);
    return hit.truncated
      ? { state: "truncated", parsed: hit }
      : { state: "success", parsed: hit };
  }
  // Cache miss — useEffect handles the fetch.
  return { state: "loading" };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Drive parsing of a session's raw NDJSON.
 *
 * Spec line 438: `useParsedSession(row: SessionRow | null)`.
 *
 * Skim and Transcript tabs invoke this hook (they need parsed data).
 * Raw and Metadata tabs do NOT — Raw uses its own 256 KB consumer in
 * `rawPreview.ts`; Metadata reads only the SessionRow already in
 * App state (Resolved Decision #18, spec line 1163).
 *
 * @see working/phase-5.md:422-491
 */
export function useParsedSession(
  row: SessionRow | null,
): UseParsedSessionResult {
  const [state, setState] = useState<UseParsedSessionState>(() =>
    deriveInitialState(row),
  );
  // `retryNonce` increments when the user clicks Retry from the error
  // state. The useEffect's dep array includes it so a bump triggers a
  // fresh fetch with no cache lookup. Spec line 441.
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (row === null) {
      setState({ state: "idle" });
      return;
    }
    if (row.storedSessionUid === null) {
      setState({ state: "no_raw", reason: "source_only" });
      return;
    }

    const storedSessionUid = row.storedSessionUid;
    const tool = row.tool;
    const key = makeKey(storedSessionUid, tool);

    // retryNonce > 0 means the user clicked Retry: skip cache lookup
    // AND skip inFlight lookup (Q1 in the M3b plan — a stuck inFlight
    // Promise is exactly the failure state Retry must escape).
    if (retryNonce === 0) {
      // Step 3: cache lookup.
      const hit = cache.get(key);
      if (hit !== undefined) {
        // LRU recency bump on read.
        cache.delete(key);
        cache.set(key, hit);
        setState(
          hit.truncated
            ? { state: "truncated", parsed: hit }
            : { state: "success", parsed: hit },
        );
        return;
      }
      // Step 4: in-flight coalescing.
      const pending = inFlight.get(key);
      if (pending !== undefined) {
        setState({ state: "loading" });
        let cancelled = false;
        // Capture epoch at subscription. Spec line 467: "Coalesced
        // consumers awaiting the same Promise see the same drop
        // semantics." `bumpCacheEpoch` aborts the originator's
        // controller, so the common path arrives via `.catch(isAbortError)`.
        // The narrow race is: stream fully resolves → microtasks queue
        // → `bumpCacheEpoch` runs synchronously (abort no-ops on settled
        // Promise) → microtasks fire. Without this guard, the sibling's
        // `.then` would transition to "success" with stale parsed data
        // while the originator correctly drops it.
        const epochAtSubscription = cacheEpoch;
        pending
          .then((parsed) => {
            if (cancelled) return;
            if (cacheEpoch !== epochAtSubscription) return;
            setState(
              parsed.truncated
                ? { state: "truncated", parsed }
                : { state: "success", parsed },
            );
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            // AbortError filter (spec line 484 + Q3): a coalesced
            // sibling whose originator unmounted (or was aborted by
            // bumpCacheEpoch) silently no-ops; a subsequent re-render
            // picks up fresh data via the dep-array re-run on row
            // identity. We never transition to "error" on abort.
            //
            // M4 surface bug-fix: under React 18 StrictMode, the FIRST
            // mount's cleanup aborts its own controller while the
            // SECOND mount immediately coalesces onto the same (now-
            // doomed) Promise. Without the retryNonce bump below, the
            // second mount would silently no-op on the AbortError and
            // the consumer would stay in "loading" forever (no dep
            // re-run is forthcoming). The bump triggers a fresh fetch
            // on the next render via the useEffect's dep array — by
            // then, inFlight has been cleared (the originator's
            // .then/.catch ran first), so step 5 fires.
            if (isAbortError(err)) {
              setRetryNonce((n) => n + 1);
              return;
            }
            setState({
              state: "error",
              error: err instanceof Error ? err : new Error(String(err)),
            });
          });
        return () => {
          cancelled = true;
        };
      }
    }

    // Step 5 (or retry path): fresh fetch.
    setState({ state: "loading" });
    const controller = new AbortController();
    inFlightControllers.set(key, controller);
    const epochAtStart = cacheEpoch;
    let cancelled = false;

    const promise = (async (): Promise<ParsedSession> => {
      const { text, totalBytes, truncated } = await streamRawText(
        storedSessionUid,
        controller.signal,
      );
      // dispatchParser is documented as TOTAL (M3a contract — it never
      // throws on any combination of inputs; unknown tool falls
      // through to `{ messages: [], warnings: [...] }`). Per Q9 in
      // the M3b plan we deliberately do NOT wrap in try/catch — adding
      // a defensive try/catch invites codex to ask "what defensive
      // scenario does this guard?" with no clear answer.
      const parsed = dispatchParser(tool, text, { totalBytes, truncated });
      // Epoch guard on cache write (spec line 467): only persist if no
      // Rescan/Import landed mid-fetch. Coalesced consumers see the
      // same drop semantics (they read cache after settle).
      if (cacheEpoch === epochAtStart) {
        cache.set(key, parsed);
        // LRU eviction. `while` (not `if`) guards against any future
        // change that bumps multiple entries at once.
        while (cache.size > USE_PARSED_SESSION_CACHE_MAX) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey === undefined) break;
          cache.delete(oldestKey);
        }
      }
      return parsed;
    })();

    inFlight.set(key, promise);

    promise
      .then((parsed) => {
        // Always drop from inFlight on settle, gated on Map identity
        // match: prevents a stale closure (e.g. after the same key
        // started a fresh fetch) from deleting a fresh entry.
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
          inFlightControllers.delete(key);
        }
        if (cancelled) return;
        // Epoch guard at the consumer level too: if epoch advanced
        // mid-flight, the cache write was skipped above, and we must
        // NOT transition to "success" with stale data. Per Q2 in the
        // plan, we silently no-op — the data is just stale, not an
        // error. A subsequent useEffect re-run (driven by row identity
        // change or by App's refetchAll triggering a SessionRow
        // identity change after Rescan/Import lands) picks up fresh
        // data.
        if (cacheEpoch !== epochAtStart) {
          return;
        }
        setState(
          parsed.truncated
            ? { state: "truncated", parsed }
            : { state: "success", parsed },
        );
      })
      .catch((err: unknown) => {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
          inFlightControllers.delete(key);
        }
        if (cancelled) return;
        // AbortError filter (spec line 484): unmount, row change, and
        // hard-reset abort all funnel here; never transition to
        // "error" on those paths.
        if (isAbortError(err)) return;
        setState({
          state: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
      // Note: do NOT delete from `inFlight` here — a sibling consumer
      // coalesced onto this Promise may still be awaiting it. inFlight
      // cleanup happens in the .then/.catch above, gated on Map
      // identity match so a stale closure can't delete a fresh
      // inFlight entry registered by a later consumer.
    };
    // Dep array: `[storedSessionUid, tool, retryNonce]`. Per Q7 in the
    // plan — App.tsx may produce a new SessionRow reference on every
    // refetchAll cycle; depending on `[row]` would trigger a fetch on
    // every unrelated row mutation. The minimal trio captures exactly
    // the identity surface that determines fetch identity. The `?? null`
    // coalescing keeps a deterministic dep value for null rows.
  }, [
    row?.storedSessionUid ?? null,
    row?.tool ?? null,
    retryNonce,
  ]);

  // Spec line 434: "no-op except in error state". The callback bumps
  // retryNonce only when the current state is "error" so that calling
  // retry() while in success / loading / no_raw / idle does NOT trigger
  // a spurious fetch. Functional setState reads the latest state so
  // a stale closure can't approve a retry.
  const retry = useCallback(() => {
    setState((current) => {
      if (current.state === "error") {
        setRetryNonce((n) => n + 1);
      }
      return current;
    });
  }, []);

  return { ...state, retry };
}
