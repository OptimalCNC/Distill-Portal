// Pure / total / synchronous Claude Code NDJSON parser.
//
// Walks the raw text line-by-line and emits `Message` rows + `ParseWarning`
// entries per the truth table in `working/phase-5.md` lines 750-757.
//
// Hard rules:
// 1. NEVER throws. Every malformed input is captured as a warning + the
//    line is skipped from `messages`. The "totality" test asserts this.
// 2. `messageIndex` is sequential across the entire stream and increments
//    once per emitted `Message`. `lineOrdinal` is the 0-indexed JSONL line
//    number — multiple messages emitted from the same line share their
//    `lineOrdinal` but get distinct `messageIndex` values (see Mixed-content
//    array case below).
// 3. Top-level `type` is the authoritative discriminator (matches the Rust
//    adapter at components/collector-runtime/src/adapters/claude_code.rs:151).
//    `/message/role` is consulted only as a sanity check; mismatch warns
//    but the parser still emits using `type`.
// 4. `custom-title` and `permission-mode` records emit NO `Message` but DO
//    add a low-severity `warnings[]` entry so we can audit parser silence.
// 5. Unknown top-level `type` → `Message{kind: "unknown"}` + warning.
//
// Field paths verified against `tests/fixtures/claude_code/sample_session.jsonl`.

import type { Message, ParseWarning, ParserOutput } from "./types";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parse a Claude Code NDJSON document into a `ParserOutput`.
 *
 * @param rawText The full NDJSON payload (already streamed and capped by `streamRawText`).
 *                The parser does not know about caps — it just walks lines.
 */
