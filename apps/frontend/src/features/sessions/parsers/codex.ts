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
import type {
  ParseWarningCategory,
  ParseWarningSeverity,
} from "./types";

/**
 * Phase 7d — short-cwd truncation cap for the `turn_context` metadata
 * display. Long absolute paths fold to head + `…` so the strip stays
 * readable. Matches `working/phase-7d/designs/design.md` §3.4
 * truncation rule (78 chars overall, with the cwd component capped to
 * keep room for `model` / `sandbox` / `approval`).
 */
const CWD_MAX_CHARS = 40;

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
    const payload = isObject(record["payload"]) ? record["payload"] : null;
    const timestamp = parseTimestamp(record, payload, lineOrdinal, warnings);

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
      case "session_meta": {
        /** Matrix: docs/features/parser-event-support.md#codex-session-meta */
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
        /**
         * Matrix:
         * - docs/features/parser-event-support.md#codex-response-item-custom-tool-call
         * - docs/features/parser-event-support.md#codex-response-item-custom-tool-call-output
         * - docs/features/parser-event-support.md#codex-response-item-function-call
         * - docs/features/parser-event-support.md#codex-response-item-function-call-output
         * - docs/features/parser-event-support.md#codex-response-item-message-role-assistant
         * - docs/features/parser-event-support.md#codex-response-item-message-role-developer
         * - docs/features/parser-event-support.md#codex-response-item-message-role-user
         * - docs/features/parser-event-support.md#codex-response-item-reasoning
         * - docs/features/parser-event-support.md#codex-response-item-web-search-call
         */
        if (!payload) {
          messages.push({
            lineOrdinal, messageIndex: nextMessageIndex++, timestamp,
            kind: "unknown", text: stringifyTruncated(record), raw, bytes: byteLength(raw),
          });
          pushWarning(
            warnings,
            lineOrdinal,
            "error",
            "schema",
            "response_item missing payload",
            nextMessageIndex - 1,
          );
          break;
        }
        const payloadType =
          typeof payload["type"] === "string" ? (payload["type"] as string) : null;
        const role =
          typeof payload["role"] === "string" ? (payload["role"] as string) : null;

        if (payloadType === "message" && (role === "user" || role === "assistant")) {
          /**
           * Matrix:
           * - docs/features/parser-event-support.md#codex-response-item-message-role-user
           * - docs/features/parser-event-support.md#codex-response-item-message-role-assistant
           *
           * Phase 7d: duplicate-anchor row — `event_msg` is canonical, but
           * the user-product decision in `working/phase-7d/designs/design.md`
           * §3.6 says "no event hidden", so we surface a `kind:"metadata"`
           * echo Message rendered as a single `↺` glyph row pointing
           * back at the canonical `event_msg.{user,agent}_message` line.
           *
           * `lineOrdinal` for `echoOf` is initially set to the echo's
           * OWN line (sentinel; resolved in the post-parse pass below).
           * Real Codex streams emit the canonical `event_msg.{user,agent}_message`
           * row on a different line than the `response_item.message`
           * duplicate, so the deferred resolution finds the nearest
           * matching canonical Message and points `echoOf.lineOrdinal`
           * at IT. If no canonical is found (degenerate session), the
           * back-pointer stays at the duplicate's own line.
           *
           * Codex external review (Phase 7d, 2026-05-16) caught the
           * earlier "always-own-line" behavior as a real bug: the
           * tooltip "duplicate of event_msg.user_message at line N"
           * promised a different line than the duplicate's own, but
           * the implementation always returned the duplicate's line.
           * The deferred resolution closes this.
           */
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "metadata",
            metaCategory: "echo",
            echoOf: {
              lineOrdinal,
              canonicalKind: role,
            },
            text: "",
            raw,
            bytes: byteLength(raw),
          });
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

        if (payloadType === "custom_tool_call") {
          const text = stringifyMessagePayload(
            payload["input"] ?? payload["arguments"] ?? null,
          );
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "tool_use",
            toolName: stringField(payload, "name", "custom_tool_call"),
            text,
            raw,
            bytes: byteLength(text),
          });
          break;
        }

        if (payloadType === "web_search_call") {
          const text = stringifyMessagePayload(payload["query"] ?? payload);
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "tool_use",
            toolName: "web_search",
            text,
            raw,
            bytes: byteLength(text),
          });
          break;
        }

        if (
          payloadType === "function_call_output" ||
          payloadType === "custom_tool_call_output"
        ) {
          const text = stringifyMessagePayload(payload["output"] ?? payload["result"] ?? null);
          messages.push({
            lineOrdinal,
            messageIndex: nextMessageIndex++,
            timestamp,
            kind: "tool_result",
            toolName:
              payloadType === "function_call_output"
                ? stringField(payload, "name", "function_call")
                : stringField(payload, "name", "custom_tool_call"),
            text,
            raw,
            bytes: byteLength(text),
          });
          break;
        }

        if (payloadType === "message" && role === "developer") {
          const text = contentArrayText(payload["content"], "developer message");
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

        if (payloadType === "reasoning") {
          const text = reasoningText(payload);
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

        // Unknown response_item shape (totality fallthrough).
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
          `unknown response_item payload.type '${payloadType ?? "(missing)"}'`,
          nextMessageIndex - 1,
        );
        break;
      }

      case "turn_context": {
        /**
         * Matrix: docs/features/parser-event-support.md#codex-turn-context
         *
         * Phase 7d: surface as `kind:"metadata"` hairline per
         * `working/phase-7d/designs/design.md` §3.4. Folds cwd / model
         * / sandbox / approval into one strip; drops `current_date`
         * per the design.
         */
        const text = formatTurnContext(payload);
        messages.push({
          lineOrdinal,
          messageIndex: nextMessageIndex++,
          timestamp,
          kind: "metadata",
          metaCategory: "context",
          text,
          raw,
          bytes: byteLength(raw),
        });
        break;
      }

      case "event_msg": {
        /**
         * Matrix:
         * - docs/features/parser-event-support.md#codex-event-msg-agent-message
         * - docs/features/parser-event-support.md#codex-event-msg-agent-reasoning
         * - docs/features/parser-event-support.md#codex-event-msg-collab-agent-interaction-end
         * - docs/features/parser-event-support.md#codex-event-msg-collab-agent-spawn-end
         * - docs/features/parser-event-support.md#codex-event-msg-collab-close-end
         * - docs/features/parser-event-support.md#codex-event-msg-collab-waiting-end
         * - docs/features/parser-event-support.md#codex-event-msg-context-compacted
         * - docs/features/parser-event-support.md#codex-event-msg-entered-review-mode
         * - docs/features/parser-event-support.md#codex-event-msg-error
         * - docs/features/parser-event-support.md#codex-event-msg-exec-command-end
         * - docs/features/parser-event-support.md#codex-event-msg-exited-review-mode
         * - docs/features/parser-event-support.md#codex-event-msg-item-completed
         * - docs/features/parser-event-support.md#codex-event-msg-mcp-tool-call-end
         * - docs/features/parser-event-support.md#codex-event-msg-patch-apply-end
         * - docs/features/parser-event-support.md#codex-event-msg-task-complete
         * - docs/features/parser-event-support.md#codex-event-msg-task-started
         * - docs/features/parser-event-support.md#codex-event-msg-thread-rolled-back
         * - docs/features/parser-event-support.md#codex-event-msg-token-count
         * - docs/features/parser-event-support.md#codex-event-msg-turn-aborted
         * - docs/features/parser-event-support.md#codex-event-msg-user-message
         * - docs/features/parser-event-support.md#codex-event-msg-web-search-end
         */
        const payloadType =
          payload && typeof payload["type"] === "string"
            ? (payload["type"] as string)
            : null;

        if (payloadType === null) {
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
            "error",
            "schema",
            "event_msg missing payload.type",
            nextMessageIndex - 1,
          );
          break;
        }

        switch (payloadType) {
          case "user_message": {
            const m = payload ? payload["message"] : undefined;
            let text = "";
            if (typeof m === "string") {
              text = m;
            } else {
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                "event_msg.user_message missing or non-string payload.message",
              );
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
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                "event_msg.agent_message missing or non-string payload.message",
              );
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
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                "event_msg.agent_reasoning missing or non-string payload.text and payload.message",
              );
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
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                "event_msg.exec_command missing payload.command",
              );
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
              pushWarning(
                warnings,
                lineOrdinal,
                "warning",
                "payload",
                "event_msg.exec_command_output missing payload.output",
              );
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

          case "exec_command_end": {
            const text = eventResultText(payload);
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

          case "mcp_tool_call_end": {
            const text = eventResultText(payload);
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "tool_result",
              toolName: stringField(payload, "tool_name", "mcp"),
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "patch_apply_end": {
            const text = eventResultText(payload);
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "tool_result",
              toolName: "apply_patch",
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "web_search_end": {
            const text = eventResultText(payload);
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "tool_result",
              toolName: "web_search",
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "context_compacted":
          case "thread_rolled_back": {
            const text =
              payloadType === "context_compacted"
                ? "conversation compacted"
                : "thread rolled back";
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "boundary",
              boundarySubtype: "compacted",
              text,
              raw,
              bytes: byteLength(text),
            });
            break;
          }

          case "collab_agent_interaction_end":
          case "collab_agent_spawn_end":
          case "collab_close_end":
          case "collab_waiting_end":
          case "entered_review_mode":
          case "exited_review_mode":
          case "item_completed":
          case "turn_aborted": {
            const text = systemEventText(payloadType, payload);
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

          case "token_count": {
            /**
             * Matrix: docs/features/parser-event-support.md#codex-event-msg-token-count
             *
             * Phase 7d: surface as `kind:"metadata"` telemetry hairline
             * per `working/phase-7d/designs/design.md` §3.4.
             */
            const text = formatTokenCount(payload);
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "metadata",
              metaCategory: "telemetry",
              text,
              raw,
              bytes: byteLength(raw),
            });
            break;
          }

          case "error": {
            const errMsg =
              payload && typeof payload["message"] === "string"
                ? (payload["message"] as string)
                : "(no error message)";
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
            messages.push({
              lineOrdinal,
              messageIndex: nextMessageIndex++,
              timestamp,
              kind: "unknown",
              text: stringifyTruncated(payload),
              raw,
              bytes: byteLength(raw),
            });
            pushWarning(
              warnings,
              lineOrdinal,
              "warning",
              "schema",
              `unknown event_msg payload.type '${payloadType}'`,
              nextMessageIndex - 1,
            );
          }
        }
        break;
      }

      case "compacted": {
        /** Matrix: docs/features/parser-event-support.md#codex-compacted */
        const text =
          payload && typeof payload["message"] === "string"
            ? (payload["message"] as string)
            : "conversation compacted";
        messages.push({
          lineOrdinal,
          messageIndex: nextMessageIndex++,
          timestamp,
          kind: "boundary",
          boundarySubtype: "compacted",
          text,
          raw,
          bytes: byteLength(text),
        });
        break;
      }

      default: {
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

  // Phase 7d post-parse resolution: echo metadata Messages (the
  // duplicate-anchor `response_item.message` rows) initially carry
  // `echoOf.lineOrdinal = duplicate's own line` because the parser
  // sees one record at a time and can't look ahead. Real Codex
  // streams emit the canonical `event_msg.{user,agent}_message` row
  // on a different line. Walk the message stream once and resolve
  // each echo's `lineOrdinal` to the nearest matching canonical
  // Message (preferring the immediately-following one — typical
  // Codex shape — then falling back to the nearest preceding).
  //
  // If no canonical is found in the stream (degenerate session with
  // a duplicate but no canonical emission), the echo's `lineOrdinal`
  // stays at its own line — the tooltip is then technically
  // pointing at itself, but the rendered glyph still surfaces the
  // event, which preserves the "no event hidden" contract.
  resolveEchoBackPointers(messages);

  return { messages, warnings };
}

