# Phase 5 M3b Implementation Plan

> Source-of-truth: `working/phase-5.md` frozen at `05467ad`. Progress log HEAD: `4ee10c6`. M3a delivered at `959becb`.

## 1. Brief context

**M3b** is the async/effect/cache layer that completes Milestone 3 of Phase 5. M3a (closed 2026-05-09 at `959becb`, 5 codex rounds) shipped pure-logic foundations under `apps/frontend/src/features/sessions/parsers/`: `types.ts`, `claude_code.ts`, `codex.ts`, `buildSkim.ts`, `index.ts` (with `dispatchParser`, `PARSERS` registry, re-exports). M3b builds the I/O layer that feeds those pure parsers, then exposes a React hook the M4 (TranscriptView) and M5 (SkimView) UI surfaces will consume. After M3b lands, Milestone 3 is closed; M4 and M5 are unblocked.

M3b is **logic-only**: no visible component, no copy, no design tokens, no CSS, no a11y behavior. UI/UX gate is `not required` (see §10).

## 2. Spec source quotes (verbatim from `working/phase-5.md`)

> **Lines 396-420 (Streaming + 5 MB safety cap):**
>
> ```ts
> export type StreamRawTextResult = {
>   /** Accumulated text up to the byte cap (or full payload if smaller). */
>   text: string;
>   /** Bytes accepted into `text` (UTF-8). When `truncated` is true, this equals STREAM_RAW_TEXT_BYTE_CAP. When false, this equals the actual payload size. */
>   totalBytes: number;
>   /** True when the byte cap fired and `reader.cancel()` was called. */
>   truncated: boolean;
> };
>
> export const STREAM_RAW_TEXT_BYTE_CAP = 5 * 1024 * 1024; // 5 MB
>
> export function streamRawText(
>   storedSessionUid: string,
>   signal: AbortSignal,
> ): Promise<StreamRawTextResult>;
> ```
>
> Consumes `streamSessionRaw(uid, signal)` (the existing `/api/v1/sessions/:uid/raw` exporter from `apps/frontend/src/lib/api.ts`), accumulates chunks via `TextDecoder`, and short-circuits via `reader.cancel()` once the byte cap fires. `STREAM_RAW_TEXT_BYTE_CAP` is exported for a future configuration phase.
>
> `totalBytes` semantics: the size of `text` (UTF-8 byte length). When `truncated` is true, `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly (the cap is a hard limit). When false, `totalBytes` is the full payload size. The spec deliberately does NOT report the actual full payload size when truncated, because computing it would require draining the stream past the cap.

> **Lines 422-491 (useParsedSession hook):**
>
> ```ts
> export type UseParsedSessionState =
>   | { state: "idle" }                                                // row === null
>   | { state: "no_raw"; reason: "source_only" }                       // row.storedSessionUid === null
>   | { state: "loading" }
>   | { state: "success"; parsed: ParsedSession }
>   | { state: "truncated"; parsed: ParsedSession }                    // parsed.truncated === true
>   | { state: "error"; error: Error };
>
> export type UseParsedSessionResult = UseParsedSessionState & {
>   /** Callable in the "error" state to re-trigger the fetch (skips cache; uses the same row). No-op in other states. */
>   retry: () => void;
> };
>
> export function useParsedSession(row: SessionRow | null): UseParsedSessionResult;
> ```
>
> The `retry` function is always present on the result (no-op except in the "error" state) so consumers can pass it to a button without conditional rendering. Internally, `retry()` increments a component-local `retryNonce` state value; the `useEffect` that drives fetching depends on `retryNonce` so bumping it triggers a fresh fetch (without cache lookup, since the previous error is what we want to retry).
>
> The hook takes a full `SessionRow` because the **raw endpoint identity is `storedSessionUid`, not `rowKey`**.
>
> **Cache (LRU + epoch + in-flight coalescing):**
> - Module-scoped `cache: Map<string, ParsedSession>` keyed by `${storedSessionUid}::${tool}` → `ParsedSession`.
> - Module-scoped `inFlight: Map<string, Promise<ParsedSession>>` keyed identically. **When a fetch for a given key is already in flight, a second invocation awaits the SAME Promise instead of starting a duplicate fetch.**
> - Cap: `USE_PARSED_SESSION_CACHE_MAX = 5` most-recently-used entries (constant exported from `useParsedSession.ts`). Applies to the resolved `cache` only; `inFlight` entries are removed on settle (success or error).
> - Eviction policy: on every cache write, if size > cap, evict the least-recently-used entry. Reads bump recency.
> - **Module-scoped epoch counter `cacheEpoch: number`**, incremented on:
>   - Rescan click (the user explicitly asked for fresh data)
>   - Successful Import completion (raw bytes may have been replaced)
> - Each in-flight fetch captures `epochAtStart = cacheEpoch` at fetch dispatch. On resolve, **only writes to cache if `cacheEpoch === epochAtStart`**; otherwise drops the result. Coalesced consumers awaiting the same Promise see the same drop semantics.
> - Hard reset: clear-all `cache` AND `inFlight` AND increment `cacheEpoch` on Rescan and on Import success. (Aborting `inFlight` requests on hard reset prevents the dropped result from spuriously settling.)
>
> **Order of operations on hook invocation** (per render):
> 1. If `row === null` → state `idle`. Skip everything.
> 2. If `row.storedSessionUid === null` → state `no_raw`. Skip fetch.
> 3. Build `key = ${storedSessionUid}::${tool}`. Look up `cache.get(key)`. If hit → bump LRU recency, return `state: "success" | "truncated"`.
> 4. Look up `inFlight.get(key)`. If hit → return `state: "loading"`; the existing Promise resolves both the original consumer and this one.
> 5. Otherwise → start a fresh fetch + parse, register the Promise in `inFlight`, return `state: "loading"`.

> **Lines 1007-1025 (M3 DoD — relevant to M3b):**
> - `useParsedSession` correctly aborts in-flight fetches on `storedSessionUid` change; correctly drops in-flight results when `cacheEpoch` changes mid-fetch.
> - `useParsedSession` correctly returns `no_raw` for `row.storedSessionUid === null` (source-only rows) without firing a fetch.
> - Tab switching does NOT re-fetch raw bytes (cache hit serves the two parsed-content tabs — Skim and Transcript; Raw uses its own consumer; Metadata bypasses parser fetch entirely).
> - `streamRawText` mirrors `rawPreview.test.ts` patterns: hand-built ReadableStreams, abort-mid-loop, byte-cap fires (`reader.cancel()` proven by spy), body-less response. Returns `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly when truncated.