export function parseClaudeCode(rawText: string): ParserOutput {
  const messages: Message[] = [];
  const warnings: ParseWarning[] = [];
  let nextMessageIndex = 0;

  // `split("\n")` produces a trailing empty string when the document ends
  // with `\n`. We skip empty trailing lines but do NOT skip empty lines
  // mid-document — those are reported as a malformed-line warning so a
  // user notices the corruption.
  const lines = rawText.split("\n");

  for (let lineOrdinal = 0; lineOrdinal < lines.length; lineOrdinal++) {
    const raw = lines[lineOrdinal];

    // Trailing newline at end of file → empty final element. Skip silently.
    if (raw === "" && lineOrdinal === lines.length - 1) {
      continue;
    }
    // Empty mid-document line → warn but continue.
    if (raw === "") {
      warnings.push({ lineOrdinal, reason: "empty line" });
      continue;
    }

    let record: JsonValue;
    try {
      record = JSON.parse(raw) as JsonValue;
    } catch {
      warnings.push({ lineOrdinal, reason: "malformed JSON" });
      continue;
    }

    if (!isObject(record)) {
      warnings.push({
        lineOrdinal,
        reason: "top-level JSON value is not an object",
      });
      continue;
    }

    const topType = typeof record["type"] === "string" ? (record["type"] as string) : null;
    const timestamp = parseTimestamp(record, lineOrdinal, warnings);

    if (topType === null) {
      warnings.push({ lineOrdinal, reason: "missing top-level 'type' field" });
      messages.push({
        lineOrdinal,
        messageIndex: nextMessageIndex++,
        timestamp,
        kind: "unknown",
        text: stringifyTruncated(record),
        raw,
        bytes: byteLength(raw),
      });
      continue;
    }

    switch (topType) {
      case "user": {
        /**
         * Matrix:
         * - docs/features/parser-event-support.md#claude-code-user-message-content-string
         * - docs/features/parser-event-support.md#claude-code-user-content-text
         * - docs/features/parser-event-support.md#claude-code-user-content-tool-result
         */
        const message = isObject(record["message"]) ? record["message"] : null;
        const content = message ? message["content"] : undefined;

        // Sanity-check role; warn on mismatch but keep top-level `type` authoritative.
        if (
          message &&
          typeof message["role"] === "string" &&
          message["role"] !== "user"
        ) {
          warnings.push({
            lineOrdinal,
            reason: `top-level type 'user' but /message/role is '${message["role"]}'`,
          });
        }

        if (typeof content === "string") {
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "user",
            text: content,
            raw,
            bytes: byteLength(content),
          });
        } else if (Array.isArray(content)) {
          for (const item of content) {
            if (!isObject(item)) {
              warnings.push({ lineOrdinal, reason: "non-object item in content array" });
              continue;
            }
            const itemType = typeof item["type"] === "string" ? item["type"] : null;
            if (itemType === "text" && typeof item["text"] === "string") {
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "user",
                text: item["text"] as string,
                raw,
                bytes: byteLength(item["text"] as string),
              });
            } else if (itemType === "tool_result") {
              const inner = item["content"];
              const text =
                typeof inner === "string" ? inner : JSON.stringify(inner ?? null);
              const toolUseId =
                typeof item["tool_use_id"] === "string"
                  ? (item["tool_use_id"] as string)
                  : undefined;
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "tool_result",
                text,
                toolName: toolUseId,
                raw,
                bytes: byteLength(text),
              });
            } else {
              // Unknown content-array shape inside a user record → warn + unknown row.
              warnings.push({
                lineOrdinal,
                reason: `unknown user content item type '${itemType ?? "(missing)"}'`,
              });
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "unknown",
                text: stringifyTruncated(item),
                raw,
                bytes: byteLength(raw),
              });
            }
          }
        } else {
          warnings.push({
            lineOrdinal,
            reason: "user record /message/content is neither string nor array",
          });
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "unknown",
            text: stringifyTruncated(record),
            raw,
            bytes: byteLength(raw),
          });
        }
        break;
      }

      case "assistant": {
        /**
         * Matrix:
         * - docs/features/parser-event-support.md#claude-code-assistant-content-text
         * - docs/features/parser-event-support.md#claude-code-assistant-content-thinking
         * - docs/features/parser-event-support.md#claude-code-assistant-content-tool-use
         */
        const message = isObject(record["message"]) ? record["message"] : null;
        const content = message ? message["content"] : undefined;

        if (
          message &&
          typeof message["role"] === "string" &&
          message["role"] !== "assistant"
        ) {
          warnings.push({
            lineOrdinal,
            reason: `top-level type 'assistant' but /message/role is '${message["role"]}'`,
          });
        }

        if (typeof content === "string") {
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "assistant",
            text: content,
            raw,
            bytes: byteLength(content),
          });
        } else if (Array.isArray(content)) {
          for (const item of content) {
            if (!isObject(item)) {
              warnings.push({ lineOrdinal, reason: "non-object item in content array" });
              continue;
            }
            const itemType = typeof item["type"] === "string" ? item["type"] : null;
            if (itemType === "text" && typeof item["text"] === "string") {
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "assistant",
                text: item["text"] as string,
                raw,
                bytes: byteLength(item["text"] as string),
              });
            } else if (itemType === "tool_use") {
              const name =
                typeof item["name"] === "string" ? (item["name"] as string) : undefined;
              const input = item["input"] ?? null;
              const text = JSON.stringify(input, null, 2);
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "tool_use",
                text,
                toolName: name,
                raw,
                bytes: byteLength(text),
              });
            } else {
              warnings.push({
                lineOrdinal,
                reason: `unknown assistant content item type '${itemType ?? "(missing)"}'`,
              });
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "unknown",
                text: stringifyTruncated(item),
                raw,
                bytes: byteLength(raw),
              });
            }
          }
        } else {
          warnings.push({
            lineOrdinal,
            reason: "assistant record /message/content is neither string nor array",
          });
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "unknown",
            text: stringifyTruncated(record),
            raw,
            bytes: byteLength(raw),
          });
        }
        break;
      }

      case "summary": {
        // Phase 4 adapter handling: leafUuid + ": " + summary.
        const leafUuid =
          typeof record["leafUuid"] === "string" ? (record["leafUuid"] as string) : "";
        const summary =
          typeof record["summary"] === "string" ? (record["summary"] as string) : "";
        const text = leafUuid ? `${leafUuid}: ${summary}` : summary;
        messages.push({
          lineOrdinal,
          messageIndex: nextMessageIndex++,
          timestamp,
          kind: "system",
          text,
          raw,
          bytes: byteLength(text),
        });
        break;
      }

      case "system": {
        /** Matrix: docs/features/parser-event-support.md#claude-code-system */
        // Some Claude Code system records carry /content, others a short tag.
        let text = "";
        if (typeof record["content"] === "string") {
          text = record["content"] as string;
        } else if (
          isObject(record["message"]) &&
          typeof (record["message"] as JsonObject)["content"] === "string"
        ) {
          text = (record["message"] as JsonObject)["content"] as string;
        } else {
          text = stringifyTruncated(record);
        }
        messages.push({
          lineOrdinal,
          messageIndex: nextMessageIndex++,
          timestamp,
          kind: "system",
          text,
          raw,
          bytes: byteLength(text),
        });
        break;
      }

      case "custom-title":
      case "permission-mode": {
        /**
         * Matrix:
         * - docs/features/parser-event-support.md#claude-code-custom-title
         * - docs/features/parser-event-support.md#claude-code-permission-mode
         */
        // Session-level metadata; the Rust adapter consumes these for indexing
        // but they are not part of the message timeline. We log a low-severity
        // warning so we can audit parser silence in M3a evidence packs.
        warnings.push({
          lineOrdinal,
          reason: `Skipping Claude-meta type '${topType}' (session-level metadata, not a timeline message)`,
        });
        break;
      }

      default: {
        /**
         * Matrix:
         * - docs/features/parser-event-support.md#claude-code-agent-name
         * - docs/features/parser-event-support.md#claude-code-ai-title
         * - docs/features/parser-event-support.md#claude-code-attachment
         * - docs/features/parser-event-support.md#claude-code-file-history-snapshot
         * - docs/features/parser-event-support.md#claude-code-last-prompt
         * - docs/features/parser-event-support.md#claude-code-queue-operation
         */
        warnings.push({
          lineOrdinal,
          reason: `unknown top-level type '${topType}'`,
        });
        messages.push({
          lineOrdinal,
          messageIndex: nextMessageIndex++,
          timestamp,
          kind: "unknown",
          text: stringifyTruncated(record),
          raw,
          bytes: byteLength(raw),
        });
      }
    }
  }

  return { messages, warnings };
}

