// Streaming-consumer tests for `streamRawText`.
//
// These tests build hand-rolled `ReadableStream` instances rather than
// mocking `fetch` directly so the cap-and-cancel mechanism is exercised
// on a real stream. The `cancelSpy` returned by `makeResponse` records
// whether `reader.cancel()` actually fired — proving the byte cap
// short-circuits the reader instead of just stopping the loop and
// letting the rest of the body drain in the background. This is the
// "memory-leak magnet" failure mode the spec calls out (spec line 1110:
// `reader.cancel()` proven by spy).
//
// Because `streamRawText` opens the response itself (via `streamSessionRaw`
// in `lib/api.ts`), tests stub `globalThis.fetch` to return the
// hand-built `Response`s. This mirrors the existing test pattern in
// `Toast.test.tsx`, `ActionBar.test.tsx`, `Pagination.test.tsx`,
// `SessionsTable.test.tsx`.
//
// Coverage map (10 tests):
//    1. small payload returns full text + totalBytes equals byte length
//       + truncated false + no cancel.
//    2. empty body (zero chunks) returns empty result without error.
//    3. body-less response (Response(null)) returns empty result.
//    4. byte cap fires on a chunk > 5 MB and reader.cancel() proven by
//       spy + totalBytes === STREAM_RAW_TEXT_BYTE_CAP exactly.
//    5. cap fires across multiple smaller chunks (cumulative breach).
//    6. pre-aborted signal throws AbortError WITHOUT opening a reader.
//    7. abort mid-loop rejects with AbortError and reader.cancel() fires.
//    8. abort AFTER cap resolution is a no-op for the consumer.
//    9. multi-byte UTF-8 chunk that fits returns intact text + totalBytes
//       reflects byte length, NOT string length.
//   10. multi-byte UTF-8 character straddling the cap boundary truncates
//       cleanly without throwing; totalBytes === cap exactly.

import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
  STREAM_RAW_TEXT_BYTE_CAP,
  streamRawText,
} from "./streamRawText";

let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

/**
 * Build a `Response` whose body streams the supplied chunks in order
 * and whose `cancel` method increments a counter so the test can
 * assert reader cancellation independently from the resolved-state
 * flag.
 *
 * Why the spy wraps `getReader().cancel`, not the underlying-source
 * `cancel`: the underlying-source `cancel` fires whenever the stream
 * is aborted, but proving the consumer ALSO reaches `reader.cancel()`
 * requires intercepting the reader-side call. We wrap `getReader()`
 * on the `Response.body` so the spy sees the consumer's invocation.
 *
 * Mirrors `rawPreview.test.ts:53-94` exactly.
 */
function makeResponse(
  chunks: Uint8Array[],
  options: { status?: number; headers?: Record<string, string> } = {},
): { response: Response; cancelSpy: { count: number; lastReason?: unknown } } {
  const cancelSpy = { count: 0, lastReason: undefined as unknown };
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        if (cancelled) return;
        controller.enqueue(chunk);
      }
      if (!cancelled) controller.close();
    },
    cancel(reason) {
      cancelled = true;
      cancelSpy.lastReason = reason;
    },
  });

  const originalGetReader = stream.getReader.bind(stream);
  (stream as unknown as { getReader: typeof originalGetReader }).getReader =
    () => {
      const reader = originalGetReader();
      const originalCancel = reader.cancel.bind(reader);
      reader.cancel = (reason?: unknown) => {
        cancelSpy.count += 1;
        cancelSpy.lastReason = reason;
        return originalCancel(reason);
      };
      return reader;
    };

  const response = new Response(stream, {
    status: options.status ?? 200,
    headers: options.headers,
  });
  return { response, cancelSpy };
}

/**
 * Stub `globalThis.fetch` so it returns the supplied `Response` for
 * any call. `streamSessionRaw` calls `fetch` once per request; we
 * don't need URL-pattern routing for these tests because each test
 * invokes `streamRawText` exactly once.
 */
function stubFetchWithResponse(response: Response): void {
  globalThis.fetch = mock(async () =>
    response,
  ) as unknown as typeof globalThis.fetch;
}

const ENC = new TextEncoder();

test("streamRawText: small ASCII payload returns full text + totalBytes equals byte length + truncated false + no cancel", async () => {
  const text = "A".repeat(1024); // 1 KB ASCII; byte length === char length.
  const encoded = ENC.encode(text);
  const { response, cancelSpy } = makeResponse([encoded]);
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const result = await streamRawText("uid-small", controller.signal);
  expect(result.text).toBe(text);
  expect(result.totalBytes).toBe(encoded.byteLength);
  expect(result.totalBytes).toBe(1024);
  expect(result.truncated).toBe(false);
  expect(cancelSpy.count).toBe(0);
});