> **Lines 1110-1111 (Test obligations):**
> - `streamRawText.test.ts` mirrors `rawPreview.test.ts` — hand-built ReadableStreams, abort-mid-loop, byte-cap fires (`reader.cancel()` proven by spy), body-less response, pre-aborted signal.
> - `useParsedSession.test.ts` — idle / no_raw / loading / success / error / truncated; abort-on-storedSessionUid-change; cache-hit-on-tab-switch; LRU eviction at cap=5; epoch invalidation on Rescan AND on Import-success drops in-flight result; cache survives selectedRowKey churn within cap.

> **Lines 1145-1146:** `STREAM_RAW_TEXT_BYTE_CAP` and `USE_PARSED_SESSION_CACHE_MAX` are exported constants.

> **Resolved Decision #13 (line 1158):** `useParsedSession` cache = LRU bounded at 5 entries keyed by `${storedSessionUid}::${tool}` (`USE_PARSED_SESSION_CACHE_MAX = 5`). Module-scoped epoch counter `cacheEpoch` is bumped on Rescan AND successful Import; in-flight fetches drop their result if the epoch changed mid-flight. Hard cache clear also fires on both Rescan and Import.

> **Resolved Decision #18 (line 1163):** Metadata + Raw tabs do NOT trigger `useParsedSession` fetch.

## 3. File list

Source files (2):
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/streamRawText.ts`
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/useParsedSession.ts`

Test files (2, co-located):
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/streamRawText.test.ts`
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/useParsedSession.test.ts`

App.tsx wire-up (1 modified):
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/App.tsx` — call `bumpCacheEpoch()` on Rescan-success and Import-success paths.

App.test.tsx (modified): add tests asserting `bumpCacheEpoch` is invoked on the success paths and NOT on the error paths. See §7.

No CSS files. No new dependencies.

## 4. Per-file specification

### 4.1 `apps/frontend/src/features/sessions/streamRawText.ts`

**Exports:**

```ts
export const STREAM_RAW_TEXT_BYTE_CAP = 5 * 1024 * 1024; // 5 MB

export type StreamRawTextResult = {
  text: string;
  totalBytes: number;
  truncated: boolean;
};

export function streamRawText(
  storedSessionUid: string,
  signal: AbortSignal,
): Promise<StreamRawTextResult>;
```

**Behavior:**

1. **Pre-aborted signal**: if `signal.aborted` is `true` on entry, throw `new DOMException("aborted", "AbortError")` synchronously, **without opening a reader**. Mirrors `consumeRawPreview` line 132-134.

2. Call `streamSessionRaw(storedSessionUid, signal)` from `apps/frontend/src/lib/api.ts:132`. `streamSessionRaw` already throws `ApiError` on non-2xx — `streamRawText` lets that bubble up unchanged (the hook handles it as `state: "error"`).

3. **Body-less response**: if `response.body === null`, return `{ text: "", totalBytes: 0, truncated: false }` defensively without throwing. Mirrors `consumeRawPreview` line 140-148.

4. **Read loop**: open `reader = response.body.getReader()`, instantiate `decoder = new TextDecoder("utf-8")`. Track:
   - `chunks: string[] = []` (decoded chunks; `parts.join("")` produces the final string at the end)
   - `totalBytes: number = 0` — the **UTF-8 byte sum**, computed as `value.byteLength` on each `Uint8Array` chunk (NOT `string.length`, NOT `decodedChunk.length` — both produce UTF-16 code-unit counts which mis-represent multi-byte characters). The byte counter is what governs the cap.

5. **Abort wiring**: install a one-shot `signal.addEventListener("abort", onAbort, { once: true })` listener that calls `void reader.cancel()`. Mirror `consumeRawPreview` lines 161-170.

6. **Loop step (per iteration)**:
   - Re-check `signal.aborted` BEFORE awaiting `reader.read()`; if aborted, throw fresh `AbortError`.
   - Wrap `reader.read()` in try/catch; on rejection, if `signal.aborted` throw `AbortError`, otherwise rethrow.
   - On `done: true`: flush trailing decoder buffer via `decoder.decode()` (no args), append to `chunks`. Break.
   - On chunk: compute `incomingByteLength = value.byteLength`. Check `if (totalBytes + incomingByteLength > STREAM_RAW_TEXT_BYTE_CAP)` — **slice the chunk to the cap boundary**:
     - Compute `room = STREAM_RAW_TEXT_BYTE_CAP - totalBytes`.
     - `slicedChunk = value.subarray(0, room)` (a `Uint8Array` view of the first `room` bytes).
     - Decode the sliced chunk via `decoder.decode(slicedChunk, { stream: false })` to flush trailing partial-multi-byte handling cleanly. Push to `chunks`.
     - Increment `totalBytes += room` so it equals `STREAM_RAW_TEXT_BYTE_CAP` exactly.
     - Set `truncated = true`.
     - Call `await reader.cancel()`.
     - Break.
   - Otherwise (chunk fits): `totalBytes += value.byteLength`; push `decoder.decode(value, { stream: true })` to `chunks`.

7. **Cleanup**: `finally { signal.removeEventListener("abort", onAbort); }`.

8. **Return**: `{ text: chunks.join(""), totalBytes, truncated }`. When truncated, `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly (the slicing in step 6 enforces this).