/**
 * Post-parse pass that resolves echo `echoOf.lineOrdinal` to the
 * canonical `event_msg.{user,agent}_message` row's line number in
 * the parsed stream.
 *
 * Algorithm: for each `kind:"metadata"` `metaCategory:"echo"`
 * message in `messages`, find the nearest matching canonical
 * Message (kind matches `echoOf.canonicalKind`) — preferring the
 * forward direction (Codex's typical stream shape), then falling
 * back to backward. Mutate `echoOf.lineOrdinal` in place to point
 * at the canonical's line.
 *
 * Linear in `messages.length` for the scan, plus per-echo bounded
 * lookups. Overall bounded by `O(messages.length × max_window)`
 * where max_window is the longest gap between a duplicate and its
 * canonical; in practice the canonical is at index ± 5 within the
 * stream.
 */
function resolveEchoBackPointers(messages: Message[]): void {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.kind !== "metadata") continue;
    if (m.metaCategory !== "echo") continue;
    if (!m.echoOf) continue;
    const target = m.echoOf.canonicalKind;
    // Forward search first (typical Codex shape: canonical comes
    // immediately after the duplicate-anchor).
    let resolvedLine: number | null = null;
    let stoppedAtEchoBoundary = false;
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].kind === target) {
        resolvedLine = messages[j].lineOrdinal;
        break;
      }
      // Stop the forward search at the next echo of the same
      // canonicalKind — that echo is presumed to be the duplicate of
      // a different canonical farther along the stream. Anything
      // BEYOND this boundary is NOT our canonical.
      if (
        messages[j].kind === "metadata" &&
        messages[j].metaCategory === "echo" &&
        messages[j].echoOf?.canonicalKind === target
      ) {
        stoppedAtEchoBoundary = true;
        break;
      }
    }
    // Codex external review round 2 (Phase 7d, 2026-05-16) caught
    // that an unconditional backward fallback could mis-associate
    // when the forward search bailed at an echo boundary: in
    // `[canonicalA, echo1, echo2, canonicalB]`, echo1 should NOT
    // back-resolve to canonicalA because echo2 sits between them.
    // The fix: only backward-search when forward terminated because
    // it ran off the end of the stream (no echo boundary, no
    // canonical found). If forward stopped at an echo boundary,
    // leave echoOf.lineOrdinal at its sentinel (the duplicate's own
    // line) — pointing at oneself is less misleading than pointing
    // at the wrong canonical.
    if (resolvedLine === null && !stoppedAtEchoBoundary) {
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].kind === target) {
          resolvedLine = messages[j].lineOrdinal;
          break;
        }
      }
    }
    if (resolvedLine !== null && resolvedLine !== m.echoOf.lineOrdinal) {
      m.echoOf.lineOrdinal = resolvedLine;
    }
  }
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
    pushWarning(
      warnings,
      lineOrdinal,
      "warning",
      "timestamp",
      `unparseable RFC3339 top-level timestamp '${top}'`,
    );
    // Fall through to payload check.
  } else if (top !== undefined && top !== null) {
    pushWarning(
      warnings,
      lineOrdinal,
      "warning",
      "timestamp",
      "top-level timestamp is not a string",
    );
  }

  if (payload) {
    const inner = payload["timestamp"];
    if (typeof inner === "string") {
      const millis = Date.parse(inner);
      if (!Number.isNaN(millis)) return inner;
      pushWarning(
        warnings,
        lineOrdinal,
        "warning",
        "timestamp",
        `unparseable RFC3339 payload.timestamp '${inner}'`,
      );
    } else if (inner !== undefined && inner !== null) {
      pushWarning(
        warnings,
        lineOrdinal,
        "warning",
        "timestamp",
        "payload.timestamp is not a string",
      );
    }
  }

  return null;
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