test("streamRawText: empty body returns empty result without error", async () => {
  // Stream that closes immediately with no chunks emitted.
  const { response, cancelSpy } = makeResponse([]);
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const result = await streamRawText("uid-empty", controller.signal);
  expect(result.text).toBe("");
  expect(result.totalBytes).toBe(0);
  expect(result.truncated).toBe(false);
  expect(cancelSpy.count).toBe(0);
});

test("streamRawText: body-less response returns empty result without throwing", async () => {
  // 204 with `null` body — `streamSessionRaw` accepts 2xx so this
  // surfaces as a body-less success that the consumer must handle
  // defensively. Mirrors `rawPreview` test #8.
  const response = new Response(null, { status: 204 });
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const result = await streamRawText("uid-204", controller.signal);
  expect(result.text).toBe("");
  expect(result.totalBytes).toBe(0);
  expect(result.truncated).toBe(false);
});

test("streamRawText: byte cap fires on a chunk > 5 MB and reader.cancel() proven by spy + totalBytes === STREAM_RAW_TEXT_BYTE_CAP exactly", async () => {
  // Construct a single chunk of (STREAM_RAW_TEXT_BYTE_CAP + 16384) bytes.
  // 'A' filler so byte length == char length; the cap-equality assertion
  // is the load-bearing one. Naïve cumulative counters that absorb the
  // whole over-cap chunk would overshoot — that is the codex-blind-spot
  // precedent this test defends against.
  const chunkSize = STREAM_RAW_TEXT_BYTE_CAP + 16_384;
  const payload = "A".repeat(chunkSize);
  const encoded = ENC.encode(payload);
  expect(encoded.byteLength).toBe(chunkSize);

  const { response, cancelSpy } = makeResponse([encoded]);
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const result = await streamRawText("uid-big", controller.signal);
  expect(result.truncated).toBe(true);
  // EXACT cap equality — the load-bearing invariant.
  expect(result.totalBytes).toBe(STREAM_RAW_TEXT_BYTE_CAP);
  // text holds exactly STREAM_RAW_TEXT_BYTE_CAP UTF-8 bytes;
  // since 'A' is single-byte, char length === byte length here.
  expect(result.text.length).toBe(STREAM_RAW_TEXT_BYTE_CAP);
  // reader.cancel() MUST have fired — the cap stops mid-stream.
  expect(cancelSpy.count).toBeGreaterThanOrEqual(1);
});

test("streamRawText: cap fires across multiple smaller chunks (cumulative breach)", async () => {
  // Five chunks of 1.5 MB each = 7.5 MB total. The cap fires partway
  // through the 4th chunk (3 × 1.5 MB = 4.5 MB; 4th chunk pushes to
  // 6 MB which exceeds the 5 MB cap, so the slice on the 4th chunk
  // brings totalBytes to STREAM_RAW_TEXT_BYTE_CAP exactly).
  const chunkBytes = 1.5 * 1024 * 1024;
  const chunk = ENC.encode("B".repeat(chunkBytes));
  const { response, cancelSpy } = makeResponse([
    chunk,
    chunk,
    chunk,
    chunk,
    chunk,
  ]);
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const result = await streamRawText("uid-cum", controller.signal);
  expect(result.truncated).toBe(true);
  expect(result.totalBytes).toBe(STREAM_RAW_TEXT_BYTE_CAP);
  // cancel() fires exactly once — cap-trip path is single-shot.
  expect(cancelSpy.count).toBe(1);
});

test("streamRawText: pre-aborted signal throws AbortError WITHOUT opening a reader", async () => {
  const { response, cancelSpy } = makeResponse([ENC.encode("never-read")]);
  // Track fetch invocations: a pre-aborted signal must short-circuit
  // BEFORE `streamSessionRaw` calls fetch.
  const fetchMock = mock(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const controller = new AbortController();
  controller.abort();

  let caught: unknown = null;
  try {
    await streamRawText("uid-pre-aborted", controller.signal);
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  expect((caught as Error | null)?.name).toBe("AbortError");
  // The reader was never opened: cancelSpy.count === 0 PROVES it.
  // (The fetch is also short-circuited; assert that too for defense
  // in depth.)
  expect(cancelSpy.count).toBe(0);
  expect(fetchMock).toHaveBeenCalledTimes(0);
});

test("streamRawText: abort mid-loop rejects with AbortError and reader.cancel() fires", async () => {
  // Build a stream that emits one chunk then waits forever on the
  // next read so the abort can fire mid-loop. The infinite-pull
  // pattern: enqueue a starter chunk, never close the controller;
  // the consumer's read() will hang waiting for more data, at which
  // point the test fires abort.
  const cancelSpy = { count: 0, lastReason: undefined as unknown };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(ENC.encode("hello"));
      // Intentionally do NOT close — the consumer's next read()
      // awaits indefinitely until abort fires.
    },
    cancel(reason) {
      cancelSpy.lastReason = reason;
    },
  });
  const originalGetReader = stream.getReader.bind(stream);
  (stream as unknown as { getReader: typeof originalGetReader }).getReader =
    () => {
      const reader = originalGetReader();
      const originalCancel = reader.cancel.bind(reader);
      reader.cancel = (reason?: unknown) => {
        cancelSpy.count += 1;
        cancelSpy.lastReason = reason;
        return originalCancel(reason);
      };
      return reader;
    };
  const response = new Response(stream);
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const promise = streamRawText("uid-abort", controller.signal);

  // Wait a few microtasks so the consumer is past the first read()
  // and genuinely awaiting on the next one.
  await Promise.resolve();
  await Promise.resolve();

  controller.abort();

  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  expect((caught as Error | null)?.name).toBe("AbortError");
  // reader.cancel() fired via the abort listener.
  expect(cancelSpy.count).toBeGreaterThanOrEqual(1);
});