**Edge cases:**

- Multi-byte UTF-8 character straddling the cap boundary: `decoder.decode(slicedChunk, { stream: false })` will replace any half-character with `U+FFFD`. Spec line 402 anchors `totalBytes` to UTF-8 byte length, so byte-count truncation is the contract. Document inline that the rare U+FFFD landing under the cap boundary is acceptable per spec.
- Chunk that lands exactly at the cap (no slicing needed but cap met): set `truncated = true` and call `reader.cancel()` after pushing the chunk. (Implementation: handle as `totalBytes >= STREAM_RAW_TEXT_BYTE_CAP` post-update; keep the cap-equality invariant.)
- Empty body (zero-byte stream): natural close → `{ text: "", totalBytes: 0, truncated: false }`. Same shape as body-less but reaches it via the loop.

**Test obligations** (in `streamRawText.test.ts`, mirror `rawPreview.test.ts` exactly):

The test file MUST use the same `cancelSpy` pattern as `rawPreview.test.ts:53-94` — wrap `getReader().cancel` so the spy increments on actual reader-cancel invocations (NOT just on the underlying-source `cancel`).

**Stub strategy**: stub `globalThis.fetch` (or override `streamSessionRaw` via `mock.module`) so the test can hand-build the streaming `Response`. The existing pattern at `Toast.test.tsx`, `ActionBar.test.tsx`, `Pagination.test.tsx`, `SessionsTable.test.tsx` uses `import { mock } from "bun:test"`.

| # | Test name (suggested) | Asserts |
|---|---|---|
| 1 | `streamRawText: small payload returns full text + totalBytes equals byte length + truncated false + no cancel` | Feed one chunk (e.g. 1 KB ASCII); expect `text` matches, `totalBytes === chunk.byteLength`, `truncated === false`, `cancelSpy.count === 0`. |
| 2 | `streamRawText: empty body returns empty result without error` | Feed zero chunks (close immediately); expect `{ text: "", totalBytes: 0, truncated: false }`. |
| 3 | `streamRawText: body-less response returns empty result` | `new Response(null, { status: 204 })`; expect same as #2 without throwing. |
| 4 | `streamRawText: byte cap fires on a chunk > 5 MB and reader.cancel() proven by spy + totalBytes === STREAM_RAW_TEXT_BYTE_CAP exactly` | Feed one chunk of `STREAM_RAW_TEXT_BYTE_CAP + 16384` bytes (use 'A' filler so byte length == char length); expect `truncated === true`, `totalBytes === STREAM_RAW_TEXT_BYTE_CAP`, `cancelSpy.count >= 1`, `text.length` measured in UTF-8 bytes equals the cap. **The cap-equality assertion is the load-bearing one — codex r2/r3 patterns prove naïve cumulative counters overshoot.** |
| 5 | `streamRawText: cap fires across multiple smaller chunks (cumulative breach)` | Feed five chunks of 1.5 MB each (7.5 MB total); expect `truncated === true`, `totalBytes === STREAM_RAW_TEXT_BYTE_CAP`, cancelSpy fired exactly once. |
| 6 | `streamRawText: pre-aborted signal throws AbortError WITHOUT opening a reader` | Pre-aborted controller; expect rejection with `name === "AbortError"`, `cancelSpy.count === 0` (reader never opened). |
| 7 | `streamRawText: abort mid-loop rejects with AbortError and reader.cancel() fires` | Stream that pumps one chunk then waits forever; controller.abort() after first read tick; expect `AbortError`, `cancelSpy.count >= 1`. |
| 8 | `streamRawText: abort AFTER cap resolution is a no-op for the consumer` | 6 MB chunk; await result; then abort the (already-resolved) signal; expect no throw, `truncated === true` preserved. |
| 9 | `streamRawText: multi-byte UTF-8 chunk that fits returns intact text` | Feed a chunk with multi-byte glyphs (`"héllo"` repeated, etc.); expect `text` byte-faithful, `totalBytes === chunk.byteLength` (NOT `text.length`). |
| 10 | `streamRawText: multi-byte UTF-8 character straddling the cap boundary truncates cleanly without throwing` | Construct a payload where a 4-byte UTF-8 codepoint straddles `STREAM_RAW_TEXT_BYTE_CAP`; expect `truncated === true`, `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly, `text` is a valid string (may contain U+FFFD, that's acceptable per spec). |

(10 tests minimum.)

### 4.2 `apps/frontend/src/features/sessions/useParsedSession.ts`

**Module-scoped state (testable via `_resetForTests` exported helper):**

```ts
export const USE_PARSED_SESSION_CACHE_MAX = 5;

// Module-scoped — survives component unmount + remount; reset only via _resetForTests or hard-reset path.
const cache = new Map<string, ParsedSession>();   // LRU via insertion-order Map: re-set on hit to move to most-recent.
const inFlight = new Map<string, Promise<ParsedSession>>();
const inFlightControllers = new Map<string, AbortController>();
let cacheEpoch = 0;

