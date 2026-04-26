// Pure-consumer tests for `consumeRawPreview`.
//
// These tests build hand-rolled `ReadableStream` instances rather than
// mocking `fetch` so the cap-and-cancel mechanism is exercised on a
// real stream. The `cancelSpy` returned by `makeResponse` records
// whether `reader.cancel()` actually fired — proving the byte/line
// cap short-circuits the reader instead of just stopping the loop and
// letting the rest of the body drain in the background (which would
// be the bug class the spec calls out: "memory-leak magnet — test
// must spy on cancel, not just assert the caption").
//
// Coverage map:
//   1. line cap: 25 lines fed → 20 retained, reachedLineCap true,
//      cancel() called.
//   2. below caps: 5 lines + close → 5 retained, neither flag set,
//      cancel() not called (the close is via the stream's natural
//      controller.close()).
//   3. byte cap: a single chunk > 256 KB → reachedByteCap true,
//      cancel() called, lines.length reflects what fit.
//   4. non-JSON fallback: mixed JSON + non-JSON lines → kind matches
//      per line, parse error not swallowed (text fallback emitted).
//   5. abort before cap: AbortController fires mid-loop →
//      consumeRawPreview rejects with AbortError, cancel() called.
//   6. abort after cap: cap fires first, then signal aborts → state
//      remains intact, abort is a no-op for the consumer (caller
//      ignoring AbortError still works because the promise has
//      already resolved).
//   7. pre-aborted signal: signal.aborted === true on entry → throws
//      AbortError WITHOUT opening a reader.
//   8. body-less response: response.body === null → returns empty
//      success without throwing.

import { expect, test } from "bun:test";
import {
  consumeRawPreview,
  RAW_PREVIEW_BYTE_CAP,
  RAW_PREVIEW_LINE_CAP,
} from "./rawPreview";

