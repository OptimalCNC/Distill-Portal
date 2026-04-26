// Streaming consumer for the raw NDJSON preview block.
//
// Pure module — never reaches React, never opens its own fetch. The
// caller hands in a `Response` (typically via `streamSessionRaw` in
// `apps/frontend/src/lib/api.ts`) and gets back a structured
// `RawPreviewState` describing what landed: a list of decoded NDJSON
// lines (each typed as JSON or text fallback), how many bytes were
// read, and whether either short-circuit cap fired.
//
// Why streaming + caps (per `working/phase-4.md` §Session Detail
// Drawer → Raw preview block):
//
//   /api/v1/sessions/:uid/raw is a tens-of-MB potential blob with no
//   range support. A blocking `.text()` would freeze the drawer. The
//   spec mandates a `ReadableStream` + `getReader()` + `TextDecoder`
//   loop short-circuited at 20 complete NDJSON lines OR a 256 KB byte
//   cap (whichever fires first), with `reader.cancel()` so the
//   connection is released without draining the rest of the body.
//
// The `.text()` shortcut is explicitly forbidden on this path. The
// `safeReadText` helper in `lib/api.ts` is for non-2xx error bodies,
// which are bounded — that's a different code path.
//
// Cap semantics:
//   - Line cap: when `lines.length >= RAW_PREVIEW_LINE_CAP`, set
//     `reachedLineCap = true`, call `reader.cancel()`, and stop.
//   - Byte cap: when `bytesRead >= RAW_PREVIEW_BYTE_CAP`, set
//     `reachedByteCap = true`, call `reader.cancel()`, and stop. The
//     bytesRead counter sums `value.byteLength` across chunks; the
//     check fires AFTER the chunk is processed, so any complete line
//     in the chunk that pushed bytesRead past the cap still appears
//     in the lines array.
//   - Both can be true if the line cap and the byte cap happen on
//     the same chunk; in that case the line cap caption wins (the
//     consumer renders the more specific message). The state still
//     records both flags.
//
// Per-line parsing:
//   - Each complete line (delimited by `\n`) is `JSON.parse`d.
//   - Success → `{ kind: "json", raw, parsed }`.
//   - Failure → `{ kind: "text", raw }` (NOT swallowed — the visual
//     fallback rendering IS the contract; if the consumer needs to
//     surface that the line was malformed, it has the type
//     discriminant).
//   - Trailing whitespace on a line is preserved (the raw bytes are
//     what the user sees in the rendered preview); only the actual
//     `\n` separator is consumed by the splitter.
//
// AbortSignal:
//   - When `signal.aborted` becomes true mid-loop, the consumer
//     calls `reader.cancel()` and re-throws a fresh
//     `DOMException("aborted", "AbortError")`. The caller (the
//     React component) is responsible for catching this and
//     discarding stale state.
//   - If the signal fires AFTER the loop has already short-circuited
//     (cap hit) and resolved, the abort is a no-op for the consumer
//     — the React effect cleanup may still call `controller.abort()`
//     on an already-completed promise; that's safe and idempotent.
//
// Tests live in `rawPreview.test.ts` and use hand-built
// `ReadableStream` instances (no fetch mocks) so the cap-and-cancel
// mechanism is exercised directly.

export const RAW_PREVIEW_LINE_CAP = 20;
export const RAW_PREVIEW_BYTE_CAP = 256 * 1024;

/**
 * One decoded line of the raw payload preview.
 *
 * `kind: "json"` carries the parsed value as `parsed: unknown` so the
 * consumer can pretty-print or fall back to `raw` as it sees fit.
 * `kind: "text"` is the plain-text fallback for lines that failed
 * `JSON.parse` (corrupt NDJSON, partial trailing lines, empty trailing
 * line). `raw` is the byte-faithful original string in both cases so
 * the user sees what the backend actually sent.
 */
export type RawPreviewLine =
  | { kind: "json"; raw: string; parsed: unknown }
  | { kind: "text"; raw: string };

/**
 * Result of consuming a streaming raw response.
 *
 * `kind: "idle"` is never produced by `consumeRawPreview` itself — the
 * value exists so a caller using `useState<RawPreviewState>` can name
 * the initial state. `kind: "loading"` is similarly a caller-state
 * marker.
 *
 * `kind: "non_2xx"` is included for completeness even though
 * `streamSessionRaw` already throws on non-2xx; a future caller that
 * obtains the `Response` some other way (e.g. a fetched-with-redirect
 * Response object) would benefit from the type.
 */
export type RawPreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      lines: RawPreviewLine[];
      reachedLineCap: boolean;
      reachedByteCap: boolean;
      bytesRead: number;
    }
  | { kind: "error"; message: string }
  | { kind: "non_2xx"; status: number; bodySnippet: string };

/**
 * Consume the streaming response body and return a structured preview.
 *
 * Short-circuits at `RAW_PREVIEW_LINE_CAP` complete NDJSON lines OR
 * `RAW_PREVIEW_BYTE_CAP` bytes, whichever comes first, by calling
 * `reader.cancel()` so the rest of the body is not drained.
 *
 * Honors the `AbortSignal`: when `signal.aborted` becomes true mid-
 * loop, calls `reader.cancel()` then throws a `DOMException` with
 * `name === "AbortError"`. Callers that fire abort on drawer close
 * should catch and ignore that error (it indicates the read was
 * intentionally cancelled).
 *
 * Body-less responses (no `response.body`) and pre-aborted signals are
 * handled defensively: the former returns an empty success; the latter
 * throws AbortError without opening a reader.
 */
