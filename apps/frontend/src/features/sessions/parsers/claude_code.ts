// Pure / total / synchronous Claude Code NDJSON parser.
//
// Walks the raw text line-by-line and emits `Message` rows + `ParseWarning`
// entries per the truth table in `working/phase-5.md` lines 750-757.
//
// Hard rules:
// 1. NEVER throws. Malformed input is captured as a structured warning + the
//    line is skipped or preserved as an unknown message. The "totality" test
//    asserts this.
// 2. `messageIndex` is sequential across the entire stream and increments
//    once per emitted `Message`. `lineOrdinal` is the 0-indexed JSONL line
//    number — multiple messages emitted from the same line share their
//    `lineOrdinal` but get distinct `messageIndex` values (see Mixed-content
//    array case below).
// 3. Top-level `type` is the authoritative discriminator (matches the Rust
//    adapter at components/collector-runtime/src/adapters/claude_code.rs:151).
//    `/message/role` is consulted only as a sanity check; mismatch warns
//    but the parser still emits using `type`.
// 4. Session-level metadata records emit NO `Message` and NO warning.
// 5. Genuinely unknown top-level `type` → `Message{kind: "unknown"}` +
//    structured warning.
//
// Field paths verified against `tests/fixtures/claude_code/sample_session.jsonl`.

import type {
  Message,
  MetaCategory,
  ParseWarning,
  ParseWarningCategory,
  ParseWarningSeverity,
  ParserOutput,
} from "./types";

/**
 * Max characters for inline display of a long string payload before
 * truncation. The renderHints layer is the canonical site for the
 * display string, but the parser emits `text` close to the eventual
 * display so the render layer can use it as-is or refine further.
 *
 * Long strings (e.g. `last-prompt`) are truncated to 78 chars +
 * U+2026 `…` per `working/phase-7d/designs/design.md` §3.4 truncation
 * rule.
 */
const META_TEXT_MAX_CHARS = 78;

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
      pushWarning(warnings, lineOrdinal, "error", "lexer", "empty line");
      continue;
    }

    let record: JsonValue;
    try {
      record = JSON.parse(raw) as JsonValue;
    } catch {
      pushWarning(warnings, lineOrdinal, "error", "lexer", "malformed JSON");
      continue;
    }

    if (!isObject(record)) {
      pushWarning(
        warnings,
        lineOrdinal,
        "error",
        "lexer",
        "top-level JSON value is not an object",
      );
      continue;
    }

    const topType = typeof record["type"] === "string" ? (record["type"] as string) : null;
    const timestamp = parseTimestamp(record, lineOrdinal, warnings);

    if (topType === null) {
      pushWarning(
        warnings,
        lineOrdinal,
        "error",
        "schema",
        "missing top-level 'type' field",
      );
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
          pushWarning(
            warnings,
            lineOrdinal,
            "warning",
            "schema",
            `top-level type 'user' but /message/role is '${message["role"]}'`,
          );
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
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                "non-object item in content array",
              );
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
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "unknown",
                text: stringifyTruncated(item),
                raw,
                bytes: byteLength(raw),
              });
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                `unknown user content item type '${itemType ?? "(missing)"}'`,
                nextMessageIndex - 1,
              );
            }
          }
        } else {
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "unknown",
            text: stringifyTruncated(record),
            raw,
            bytes: byteLength(raw),
          });
          pushWarning(
            warnings,
            lineOrdinal,
            "warning",
            "payload",
            "user record /message/content is neither string nor array",
            nextMessageIndex - 1,
          );
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
          pushWarning(
            warnings,
            lineOrdinal,
            "warning",
            "schema",
            `top-level type 'assistant' but /message/role is '${message["role"]}'`,
          );
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
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                "non-object item in content array",
              );
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
            } else if (itemType === "thinking") {
              const thinking =
                typeof item["thinking"] === "string"
                  ? (item["thinking"] as string)
                  : typeof item["text"] === "string"
                    ? (item["text"] as string)
                    : "";
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "assistant",
                text: thinking,
                raw,
                bytes: byteLength(thinking),
              });
            } else {
              messages.push({
                lineOrdinal,
                messageIndex: nextMessageIndex++,
                timestamp,
                kind: "unknown",
                text: stringifyTruncated(item),
                raw,
                bytes: byteLength(raw),
              });
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                `unknown assistant content item type '${itemType ?? "(missing)"}'`,
                nextMessageIndex - 1,
              );
            }
          }
        } else {
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "unknown",
            text: stringifyTruncated(record),
            raw,
            bytes: byteLength(raw),
          });
          pushWarning(
            warnings,
            lineOrdinal,
            "warning",
            "payload",
            "assistant record /message/content is neither string nor array",
            nextMessageIndex - 1,
          );
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

      case "agent-name":
      case "ai-title":
      case "attachment":
      case "custom-title":
      case "file-history-snapshot":
      case "last-prompt":
      case "queue-operation":
      case "permission-mode": {
        /**
         * Matrix:
         * - docs/features/parser-event-support.md#claude-code-agent-name
         * - docs/features/parser-event-support.md#claude-code-ai-title
         * - docs/features/parser-event-support.md#claude-code-attachment
         * - docs/features/parser-event-support.md#claude-code-custom-title
         * - docs/features/parser-event-support.md#claude-code-file-history-snapshot
         * - docs/features/parser-event-support.md#claude-code-last-prompt
         * - docs/features/parser-event-support.md#claude-code-permission-mode
         * - docs/features/parser-event-support.md#claude-code-queue-operation
         *
         * Phase 7d: session-level chrome surfaces as `kind:"metadata"`
         * Messages, rendered as marginalia hairlines per
         * `working/phase-7d/designs/design.md` §3.2 + §3.4. The previous
         * Phase 7b silent-skip decision is replaced (protected-path
         * exception logged in `progress/phase-7d.progress.md`).
         */
        const { metaCategory, text } = formatClaudeCodeMetadata(topType, record);
        messages.push({
          lineOrdinal,
          messageIndex: nextMessageIndex++,
          timestamp,
          kind: "metadata",
          metaCategory,
          text,
          raw,
          bytes: byteLength(raw),
        });
        break;
      }

      default: {
        /**
         * Matrix: future Claude Code top-level discriminator not yet present in
         * docs/features/parser-event-support.md.
         */
        messages.push({
          lineOrdinal,
          messageIndex: nextMessageIndex++,
          timestamp,
          kind: "unknown",
          text: stringifyTruncated(record),
          raw,
          bytes: byteLength(raw),
        });
        pushWarning(
          warnings,
          lineOrdinal,
          "warning",
          "schema",
          `unknown top-level type '${topType}'`,
          nextMessageIndex - 1,
        );
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
    pushWarning(
      warnings,
      lineOrdinal,
      "warning",
      "timestamp",
      "timestamp field is not a string",
    );
    return null;
  }
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    pushWarning(
      warnings,
      lineOrdinal,
      "warning",
      "timestamp",
      `unparseable RFC3339 timestamp '${value}'`,
    );
    return null;
  }
  return value;
}