function stringField(
  object: JsonObject | null,
  field: string,
  fallback: string,
): string {
  return object && typeof object[field] === "string"
    ? (object[field] as string)
    : fallback;
}

function stringifyMessagePayload(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null);
}

function eventResultText(payload: JsonObject | null): string {
  if (!payload) return "";
  const candidate =
    payload["output"] ?? payload["result"] ?? payload["message"] ?? payload["status"] ?? payload;
  return stringifyMessagePayload(candidate);
}

function systemEventText(payloadType: string, payload: JsonObject | null): string {
  if (!payload) return payloadType;
  const status = typeof payload["status"] === "string" ? ` · ${payload["status"]}` : "";
  const reason = typeof payload["reason"] === "string" ? ` · ${payload["reason"]}` : "";
  const agent = typeof payload["agent_id"] === "string" ? ` · ${payload["agent_id"]}` : "";
  const item = typeof payload["item_id"] === "string" ? ` · ${payload["item_id"]}` : "";
  return `${payloadType}${agent}${item}${status}${reason}`;
}

function contentArrayText(value: JsonValue | undefined, fallback: string): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return fallback;
  const parts = value.flatMap((item) => {
    if (!isObject(item)) return [];
    const text = item["text"];
    return typeof text === "string" ? [text] : [];
  });
  return parts.length > 0 ? parts.join("\n") : fallback;
}

