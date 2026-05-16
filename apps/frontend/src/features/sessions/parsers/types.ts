// Type definitions for the per-tool message parsers, the dispatcher, and
// the buildSkim block model. Mirrors `working/phase-5.md` §Data Model in
// the Browser (lines 233-348) verbatim.
//
// Per-tool parsers (`parseClaudeCode`, `parseCodex`) return `ParserOutput`
// — pure of stream metadata. The dispatcher (`dispatchParser`) wraps the
// parser output with `StreamMeta` and `buildSkim(messages)` to produce the
// consumable `ParsedSession`.
//
// `Tool` is re-imported from the existing contracts barrel to keep the
// frontend's typed-message data model anchored to the canonical Rust
// contract crate. If `Tool` later grows a third variant the dispatcher's
// `Record<Tool, ParserFn>` type fails the build until a parser is added.

import type { Tool } from "../../../lib/contracts";

/**
 * The kinds a single parsed message can carry. Parsers assign these
 * authoritatively; `buildSkim` consumes them but never mutates.
 *
 * - `user` / `assistant` / `tool_use` / `tool_result`: standard timeline shapes.
 * - `system`: prelude / metadata (e.g., Codex `session_meta` first occurrence,
 *   Claude Code `summary`).
 * - `boundary`: chapter-break marker (Codex second `session_meta` →
 *   `session_resumed`; future `compacted` markers). Carries `boundarySubtype`.
 * - `unknown`: fallthrough for malformed or genuinely unrecognised
 *   top-level / payload shapes.
 * - `metadata`: Phase 7d — session-level chrome the parser previously
 *   silenced (Claude Code `agent-name`, `ai-title`, `attachment`,
 *   `custom-title`, `file-history-snapshot`, `last-prompt`,
 *   `permission-mode`, `queue-operation`; Codex `event_msg.token_count`,
 *   `turn_context`, `response_item.message role=user`,
 *   `response_item.message role=assistant`). Messages with this kind
 *   carry `metaCategory` (required) and, when `metaCategory === "echo"`,
 *   `echoOf` (required). Rendered as the marginalia "hairline" / "echo"
 *   register in `TranscriptView.tsx`.
 *
 * Amends Resolved Decision #2 of Phase 7c ("MessageKind is stable").
 * User explicitly approved the extension in the Phase 7d design review
 * round 2 — see `working/phase-7d/designs/design.md` §2.1.
 */
export type MessageKind =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system"
  | "unknown"
  | "boundary"
  | "metadata";

/**
 * Phase 7d — sub-category for `kind === "metadata"` messages. Each value
 * drives ONE visual recipe (label text, separator, value typography) in
 * the renderHints layer and `TranscriptView.tsx`'s `<MetadataRow>`
 * component.
 *
 * - `control`     — Claude Code `permission-mode`, `queue-operation`.
 * - `telemetry`   — Codex `event_msg.token_count`.
 * - `title`       — Claude Code `ai-title`, `custom-title`.
 * - `attachment`  — Claude Code `attachment`, `file-history-snapshot`.
 * - `agent`       — Claude Code `agent-name`.
 * - `prompt`      — Claude Code `last-prompt`.
 * - `context`     — Codex `turn_context`.
 * - `echo`        — Codex `response_item.message role=user/assistant`
 *                   (duplicate-anchor; renders as a single `↺` glyph row
 *                   pointing at the canonical `event_msg.{user,agent}_message`
 *                   line via `Message.echoOf`).
 *
 * Set on every Message with `kind === "metadata"`; absent on every other kind.
 */
export type MetaCategory =
  | "control"
  | "telemetry"
  | "title"
  | "attachment"
  | "agent"
  | "prompt"
  | "context"
  | "echo";

/**
 * One typed message in the timeline. Multiple `Message` rows can share a
 * single `lineOrdinal` when one NDJSON line splits into N typed rows
 * (Claude Code assistant content arrays carrying both `text` and
 * `tool_use` items, for example). `messageIndex` is always sequential
 * across the entire stream — that monotonicity is what `buildSkim`
 * relies on to define inclusive `[start, end]` ranges.
 */