/**
 * Read top-level `/timestamp` as RFC3339. Returns ISO-8601-canonical string
 * (preserves the original RFC3339 form) when parseable; null otherwise.
 *
 * Note: the field is stored as a string (not a number) in `Message.timestamp`
 * so the rendering layer can produce both relative and absolute displays
 * via `relativeTimeFrom` and `<time dateTime>`. We sanity-check parseability
 * by round-tripping through `Date` — invalid dates lower a warning.
 */
function parseTimestamp(
  record: JsonObject,
  lineOrdinal: number,
  warnings: ParseWarning[],
): string | null {
  const value = record["timestamp"];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    warnings.push({ lineOrdinal, reason: "timestamp field is not a string" });
    return null;
  }
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    warnings.push({ lineOrdinal, reason: `unparseable RFC3339 timestamp '${value}'` });
    return null;
  }
  return value;
}

/** Approximate UTF-8 byte length without instantiating a TextEncoder per call. */
function byteLength(text: string): number {
  // Bun runs on V8; TextEncoder is hot-path and small. Keep it explicit;
  // parsers run once per session selection so allocation cost is irrelevant.
  return new TextEncoder().encode(text).length;
}

/** JSON-stringify with a generous-but-bounded clip for unknown rows. */
function stringifyTruncated(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    // Cyclic / non-serialisable — degrade gracefully.
    return "[unserialisable record]";
  }
}