/**
 * Build a `Response` whose body streams the supplied chunks in order
 * and whose `cancel` method increments a counter so the test can
 * assert reader cancellation independently from the success-state
 * caption.
 *
 * Why `cancelSpy` is wrapped around `reader.cancel` rather than the
 * underlying-source `cancel` method: the underlying-source `cancel`
 * fires when the stream is aborted, but proving the consumer ALSO
 * reaches `reader.cancel()` requires intercepting the reader-side
 * call. We wrap `getReader()` on the Response.body so the spy sees
 * the consumer's `reader.cancel()` invocation.
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

  // Wrap `getReader` so we can spy on the reader's `cancel()` call.
  // The native `ReadableStream` returns a fresh reader instance each
  // call; we proxy it.
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

const ENC = new TextEncoder();
function ndjson(line: string): string {
  return `${line}\n`;
}

test("consumeRawPreview: short-circuits at the line cap and cancels the reader", async () => {
  // 25 lines, each `{"i":N}\n` — well under the byte cap so the line
  // cap is the one that fires.
  const lines = Array.from(
    { length: 25 },
    (_, i) => ndjson(`{"i":${i}}`),
  );
  const { response, cancelSpy } = makeResponse([ENC.encode(lines.join(""))]);

  const state = await consumeRawPreview(response);
  expect(state.kind).toBe("success");
  if (state.kind !== "success") return;
  expect(state.lines.length).toBe(RAW_PREVIEW_LINE_CAP); // 20
  expect(state.reachedLineCap).toBe(true);
  expect(state.reachedByteCap).toBe(false);
  // cancel() must have been called — the cap stops mid-stream.
  expect(cancelSpy.count).toBeGreaterThanOrEqual(1);
  // The first line decodes as JSON.
  expect(state.lines[0]).toEqual({
    kind: "json",
    raw: '{"i":0}',
    parsed: { i: 0 },
  });
});

test("consumeRawPreview: success below caps emits all lines without cancelling", async () => {
  // 5 lines, well below both caps.
  const payload = [
    ndjson('{"a":1}'),
    ndjson('{"b":2}'),
    ndjson('{"c":3}'),
    ndjson('{"d":4}'),
    ndjson('{"e":5}'),
  ].join("");
  const { response, cancelSpy } = makeResponse([ENC.encode(payload)]);

  const state = await consumeRawPreview(response);
  expect(state.kind).toBe("success");
  if (state.kind !== "success") return;
  expect(state.lines.length).toBe(5);
  expect(state.reachedLineCap).toBe(false);
  expect(state.reachedByteCap).toBe(false);
  // cancel() should NOT have been called — the stream closed
  // naturally via controller.close().
  expect(cancelSpy.count).toBe(0);
});

test("consumeRawPreview: byte cap fires on a >256 KB chunk and cancels the reader", async () => {
  // Construct a single chunk of (RAW_PREVIEW_BYTE_CAP + 16384) bytes
  // containing a long NDJSON line whose JSON value is one giant
  // string. We pick a payload size > 256 KB so the byte cap MUST
  // fire on this single chunk.
  //
  // Shape: `{"large_field":"AAAAA...AAAAA"}\n` followed by trailing
  // garbage padding to push the chunk past the byte cap. The first
  // newline lets the consumer extract one complete line; the rest
  // of the chunk increments bytesRead past the cap.
  //
  // We use 'A' as the filler byte because every 'A' is a single
  // UTF-8 code unit, so the byte length and the character length
  // are equal.
  const chunkSize = RAW_PREVIEW_BYTE_CAP + 16_384; // ~272 KB
  const lineHeader = '{"large_field":"';
  const lineFooter = '"}\n';
  // First line: 1 KB of 'A' wrapped in JSON. Tiny so it parses
  // fast and we can assert the parsed shape if we want.
  const firstLineBody = "A".repeat(1024);
  const firstLine = lineHeader + firstLineBody + lineFooter;
  // Pad the remainder with 'B' bytes (no newline) so the rest of
  // the chunk drives bytesRead past the cap without producing more
  // complete lines.
  const remaining = chunkSize - firstLine.length;
  // Defensive: the chunk MUST exceed RAW_PREVIEW_BYTE_CAP so the
  // cap fires. The math above guarantees it (chunkSize is +16 KB
  // above the cap), but assert the invariant for documentation.
  expect(chunkSize).toBeGreaterThan(RAW_PREVIEW_BYTE_CAP);
  const payload = firstLine + "B".repeat(remaining);
  const encoded = ENC.encode(payload);
  expect(encoded.byteLength).toBe(chunkSize);

  const { response, cancelSpy } = makeResponse([encoded]);
  const state = await consumeRawPreview(response);

  expect(state.kind).toBe("success");
  if (state.kind !== "success") return;
  expect(state.reachedByteCap).toBe(true);
  expect(state.reachedLineCap).toBe(false);
  // bytesRead reflects the entire chunk we fed (the cap check
  // fires AFTER chunk processing so the byte counter already
  // includes this chunk).
  expect(state.bytesRead).toBe(chunkSize);
  // The first line was complete and got captured.
  expect(state.lines.length).toBeGreaterThanOrEqual(1);
  expect(state.lines[0]?.kind).toBe("json");
  // cancel() MUST have been called — the byte cap is the whole
  // point of this test.
  expect(cancelSpy.count).toBeGreaterThanOrEqual(1);
});

test("consumeRawPreview: non-JSON line falls back to plain text without swallowing the parse error", async () => {
  const payload = [
    ndjson('{"good":1}'),
    ndjson("not json"),
    ndjson('{"also good":2}'),
  ].join("");
  const { response } = makeResponse([ENC.encode(payload)]);

  const state = await consumeRawPreview(response);
  expect(state.kind).toBe("success");
  if (state.kind !== "success") return;
  expect(state.lines.length).toBe(3);
  expect(state.lines[0]).toEqual({
    kind: "json",
    raw: '{"good":1}',
    parsed: { good: 1 },
  });
  expect(state.lines[1]).toEqual({
    kind: "text",
    raw: "not json",
  });
  expect(state.lines[2]).toEqual({
    kind: "json",
    raw: '{"also good":2}',
    parsed: { "also good": 2 },
  });
});

test("consumeRawPreview: signal abort before cap rejects with AbortError and cancels the reader", async () => {
  // Build a stream that emits one chunk then waits forever on the
  // next read so the abort can fire mid-loop. The infinite-pull
  // pattern is: enqueue a starter chunk, then never close the
  // controller; the consumer's read() will hang waiting for more
  // data, at which point we fire the abort.
  let abortListenerInstalled = false;
  const cancelSpy = { count: 0, lastReason: undefined as unknown };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(ENC.encode(ndjson('{"i":0}')));
      abortListenerInstalled = true;
      // Intentionally do not close — we want the consumer's next
      // read() to await indefinitely until abort fires.
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
  const controller = new AbortController();
  const promise = consumeRawPreview(response, controller.signal);

  // Wait a tick so the consumer is past the first read() and
  // genuinely waiting on the next one.
  await Promise.resolve();
  await Promise.resolve();
  expect(abortListenerInstalled).toBe(true);

  controller.abort();

  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  expect((caught as Error | null)?.name).toBe("AbortError");
  expect(cancelSpy.count).toBeGreaterThanOrEqual(1);
});

test("consumeRawPreview: signal abort AFTER cap fires is a no-op for the consumer", async () => {
  // 25 lines fits the line cap. After consumeRawPreview resolves,
  // firing abort on the (already-canceled) signal must NOT throw
  // and the resolved state must remain intact.
  const lines = Array.from(
    { length: 25 },
    (_, i) => ndjson(`{"i":${i}}`),
  );
  const { response, cancelSpy } = makeResponse([ENC.encode(lines.join(""))]);
  const controller = new AbortController();

  const state = await consumeRawPreview(response, controller.signal);
  expect(state.kind).toBe("success");
  if (state.kind !== "success") return;
  expect(state.reachedLineCap).toBe(true);
  expect(state.lines.length).toBe(RAW_PREVIEW_LINE_CAP);
  // cancel() ran at the cap.
  expect(cancelSpy.count).toBeGreaterThanOrEqual(1);

  // Now abort post-resolution. Must not throw.
  expect(() => controller.abort()).not.toThrow();
  // State unchanged.
  expect(state.lines.length).toBe(RAW_PREVIEW_LINE_CAP);
});

test("consumeRawPreview: pre-aborted signal throws AbortError without opening a reader", async () => {
  const { response, cancelSpy } = makeResponse([
    ENC.encode(ndjson('{"never":"read"}')),
  ]);
  const controller = new AbortController();
  controller.abort();

  let caught: unknown = null;
  try {
    await consumeRawPreview(response, controller.signal);
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  expect((caught as Error | null)?.name).toBe("AbortError");
  // The reader was never opened, so cancelSpy never incremented.
  expect(cancelSpy.count).toBe(0);
});

test("consumeRawPreview: body-less response returns empty success", async () => {
  // Construct a Response with a null body (e.g. a 204). The
  // consumer must return an empty success rather than throwing.
  const response = new Response(null, { status: 204 });
  const state = await consumeRawPreview(response);
  expect(state.kind).toBe("success");
  if (state.kind !== "success") return;
  expect(state.lines.length).toBe(0);
  expect(state.reachedLineCap).toBe(false);
  expect(state.reachedByteCap).toBe(false);
  expect(state.bytesRead).toBe(0);
});