export type Message = {
  /** 0-indexed JSONL line number. Multiple messages may share this when one line splits into N rows. */
  lineOrdinal: number;
  /** 0-indexed sequential position in `messages[]`. Stable identity used by skim block ranges. */
  messageIndex: number;
  /** RFC3339-parsed timestamp from the line, or `null` if missing/unparseable. */
  timestamp: string | null;
  kind: MessageKind;
  /** Human-readable text body. Tool calls JSON.stringify their input here. */
  text: string;
  /** Populated when `kind === "tool_use"` or `kind === "tool_result"`. */
  toolName?: string;
  /** Populated when `kind === "boundary"`. Consumed by `buildSkim` for the chapter-break label. */
  boundarySubtype?: "session_resumed" | "compacted";
  /** Verbatim NDJSON line for "Expand to raw" affordances. */
  raw: string;
  /** Approximate UTF-8 byte size for oversize detection in `buildSkim`. */
  bytes: number;
  /**
   * Phase 7d — sub-category for `kind === "metadata"` messages. REQUIRED
   * on every metadata-kind message. ABSENT on every other kind.
   *
   * Drives the per-row visual recipe in the renderHints layer and the
   * `<MetadataRow>` component in `TranscriptView.tsx`.
   */
  metaCategory?: MetaCategory;
  /**
   * Phase 7d — back-pointer for `metaCategory === "echo"` messages
   * (Codex `response_item.message role=user/assistant`). Identifies the
   * canonical `event_msg.{user,agent}_message` line whose content this
   * echo row duplicates. REQUIRED when `metaCategory === "echo"`;
   * ABSENT on every other metaCategory.
   *
   * `lineOrdinal` is the 0-indexed JSONL line of the canonical row;
   * `canonicalKind` discriminates the tooltip / aria-label copy.
   */
  echoOf?: { lineOrdinal: number; canonicalKind: "user" | "assistant" };
};

/**
 * The four block kinds emitted by `buildSkim`. Note `oversized_user_message`
 * and `boundary` are EMITTED as their own one-element blocks; `user_turn` and
 * `agent_only` are RANGES.
 *
 * Per spec lines 260-262.
 */
export type BlockKind =
  | "user_turn"
  | "boundary"
  | "agent_only"
  | "oversized_user_message";

/**
 * One Skim block. `start` and `end` are INCLUSIVE indices into `messages[]`
 * (NOT `lineOrdinal`). `meta` carries kind-specific bookkeeping:
 *
 * - `user_turn` blocks may carry `oversize: N` if N user messages within
 *   the block exceed the threshold (we still keep the turn as `user_turn`;
 *   only top-level oversized-user-message-as-its-own-block emits the
 *   `oversized_user_message` kind). For M3a, the spec defers the inside-turn
 *   oversize counter to a later pass — buildSkim simply emits a top-level
 *   `oversized_user_message` block when the user turn would have started with
 *   an oversize user message.
 * - `agent_only` blocks may carry `empty: 1` for the empty-stream case.
 * - `boundary` blocks carry `subtype: "session_resumed" | "compacted"`.
 * - `oversized_user_message` blocks carry `sizeBytes: number`.
 */
export type SkimBlock = {
  kind: BlockKind;
  /** Inclusive `messageIndex` of the first message in the block. */
  start: number;
  /** Inclusive `messageIndex` of the last message in the block. -1 is reserved for the empty-stream sentinel. */
  end: number;
  meta?: Record<string, string | number>;
};

/**
 * Phase 7b warning taxonomy. Parser warnings are reserved for genuine
 * anomalies; expected metadata and lifecycle records are handled by
 * explicit parser routes without warning.
 */
export type ParseWarningSeverity = "error" | "warning" | "info";

export type ParseWarningCategory =
  | "lexer"
  | "schema"
  | "payload"
  | "timestamp"
  | "meta";

/**
 * One parser warning. Surfaced by the existing Transcript banner through
 * `reason`; severity/category/messageIndex are carried forward for Phase 7c
 * inline routing. Parsers MUST NEVER throw.
 */
export type ParseWarning = {
  /** 0-indexed JSONL line number where the warning was raised. */
  lineOrdinal: number;
  /** Drives future banner-vs-inline routing. */
  severity: ParseWarningSeverity;
  /** Groups warnings by parser failure domain. */
  category: ParseWarningCategory;
  /** Human-readable reason; surfaced as a small dismissible banner. */
  reason: string;
  /** Optional index into `messages[]` when the warning concerns an emitted message. */
  messageIndex?: number;
};

/**
 * What a per-tool parser returns. Pure of stream metadata.
 */
export type ParserOutput = {
  messages: Message[];
  warnings: ParseWarning[];
};

/**
 * Stream metadata produced by `streamRawText` (M3b) and passed into
 * `dispatchParser`. The dispatcher wraps it onto the `ParserOutput` to
 * form the consumable `ParsedSession`.
 */
export type StreamMeta = {
  /** Bytes accepted into `text` (UTF-8). */
  totalBytes: number;
  /** True when the 5 MB cap fired during streamRawText. */
  truncated: boolean;
};

/**
 * What the dispatcher assembles. Consumed by Skim/Transcript views.
 */
export type ParsedSession = {
  tool: Tool;
  messages: Message[];
  skim: SkimBlock[];
  totalBytes: number;
  truncated: boolean;
  warnings: ParseWarning[];
};
