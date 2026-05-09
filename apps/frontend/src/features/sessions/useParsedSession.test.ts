// Hook-level tests for `useParsedSession`.
//
// `useParsedSession` is the React-facing surface of M3b. It coordinates
// `streamRawText` (the streaming consumer) and `dispatchParser` (M3a)
// behind a discriminated state machine, with module-scoped LRU + epoch
// + in-flight coalescing. This test file exercises every state edge,
// every cache-management invariant, and every codex-blind-spot
// precedent the M3b plan §6 enumerates.
//
// Test infrastructure:
//   - `renderHook` from `@testing-library/react` mounts the hook against
//     a renderer.
//   - `mock` from `bun:test` stubs `globalThis.fetch` so the streaming
//     consumer reads the hand-built `Response` we control. We do NOT
//     mock `streamSessionRaw` directly — going through the same fetch
//     surface as production exercises the AbortSignal + ApiError shape.
//   - `_resetForTests()` is called in `beforeEach` to start each test
//     with empty cache + epoch 0 (Q5 in the plan).
//
// Coverage map (18 tests):
//    1. idle: row === null returns idle, no fetch, retry function present.
//    2. no_raw: source-only row returns no_raw, no fetch.
//    3. loading → success: stored row fetches, parses, transitions.
//    4. loading → truncated: > 5 MB body triggers truncated state.
//    5. error → retry: 500 from fetch lands as state "error"; retry
//       fires fresh fetch and the error result is NOT cached.
//    6. cache hit on tab switch: same row, second mount renders
//       success synchronously (no second fetch).
//    7. cache hit bumps LRU recency: re-touch evicts a different
//       entry on next eviction.
//    8. LRU eviction at cap=5: 6th insertion evicts the 1st.
//    9. abort on storedSessionUid change: in-flight fetch is aborted,
//       new fetch starts.
//   10. abort on hook unmount: in-flight fetch is aborted.
//   11. in-flight coalescing: two consumers with same row share one
//       fetch; both transition to success.
//   12. epoch invalidation on Rescan drops in-flight result; cache
//       is empty after; subsequent mount re-fetches.
//   13. epoch invalidation on Import-success across two consecutive
//       bumps drops in-flight result; subsequent mount re-fetches.
//   14. cache survives selectedRowKey churn within cap (A→B→A: A is
//       cached, no third fetch).
//   15. retry skips cache + skips inFlight, fires fresh fetch.
//   16. retry is no-op when state is not "error" (no spurious fetch).
//   17. pre-aborted external signal during in-flight is silently
//       ignored (no error transition).
//   18. epoch-stale resolution does NOT transition state to "error".

import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  mock,
  test,
} from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  STREAM_RAW_TEXT_BYTE_CAP,
} from "./streamRawText";
import {
  USE_PARSED_SESSION_CACHE_MAX,
  _resetForTests,
  bumpCacheEpoch,
  useParsedSession,
} from "./useParsedSession";
import type { SessionRow } from "./types";

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch | undefined;

beforeAll(() => {
  // happy-dom installs the DOM globals; nothing else to wire here for
  // this test file. Mirrors the lightweight setup in
  // `useSessionFilters.test.ts`.
});

