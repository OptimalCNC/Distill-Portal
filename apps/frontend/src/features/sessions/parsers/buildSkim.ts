// Pure synchronous turn/agent/boundary block builder.
//
// Walks a parser-produced `Message[]` exactly once with TWO explicit
// open-region trackers — `openUserTurnStart` and `openAgentOnlyStart` —
// per `working/phase-5.md` §User-turn boundary algorithm (lines 360-394).
//
// Why two trackers and not one shared `currentTurnStart`: a Codex session
// often begins with a `system` prelude (the first `session_meta` line)
// followed by the user prompt followed by the agent reply. With a shared
// tracker the system prelude would silently fold into the user turn,
// emitting one block `[user_turn 0..2]` instead of the spec-required two
// `[agent_only 0..0, user_turn 1..2]`. The dual-tracker structure forces
// the open agent_only region to close at `i - 1` the moment the first
// user message arrives — matching the spec's "system → user → assistant"
// truth-table row exactly.
//
// Block kinds per spec line 261:
//   - `user_turn`: a user message + its agent reaction (assistant /
//     tool_use / tool_result / system / unknown rows that follow until
//     the next user message or boundary or end-of-stream).
//   - `boundary`: a single-message block emitted for `kind: "boundary"`
//     messages (Codex `session_resumed`; future `compacted`). NEVER
//     merged into a neighbor.
//   - `agent_only`: a run of non-user messages with no preceding user
//     message in the open turn. Also the empty-stream sentinel
//     (`{start: 0, end: -1, meta: {empty: 1}}`).
//   - `oversized_user_message`: a single-message block emitted when a
//     user message's `bytes > threshold`. Both trackers reset before and
//     after — the oversize block stands alone (the agent reaction that
//     follows opens a new agent_only or user_turn per the next message).
//
// `start` and `end` are INCLUSIVE indices into `messages[]`
// (`messageIndex`, NOT `lineOrdinal`).

import type { Message, SkimBlock } from "./types";

/**
 * 64 KB. Spec §Per-tool Message Parsers / Truth tables line 805 cites a
 * 64 KB threshold. Co-located with `buildSkim` per spec §File layout
 * line 740.
 */
export const USER_MSG_OVERSIZE_THRESHOLD = 65_536;

/**
 * Walk a typed message stream and produce the skim block list.
 *
 * @param messages The full ordered message stream (parser output).
 * @param threshold Byte threshold above which a user message becomes its
 *                  own `oversized_user_message` block.
 */
export function buildSkim(messages: Message[], threshold: number): SkimBlock[] {
  // Spec line 372: empty stream → one `agent_only` block with the empty sentinel.
  if (messages.length === 0) {
    return [
      { kind: "agent_only", start: 0, end: -1, meta: { empty: 1 } },
    ];
  }

  const blocks: SkimBlock[] = [];
  let openUserTurnStart: number | null = null;
  let openAgentOnlyStart: number | null = null;

  const closeOpenRegions = (endIndex: number): void => {
    if (openUserTurnStart !== null) {
      blocks.push({
        kind: "user_turn",
        start: openUserTurnStart,
        end: endIndex,
      });
      openUserTurnStart = null;
    } else if (openAgentOnlyStart !== null) {
      blocks.push({
        kind: "agent_only",
        start: openAgentOnlyStart,
        end: endIndex,
      });
      openAgentOnlyStart = null;
    }
  };

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];

    if (m.kind === "boundary") {
      closeOpenRegions(i - 1);
      const meta: Record<string, string | number> = {};
      if (m.boundarySubtype) meta["subtype"] = m.boundarySubtype;
      blocks.push({ kind: "boundary", start: i, end: i, meta });
      // Both trackers already null after closeOpenRegions.
      continue;
    }

    if (m.kind === "metadata") {
      // Phase 7d — metadata Messages are session-level chrome
      // (Claude Code session settings, Codex telemetry / context /
      // duplicate-anchor rows). They do NOT participate in the
      // user_turn / agent_only partition because they are not
      // timeline turn participants — they're marginalia rendered
      // beside the timeline in TranscriptView. Skip them here so the
      // partition's truth-table rows (system → user → assistant)
      // remain unaffected.
      //
      // The metadata row's `messageIndex` remains addressable inside
      // any enclosing user_turn / agent_only block range — the range
      // is still inclusive `[start, end]`, and a metadata message at
      // index k between start and end is simply rendered inside the
      // scoped TranscriptView when the user expands the block. The
      // block-kind partition treats it as "extend whichever region is
      // currently open"; an isolated metadata message at the head of
      // the stream opens an `agent_only` block of length 1 like any
      // other non-user prelude.
      if (openUserTurnStart !== null) {
        // Inside a user_turn → keep extending; no state change.
        continue;
      }
      if (openAgentOnlyStart === null) {
        openAgentOnlyStart = i;
      }
      continue;
    }

    if (m.kind === "user") {
      if (m.bytes > threshold) {
        closeOpenRegions(i - 1);
        blocks.push({
          kind: "oversized_user_message",
          start: i,
          end: i,
          meta: { sizeBytes: m.bytes },
        });
        // Both trackers stay null. The next non-user message will open a
        // fresh agent_only; the next user message will open a fresh
        // user_turn.
        continue;
      }

      // Normal user message: close any open region at i-1, open a new user_turn.
      closeOpenRegions(i - 1);
      openUserTurnStart = i;
      continue;
    }

    // assistant / tool_use / tool_result / system / unknown all extend
    // whichever region is currently open, OR open a new agent_only if
    // neither is open.
    if (openUserTurnStart !== null) {
      // Inside a user_turn → keep extending; no state change.
      continue;
    }
    if (openAgentOnlyStart === null) {
      openAgentOnlyStart = i;
    }
    // Otherwise extending an open agent_only → no state change.
  }

  // End-of-stream: close any still-open region at the last index.
  closeOpenRegions(messages.length - 1);

  return blocks;
}