/**
 * Increment `cacheEpoch`, clear `cache`, abort + clear all `inFlight`.
 * Called by App.tsx on Rescan-success and Import-success.
 */
export function bumpCacheEpoch(): void {
  cacheEpoch += 1;
  cache.clear();
  for (const ctrl of inFlightControllers.values()) ctrl.abort();
  inFlightControllers.clear();
  inFlight.clear();
}

/**
 * Test-only helper. Co-located in this module per the M3a buildSkim
 * precedent (constants + helpers in the same file as the consumer).
 */
export function _resetForTests(): void {
  cache.clear();
  inFlight.clear();
  inFlightControllers.clear();
  cacheEpoch = 0;
}
```

**Public types:**

Re-export verbatim from spec lines 425-438. `UseParsedSessionState` is a discriminated union; `UseParsedSessionResult = UseParsedSessionState & { retry: () => void }`.

**Hook implementation (sketch):**

```ts
export function useParsedSession(row: SessionRow | null): UseParsedSessionResult {
  const [state, setState] = useState<UseParsedSessionState>(() => deriveInitialState(row));
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (row === null) { setState({ state: "idle" }); return; }
    if (row.storedSessionUid === null) {
      setState({ state: "no_raw", reason: "source_only" });
      return;
    }

    const key = `${row.storedSessionUid}::${row.tool}`;

    // retryNonce > 0 means the user clicked Retry: skip cache + skip inFlight,
    // start a fresh fetch. retryNonce === 0 means initial mount or row change.
    if (retryNonce === 0) {
      // Step 3: cache lookup
      const hit = cache.get(key);
      if (hit !== undefined) {
        // LRU bump: delete + re-set so insertion order moves to most-recent.
        cache.delete(key);
        cache.set(key, hit);
        setState(hit.truncated
          ? { state: "truncated", parsed: hit }
          : { state: "success", parsed: hit });
        return;
      }
      // Step 4: in-flight coalescing
      const pending = inFlight.get(key);
      if (pending !== undefined) {
        setState({ state: "loading" });
        let cancelled = false;
        pending.then(parsed => {
          if (cancelled) return;
          setState(parsed.truncated
            ? { state: "truncated", parsed }
            : { state: "success", parsed });
        }).catch(err => {
          if (cancelled) return;
          if (isAbortError(err)) return;  // coalesced abort = silent no-op
          setState({ state: "error", error: err instanceof Error ? err : new Error(String(err)) });
        });
        return () => { cancelled = true; };
      }
    }

    // Step 5 (or retry path): fresh fetch
    setState({ state: "loading" });
    const controller = new AbortController();
    inFlightControllers.set(key, controller);
    const epochAtStart = cacheEpoch;
    const sessionUid = row.storedSessionUid;
    const tool = row.tool;
    let cancelled = false;

    const promise = (async (): Promise<ParsedSession> => {
      const { text, totalBytes, truncated } = await streamRawText(sessionUid, controller.signal);
      const parsed = dispatchParser(tool, text, { totalBytes, truncated });
      // Epoch guard: only cache if no Rescan/Import landed mid-fetch.
      if (cacheEpoch === epochAtStart) {
        cache.set(key, parsed);
        // LRU eviction: while size > cap, delete oldest (first insertion-order key).
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
      .then(parsed => {
        // Always remove from inFlight on settle.
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
          inFlightControllers.delete(key);
        }
        if (cancelled) return;
        // Epoch guard at consumer level too: if epoch advanced, do not transition to success.
        if (cacheEpoch !== epochAtStart) {
          // The bumpCacheEpoch() path aborted us; treat as if we'd gotten AbortError.
          // The follow-on re-render (driven by a row change or by App's refetchAll triggering
          // a SessionRow identity change) will start a fresh fetch via the dep-array re-run.
          // We do NOT spuriously transition to "error" here — the data is just stale.
          return;
        }
        setState(parsed.truncated
          ? { state: "truncated", parsed }
          : { state: "success", parsed });
      })
      .catch(err => {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
          inFlightControllers.delete(key);
        }
        if (cancelled) return;
        if (isAbortError(err)) return;       // unmount / row change / hard-reset abort
        setState({ state: "error", error: err instanceof Error ? err : new Error(String(err)) });
      });

    return () => {
      cancelled = true;
      controller.abort();
      // Note: do NOT delete from inFlight here — a sibling consumer coalesced onto this Promise
      // may still be awaiting it. inFlight cleanup happens in the .then/.catch above (gated on
      // map identity match so a stale closure can't delete a fresh inFlight entry).
    };
  }, [row?.storedSessionUid ?? null, row?.tool ?? null, retryNonce]);

  const retry = useCallback(() => { setRetryNonce(n => n + 1); }, []);

  return { ...state, retry };
}