export async function consumeRawPreview(
  response: Response,
  signal?: AbortSignal,
): Promise<RawPreviewState> {
  // Pre-aborted signal: short-circuit before opening the reader so the
  // caller's `.catch(ignoreAbort)` path runs. This matches the
  // standard fetch-API semantics where an already-aborted signal
  // throws synchronously on the first I/O.
  if (signal?.aborted) {
    throw makeAbortError();
  }

  // If the response has no body at all (e.g. a HEAD response or an
  // empty 204 reused as a stream surface), return an empty success
  // rather than throwing — the consumer's caption will read "Showing
  // first 0 lines" which is informative.
  if (response.body === null) {
    return {
      kind: "success",
      lines: [],
      reachedLineCap: false,
      reachedByteCap: false,
      bytesRead: 0,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let bytesRead = 0;
  const lines: RawPreviewLine[] = [];
  let reachedLineCap = false;
  let reachedByteCap = false;

  // Wire the abort signal so an external abort during the loop can
  // cancel the reader promptly; we still re-check `signal.aborted`
  // after each chunk so an abort that fires between read() calls is
  // observed.
  const onAbort = () => {
    // Fire-and-forget; reader.cancel() returns a promise but we don't
    // await it from the listener (the loop will throw on its own
    // signal.aborted re-check).
    void reader.cancel();
  };
  if (signal !== undefined) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    // Read loop: pull chunks until the stream ends or a cap fires.
    while (true) {
      if (signal?.aborted) {
        // The reader.cancel() call in onAbort has already run; just
        // throw the AbortError so the caller can ignore it.
        throw makeAbortError();
      }

      // ReadableStreamDefaultReader<R>.read() returns
      // ReadableStreamReadResult<R> in the standard lib, but
      // happy-dom + the lib.dom.d.ts that ships with `@types/bun` 1.3
      // declares the done variant with an optional `value`, which
      // doesn't structurally match the broader `ReadableStreamReadResult`
      // type. Annotating against `Awaited<ReturnType<typeof reader.read>>`
      // keeps the code working across both shapes.
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch (err) {
        // If the read was cancelled by our abort listener, surface
        // it as AbortError. Otherwise re-throw the underlying error
        // so the caller renders the network-failure path.
        if (signal?.aborted) {
          throw makeAbortError();
        }
        throw err;
      }

      if (chunk.done) {
        // The abort listener calls `reader.cancel()` which surfaces
        // here as a clean `done: true` rather than as a thrown
        // error. Re-check the signal so an abort that fires between
        // reads is still observed.
        if (signal?.aborted) {
          throw makeAbortError();
        }
        // Final flush: any bytes left in the decoder buffer (a
        // multi-byte char that straddled the last chunk) come out
        // here. Any unterminated trailing fragment in `buffer` is
        // kept as-is and emitted as a final line.
        const flushed = decoder.decode();
        buffer += flushed;
        if (buffer.length > 0) {
          appendLineIfRoom(lines, buffer);
          if (lines.length >= RAW_PREVIEW_LINE_CAP) {
            reachedLineCap = true;
          }
          buffer = "";
        }
        break;
      }

      const value = chunk.value;
      bytesRead += value.byteLength;
      buffer += decoder.decode(value, { stream: true });

      // Drain whatever complete lines are now in the buffer. The
      // last (possibly partial) fragment stays in the buffer for
      // the next iteration.
      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const lineRaw = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        appendLineIfRoom(lines, lineRaw);
        if (lines.length >= RAW_PREVIEW_LINE_CAP) {
          reachedLineCap = true;
          break;
        }
        newlineIdx = buffer.indexOf("\n");
      }

      // Cap checks. Order: line cap first (more specific), then byte
      // cap. Either fire => cancel the reader and stop reading.
      if (reachedLineCap) {
        await reader.cancel();
        break;
      }
      if (bytesRead >= RAW_PREVIEW_BYTE_CAP) {
        reachedByteCap = true;
        await reader.cancel();
        break;
      }
    }
  } finally {
    if (signal !== undefined) {
      signal.removeEventListener("abort", onAbort);
    }
  }

  return {
    kind: "success",
    lines,
    reachedLineCap,
    reachedByteCap,
    bytesRead,
  };
}

/**
 * Append one decoded line to `lines` only if the line cap has not yet
 * been reached. Returns whether the line was actually appended.
 */
function appendLineIfRoom(
  lines: RawPreviewLine[],
  raw: string,
): boolean {
  if (lines.length >= RAW_PREVIEW_LINE_CAP) return false;
  lines.push(decodeLine(raw));
  return true;
}

/**
 * Try `JSON.parse(raw)`; fall back to plain text on failure. Empty
 * strings are emitted as text fallback rather than swallowed so the
 * caller can render visible blank lines (matches the spec's "render
 * with a muted '(non-JSON line)' hint OR a different class" rule —
 * the visual fallback rendering IS the contract).
 */
function decodeLine(raw: string): RawPreviewLine {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return { kind: "json", raw, parsed };
  } catch {
    return { kind: "text", raw };
  }
}

/**
 * Build a fresh AbortError. Must be a `DOMException` with
 * `name === "AbortError"` so callers can match the standard fetch-API
 * shape with `if (err instanceof DOMException && err.name === "AbortError")`
 * or the simpler `err.name === "AbortError"` check.
 */
function makeAbortError(): DOMException {
  return new DOMException("aborted", "AbortError");
}