test("streamRawText: abort AFTER cap resolution is a no-op for the consumer", async () => {
  // Cap fires first; THEN external abort lands on the (already-resolved)
  // signal. The resolved result must remain intact and the abort must
  // not throw.
  const chunkSize = STREAM_RAW_TEXT_BYTE_CAP + 1024;
  const encoded = ENC.encode("C".repeat(chunkSize));
  const { response, cancelSpy } = makeResponse([encoded]);
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const result = await streamRawText("uid-post-abort", controller.signal);
  expect(result.truncated).toBe(true);
  expect(result.totalBytes).toBe(STREAM_RAW_TEXT_BYTE_CAP);
  expect(cancelSpy.count).toBeGreaterThanOrEqual(1);

  // Abort post-resolution — must not throw.
  expect(() => controller.abort()).not.toThrow();
  // Result is unchanged.
  expect(result.truncated).toBe(true);
  expect(result.totalBytes).toBe(STREAM_RAW_TEXT_BYTE_CAP);
});

test("streamRawText: multi-byte UTF-8 chunk that fits returns intact text + totalBytes reflects BYTE length, not string length", async () => {
  // Mix of 1-byte ASCII, 2-byte Latin-1 supplement, and 4-byte
  // surrogate-pair characters so the byte length and the JS
  // string.length differ. This pins the codex-blind-spot precedent:
  // a `string.length` counter would mis-tally these. Spec line 402:
  // `totalBytes` is bytes, NOT characters.
  const text = "héllo \u{1F600} world"; // h=1, é=2, l=1, l=1, o=1, space=1, U+1F600=4 (surrogate pair → 2 UTF-16 units), space=1, w=1, o=1, r=1, l=1, d=1
  const encoded = ENC.encode(text);
  // Sanity-check that byte length and string.length differ — if they
  // matched, this test would not actually exercise the byte-vs-string
  // distinction. text.length counts UTF-16 units; encoded.byteLength
  // counts UTF-8 bytes.
  expect(encoded.byteLength).not.toBe(text.length);
  const { response, cancelSpy } = makeResponse([encoded]);
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const result = await streamRawText("uid-utf8-fit", controller.signal);
  expect(result.text).toBe(text);
  expect(result.totalBytes).toBe(encoded.byteLength);
  expect(result.truncated).toBe(false);
  expect(cancelSpy.count).toBe(0);
});

test("streamRawText: multi-byte UTF-8 character straddling the cap boundary truncates cleanly without throwing", async () => {
  // Construct a payload where a 4-byte UTF-8 codepoint (U+1F600)
  // straddles STREAM_RAW_TEXT_BYTE_CAP. The first chunk fills
  // (STREAM_RAW_TEXT_BYTE_CAP - 2) bytes of 'A'; the second chunk
  // is the 4-byte UTF-8 encoding of U+1F600 — only 2 bytes of which
  // fit under the cap. The slice via `value.subarray(0, room)`
  // splits the codepoint at byte boundary 2; `decoder.decode(
  // slicedChunk, { stream: false })` emits U+FFFD for the broken
  // half-codepoint. Spec line 402 anchors `totalBytes` to UTF-8
  // byte length, accepting the U+FFFD trade-off.
  const room = 2;
  const fillerSize = STREAM_RAW_TEXT_BYTE_CAP - room;
  const filler = ENC.encode("A".repeat(fillerSize));
  const emoji = ENC.encode("\u{1F600}"); // 4 bytes
  expect(emoji.byteLength).toBe(4);
  const { response, cancelSpy } = makeResponse([filler, emoji]);
  stubFetchWithResponse(response);

  const controller = new AbortController();
  const result = await streamRawText("uid-utf8-straddle", controller.signal);
  expect(result.truncated).toBe(true);
  // Cap-equality holds: totalBytes EXACTLY STREAM_RAW_TEXT_BYTE_CAP.
  expect(result.totalBytes).toBe(STREAM_RAW_TEXT_BYTE_CAP);
  // text is a valid string (no throw); may contain U+FFFD where
  // the half-codepoint was — that's acceptable per spec.
  expect(typeof result.text).toBe("string");
  // cancel() fired.
  expect(cancelSpy.count).toBeGreaterThanOrEqual(1);
});
