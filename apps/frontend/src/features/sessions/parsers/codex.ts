// Pure / total / synchronous Codex NDJSON parser.
//
// Walks the raw text line-by-line and emits `Message` rows + `ParseWarning`
// entries per the truth table in `working/phase-5.md` lines 769-783.
//
// Anchor principle (spec line 767): the Codex stream emits BOTH an
// API-layer `response_item` AND a UI-layer `event_msg` for the same
// logical user/assistant turn. The fixture at
// `tests/fixtures/codex/sample_session.jsonl` shows the prompt
// "Introduce omx and its subcommands." appearing on both lines 2
// (`response_item.message.role: user`) and 3 (`event_msg.user_message`).
// To prevent duplicate timeline rows, this parser SKIPS
// `response_item` whose `payload.type === "message"` AND
// `payload.role` is `"user"` or `"assistant"`. `event_msg` is canonical.
//
// `response_item.function_call` is NOT skipped — if the Codex stream ever
// carries explicit function-call payloads on response_item (some Codex
// versions and the upstream changelog hint at this), we still want those
// rendered as `tool_use` rows. The fixture for M3a does not exercise this
// branch; it is documented in the JSDoc on the case below so reviewers
// can audit. NOTE: the spec says event_msg `exec_command` is canonical
// for shell calls; `response_item.function_call` is the broader function-
// call gateway for non-exec tools.
//
// Hard rules (same as parseClaudeCode):
// 1. NEVER throws.
// 2. `messageIndex` is sequential across the entire stream.
// 3. Top-level `type` is the authoritative discriminator (matches the
//    Rust adapter at components/collector-runtime/src/adapters/codex.rs:85,
//    137, 144 — the field is `type`, NOT `record_type`).
// 4. Top-level `/timestamp` preferred; falls back to `/payload/timestamp`.

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
 * Parse a Codex NDJSON document into a `ParserOutput`.
 *
 * @param rawText The full NDJSON payload (already streamed and capped by `streamRawText`).
 */