function pushWarning(
  warnings: ParseWarning[],
  lineOrdinal: number,
  severity: ParseWarningSeverity,
  category: ParseWarningCategory,
  reason: string,
  messageIndex?: number,
): void {
  warnings.push({
    lineOrdinal,
    severity,
    category,
    reason,
    ...(messageIndex === undefined ? {} : { messageIndex }),
  });
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

/**
 * Truncate a string at `META_TEXT_MAX_CHARS` (78) and append U+2026
 * `…` when the original exceeded the cap. Matches
 * `working/phase-7d/designs/design.md` §3.4 truncation rule.
 */
function truncateMeta(value: string): string {
  if (value.length <= META_TEXT_MAX_CHARS) return value;
  return value.slice(0, META_TEXT_MAX_CHARS) + "…";
}

/**
 * Phase 7d — compute the `metaCategory` and pre-formatted display
 * string for one Claude Code metadata record. The renderHints layer
 * may use this string verbatim, or refine it further (e.g. for the
 * cluster summary), but the parser owns the data extraction so the
 * render layer can stay schema-free.
 *
 * Per `working/phase-7d/designs/design.md` §3.4.
 */
function formatClaudeCodeMetadata(
  topType: string,
  record: JsonObject,
): { metaCategory: MetaCategory; text: string } {
  switch (topType) {
    case "agent-name": {
      const name =
        typeof record["name"] === "string"
          ? (record["name"] as string)
          : "(unknown)";
      return { metaCategory: "agent", text: `agent → ${name}` };
    }
    case "ai-title": {
      const title =
        typeof record["title"] === "string"
          ? (record["title"] as string)
          : "(empty)";
      // Curly quotes per design §3.4.
      return {
        metaCategory: "title",
        text: `auto title: “${truncateMeta(title)}”`,
      };
    }
    case "custom-title": {
      const title =
        typeof record["customTitle"] === "string"
          ? (record["customTitle"] as string)
          : "(empty)";
      return {
        metaCategory: "title",
        text: `custom title: “${truncateMeta(title)}”`,
      };
    }
    case "attachment": {
      const fileName =
        typeof record["fileName"] === "string"
          ? (record["fileName"] as string)
          : "(unnamed)";
      const mimeType =
        typeof record["mimeType"] === "string"
          ? (record["mimeType"] as string)
          : "unknown";
      return {
        metaCategory: "attachment",
        text: `attachment → ${fileName} (${mimeType})`,
      };
    }
    case "file-history-snapshot": {
      const filesArr = Array.isArray(record["files"]) ? record["files"] : [];
      const paths = filesArr
        .flatMap((f) => {
          if (!isObject(f)) return [];
          const p = f["path"];
          return typeof p === "string" ? [p] : [];
        })
        .slice(0, 2);
      const total = filesArr.length;
      const trail = total > paths.length ? ", …" : "";
      const list = paths.join(", ") + trail;
      return {
        metaCategory: "attachment",
        text: `file snapshot → ${total} files: ${list}`,
      };
    }
    case "last-prompt": {
      const prompt =
        typeof record["prompt"] === "string"
          ? (record["prompt"] as string)
          : "(empty)";
      return {
        metaCategory: "prompt",
        text: `last prompt: “${truncateMeta(prompt)}”`,
      };
    }
    case "permission-mode": {
      const mode =
        typeof record["permissionMode"] === "string"
          ? (record["permissionMode"] as string)
          : "(unknown)";
      return {
        metaCategory: "control",
        text: `permission mode → ${mode}`,
      };
    }
    case "queue-operation": {
      const op =
        typeof record["operation"] === "string"
          ? (record["operation"] as string)
          : "(unknown)";
      const promptValue = record["prompt"];
      if (typeof promptValue === "string" && promptValue.length > 0) {
        return {
          metaCategory: "control",
          text: `queue → ${op}: “${truncateMeta(promptValue)}”`,
        };
      }
      return { metaCategory: "control", text: `queue → ${op}` };
    }
    default: {
      // Defensive — every caller site is one of the 8 cases above.
      return { metaCategory: "control", text: topType };
    }
  }
}