function reasoningText(payload: JsonObject): string {
  const text = payload["text"] ?? payload["message"];
  if (typeof text === "string") return text;
  const summary = payload["summary"];
  if (Array.isArray(summary)) {
    const parts = summary.flatMap((item) => {
      if (!isObject(item)) return [];
      const summaryText = item["text"];
      return typeof summaryText === "string" ? [summaryText] : [];
    });
    if (parts.length > 0) return parts.join("\n");
  }
  return stringifyMessagePayload(payload);
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

/**
 * Phase 7d — format an `event_msg.token_count` payload as a metadata
 * telemetry line. Per `working/phase-7d/designs/design.md` §3.4:
 * `tokens: ${input}↓ ${output}↑` (+ ` ${cached}≈` if cached present,
 * + ` ${reasoning}†` if reasoning present).
 */
function formatTokenCount(payload: JsonObject | null): string {
  if (!payload) return "tokens: (no payload)";
  const input = numberField(payload, "input_tokens");
  const output = numberField(payload, "output_tokens");
  const cached = numberField(payload, "cached_input_tokens");
  const reasoning = numberField(payload, "reasoning_output_tokens");
  let text = `tokens: ${input ?? "?"}↓ ${output ?? "?"}↑`;
  if (cached !== null) text += ` ${cached}≈`;
  if (reasoning !== null) text += ` ${reasoning}†`;
  return text;
}

/**
 * Phase 7d — format a `turn_context` payload as a metadata context
 * line. Per `working/phase-7d/designs/design.md` §3.4: starts with
 * `turn context → cwd ${shortCwd}` and appends ` · model …`,
 * ` · sandbox …`, ` · approval …` when those fields are present.
 * `current_date` is dropped per design.
 */
function formatTurnContext(payload: JsonObject | null): string {
  if (!payload) return "turn context → (no payload)";
  const rawCwd =
    typeof payload["cwd"] === "string" ? (payload["cwd"] as string) : "?";
  const cwd =
    rawCwd.length > CWD_MAX_CHARS
      ? rawCwd.slice(0, CWD_MAX_CHARS) + "…"
      : rawCwd;
  let text = `turn context → cwd ${cwd}`;
  const model =
    typeof payload["model"] === "string" ? (payload["model"] as string) : null;
  if (model !== null) text += ` · model ${model}`;
  const sandbox =
    typeof payload["sandbox"] === "string"
      ? (payload["sandbox"] as string)
      : null;
  if (sandbox !== null) text += ` · sandbox ${sandbox}`;
  const approval =
    typeof payload["approval"] === "string"
      ? (payload["approval"] as string)
      : null;
  if (approval !== null) text += ` · approval ${approval}`;
  return text;
}

function numberField(payload: JsonObject, field: string): number | null {
  const value = payload[field];
  return typeof value === "number" ? value : null;
}
