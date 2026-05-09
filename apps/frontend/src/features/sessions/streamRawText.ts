// Streaming consumer for the per-tool parser pipeline (M3b).
//
// `streamRawText` consumes `/api/v1/sessions/:uid/raw` (via
// `streamSessionRaw` in `apps/frontend/src/lib/api.ts`) and accumulates
// the decoded UTF-8 text up to a 5 MB byte cap. This is the I/O layer
// that feeds `dispatchParser` (M3a) — the parser receives the full
// text plus a `StreamMeta { totalBytes, truncated }` so it can branch
// on truncation without re-reading the byte ledger.
//
// Why a 5 MB cap (per `working/phase-5.md` lines 396-420):
//
//   The Skim/Transcript views must eagerly parse the entire payload to
//   index messages and build skim blocks. A naive `.text()` call on a
//   tens-of-MB body would freeze the page. Instead we stream chunks,
//   sum `value.byteLength` (NOT `string.length` — the UTF-16 code-unit
//   count would mis-tally multi-byte characters and silently overshoot
//   the cap), and short-circuit via `reader.cancel()` once the byte
//   sum hits `STREAM_RAW_TEXT_BYTE_CAP`. The slice at the cap boundary
//   is taken on the `Uint8Array` (`value.subarray(0, room)`) so that
//   `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly when truncated —
//   spec line 402 anchors `totalBytes` to UTF-8 byte length and
//   contractually equals the cap on truncate.
//
// Cap semantics (per spec lines 402-403, 418):
//   - `truncated: true` → `totalBytes === STREAM_RAW_TEXT_BYTE_CAP`
//     EXACTLY. The slice in step 6 enforces this; a naïve cumulative
//     counter that swallowed the whole over-cap chunk would overshoot.
//   - `truncated: false` → `totalBytes` is the full payload's UTF-8
//     byte length.
//
// AbortSignal:
//   - Pre-aborted signal: throws `AbortError` synchronously, BEFORE
//     opening a reader (mirrors `consumeRawPreview` line 132-134;
//     matches the standard fetch-API semantics).
//   - Mid-loop abort: a one-shot `addEventListener("abort", ..., { once: true })`
//     listener calls `void reader.cancel()`; the loop re-checks
//     `signal.aborted` before each `read()` and on any `read()`
//     rejection, then throws a fresh `AbortError`.
//   - Post-resolution abort: a no-op (the promise is already settled).
//
// Multi-byte UTF-8 character at the cap boundary: `decoder.decode(slicedChunk,
// { stream: false })` will replace any half-character with `U+FFFD`.
// Spec line 402 anchors `totalBytes` to UTF-8 byte length, so byte-count
// truncation is the contract — the rare U+FFFD landing right under the
// cap boundary is acceptable per spec.
//
// @see working/phase-5.md:396-420 (Streaming + 5 MB safety cap)

import { streamSessionRaw } from "../../lib/api";

/**
 * Result of consuming a streaming raw response into a single text blob.
 *
 * Per spec lines 399-405:
 * - `text`: accumulated decoded text up to the byte cap (or full payload
 *   if smaller).
 * - `totalBytes`: bytes accepted into `text` (UTF-8). When `truncated`
 *   is true, this equals `STREAM_RAW_TEXT_BYTE_CAP` exactly. When false,
 *   this equals the actual payload size.
 * - `truncated`: true when the byte cap fired and `reader.cancel()` was
 *   called.
 */
export type StreamRawTextResult = {
  /** Accumulated text up to the byte cap (or full payload if smaller). */
  text: string;
  /** Bytes accepted into `text` (UTF-8). When `truncated` is true, this equals STREAM_RAW_TEXT_BYTE_CAP. When false, this equals the actual payload size. */
  totalBytes: number;
  /** True when the byte cap fired and `reader.cancel()` was called. */
  truncated: boolean;
};

/**
 * 5 MB cap on the streaming consumer. Exported for a future configuration
 * phase and so the hook layer can branch on `totalBytes === STREAM_RAW_TEXT_BYTE_CAP`
 * if it ever needs to. Per spec line 408 + 1145-1146.
 */
export const STREAM_RAW_TEXT_BYTE_CAP = 5 * 1024 * 1024; // 5 MB

/**
 * Build a fresh AbortError. Must be a `DOMException` with
 * `name === "AbortError"` so callers can match the standard fetch-API
 * shape with `err.name === "AbortError"`.
 */
function makeAbortError(): DOMException {
  return new DOMException("aborted", "AbortError");
}

/**
 * Stream `/api/v1/sessions/:uid/raw` into a single text blob, capped at
 * `STREAM_RAW_TEXT_BYTE_CAP` UTF-8 bytes.
 *
 * Throws `ApiError` (from `lib/api.ts`) on non-2xx; the caller (the
 * `useParsedSession` hook) catches and surfaces this as `state: "error"`.
 * Throws `DOMException` with `name === "AbortError"` when `signal`
 * fires before or during the read; the caller's `.catch` filters this
 * silently.
 *
 * Body-less responses (`response.body === null`) return an empty
 * result rather than throwing — defensive parity with `consumeRawPreview`.
 *
 * Per spec lines 410-413 the signature is non-negotiable:
 * `streamRawText(storedSessionUid, signal): Promise<StreamRawTextResult>`.
 * `signal` is REQUIRED (not optional) because the M3b spec assumes the
 * hook always passes a controller signal.
 *
 * @param storedSessionUid Stored-session UID for `/api/v1/sessions/:uid/raw`.
 * @param signal Required AbortSignal — fired on hook unmount, row change, or hard cache reset.
 * @see working/phase-5.md:396-420
 */