export function parseCodex(rawText: string): ParserOutput {
  const messages: Message[] = [];
  const warnings: ParseWarning[] = [];
  let nextMessageIndex = 0;
  let sessionMetaSeen = false;

  const lines = rawText.split("\n");

  for (let lineOrdinal = 0; lineOrdinal < lines.length; lineOrdinal++) {
    const raw = lines[lineOrdinal];

    if (raw === "" && lineOrdinal === lines.length - 1) {
      continue;
    }
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
    const payload = isObject(record["payload"]) ? record["payload"] : null;
    const timestamp = parseTimestamp(record, payload, lineOrdinal, warnings);

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
      case "session_meta": {
        if (!sessionMetaSeen) {
          sessionMetaSeen = true;
          const cwd =
            payload && typeof payload["cwd"] === "string"
              ? (payload["cwd"] as string)
              : "(unknown cwd)";
          const cliVersion =
            payload && typeof payload["cli_version"] === "string"
              ? (payload["cli_version"] as string)
              : "(unknown cli)";
          const modelProvider =
            payload && typeof payload["model_provider"] === "string"
              ? (payload["model_provider"] as string)
              : "(unknown provider)";
          const text = `Codex session — cwd=${cwd}, cli_version=${cliVersion}, model_provider=${modelProvider}`;
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "system",
            text,
            raw,
            bytes: byteLength(text),
          });
        } else {
          // Second `session_meta` mid-stream → boundary. buildSkim converts
          // this to a `boundary` SkimBlock that separates conversation
          // chapters (e.g. `CODEX_FORKED_FIXTURE` at parsers.rs line 16).
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "boundary",
            boundarySubtype: "session_resumed",
            text: "session resumed",
            raw,
            bytes: byteLength(raw),
          });
        }
        break;
      }

      case "response_item": {
        if (!payload) {
          warnings.push({ lineOrdinal, reason: "response_item missing payload" });
          messages.push({
            lineOrdinal, messageIndex: nextMessageIndex++, timestamp,
            kind: "unknown", text: stringifyTruncated(record), raw, bytes: byteLength(raw),
          });
          break;
        }
        const payloadType =
          typeof payload["type"] === "string" ? (payload["type"] as string) : null;
        const role =
          typeof payload["role"] === "string" ? (payload["role"] as string) : null;

        if (payloadType === "message" && (role === "user" || role === "assistant")) {
          // ANCHOR PRINCIPLE: `event_msg` is canonical. SKIP entirely. No warning.
          break;
        }

        if (payloadType === "function_call") {
          // Some Codex versions emit explicit function_call payloads on
          // response_item that are NOT duplicated in event_msg. Emit as
          // tool_use so they appear in the timeline.
          //
          // Verified against fixture: the canonical short fixture
          // (tests/fixtures/codex/sample_session.jsonl, 4 lines) does NOT
          // exercise this branch; CODEX_FORKED_FIXTURE in
          // components/collector-runtime/tests/parsers.rs also does not.
          // We keep the branch per the spec's M3 planner directive — a
          // unit test below covers it explicitly with an inline fixture.
          const name =
            typeof payload["name"] === "string"
              ? (payload["name"] as string)
              : "function_call";
          const args = payload["arguments"] ?? null;
          const text = JSON.stringify(args);
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "tool_use",
            toolName: name,
            text,
            raw,
            bytes: byteLength(text),
          });
          break;
        }

        // Unknown response_item shape (totality fallthrough).
        warnings.push({
          lineOrdinal,
          reason: `unknown response_item payload.type '${payloadType ?? "(missing)"}'`,
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
        break;
      }

      case "turn_context": {
        // Adapter metadata (project_path); not part of the message timeline.
        // Spec line 774. Silent skip — no warning, no message.
        break;
      }

      case "event_msg": {
        const payloadType =
          payload && typeof payload["type"] === "string"
            ? (payload["type"] as string)
            : null;

        if (payloadType === null) {
          warnings.push({
            lineOrdinal,
            reason: "event_msg missing payload.type",
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
          break;
        }

        switch (payloadType) {
          case "user_message": {
            const m = payload ? payload["message"] : undefined;
            let text = "";
            if (typeof m === "string") {
              text = m;
            } else {
              warnings.push({
                lineOrdinal,
                reason: "event_msg.user_message missing or non-string payload.message",
              });
            }
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "user",
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "agent_message": {
            const m = payload ? payload["message"] : undefined;
            let text = "";
            if (typeof m === "string") {
              text = m;
            } else {
              warnings.push({
                lineOrdinal,
                reason: "event_msg.agent_message missing or non-string payload.message",
              });
            }
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "assistant",
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "agent_reasoning": {
            // Rendered as assistant per spec line 777. No special discrimination at
            // the typed-message layer — the Raw tab is the verifiability hatch.
            const t = payload ? payload["text"] : undefined;
            const m = payload ? payload["message"] : undefined;
            let text = "";
            if (typeof t === "string") {
              text = t;
            } else if (typeof m === "string") {
              text = m;
            } else {
              warnings.push({
                lineOrdinal,
                reason:
                  "event_msg.agent_reasoning missing or non-string payload.text and payload.message",
              });
            }
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "assistant",
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "task_started": {
            // Brief system note; preserves the chronological landmark without bloat.
            const turn =
              payload && typeof payload["turn_id"] === "string"
                ? (payload["turn_id"] as string)
                : "(unknown turn)";
            const text = `task_started · turn ${turn}`;
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

          case "task_complete": {
            const turn =
              payload && typeof payload["turn_id"] === "string"
                ? (payload["turn_id"] as string)
                : "(unknown turn)";
            const text = `task_complete · turn ${turn}`;
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

          case "exec_command": {
            const rawCommand = payload ? payload["command"] : null;
            if (rawCommand === null || rawCommand === undefined) {
              warnings.push({
                lineOrdinal,
                reason: "event_msg.exec_command missing payload.command",
              });
            }
            // Normalize undefined → null so JSON.stringify always returns a string
            // (JSON.stringify(undefined) === undefined, which would violate Message.text: string).
            // Spec line 779 mandates JSON.stringify(payload.command) literally — strings get JSON-quote-wrapped.
            const command = rawCommand ?? null;
            const text = JSON.stringify(command);
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "tool_use",
              toolName: "exec",
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "exec_command_output": {
            const rawOutput = payload ? payload["output"] : null;
            if (rawOutput === null || rawOutput === undefined) {
              warnings.push({
                lineOrdinal,
                reason: "event_msg.exec_command_output missing payload.output",
              });
            }
            // Spec line 779: `text: ... / payload.output` — for exec_command_output the raw
            // string passes through (no JSON.stringify wrapper, unlike exec_command). Non-string
            // outputs (array/object/missing) get JSON.stringify-with-null-normalization to keep
            // Message.text: string. JSON.stringify(undefined) === undefined, so normalize to null first.
            const text =
              typeof rawOutput === "string"
                ? rawOutput
                : JSON.stringify(rawOutput ?? null);
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "tool_result",
              toolName: "exec",
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "error": {
            const errMsg =
              payload && typeof payload["message"] === "string"
                ? (payload["message"] as string)
                : "(no error message)";
            warnings.push({
              lineOrdinal,
              reason: `event_msg.error: ${errMsg}`,
            });
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "system",
              text: errMsg,
              raw,
              bytes: byteLength(errMsg),
            });
            break;
          }

          default: {
            warnings.push({
              lineOrdinal,
              reason: `unknown event_msg payload.type '${payloadType}'`,
            });
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "unknown",
              text: stringifyTruncated(payload),
              raw,
              bytes: byteLength(raw),
            });
          }
        }
        break;
      }

      default: {
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
 * Read timestamp: top-level `/timestamp` preferred (spec line 784);
 * falls back to `/payload/timestamp`. Returns RFC3339 string when
 * parseable, null otherwise. Issues a warning on unparseable strings.
 */
function parseTimestamp(
  record: JsonObject,
  payload: JsonObject | null,
  lineOrdinal: number,
  warnings: ParseWarning[],
): string | null {
  const top = record["timestamp"];
  if (typeof top === "string") {
    const millis = Date.parse(top);
    if (!Number.isNaN(millis)) return top;
    warnings.push({
      lineOrdinal,
      reason: `unparseable RFC3339 top-level timestamp '${top}'`,
    });
    // Fall through to payload check.
  } else if (top !== undefined && top !== null) {
    warnings.push({ lineOrdinal, reason: "top-level timestamp is not a string" });
  }

  if (payload) {
    const inner = payload["timestamp"];
    if (typeof inner === "string") {
      const millis = Date.parse(inner);
      if (!Number.isNaN(millis)) return inner;
      warnings.push({
        lineOrdinal,
        reason: `unparseable RFC3339 payload.timestamp '${inner}'`,
      });
    } else if (inner !== undefined && inner !== null) {
      warnings.push({ lineOrdinal, reason: "payload.timestamp is not a string" });
    }
  }

  return null;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function stringifyTruncated(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return "[unserialisable record]";
  }
}
