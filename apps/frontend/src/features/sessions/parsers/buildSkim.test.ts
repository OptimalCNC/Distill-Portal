// Coverage map (per spec lines 798-810 + the dual-tracker regression set):
//   1. Empty stream → one agent_only block with end:-1, meta.empty=1
//   2. Single user msg → one user_turn block
//   3. user → assistant → user → assistant → two disjoint user_turn blocks
//   4. user → assistant → tool_use → tool_result → user → ... → tool calls extend turn
//   5. Boundary mid-stream resets BOTH trackers (regression for spec line 374)
//   6. Agent-only run → single agent_only block
//   7. Single oversized user msg → single oversized_user_message block (no user_turn)
//   8. Oversized user msg between two user turns → ...turn / oversized / turn...
//   9. Codex `system → user → assistant` → [agent_only [0,0], user_turn [1,2]]
//      (THE dual-tracker merging-bug regression — the bug both Claude reviewers
//       missed in earlier phases.)
//  10. Boundary at start of stream → boundary at [0,0], then opens agent_only
//  11. Boundary at end of stream → previous block closes at i-1, boundary [last,last]
//  12. Boundary subtype propagates through meta
//  13. Trailing user message with no agent reply → user_turn closes at last index
//  14. unknown messages extend whichever tracker is open / open agent_only otherwise
//  15. Oversized at index 0 (no preceding tracker to close) — exercises null-close branch

import { expect, test } from "bun:test";
import { buildSkim, USER_MSG_OVERSIZE_THRESHOLD } from "./buildSkim";
import type { Message } from "./types";

/** Tiny helper to build a Message without spelling out every field every time. */
function msg(
  messageIndex: number,
  kind: Message["kind"],
  overrides: Partial<Message> = {},
): Message {
  return {
    lineOrdinal: messageIndex,
    messageIndex,
    timestamp: null,
    kind,
    text: "",
    raw: "",
    bytes: 0,
    ...overrides,
  };
}

test("empty stream returns single agent_only sentinel block", () => {
  expect(buildSkim([], USER_MSG_OVERSIZE_THRESHOLD)).toEqual([
    { kind: "agent_only", start: 0, end: -1, meta: { empty: 1 } },
  ]);
});

test("single user message becomes one user_turn block", () => {
  const result = buildSkim([msg(0, "user", { text: "hi" })], USER_MSG_OVERSIZE_THRESHOLD);
  expect(result).toEqual([{ kind: "user_turn", start: 0, end: 0 }]);
});

test("user→assistant→user→assistant produces two disjoint user_turn blocks", () => {
  const result = buildSkim(
    [
      msg(0, "user"),
      msg(1, "assistant"),
      msg(2, "user"),
      msg(3, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "user_turn", start: 0, end: 1 },
    { kind: "user_turn", start: 2, end: 3 },
  ]);
});

test("tool_use and tool_result extend the current user_turn", () => {
  const result = buildSkim(
    [
      msg(0, "user"),
      msg(1, "assistant"),
      msg(2, "tool_use"),
      msg(3, "tool_result"),
      msg(4, "assistant"),
      msg(5, "user"),
      msg(6, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "user_turn", start: 0, end: 4 },
    { kind: "user_turn", start: 5, end: 6 },
  ]);
});

test("boundary mid-stream resets BOTH trackers and emits boundary block", () => {
  const result = buildSkim(
    [
      msg(0, "user"),
      msg(1, "assistant"),
      msg(2, "boundary", { boundarySubtype: "session_resumed" }),
      msg(3, "user"),
      msg(4, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "user_turn", start: 0, end: 1 },
    { kind: "boundary", start: 2, end: 2, meta: { subtype: "session_resumed" } },
    { kind: "user_turn", start: 3, end: 4 },
  ]);
});

test("boundary mid agent_only run also closes the agent_only", () => {
  // No user message before the boundary — only agent_only is open.
  const result = buildSkim(
    [
      msg(0, "system"),
      msg(1, "assistant"),
      msg(2, "boundary", { boundarySubtype: "compacted" }),
      msg(3, "user"),
      msg(4, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "agent_only", start: 0, end: 1 },
    { kind: "boundary", start: 2, end: 2, meta: { subtype: "compacted" } },
    { kind: "user_turn", start: 3, end: 4 },
  ]);
});

