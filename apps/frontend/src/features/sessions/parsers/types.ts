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
 * - `unknown`: fallthrough for unrecognised top-level / payload shapes.
 *   Always paired with a `warnings[]` entry by the parser.
 */
export type MessageKind =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system"
  | "unknown"
  | "boundary";

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
 * One parser warning. Surfaced as a small dismissible banner in M4/M5.
 * Every malformed input (JSON parse failure, unknown shape, role
 * mismatch, low-severity Claude-meta type) lands here — parsers MUST
 * NEVER throw.
 */
export type ParseWarning = {
  /** 0-indexed JSONL line number where the warning was raised. */
  lineOrdinal: number;
  /** Human-readable reason; surfaced as a small dismissible banner. */
  reason: string;
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