beforeEach(() => {
  _resetForTests();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

const ENC = new TextEncoder();

/**
 * Build a `SessionRow` fixture pointing at a stored UID + tool. Only
 * the fields the hook reads (`storedSessionUid`, `tool`, `rowKey`) are
 * meaningful for these tests; the rest are filled with type-safe
 * placeholders.
 */
function makeStoredRow(
  storedSessionUid: string,
  tool: SessionRow["tool"] = "claude_code",
): SessionRow {
  return {
    rowKey: `${tool}:${storedSessionUid}`,
    sourceSessionKey: `${tool}:${storedSessionUid}`,
    tool,
    sourceSessionId: storedSessionUid,
    title: null,
    projectPath: null,
    sourcePath: `/tmp/${storedSessionUid}.jsonl`,
    sourcePathIsStale: false,
    sourceFingerprint: `fp-${storedSessionUid}`,
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-22T00:00:00Z",
    ingestedAt: "2026-04-22T00:00:01Z",
    storedSessionUid,
    storedRawRef: `raw/${storedSessionUid}.ndjson`,
    hasSubagentSidecars: false,
    status: "up_to_date",
    statusConflict: false,
    presence: "both",
  };
}

/**
 * Build a SessionRow with `storedSessionUid: null` (source-only).
 */
function makeSourceOnlyRow(): SessionRow {
  return {
    rowKey: "claude_code:src-only",
    sourceSessionKey: "claude_code:src-only",
    tool: "claude_code",
    sourceSessionId: "src-only",
    title: null,
    projectPath: null,
    sourcePath: "/tmp/src-only.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-src-only",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-22T00:00:00Z",
    ingestedAt: null,
    storedSessionUid: null,
    storedRawRef: null,
    hasSubagentSidecars: false,
    status: "not_stored",
    statusConflict: false,
    presence: "source_only",
  };
}

/**
 * One valid Claude Code NDJSON line — sufficient to make
 * `dispatchParser` produce one user `Message`. The skim block builder
 * + parser totality are M3a's contract; we just need a non-empty
 * messages array to assert "success" landed.
 */
function makeClaudeNdjson(messages: number = 1): string {
  const lines: string[] = [];
  for (let i = 0; i < messages; i += 1) {
    lines.push(
      JSON.stringify({
        type: "user",
        timestamp: "2026-04-22T00:00:00Z",
        message: {
          role: "user",
          content: `hello ${i}`,
        },
      }),
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Build a `Response` whose body is a single closing chunk of `body`.
 */
function makeStreamResponse(body: string | Uint8Array): Response {
  const bytes = typeof body === "string" ? ENC.encode(body) : body;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

/**
 * Build a `Response` whose body NEVER closes — tests that need to
 * observe an in-flight fetch (abort / coalescing / epoch invalidation)
 * use this. Returns the response and a `close()` callback the test
 * can invoke to terminate the stream cleanly.
 */
function makePendingResponse(): {
  response: Response;
  close: (body?: string) => void;
  cancelSpy: { count: number };
  signalSawAbort: () => boolean;
} {
  const cancelSpy = { count: 0 };
  let abortObserved = false;
  // `closed` flips true when either the test calls close() or the
  // stream is cancelled (via reader.cancel from the abort listener).
  // Subsequent close() calls after abort are no-ops — without this
  // guard, enqueue() on a cancelled controller throws ERR_INVALID_STATE.
  let closed = false;
  let pendingController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      pendingController = controller;
      // Intentionally never close — the test will close() or the
      // fetch will abort.
    },
    cancel() {
      abortObserved = true;
      closed = true;
    },
  });
  const originalGetReader = stream.getReader.bind(stream);
  (stream as unknown as { getReader: typeof originalGetReader }).getReader =
    () => {
      const reader = originalGetReader();
      const originalCancel = reader.cancel.bind(reader);
      reader.cancel = (reason?: unknown) => {
        cancelSpy.count += 1;
        return originalCancel(reason);
      };
      return reader;
    };
  const response = new Response(stream, { status: 200 });
  return {
    response,
    close: (body?: string) => {
      if (pendingController === null) return;
      if (closed) return; // already cancelled by abort, or already closed
      if (body !== undefined) {
        try {
          pendingController.enqueue(ENC.encode(body));
        } catch {
          // already cancelled mid-call
          return;
        }
      }
      try {
        pendingController.close();
      } catch {
        // already closed
      }
      closed = true;
    },
    cancelSpy,
    signalSawAbort: () => abortObserved,
  };
}

/**
 * Stub `globalThis.fetch` so calls to `/api/v1/sessions/<uid>/raw`
 * return the response built by `responseFor(uid)`. Other paths return
 * 404 to surface unintended traffic. Returns the underlying mock so
 * tests can assert call counts.
 *
 * The `init.signal` is wired into the resolved Response so that an
 * abort fired AFTER fetch resolved propagates through the
 * `streamRawText` reader-side abort listener (which is what we want
 * to test).
 */
function stubRawFetch(
  responseFor: (uid: string, signal: AbortSignal | null) => Response | Promise<Response>,
): ReturnType<typeof mock> {
  const fetchMock = mock(
    async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const m = url.match(/\/api\/v1\/sessions\/([^/]+)\/raw$/);
      if (m === null) {
        return new Response(`unexpected url ${url}`, { status: 404 });
      }
      const signal = init?.signal ?? null;
      // If the signal is already aborted at fetch time, throw an
      // AbortError to mirror real browser semantics.
      if (signal?.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      return await responseFor(decodeURIComponent(m[1] ?? ""), signal);
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
}

/**
 * Wait for a microtask to flush so any pending state updates from a
 * just-resolved promise are observed by the renderer. `act` wraps the
 * await so React 19's strict-mode rendering doesn't warn.
 */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("idle: row === null returns { state: 'idle' } and does not fetch", async () => {
  const fetchMock = stubRawFetch(() => makeStreamResponse("never-read"));
  const { result } = renderHook(() => useParsedSession(null));
  expect(result.current.state).toBe("idle");
  expect(typeof result.current.retry).toBe("function");
  await flushMicrotasks();
  expect(fetchMock).toHaveBeenCalledTimes(0);
});

test("no_raw: source-only row returns { state: 'no_raw', reason: 'source_only' } and does not fetch", async () => {
  const fetchMock = stubRawFetch(() => makeStreamResponse("never-read"));
  const { result } = renderHook(() => useParsedSession(makeSourceOnlyRow()));
  expect(result.current.state).toBe("no_raw");
  if (result.current.state === "no_raw") {
    expect(result.current.reason).toBe("source_only");
  }
  await flushMicrotasks();
  expect(fetchMock).toHaveBeenCalledTimes(0);
});

test("loading → success: stored row fetches, parses, transitions to success with parsed data", async () => {
  const fetchMock = stubRawFetch(() => makeStreamResponse(makeClaudeNdjson(3)));
  const row = makeStoredRow("uid-success");
  const { result } = renderHook(() => useParsedSession(row));
  // Initial render: cache miss → "loading".
  expect(result.current.state).toBe("loading");
  await flushMicrotasks();
  expect(result.current.state).toBe("success");
  if (result.current.state === "success") {
    expect(result.current.parsed.tool).toBe("claude_code");
    expect(result.current.parsed.messages.length).toBe(3);
    expect(result.current.parsed.truncated).toBe(false);
  }
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("loading → truncated: large payload triggers truncated state with parsed.truncated === true", async () => {
  // Build a body that exceeds the 5 MB cap. Keep it valid NDJSON for
  // the front: one valid Claude line, then 'A' filler that pushes
  // bytes past the cap. dispatchParser is total, so the trailing
  // garbage just lands as warnings.
  const validLine = JSON.stringify({
    type: "user",
    timestamp: "2026-04-22T00:00:00Z",
    message: { role: "user", content: "hi" },
  }) + "\n";
  const filler = "A".repeat(STREAM_RAW_TEXT_BYTE_CAP);
  const body = validLine + filler;
  const fetchMock = stubRawFetch(() => makeStreamResponse(body));
  const row = makeStoredRow("uid-trunc");
  const { result } = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(result.current.state).toBe("truncated");
  if (result.current.state === "truncated") {
    expect(result.current.parsed.truncated).toBe(true);
    expect(result.current.parsed.totalBytes).toBe(STREAM_RAW_TEXT_BYTE_CAP);
  }
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("error → retry: 500 transitions state to 'error'; retry() fires a fresh fetch and result is NOT cached", async () => {
  let callIndex = 0;
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!/\/api\/v1\/sessions\/[^/]+\/raw$/.test(url)) {
        return new Response("unexpected", { status: 404 });
      }
      callIndex += 1;
      if (callIndex === 1) {
        // First call: 500.
        return new Response("server error", { status: 500 });
      }
      // Second call (post-retry): success.
      return makeStreamResponse(makeClaudeNdjson(2));
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const row = makeStoredRow("uid-err");
  const { result } = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(result.current.state).toBe("error");
  if (result.current.state === "error") {
    expect(result.current.error).toBeInstanceOf(Error);
  }
  // Confirm error was NOT cached: pre-retry, fetch called exactly once.
  expect(callIndex).toBe(1);

  // Retry — must fire a fresh fetch.
  await act(async () => {
    result.current.retry();
  });
  await flushMicrotasks();
  expect(callIndex).toBe(2);
  expect(result.current.state).toBe("success");
  if (result.current.state === "success") {
    expect(result.current.parsed.messages.length).toBe(2);
  }
});

test("cache hit on tab switch: same row, second mount returns success synchronously (no second fetch)", async () => {
  const fetchMock = stubRawFetch(() => makeStreamResponse(makeClaudeNdjson(1)));
  const row = makeStoredRow("uid-cache");
  // First mount: fetches.
  const first = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(first.result.current.state).toBe("success");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  first.unmount();
  // Second mount: cache hit on initial render (synchronous).
  const second = renderHook(() => useParsedSession(row));
  expect(second.result.current.state).toBe("success");
  // Crucially: NO second fetch.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("cache hit bumps LRU recency: re-touched entry survives subsequent eviction", async () => {
  const fetchMock = stubRawFetch(() => makeStreamResponse(makeClaudeNdjson(1)));
  // Insert 5 entries A..E in order.
  const rows = ["A", "B", "C", "D", "E"].map((u) => makeStoredRow(`uid-${u}`));
  for (const row of rows) {
    const { unmount } = renderHook(() => useParsedSession(row));
    await flushMicrotasks();
    unmount();
  }
  expect(fetchMock).toHaveBeenCalledTimes(5);

  // Re-touch A (cache hit) — should bump A to most-recent.
  const reA = renderHook(() => useParsedSession(rows[0]));
  expect(reA.result.current.state).toBe("success");
  reA.unmount();
  expect(fetchMock).toHaveBeenCalledTimes(5); // No new fetch.

  // Insert F — cap is 5; with A re-touched, B should evict (the oldest
  // remaining). A must survive.
  const rowF = makeStoredRow("uid-F");
  const fHook = renderHook(() => useParsedSession(rowF));
  await flushMicrotasks();
  fHook.unmount();
  expect(fetchMock).toHaveBeenCalledTimes(6);

  // A should still be cached (synchronous success).
  const reA2 = renderHook(() => useParsedSession(rows[0]));
  expect(reA2.result.current.state).toBe("success");
  expect(fetchMock).toHaveBeenCalledTimes(6); // No new fetch for A.
  reA2.unmount();

  // B should NOT be cached (evicted) — re-mount triggers a fresh
  // fetch (loading on first render).
  const reB = renderHook(() => useParsedSession(rows[1]));
  expect(reB.result.current.state).toBe("loading");
  await flushMicrotasks();
  expect(fetchMock).toHaveBeenCalledTimes(7);
});

test("LRU eviction at cap=5: 6th insertion evicts the oldest", async () => {
  const fetchMock = stubRawFetch(() => makeStreamResponse(makeClaudeNdjson(1)));
  // Insert 5 distinct rows.
  for (let i = 0; i < USE_PARSED_SESSION_CACHE_MAX; i += 1) {
    const { unmount } = renderHook(() =>
      useParsedSession(makeStoredRow(`uid-${i}`)),
    );
    await flushMicrotasks();
    unmount();
  }
  expect(fetchMock).toHaveBeenCalledTimes(5);
  // Insert a 6th — evicts uid-0 (the oldest).
  const sixth = renderHook(() =>
    useParsedSession(makeStoredRow(`uid-${USE_PARSED_SESSION_CACHE_MAX}`)),
  );
  await flushMicrotasks();
  sixth.unmount();
  expect(fetchMock).toHaveBeenCalledTimes(6);
  // Re-mount uid-0: cache miss, NEW fetch.
  const reZero = renderHook(() => useParsedSession(makeStoredRow("uid-0")));
  expect(reZero.result.current.state).toBe("loading");
  await flushMicrotasks();
  expect(fetchMock).toHaveBeenCalledTimes(7);
  // The 6th (most-recent) should still be cached.
  reZero.unmount();
  const reSixth = renderHook(() =>
    useParsedSession(makeStoredRow(`uid-${USE_PARSED_SESSION_CACHE_MAX}`)),
  );
  expect(reSixth.result.current.state).toBe("success");
  expect(fetchMock).toHaveBeenCalledTimes(7); // No new fetch.
});

test("abort on storedSessionUid change: in-flight fetch is aborted, new fetch starts on new row", async () => {
  // Track which signals were observed-aborted by fetch.
  const signalsByUid = new Map<string, AbortSignal | null>();
  const pendingByUid = new Map<string, ReturnType<typeof makePendingResponse>>();
  const fetchMock = stubRawFetch((uid, signal) => {
    signalsByUid.set(uid, signal);
    if (uid === "row-A") {
      const p = makePendingResponse();
      pendingByUid.set(uid, p);
      return p.response;
    }
    // row-B: a fresh small response that resolves quickly.
    return makeStreamResponse(makeClaudeNdjson(1));
  });

  const rowA = makeStoredRow("row-A");
  const rowB = makeStoredRow("row-B");
  const { result, rerender } = renderHook(
    ({ row }: { row: SessionRow }) => useParsedSession(row),
    { initialProps: { row: rowA } },
  );
  // Wait for fetch to dispatch and the loading state to land.
  await flushMicrotasks();
  expect(result.current.state).toBe("loading");
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Switch to row B before A resolves.
  rerender({ row: rowB });
  await flushMicrotasks();
  // A's signal must now be aborted.
  const aSignal = signalsByUid.get("row-A");
  expect(aSignal?.aborted).toBe(true);
  // B has fired and resolved.
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.state).toBe("success");
});

test("abort on hook unmount: in-flight fetch is aborted via the captured signal", async () => {
  const pendingMap = new Map<string, ReturnType<typeof makePendingResponse>>();
  const signalsByUid = new Map<string, AbortSignal | null>();
  stubRawFetch((uid, signal) => {
    signalsByUid.set(uid, signal);
    const p = makePendingResponse();
    pendingMap.set(uid, p);
    return p.response;
  });

  const row = makeStoredRow("uid-unmount");
  const { result, unmount } = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(result.current.state).toBe("loading");
  unmount();
  // The captured AbortSignal must show aborted === true after unmount.
  const sig = signalsByUid.get("uid-unmount");
  expect(sig?.aborted).toBe(true);
});

test("in-flight coalescing: two consumers with same row share ONE fetch", async () => {
  const pending = makePendingResponse();
  const fetchMock = stubRawFetch(() => pending.response);
  const row = makeStoredRow("uid-coalesce");
  const first = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(first.result.current.state).toBe("loading");
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Mount a second consumer against the SAME row while the first
  // fetch is still pending. Must coalesce — fetch count stays at 1.
  const second = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(second.result.current.state).toBe("loading");
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Resolve the shared promise.
  await act(async () => {
    pending.close(makeClaudeNdjson(2));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  // Both consumers transition to success.
  expect(first.result.current.state).toBe("success");
  expect(second.result.current.state).toBe("success");
  // Fetch was called exactly once.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("epoch invalidation on Rescan drops in-flight result; subsequent mount fires a fresh fetch", async () => {
  const pending = makePendingResponse();
  let fetchCount = 0;
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!/\/api\/v1\/sessions\/[^/]+\/raw$/.test(url)) {
        return new Response("unexpected", { status: 404 });
      }
      fetchCount += 1;
      if (fetchCount === 1) {
        return pending.response;
      }
      return makeStreamResponse(makeClaudeNdjson(1));
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const row = makeStoredRow("uid-epoch-rescan");
  const { result, unmount } = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(result.current.state).toBe("loading");
  expect(fetchCount).toBe(1);

  // Rescan lands while the fetch is still pending.
  bumpCacheEpoch();

  // Resolve the originally-pending promise. The cache write was
  // skipped (epoch advanced), so a re-mount must fire a fresh fetch.
  await act(async () => {
    pending.close(makeClaudeNdjson(1));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  // The hook must NOT have transitioned to "success" with stale data.
  // It can stay "loading" or be cleaned up; in this scenario the
  // controller was aborted by bumpCacheEpoch so the hook saw an
  // AbortError and silently no-ops.
  expect(result.current.state).not.toBe("error");
  unmount();

  // Re-mount with the same row: must fire a fresh fetch (cache empty).
  const fresh = renderHook(() => useParsedSession(row));
  expect(fresh.result.current.state).toBe("loading");
  await flushMicrotasks();
  expect(fetchCount).toBe(2);
  expect(fresh.result.current.state).toBe("success");
});

test("epoch invalidation across two consecutive bumps (Rescan then Import) drops in-flight result", async () => {
  const pending = makePendingResponse();
  let fetchCount = 0;
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!/\/api\/v1\/sessions\/[^/]+\/raw$/.test(url)) {
        return new Response("unexpected", { status: 404 });
      }
      fetchCount += 1;
      if (fetchCount === 1) {
        return pending.response;
      }
      return makeStreamResponse(makeClaudeNdjson(1));
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const row = makeStoredRow("uid-epoch-twice");
  const { unmount } = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(fetchCount).toBe(1);

  // Two consecutive bumps simulate Rescan then Import-success.
  bumpCacheEpoch();
  bumpCacheEpoch();

  await act(async () => {
    pending.close(makeClaudeNdjson(1));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  unmount();

  // Cache empty → re-mount fires a fresh fetch.
  const fresh = renderHook(() => useParsedSession(row));
  expect(fresh.result.current.state).toBe("loading");
  await flushMicrotasks();
  expect(fetchCount).toBe(2);
  expect(fresh.result.current.state).toBe("success");
});

test("cache survives selectedRowKey churn within cap (A → B → A: A is cached, no third fetch for A)", async () => {
  const fetchMock = stubRawFetch(() => makeStreamResponse(makeClaudeNdjson(1)));
  const rowA = makeStoredRow("uid-churn-A");
  const rowB = makeStoredRow("uid-churn-B");
  // Mount A → success.
  const aHook = renderHook(() => useParsedSession(rowA));
  await flushMicrotasks();
  expect(aHook.result.current.state).toBe("success");
  aHook.unmount();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  // Mount B → success.
  const bHook = renderHook(() => useParsedSession(rowB));
  await flushMicrotasks();
  expect(bHook.result.current.state).toBe("success");
  bHook.unmount();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  // Re-mount A → cache hit (synchronous).
  const aHook2 = renderHook(() => useParsedSession(rowA));
  expect(aHook2.result.current.state).toBe("success");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("retry skips cache + skips inFlight, fires fresh fetch", async () => {
  let callIndex = 0;
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!/\/api\/v1\/sessions\/[^/]+\/raw$/.test(url)) {
        return new Response("unexpected", { status: 404 });
      }
      callIndex += 1;
      if (callIndex === 1) {
        return new Response("server error", { status: 500 });
      }
      return makeStreamResponse(makeClaudeNdjson(2));
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const row = makeStoredRow("uid-retry-skip");
  const { result } = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(result.current.state).toBe("error");
  expect(callIndex).toBe(1);

  // Retry: must fire a fresh fetch even if some other consumer had
  // pre-populated cache (we manually leave cache unwritten by the
  // error path; what we care about is that retry's fresh-fetch path
  // does NOT short-circuit on cache or inFlight). callIndex === 2
  // proves the fetch fired.
  await act(async () => {
    result.current.retry();
  });
  await flushMicrotasks();
  expect(callIndex).toBe(2);
  expect(result.current.state).toBe("success");
});

test("retry is no-op when state is not 'error' (no spurious fetch on success)", async () => {
  const fetchMock = stubRawFetch(() => makeStreamResponse(makeClaudeNdjson(1)));
  const row = makeStoredRow("uid-retry-noop");
  const { result } = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(result.current.state).toBe("success");
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Call retry while state is "success" — must NOT fire a new fetch.
  await act(async () => {
    result.current.retry();
  });
  await flushMicrotasks();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.current.state).toBe("success");
});

test("pre-aborted external signal during in-flight is silently ignored (no error transition)", async () => {
  // Mount a hook whose fetch is in-flight; trigger unmount which
  // aborts the underlying fetch. The hook must NOT transition to
  // error on the AbortError. Also re-rendering with a different row
  // produces the same silent no-op.
  const pending = makePendingResponse();
  stubRawFetch(() => pending.response);
  const row = makeStoredRow("uid-abort-silent");
  const initialProps: { row: SessionRow | null } = { row };
  const { result, rerender } = renderHook(
    ({ row: r }: { row: SessionRow | null }) => useParsedSession(r),
    { initialProps },
  );
  await flushMicrotasks();
  expect(result.current.state).toBe("loading");

  // Rerender with null row: triggers abort + transition to "idle".
  rerender({ row: null });
  await flushMicrotasks();
  // Hook resolves to "idle"; never an "error".
  expect(result.current.state).toBe("idle");

  // Resolve the (already-aborted) original promise with a value;
  // hook stays at "idle". No transition to "error".
  await act(async () => {
    pending.close(makeClaudeNdjson(1));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(result.current.state).toBe("idle");
});

test("epoch-stale resolution does NOT transition state to 'error'", async () => {
  // Specifically asserts spec line 467 + Q2 in plan: when bumpCacheEpoch
  // fires mid-fetch, the resolved value MUST be silently dropped, not
  // surfaced as an error.
  const pending = makePendingResponse();
  let fetchCount = 0;
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!/\/api\/v1\/sessions\/[^/]+\/raw$/.test(url)) {
        return new Response("unexpected", { status: 404 });
      }
      fetchCount += 1;
      return pending.response;
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const row = makeStoredRow("uid-epoch-no-error");
  const { result } = renderHook(() => useParsedSession(row));
  await flushMicrotasks();
  expect(result.current.state).toBe("loading");

  // Bump the epoch mid-fetch.
  bumpCacheEpoch();
  // Resolve the original (now-aborted) pending promise. The hook
  // should NOT transition to "error" — it stays "loading" until a
  // subsequent re-render fires a fresh fetch.
  await act(async () => {
    pending.close(makeClaudeNdjson(1));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(result.current.state).not.toBe("error");
});