test("agent-only run with no user message becomes one agent_only block", () => {
  const result = buildSkim(
    [
      msg(0, "assistant"),
      msg(1, "tool_use"),
      msg(2, "tool_result"),
      msg(3, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([{ kind: "agent_only", start: 0, end: 3 }]);
});

test("single oversize user message → single oversized_user_message block; no user_turn", () => {
  const result = buildSkim(
    [msg(0, "user", { bytes: USER_MSG_OVERSIZE_THRESHOLD + 1 })],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    {
      kind: "oversized_user_message",
      start: 0,
      end: 0,
      meta: { sizeBytes: USER_MSG_OVERSIZE_THRESHOLD + 1 },
    },
  ]);
});

test("oversize user msg sits between two user_turns; both trackers reset", () => {
  const result = buildSkim(
    [
      msg(0, "user"),
      msg(1, "assistant"),
      msg(2, "user", { bytes: USER_MSG_OVERSIZE_THRESHOLD + 100 }),
      msg(3, "user"),
      msg(4, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "user_turn", start: 0, end: 1 },
    {
      kind: "oversized_user_message",
      start: 2,
      end: 2,
      meta: { sizeBytes: USER_MSG_OVERSIZE_THRESHOLD + 100 },
    },
    { kind: "user_turn", start: 3, end: 4 },
  ]);
});

// ===== THE dual-tracker merging-bug regression test =====
// Without two explicit trackers, a "system → user → assistant" stream
// would produce one merged user_turn [0..2]. The spec at line 387 mandates
// [agent_only [0,0], user_turn [1,2]]. Regress on this specifically.
test("system → user → assistant emits [agent_only [0,0], user_turn [1,2]] (dual-tracker regression)", () => {
  const result = buildSkim(
    [msg(0, "system"), msg(1, "user"), msg(2, "assistant")],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "agent_only", start: 0, end: 0 },
    { kind: "user_turn", start: 1, end: 2 },
  ]);
});

test("boundary at start of stream emits boundary at [0,0], then opens agent_only", () => {
  const result = buildSkim(
    [
      msg(0, "boundary", { boundarySubtype: "session_resumed" }),
      msg(1, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "boundary", start: 0, end: 0, meta: { subtype: "session_resumed" } },
    { kind: "agent_only", start: 1, end: 1 },
  ]);
});

test("boundary at end of stream closes preceding tracker at i-1", () => {
  const result = buildSkim(
    [
      msg(0, "user"),
      msg(1, "assistant"),
      msg(2, "boundary", { boundarySubtype: "session_resumed" }),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "user_turn", start: 0, end: 1 },
    { kind: "boundary", start: 2, end: 2, meta: { subtype: "session_resumed" } },
  ]);
});

test("boundary without subtype emits empty meta", () => {
  const result = buildSkim(
    [msg(0, "boundary")],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([{ kind: "boundary", start: 0, end: 0, meta: {} }]);
});

test("trailing user message with no agent reply still closes at last index", () => {
  const result = buildSkim(
    [msg(0, "user"), msg(1, "assistant"), msg(2, "user")],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "user_turn", start: 0, end: 1 },
    { kind: "user_turn", start: 2, end: 2 },
  ]);
});

test("unknown messages extend an open user_turn", () => {
  const result = buildSkim(
    [msg(0, "user"), msg(1, "unknown"), msg(2, "assistant")],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([{ kind: "user_turn", start: 0, end: 2 }]);
});

test("unknown messages open agent_only when no tracker is open", () => {
  const result = buildSkim(
    [msg(0, "unknown"), msg(1, "system")],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([{ kind: "agent_only", start: 0, end: 1 }]);
});

test("oversized at index 0 with no preceding tracker exercises null-close branch", () => {
  const result = buildSkim(
    [
      msg(0, "user", { bytes: USER_MSG_OVERSIZE_THRESHOLD + 1 }),
      msg(1, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    {
      kind: "oversized_user_message",
      start: 0,
      end: 0,
      meta: { sizeBytes: USER_MSG_OVERSIZE_THRESHOLD + 1 },
    },
    { kind: "agent_only", start: 1, end: 1 },
  ]);
});

test("user message exactly at threshold is NOT oversized (boundary check)", () => {
  // > threshold, not >=. A user message of EXACTLY 65_536 bytes still opens a normal turn.
  const result = buildSkim(
    [msg(0, "user", { bytes: USER_MSG_OVERSIZE_THRESHOLD })],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([{ kind: "user_turn", start: 0, end: 0 }]);
});

test("boundary in middle of agent_only with no user_turn ever — agent_only / boundary / agent_only", () => {
  const result = buildSkim(
    [
      msg(0, "system"),
      msg(1, "assistant"),
      msg(2, "boundary", { boundarySubtype: "session_resumed" }),
      msg(3, "system"),
      msg(4, "assistant"),
    ],
    USER_MSG_OVERSIZE_THRESHOLD,
  );
  expect(result).toEqual([
    { kind: "agent_only", start: 0, end: 1 },
    { kind: "boundary", start: 2, end: 2, meta: { subtype: "session_resumed" } },
    { kind: "agent_only", start: 3, end: 4 },
  ]);
});

test("constant USER_MSG_OVERSIZE_THRESHOLD is 65_536 bytes (spec §File layout)", () => {
  expect(USER_MSG_OVERSIZE_THRESHOLD).toBe(65_536);
});