function deriveInitialState(row: SessionRow | null): UseParsedSessionState {
  if (row === null) return { state: "idle" };
  if (row.storedSessionUid === null) return { state: "no_raw", reason: "source_only" };
  const key = `${row.storedSessionUid}::${row.tool}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    // LRU bump
    cache.delete(key);
    cache.set(key, hit);
    return hit.truncated
      ? { state: "truncated", parsed: hit }
      : { state: "success", parsed: hit };
  }
  // We can't dispatch a fetch from a useState initializer; the useEffect handles it.
  return { state: "loading" };
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}
```

**Critical correctness notes** (every one of these maps to a codex-blind-spot precedent — see §6):

- **Synchronous cache hit on first render**: `deriveInitialState` reads cache directly. When a user switches tabs (Skim → Transcript) with the same row, the second mount sees cache and returns `state: "success"` synchronously — **NOT** `loading → success` via useEffect. This is the cache-hit-on-tab-switch path.
- **`retryNonce === 0` short-circuit on cache lookup**: when the user clicks Retry, we bypass cache + inFlight. Otherwise normal cache/coalesce path.
- **Per-hook-instance AbortController**: each consumer's effect creates its own `controller`. The `inFlightControllers` Map tracks the FIRST consumer's controller — coalesced consumers do NOT register a new controller. On unmount, the originator's controller aborts; coalesced siblings unmount their `cancelled` flag but the underlying fetch keeps running. **Trade-off**: if the originator unmounts mid-flight, the fetch IS aborted, and the coalesced sibling's `.catch(isAbortError)` silently ignores the abort. The sibling re-renders eventually (via dep-array re-run on next render of its own row identity) and re-enters the fetch path. This matches the rawPreview cleanup discipline. Document inline why this is safe: **a coalesced sibling that loses its fetch will simply re-fetch on its own next mount cycle, and the cache LRU + epoch guards prevent corrupt state from leaking**.
- **Map insertion-order LRU**: `Map`-based LRU is achieved by `delete(key); set(key, value)` on hit — JavaScript `Map` preserves insertion order, so `cache.keys().next().value` is the oldest entry.
- **Eviction loop uses `while`, not `if`**: defensive — if a future change ever bumps multiple entries at once.
- **Epoch race semantics**: gate the cache write AND the state transition. If `bumpCacheEpoch()` fires mid-fetch, the controller is already aborted (because `bumpCacheEpoch` aborts every in-flight controller), so the resolved `.then` runs with `cacheEpoch !== epochAtStart` AND `cancelled === true` (likely; the unmount path may also fire from row identity change). We do NOT transition to `state: "error"` for an epoch-stale result — we silently return and let a subsequent useEffect re-run pick up fresh data.
- **inFlight cleanup is gated on Map identity match**: `if (inFlight.get(key) === promise)` — prevents a stale-closure from deleting a fresh inFlight entry registered by a later consumer.

**Test obligations** (in `useParsedSession.test.ts`, using `renderHook` from `@testing-library/react` per the existing test infrastructure + `mock` from `bun:test` to stub `globalThis.fetch` or `streamSessionRaw`):

The test suite MUST call `_resetForTests()` in `beforeEach` to start with empty cache + epoch 0. Stubbed `fetch` returns hand-built `ReadableStream` `Response`s identical in shape to `rawPreview.test.ts`'s `makeResponse` helper.

| # | Test name (suggested) | Asserts |
|---|---|---|
| 1 | `idle: row === null returns { state: "idle" } and does not fetch` | `renderHook(() => useParsedSession(null))`; expect `result.current.state === "idle"`, `fetchMock.mock.calls.length === 0`; `result.current.retry` is a function. |
| 2 | `no_raw: source-only row returns { state: "no_raw", reason: "source_only" } and does not fetch` | Build `SessionRow` with `storedSessionUid: null`; expect `state === "no_raw"`, fetch not called. |
| 3 | `loading → success: stored row fetches, parses, transitions to success` | Stored row with `tool: "claude_code"`; mock fetch returning a small valid Claude NDJSON payload; assert `state === "loading"` initially, then `state === "success"`, `parsed.messages.length` matches fixture, `parsed.truncated === false`. Also verify `parsed.tool === "claude_code"`. |
| 4 | `loading → truncated: large payload triggers truncated state` | Mock fetch returning > 5 MB body; expect `state === "truncated"`, `parsed.truncated === true`, `parsed.totalBytes === STREAM_RAW_TEXT_BYTE_CAP`. |
| 5 | `error: streamSessionRaw rejects → state "error" + retry function works` | Mock fetch returning 500 (so `streamSessionRaw` throws `ApiError`); expect `state === "error"`, `error instanceof Error`. Then call `result.current.retry()` inside `act(...)`, verify a fresh fetch fires and on success → `state === "success"`. Confirm error result was NOT cached: a subsequent mount with same row triggers fetch again. |
| 6 | `cache hit on tab switch: same row, second mount returns success synchronously` | Mount once with row A; await success. Unmount. Re-mount with same row A; assert first-render state is `"success"` (NOT `"loading"`); fetch called only once (cumulative). |
| 7 | `cache hit also bumps LRU recency` | Insert 5 distinct rows in order A,B,C,D,E. Re-touch A (re-mount with row A). Insert F → expect B (now oldest) evicted; A still cached. Test by verifying re-mount with A returns synchronously and re-mount with B fires a fetch. |
| 8 | `LRU eviction at cap=5: 6th insertion evicts the oldest` | Mount + await for 5 distinct rows; mount the 6th; expect 6th cached, 1st evicted (re-mount of 1st triggers fresh fetch). |
| 9 | `abort on storedSessionUid change: in-flight fetch is aborted, new fetch starts` | Start fetch on row A (mock pending forever); rerender with row B before A resolves; expect controller for A aborted (the abort signal of the captured A signal becomes true), B's fetch fires, B's success appears. |
| 10 | `abort on hook unmount: in-flight fetch is aborted` | Start fetch on row A (pending); unmount; expect the captured AbortSignal `aborted === true`. |
| 11 | `in-flight coalescing: two consumers with same row share one fetch` | Mount two `renderHook`s in sequence (or use one `renderHook` with a doubly-used hook), with same row, while fetch is pending. Expect `fetchMock` called exactly once. Resolve fetch. Both consumers transition to `state: "success"` with the same `parsed` reference (or at minimum identical `messages`). |
| 12 | `epoch invalidation on Rescan drops in-flight result` | Start fetch on row A (mock pending). Call `bumpCacheEpoch()` while pending. Resolve the original promise. Expect: cache is empty (no write happened); the hook does NOT transition to `state: "success"` from the dropped result — but a subsequent mount-cycle DOES trigger a fresh fetch and lands successfully. |
| 13 | `epoch invalidation on Import-success drops in-flight result` | Same as #12 but verifies the hook works correctly across two `bumpCacheEpoch()` calls (Rescan then Import scenario simulated). |
| 14 | `cache survives selectedRowKey churn within cap` | Mount with A → success. Mount with B → success. Re-mount with A → cache hit (no fetch). All within the cap of 5. Validates cache survival across React unmount cycles. |
| 15 | `retry skips cache + skips inFlight, fires fresh fetch` | Force `state: "error"` for row A. Pre-populate cache with row A's stale parsed data (via direct `cache.set`). Call `retry()`. Expect a fresh fetch fires (NOT the cached value), and on resolve the fresh result lands. |
| 16 | `retry is no-op when state is not "error"` | Spec line 434 says retry is "no-op except in error state" — guard inside the `retry` callback so it only bumps `retryNonce` when current state is `"error"`. Test mounts row A → success, calls `retry()`, asserts NO new fetch fires. |
| 17 | `pre-aborted signal during in-flight is silently ignored (no error transition)` | Start fetch; abort externally; expect no transition to `state: "error"`. |
| 18 | `epoch-stale resolution does NOT transition state to "error"` | Same as #12 but specifically asserts `state` does NOT become `"error"` — it can remain `"loading"` until a subsequent re-render flips to a fresh fetch (or `"idle"` if row went null). |

(18 tests minimum.)

### 4.3 App.tsx edits (cacheEpoch wire-up)

**Imports** (top of file, alongside existing feature imports):

```ts
import { bumpCacheEpoch } from "./features/sessions/useParsedSession";
```

**Rescan-success path** at `App.tsx:447-482`. Inside `handleRescan`'s `try` block, AFTER the `pushToast` success notification but **BEFORE** `await refetchAll()`:

```ts
  const handleRescan = useCallback(async () => {
    setPending("rescan");
    try {
      const report: RescanReport = await triggerRescan();
      const iso = new Date().toISOString();
      writeLastRescan(iso);
      setLastRescanAt(iso);
      pushToast({
        kind: "success",
        title: "Rescan complete",
        message: rescanSummary(report),
        details: rescanCounts(report),
      });
      bumpCacheEpoch();          // ← NEW: clear parser cache + abort in-flight + bump epoch
      await refetchAll();
    } catch (error) {
      // ... unchanged: error path does NOT bump epoch
    } finally {
      setPending(null);
    }
  }, [refetchAll, pushToast]);
```

**Import-success path** at `App.tsx:484-563`. Inside `handleImport`'s `try` block, AFTER the `pushToast` success notification, BEFORE `await refetchAll()`:

```ts
    try {
      const report: ImportReport = await importSourceSessions(keysToImport);
      setSelected(new Set());
      pushToast({ kind: "success", title: "Import complete", ... });
      bumpCacheEpoch();          // ← NEW: clear parser cache + abort in-flight + bump epoch
      await refetchAll();
    } catch (error) {
      // ... unchanged: error path does NOT bump epoch
    }
```

**Why BEFORE `refetchAll()`**: spec line 466 says "Successful Import completion" — the bump should fire as soon as the import call has succeeded, irrespective of `refetchAll`'s outcome. Putting it before `refetchAll` ensures that if `refetchAll` fails (network blip), the cache is still cleared, so the next Skim/Transcript view fetches fresh bytes. **It also means the bump is committed to module state before any state update from `refetchAll` triggers a re-render** that could observe stale cached parsed sessions.

**Why NOT in `finally`**: error paths must not bump epoch (no successful state transition → cached data is still valid relative to source-of-truth).

## 5. Open questions resolved (Q1–Q10)

**Q1: Does `retry()` skip cache AND inFlight, or only cache?**

**Recommendation: skip BOTH cache AND inFlight.** Rationale: a stuck inFlight Promise is exactly the failure state Retry must escape. If `retry` only skipped cache, a wedged Promise would resolve into the same error and Retry would be a no-op. The implementation gates on `retryNonce === 0` for both the cache lookup AND the inFlight lookup; non-zero retryNonce always starts a fresh fetch with a fresh AbortController. Verified by test #15.

**Q2: When epoch invalidation drops a result mid-fetch, what state does the hook transition to?**

**Recommendation: do NOT transition to `error`. Silently no-op the resolution; let the subsequent useEffect re-run pick up a fresh fetch.** The user's mental model of "Rescan invalidates everything" is "wait, it's reloading" not "an error occurred". Since `bumpCacheEpoch()` aborts every in-flight controller, the resolution path most often arrives via the `.catch(isAbortError)` branch, which is already silent. The defensive `cacheEpoch !== epochAtStart` check in `.then` covers the narrow race where the abort hadn't propagated yet. Verified by test #18.

**Q3: Per-hook-instance AbortController vs shared per-key controller?**

**Recommendation: per-hook-instance controller; the `inFlightControllers` Map tracks the originator's controller.** Coalesced sibling consumers do NOT register a new controller — they just await the existing Promise and treat AbortError silently. **Trade-off accepted**: if the originator unmounts mid-flight, the fetch IS aborted, and any sibling that coalesced loses its read. The sibling will re-render eventually (via its own dep-array re-run on its own next render) and re-fetch. This is consistent with the rawPreview discipline and is verified by test #11. The alternative (shared per-key controller with refcount) introduces complexity that codex would (correctly) flag as un-warranted given the rare race window.

**Q4: Multi-byte UTF-8 character at the cap boundary — clamp by byte count or string length?**

**Recommendation: clamp by UTF-8 BYTE COUNT (Uint8Array byteLength sum), per spec lines 402-403.** A naïve `string.length` counter would count UTF-16 code units (surrogate pairs counted as 2; non-BMP characters mis-tallied; ASCII characters under-counted by zero), violating the spec contract that `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly when truncated. The implementation uses `value.byteLength` on each `Uint8Array` chunk and slices via `value.subarray(0, room)` at the cap boundary. Verified by tests #4, #9, #10.

**Q5: How is the cache module structured for testability?**

**Recommendation: module-scoped state INSIDE `useParsedSession.ts` with `_resetForTests()` exported helper.** This mirrors the M3a `buildSkim.ts` precedent (constants + helper co-located with consumer). A separate `_cacheState.ts` module would force the test suite to import from two places, which is a cosmetic loss and forces an extra surface for codex to audit. The `_resetForTests` underscore prefix marks it as test-only. Tests call it in `beforeEach`. The cache module itself is deliberately NOT exported as a separate `Map` — only `bumpCacheEpoch()` (for App.tsx) and `_resetForTests()` (for tests) cross the module boundary.

**Q6: Does the hook accept the SessionRow object or storedSessionUid + tool tuple?**

**Spec-verbatim signature: `useParsedSession(row: SessionRow | null)`.** Non-negotiable per spec line 438. The hook destructures `row?.storedSessionUid` and `row?.tool` for the dep array.

**Q7: useEffect's dependency array — minimal set?**

**Recommendation: `[row?.storedSessionUid ?? null, row?.tool ?? null, retryNonce]`.** Why NOT `[row]`: `App.tsx` may produce a new `SessionRow` reference on every refetchAll cycle (the `mergedRows` array is reconstituted), which would trigger a fetch on every unrelated row mutation. The minimal trio captures exactly the identity surface that determines fetch identity. The `?? null` guards ensure a deterministic dep value for null rows.

**Q8: Is `bumpCacheEpoch()` exported from `useParsedSession.ts` directly, or from a sibling?**

**Recommendation: export directly from `useParsedSession.ts`.** App.tsx imports once: `import { bumpCacheEpoch } from "./features/sessions/useParsedSession";`. Co-locating the bump function with the cache state minimizes the public surface and prevents codex from asking "why is the bump in a different file from the cache it's bumping?".

**Q9: What happens if `dispatchParser` itself throws?**

`dispatchParser` is documented as TOTAL (M3a contract — it never throws on any combination of inputs; unknown tool falls through to `{ messages: [], warnings: [...] }`). The spec line 485 says "synchronous; pure". So we trust this and do NOT wrap in try/catch. **Recommendation: do NOT add the try/catch** — adding it would invite codex to ask "what defensive scenario does this guard?" with no clear answer. M3a's parser tests already prove totality.

**Q10: `bumpCacheEpoch` ordering vs `refetchAll`?**

Per spec line 466: "Successful Import completion" — the contract is "after the import succeeds". `refetchAll` is part of the success-path consequences but not part of the import success itself. Place `bumpCacheEpoch()` immediately after the toast push but before `await refetchAll()`. (See §4.3.)

## 6. Codex catch precedents this plan defends against

Phase 5 codex catches through M3a: 25 cumulative blocking findings. M3a alone needed 5 codex rounds. The async/cache surface introduces NEW opportunities. Each precedent below has a corresponding test in §4 that would catch it.

| Precedent | Defense in plan |
|---|---|
| Cap-equality off-by-one (M3a r2: function_call spec-literal violation pattern; runtime-shape bugs) | Test #4 asserts `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly. The implementation slices `value.subarray(0, room)` to enforce. |
| Multi-byte char straddle (codex consistently catches edge-case I/O bugs) | Test #10 explicitly constructs a 4-byte UTF-8 codepoint at the cap boundary. |
| `string.length` vs byte count (silent UTF-16 vs UTF-8 conflation) | Q4 + Test #9 explicitly verifies via mixed-byte-length payload. |
| `reader.cancel()` not actually firing (M3a precedent + spec line 1110) | `cancelSpy` pattern wraps `getReader().cancel`, asserted in tests #4, #5, #7. |
| Body-less response throws / hangs | Test #3. |
| Pre-aborted signal opens reader anyway | Test #6 asserts `cancelSpy.count === 0` when signal pre-aborts. |
| AbortError leaking to user-facing `error` state (rawPreview precedent) | `isAbortError` filter in `.catch`; tests #9, #10, #17 all verify silent abort handling. |
| LRU eviction off-by-one (when adding 6th, evict 1st — but the 6th-MUST-be-cached invariant) | Test #8 asserts both that the 6th is cached AND the 1st is evicted. |
| Insertion-order LRU recency (read should bump) | Test #7 asserts the re-touched entry survives eviction. |
| In-flight coalescing failure (two fetches fire) | Test #11 asserts `fetchMock` called exactly once when two consumers mount with same row. |
| Epoch race: stale data leaks to cache | Tests #12, #13 verify cache is empty after Rescan/Import bump while pending. |
| Epoch race: state transitions to spurious success | Test #18 verifies state does NOT become success on epoch-stale resolution. |
| `retry` reuses stuck inFlight Promise | Test #15 verifies retry skips inFlight (fresh fetch fires even when inFlight has a stale entry). |
| Hook fetches on `row === null` or source-only | Tests #1, #2 assert `fetch` not called. |
| Tab switch re-fetches (DoD line 1022) | Test #6 (cache hit on remount with same row → no second fetch). |
| Cache key incoherence on null storedSessionUid | The order-of-operations check at step 2 short-circuits before the cache lookup at step 3 (key would be `"null::tool"` which is incoherent). Test #2 indirectly covers. |
| `bumpCacheEpoch` called on error path (spec violation) | App.test.tsx test asserts: rescan-error path does NOT call `bumpCacheEpoch`. |
| App.tsx dep-array regression after import (closure capture issues, M3a r1 false-positive parallel) | Plan specifies bump goes in the success try-branch directly inline; no ref-hop closure to mismanage. |
| Spec-literal vs paraphrase bugs (M3a r1 false positive lesson) | The plan quotes spec verbatim in §2 rather than paraphrasing. The developer's commit message + JSDoc must cite line ranges 396-491 + 1007-1025 + 1110-1111. |

## 7. App.tsx test obligations

In `apps/frontend/src/App.test.tsx`, ADD tests covering the cacheEpoch wire-up:

| # | Test | Asserts |
|---|---|---|
| A | `Rescan success path bumps cache epoch` | Pre-populate cache by mounting `useParsedSession` against a stored row, await success. Trigger Rescan (mock `triggerRescan` to resolve); verify cache cleared by re-mounting and observing `state: "loading"` instead of synchronous `success`. |
| B | `Rescan error path does NOT bump cache epoch` | Same setup; mock `triggerRescan` to reject; verify cache survives (re-mount returns synchronous `success`). |
| C | `Import success path bumps cache epoch` | Mirror A for `importSourceSessions`. |
| D | `Import error path does NOT bump cache epoch` | Mirror B. |

**Recommended observable-side-effect approach** (avoids `mock.module` complexity): pre-populate cache by mounting a hook with a stored row, await success, then trigger rescan/import; verify cache is now empty by re-mounting and observing `state: "loading"` instead of synchronous `success`. This double-tests the contract (the bump fires AND it actually clears).

## 8. Verification commands

The developer MUST run all of these before declaring done. Output baselines below come from M3a close.

```bash
# From repo root:
cargo check --workspace                                                # no Rust touched; should be clean
cargo test -p distill-portal-ui-api-contracts --features ts-bindings   # 1 passed / 1 ignored

# From apps/frontend/:
bun run test         # FULL SUITE; baseline 415 pass / 0 fail / 1477 expects across 27 files. M3b adds ~28+ tests across 2 new files → expect ≥ 443 pass / 0 fail / ≥ 1500 expects across 29 files. Test count must be ≥ baseline.
bun run build        # baseline 21.34 kB CSS / 239.78 kB JS / 519ms.
                     # CSS MUST remain 21.34 kB EXACTLY (M3b ships zero CSS).
                     # JS will grow modestly. Document the exact delta in the commit message.
bun run test:e2e     # baseline 1 passed in ~3.2s. M3b doesn't touch e2e; expect 1 passed.
bunx tsc --noEmit    # MUST be clean. M3a r3 demonstrated this catches `JSON.stringify(undefined)` type-contract violations.
```

## 9. Hex / token / protected-path invariants

The developer MUST confirm before declaring done:

```bash
rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l          # MUST equal 24
rg -c '^\s*--' apps/frontend/src/styles/tokens.css            # MUST equal 83 (token count unchanged)

git status --short    # NO changes under: apps/backend/, components/, tests/e2e/ (Rust e2e), root Cargo.{toml,lock}.
                      # Allowed scope: apps/frontend/src/features/sessions/streamRawText.{ts,test.ts}
                      #                apps/frontend/src/features/sessions/useParsedSession.{ts,test.ts}
                      #                apps/frontend/src/App.tsx + apps/frontend/src/App.test.tsx
                      # NO new package.json deps. NO new CSS files. NO new fonts. NO new components.
```

If `bun run build` shows the CSS bundle deviated from 21.34 kB, the developer accidentally added CSS — investigate and remove. If hex isolation drifts from 24, audit (the developer's own JSDoc/comments may have triggered the regex; M2b precedent: the developer caught a `#29a` JSDoc reference and rewrote to `item 29a`).

## 10. UI/UX gate decision

**`not required`.**

**Rationale**: M3b is logic-only — pure module additions under `apps/frontend/src/features/sessions/` and one cacheEpoch wire-up edit in `App.tsx`. It introduces:
- NO visible component
- NO new copy / strings (the truncation banner copy is in M4 spec; the "Not yet imported" copy already exists in RawTab/Metadata)
- NO design tokens
- NO motion / animation
- NO accessibility-affecting structure
- NO interaction surface

The contract is purely typed-data emission. M4 (TranscriptView) and M5 (SkimView) are the first surfaces that render parsed data; they own their own UI/UX design loops. This matches the M3a gate decision verbatim ("not required" — same rationale).

**No UI/UX designer or reviewer subagent dispatched for M3b. No artifact written under `working/phase-5/designs/`.**

## 11. Recommended chunk split

**Single chunk.** M3b's two source files have a tight dependency relationship (`useParsedSession` imports `streamRawText` and `dispatchParser`; both are consumed together by M4/M5). Splitting them adds two coordinator-handoff cycles + two codex review cycles for what is mechanically one chunk's worth of work (~600 lines of source + ~700 lines of test). The blast-radius bound that justified the M2a/M2b and M3a/M3b splits doesn't apply here — both files are async/effect surface; splitting at the file boundary doesn't bound a different review surface.

**Estimate**: ~28-30 tests across 2 new test files. Test count delta: 415 → ~443. Codex catches expected: 2-4 (Phase 5 cadence; the async/cache surface is the highest-blind-spot territory in Phase 5).