export async function streamRawText(
  storedSessionUid: string,
  signal: AbortSignal,
): Promise<StreamRawTextResult> {
  // Pre-aborted signal: short-circuit before opening a reader so the
  // caller's `.catch(isAbortError)` path runs. Matches the standard
  // fetch-API semantics and `consumeRawPreview` line 132-134.
  if (signal.aborted) {
    throw makeAbortError();
  }

  // `streamSessionRaw` opens the response with `fetch(..., { signal })`
  // and throws `ApiError` on non-2xx. We let `ApiError` bubble unchanged
  // — the hook layer renders it as `state: "error"` (spec line 486).
  const response = await streamSessionRaw(storedSessionUid, signal);

  // Body-less response (HEAD / 204 reused as a stream surface): return
  // an empty success defensively rather than throwing. Mirrors
  // `consumeRawPreview` line 140-148.
  if (response.body === null) {
    return { text: "", totalBytes: 0, truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  // `chunks: string[]` accumulates decoded UTF-8 fragments; `parts.join("")`
  // produces the final string at return. Avoids quadratic-cost string
  // concatenation on multi-MB payloads.
  const chunks: string[] = [];
  // `totalBytes` is the UTF-8 byte sum, taken from `value.byteLength` on
  // each `Uint8Array` chunk. NOT `string.length` (UTF-16 code units)
  // and NOT `decodedChunk.length` (same problem). The byte counter is
  // what governs the cap (spec line 402: `totalBytes` is bytes, not
  // characters).
  let totalBytes = 0;
  let truncated = false;

  // One-shot abort listener: an external abort fires `reader.cancel()`
  // immediately so the connection releases without draining the rest
  // of the body. The loop ALSO re-checks `signal.aborted` per iteration
  // so an abort that lands between reads is observed even when the
  // listener already ran.
  const onAbort = (): void => {
    void reader.cancel();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    // Read loop: pull chunks until done or the cap fires.
    while (true) {
      // Re-check `signal.aborted` BEFORE awaiting `read()` so an
      // abort that landed between iterations is caught promptly.
      if (signal.aborted) {
        throw makeAbortError();
      }

      // ReadableStreamDefaultReader<R>.read() returns
      // ReadableStreamReadResult<R>. Annotating against
      // `Awaited<ReturnType<typeof reader.read>>` keeps the code
      // working across the `lib.dom.d.ts` shape that ships with
      // `@types/bun` 1.3 (mirrors rawPreview.ts:188).
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch (err) {
        // If the read was cancelled by our abort listener, surface
        // it as AbortError so the caller filters it silently.
        // Otherwise re-throw so the caller renders the network-failure
        // path.
        if (signal.aborted) {
          throw makeAbortError();
        }
        throw err;
      }

      if (chunk.done) {
        // Re-check abort between reads: if it landed AFTER read()
        // resolved with `done`, surface as AbortError so the caller
        // ignores the partial result rather than treating it as
        // success.
        if (signal.aborted) {
          throw makeAbortError();
        }
        // Final flush: any bytes left in the decoder buffer (a
        // multi-byte char that straddled the last chunk) come out
        // here. `decoder.decode()` (no args) flushes the trailer.
        const flushed = decoder.decode();
        if (flushed.length > 0) {
          chunks.push(flushed);
        }
        break;
      }

      const value = chunk.value;
      const incomingByteLength = value.byteLength;

      if (totalBytes + incomingByteLength > STREAM_RAW_TEXT_BYTE_CAP) {
        // Cap-trip path: slice the chunk at the byte boundary so
        // `totalBytes` lands EXACTLY on STREAM_RAW_TEXT_BYTE_CAP.
        // A naïve cumulative counter that absorbed the whole over-cap
        // chunk would overshoot — codex-blind-spot precedent (spec
        // line 1110: `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly
        // when truncated).
        const room = STREAM_RAW_TEXT_BYTE_CAP - totalBytes;
        const slicedChunk = value.subarray(0, room);
        // `decoder.decode(slicedChunk, { stream: false })` flushes
        // the trailing partial multi-byte character cleanly, emitting
        // U+FFFD if a 4-byte codepoint straddles the boundary. Spec
        // line 402 anchors `totalBytes` to byte length, so the
        // U+FFFD trade-off is acceptable per spec.
        const decoded = decoder.decode(slicedChunk, { stream: false });
        if (decoded.length > 0) {
          chunks.push(decoded);
        }
        totalBytes += room; // === STREAM_RAW_TEXT_BYTE_CAP exactly.
        truncated = true;
        // Cancel the reader so the rest of the body is not drained.
        // `await` so the cancellation signal definitely propagates
        // before we resolve. Mirrors rawPreview.ts:247.
        await reader.cancel();
        break;
      }

      // Chunk fits under the cap.
      totalBytes += incomingByteLength;
      const decoded = decoder.decode(value, { stream: true });
      if (decoded.length > 0) {
        chunks.push(decoded);
      }
    }
  } finally {
    // Always unwire the abort listener — leaving it bound would leak
    // a closure reference into the AbortSignal across consumer
    // lifecycles.
    signal.removeEventListener("abort", onAbort);
  }

  return {
    text: chunks.join(""),
    totalBytes,
    truncated,
  };
}
