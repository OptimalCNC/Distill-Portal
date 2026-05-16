// Unit tests for the Phase 7c / M2 render-hint layer.
//
// Branch-coverage targets (per `working/phase-7c.md` §Milestone 2):
//   - Adjacent pair (tool_use immediately followed by matching tool_result).
//   - Orphan tool_use (no following result OR non-matching tool_result).
//   - Orphan tool_result (no preceding tool_use).
//   - Boundary message resets pairing.
//   - Each of the 4 warning classification buckets.
//   - Warning with messageIndex set: attaches to the hint at that index.
//   - Warning without messageIndex: no inline attachment.
//   - Task-lifecycle stamping for `task_started` / `task_complete` prefixes.
//   - Empty messages array returns empty hints.
//
// Test scaffolding: pure synthetic `Message[]` arrays — no JSONL
// parsing in this layer.

import { expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyWarning,
  detectFailure,
  GROUP_THRESHOLD,
  METADATA_COLLAPSE_THRESHOLD,
  renderHints,
  type InlineWarning,
  type RenderHint,
} from "./renderHints";
import { dispatchParser } from "./parsers";
import type { Message, ParseWarning } from "./parsers";

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../tests/fixtures/render-hints",
);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<Message>): Message {
  const base: Message = {
    lineOrdinal: overrides.messageIndex ?? 0,
    messageIndex: 0,
    timestamp: null,
    kind: "user",
    text: "",
    raw: "",
    bytes: 0,
  };
  return { ...base, ...overrides };
}

function w(
  severity: ParseWarning["severity"],
  category: ParseWarning["category"],
  messageIndex?: number,
  reason: string = "x",
): ParseWarning {
  return {
    lineOrdinal: 0,
    severity,
    category,
    reason,
    ...(messageIndex !== undefined ? { messageIndex } : {}),
  };
}

// ---------------------------------------------------------------------------
// GROUP_THRESHOLD
// ---------------------------------------------------------------------------

test("GROUP_THRESHOLD is locked at 2 per polish-r2 (was 3 at M1)", () => {
  // Post-Phase-7c polish round 2 lowered the threshold to 2 after
  // real-session user feedback: a 2-Edit pair within a typical
  // Claude Code turn (assistant text → Edit → tool_result → assistant
  // text → Edit → tool_result) is visually noisy and the user wanted
  // it to collapse. With passthrough buffering (assistant/system
  // standalones don't break the run), threshold=2 matches the
  // "tool batch" mental model from real agent-iteration sessions.
  expect(GROUP_THRESHOLD).toBe(2);
});

// ---------------------------------------------------------------------------
// classifyWarning — 4-bucket mapping (design.md §15.4)
// ---------------------------------------------------------------------------

test("classifyWarning: error/lexer → render-normally", () => {
  expect(classifyWarning(w("error", "lexer"))).toBe("render-normally");
});

test("classifyWarning: error/schema → render-normally", () => {
  expect(classifyWarning(w("error", "schema"))).toBe("render-normally");
});

test("classifyWarning: error/payload → render-normally", () => {
  expect(classifyWarning(w("error", "payload"))).toBe("render-normally");
});

test("classifyWarning: error/timestamp → render-normally", () => {
  expect(classifyWarning(w("error", "timestamp"))).toBe("render-normally");
});

test("classifyWarning: error/meta → render-normally", () => {
  expect(classifyWarning(w("error", "meta"))).toBe("render-normally");
});

test("classifyWarning: warning/schema → render-normally", () => {
  expect(classifyWarning(w("warning", "schema"))).toBe("render-normally");
});

test("classifyWarning: warning/payload → render-normally", () => {
  expect(classifyWarning(w("warning", "payload"))).toBe("render-normally");
});

test("classifyWarning: warning/lexer → collapse-by-default", () => {
  expect(classifyWarning(w("warning", "lexer"))).toBe("collapse-by-default");
});

test("classifyWarning: warning/timestamp → collapse-by-default", () => {
  expect(classifyWarning(w("warning", "timestamp"))).toBe(
    "collapse-by-default",
  );
});

test("classifyWarning: warning/meta → warning-only", () => {
  expect(classifyWarning(w("warning", "meta"))).toBe("warning-only");
});

test("classifyWarning: info/lexer → hide-with-inspect", () => {
  expect(classifyWarning(w("info", "lexer"))).toBe("hide-with-inspect");
});

test("classifyWarning: info/meta → hide-with-inspect", () => {
  expect(classifyWarning(w("info", "meta"))).toBe("hide-with-inspect");
});

// ---------------------------------------------------------------------------
// detectFailure — text-string heuristic (design.md §15.3)
// ---------------------------------------------------------------------------

test('detectFailure: tool_result with `"is_error":true` → true', () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: '{"is_error":true,"content":"oops"}',
      }),
    ),
  ).toBe(true);
});

test('detectFailure: tool_result with `"is_error": true` (spaced) → true', () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: '{ "is_error": true }',
      }),
    ),
  ).toBe(true);
});

test('detectFailure: tool_result with `"isError":true` (MCP) → true', () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: '{"isError":true}',
      }),
    ),
  ).toBe(true);
});

test("detectFailure: tool_result with exit_code: 1 → true", () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: "exit_code: 1\n3 tests failed",
      }),
    ),
  ).toBe(true);
});

test("detectFailure: tool_result with exit_code: 0 → false", () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: "exit_code: 0\nall good",
      }),
    ),
  ).toBe(false);
});

test('detectFailure: tool_result with `"success":false` → true', () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: '{"success":false,"error":"diff conflict"}',
      }),
    ),
  ).toBe(true);
});

test("detectFailure: tool_result with status: failed → true", () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: "status: failed\nreason: timeout",
      }),
    ),
  ).toBe(true);
});

test("detectFailure: tool_result with status: error → true", () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: "status: error",
      }),
    ),
  ).toBe(true);
});

test("detectFailure: plain successful tool_result → false", () => {
  expect(
    detectFailure(
      makeMessage({
        kind: "tool_result",
        text: "read 4.1 KB",
      }),
    ),
  ).toBe(false);
});

test("detectFailure: non-tool_result message → false", () => {
  expect(
    detectFailure(
      makeMessage({ kind: "assistant", text: 'is_error":true (in prose)' }),
    ),
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// renderHints — empty array
// ---------------------------------------------------------------------------

test("renderHints: empty messages → empty hints", () => {
  expect(renderHints([], [])).toEqual([]);
});

// ---------------------------------------------------------------------------
// renderHints — pairing
// ---------------------------------------------------------------------------

test("renderHints: adjacent tool_use + tool_result → one lifecycle hint, tool_result consumed", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "tool_use",
      toolName: "Read",
      text: "{}",
    }),
    makeMessage({
      messageIndex: 1,
      kind: "tool_result",
      toolName: "toolu_abc",
      text: "ok",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0]).toEqual({
    kind: "lifecycle",
    messageIndex: 0,
    pairWithIndex: 1,
  });
});

test("renderHints: orphan tool_use (end-of-stream) → lifecycle with pairWithIndex null", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "tool_use",
      toolName: "Bash",
      text: "{}",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0]).toEqual({
    kind: "lifecycle",
    messageIndex: 0,
    pairWithIndex: null,
  });
});

test("renderHints: orphan tool_use (next is assistant, not tool_result) → lifecycle null", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "tool_use",
      toolName: "Bash",
      text: "{}",
    }),
    makeMessage({
      messageIndex: 1,
      kind: "assistant",
      text: "I'll run that",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(2);
  expect(hints[0]).toEqual({
    kind: "lifecycle",
    messageIndex: 0,
    pairWithIndex: null,
  });
  expect(hints[1]).toMatchObject({
    kind: "standalone",
    messageIndex: 1,
  });
});

test("renderHints: orphan tool_result (no preceding tool_use) → standalone with stray-result chip", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "tool_result",
      toolName: "(unknown)",
      text: "stray body",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("standalone");
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.warnings).toBeDefined();
  expect(standalone.warnings).toHaveLength(1);
  expect(standalone.warnings![0]).toMatchObject({
    classification: "render-normally",
    severity: "warning",
    category: "payload",
  });
  expect(standalone.warnings![0].reason).toContain("stray tool_result");
});

test("renderHints: orphan tool_result preceded by non-matching kind → standalone with stray chip", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "assistant", text: "narrating" }),
    makeMessage({
      messageIndex: 1,
      kind: "tool_result",
      toolName: "(unknown)",
      text: "stray body",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(2);
  expect(hints[0]).toMatchObject({ kind: "standalone", messageIndex: 0 });
  expect(hints[1].kind).toBe("standalone");
  const stray = hints[1] as Extract<RenderHint, { kind: "standalone" }>;
  expect(stray.warnings![0].reason).toContain("stray tool_result");
});

test("renderHints: boundary between tool_use and tool_result blocks pairing", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "tool_use",
      toolName: "Bash",
      text: "{}",
    }),
    makeMessage({
      messageIndex: 1,
      kind: "boundary",
      boundarySubtype: "session_resumed",
    }),
    makeMessage({
      messageIndex: 2,
      kind: "tool_result",
      toolName: "toolu_xyz",
      text: "leftover",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(3);
  // tool_use becomes orphan lifecycle.
  expect(hints[0]).toEqual({
    kind: "lifecycle",
    messageIndex: 0,
    pairWithIndex: null,
  });
  // boundary unchanged.
  expect(hints[1]).toEqual({ kind: "boundary", messageIndex: 1 });
  // tool_result becomes orphan standalone with stray chip.
  expect(hints[2].kind).toBe("standalone");
  const stray = hints[2] as Extract<RenderHint, { kind: "standalone" }>;
  expect(stray.warnings![0].reason).toContain("stray tool_result");
});

// ---------------------------------------------------------------------------
// renderHints — warning attachment
// ---------------------------------------------------------------------------

test("renderHints: warning with messageIndex attaches to that hint", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "hi" }),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "schema", 0, "unknown role"),
  ];
  const hints = renderHints(messages, warnings);
  expect(hints).toHaveLength(1);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.warnings).toBeDefined();
  expect(standalone.warnings).toHaveLength(1);
  expect(standalone.warnings![0].classification).toBe("render-normally");
});

test("renderHints: warning WITHOUT messageIndex → no inline attachment (banner-only)", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "hi" }),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "schema", undefined, "session-level"),
  ];
  const hints = renderHints(messages, warnings);
  expect(hints).toHaveLength(1);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.warnings).toBeUndefined();
});

test("renderHints: out-of-range messageIndex on warning is ignored (no crash)", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "hi" }),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "schema", 999, "lost warning"),
    w("warning", "schema", -1, "negative index"),
  ];
  const hints = renderHints(messages, warnings);
  expect(hints).toHaveLength(1);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.warnings).toBeUndefined();
});

test("renderHints: warning-only severity/category → warning-only hint (no chip rendered)", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "assistant", text: "All looks good" }),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "meta", 0, "meta annotation"),
  ];
  const hints = renderHints(messages, warnings);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("warning-only");
  const wonly = hints[0] as Extract<RenderHint, { kind: "warning-only" }>;
  expect(wonly.warnings).toHaveLength(1);
  expect(wonly.warnings[0].classification).toBe("warning-only");
});

test("renderHints: render-normally bucket attaches as visible chip", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "hi" }),
  ];
  const hints = renderHints(messages, [w("error", "payload", 0, "fatal")]);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.warnings![0].classification).toBe("render-normally");
});

test("renderHints: collapse-by-default bucket attaches as classified chip", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "assistant", text: "hi" }),
  ];
  const hints = renderHints(messages, [w("warning", "lexer", 0)]);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.warnings![0].classification).toBe("collapse-by-default");
});

test("renderHints: hide-with-inspect bucket attaches as classified chip", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "assistant", text: "hi" }),
  ];
  const hints = renderHints(messages, [w("info", "meta", 0)]);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.warnings![0].classification).toBe("hide-with-inspect");
});

test("renderHints: tool_result warning attaches to the lifecycle hint when paired", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "tool_use",
      toolName: "Bash",
      text: "{}",
    }),
    makeMessage({
      messageIndex: 1,
      kind: "tool_result",
      toolName: "toolu_x",
      text: "boom",
    }),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "payload", 1, "weird result"),
  ];
  const hints = renderHints(messages, warnings);
  expect(hints).toHaveLength(1);
  const lifecycle = hints[0] as Extract<RenderHint, { kind: "lifecycle" }>;
  expect(lifecycle.warnings).toBeDefined();
  expect(lifecycle.warnings).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// renderHints — task-lifecycle stamping (design.md §6.5 + checklist #36)
// ---------------------------------------------------------------------------

test("renderHints: system text starting with `task_started · turn ` → standalone with taskLifecycle: started", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "system",
      text: "task_started · turn abc123",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.taskLifecycle).toBe("started");
});

test("renderHints: system text starting with `task_complete · turn ` → standalone with taskLifecycle: complete", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "system",
      text: "task_complete · turn xyz789",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.taskLifecycle).toBe("complete");
});

test("renderHints: system text with `(unknown turn)` fallback still stamps the lifecycle", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "system",
      text: "task_started · turn (unknown turn)",
    }),
  ];
  const hints = renderHints(messages, []);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.taskLifecycle).toBe("started");
});

test("renderHints: unrelated system text → standalone WITHOUT taskLifecycle", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "system",
      text: "Session metadata loaded",
    }),
  ];
  const hints = renderHints(messages, []);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.taskLifecycle).toBeUndefined();
});

test("task_started message with attached warning-only warning still renders task-lifecycle", () => {
  // Precedence regression guard: a `task_started · turn ...` system
  // message whose index also carries a `warning/meta` warning (which
  // classifies to the `warning-only` bucket) must STILL emit a
  // `standalone` RenderHint with `taskLifecycle: "started"`. The
  // chapter marker is non-suppressible by attached warnings — the
  // warning rides along on `hint.warnings` so the session banner
  // stays loud (Resolved Decision #6) without the renderer losing
  // the chapter marker. Theoretical today (parser does not currently
  // attach warning/meta to task_started/task_complete system rows)
  // but the precedence is right-by-default after the fix.
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "system",
      text: "task_started · turn abc",
    }),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "meta", 0, "meta annotation"),
  ];
  const hints = renderHints(messages, warnings);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("standalone");
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.taskLifecycle).toBe("started");
  // The warning rides along so the banner-only surface still has it.
  expect(standalone.warnings).toBeDefined();
  expect(standalone.warnings).toHaveLength(1);
  expect(standalone.warnings![0].classification).toBe("warning-only");
  // And critically the message is NOT routed to the warning-only hint.
  expect(hints.some((h) => h.kind === "warning-only")).toBe(false);
});

test("task_complete message with attached warning-only warning still renders task-lifecycle", () => {
  // Same precedence guard for the `complete` half of the chapter
  // marker pair.
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "system",
      text: "task_complete · turn xyz",
    }),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "meta", 0, "meta annotation"),
  ];
  const hints = renderHints(messages, warnings);
  expect(hints).toHaveLength(1);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.taskLifecycle).toBe("complete");
  expect(hints.some((h) => h.kind === "warning-only")).toBe(false);
});

test("renderHints: system text starting with task_started but no space after → NO stamp", () => {
  // Defensive: prefix detection must use the exact ` · turn ` separator.
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "system",
      text: "task_started_other",
    }),
  ];
  const hints = renderHints(messages, []);
  const standalone = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(standalone.taskLifecycle).toBeUndefined();
});

// ---------------------------------------------------------------------------
// renderHints — mixed-stream sanity
// ---------------------------------------------------------------------------

test("renderHints: mixed stream emits the right hint per message in order", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "hi" }),
    makeMessage({ messageIndex: 1, kind: "assistant", text: "hello" }),
    makeMessage({
      messageIndex: 2,
      kind: "tool_use",
      toolName: "Read",
      text: "{}",
    }),
    makeMessage({
      messageIndex: 3,
      kind: "tool_result",
      toolName: "toolu_x",
      text: "ok",
    }),
    makeMessage({
      messageIndex: 4,
      kind: "boundary",
      boundarySubtype: "session_resumed",
    }),
    makeMessage({
      messageIndex: 5,
      kind: "system",
      text: "task_complete · turn t1",
    }),
  ];
  const hints = renderHints(messages, []);
  // tool_use+tool_result collapses to one lifecycle, so:
  //   user / assistant / lifecycle / boundary / task-lifecycle-system
  expect(hints).toHaveLength(5);
  expect(hints[0]).toMatchObject({ kind: "standalone", messageIndex: 0 });
  expect(hints[1]).toMatchObject({ kind: "standalone", messageIndex: 1 });
  expect(hints[2]).toMatchObject({
    kind: "lifecycle",
    messageIndex: 2,
    pairWithIndex: 3,
  });
  expect(hints[3]).toMatchObject({ kind: "boundary", messageIndex: 4 });
  expect(hints[4]).toMatchObject({
    kind: "standalone",
    messageIndex: 5,
    taskLifecycle: "complete",
  });
});

// ---------------------------------------------------------------------------
// renderHints — InlineWarning type (smoke test that the shape exports)
// ---------------------------------------------------------------------------

test("InlineWarning type carries all four classification arms", () => {
  const buckets: Array<InlineWarning["classification"]> = [
    "render-normally",
    "collapse-by-default",
    "hide-with-inspect",
    "warning-only",
  ];
  expect(buckets).toHaveLength(4);
});

// ---------------------------------------------------------------------------
// renderHints — M3 same-tool grouping (design.md §15.2 + §4)
// ---------------------------------------------------------------------------

/** Helper: build a pair of tool_use + tool_result messages at the
 * given starting index, both naming `tool`. Result text drives the
 * failure detection (default success). */
function pair(
  start: number,
  tool: string,
  resultText: string = "ok",
): Message[] {
  return [
    makeMessage({
      messageIndex: start,
      kind: "tool_use",
      toolName: tool,
      text: "{}",
    }),
    makeMessage({
      messageIndex: start + 1,
      kind: "tool_result",
      toolName: tool,
      text: resultText,
    }),
  ];
}

/** Helper: lone tool_use (orphan lifecycle). */
function orphanUse(index: number, tool: string): Message {
  return makeMessage({
    messageIndex: index,
    kind: "tool_use",
    toolName: tool,
    text: "{}",
  });
}

test("group below threshold (1 lifecycle) → 1 standalone lifecycle hint, no group head", () => {
  // Post-polish-r2: threshold = 2. A single lifecycle stays as a
  // standalone lifecycle card; 2+ collapse into a group.
  const messages: Message[] = [...pair(0, "Read")];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("lifecycle");
});

test("group AT new threshold (2 same-tool lifecycles, no passthrough) → 1 group-head + 2 group-member", () => {
  // Post-polish-r2: with threshold = 2, even 2 consecutive lifecycles
  // group. This matches the user-reported scenario of 2 Edit calls
  // in a single Claude Code turn (which produces 2 consecutive
  // lifecycles after the parser collapses content[].text + tool_use
  // and the assistant-text passthrough buffering kicks in).
  const messages: Message[] = [...pair(0, "Read"), ...pair(2, "Read")];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(3);
  expect(hints[0].kind).toBe("group-head");
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.toolName).toBe("Read");
  expect(head.toolNames).toEqual(["Read"]);
  expect(head.messageIndices).toEqual([0, 2]);
  expect(hints[1].kind).toBe("group-member");
  expect(hints[2].kind).toBe("group-member");
});

test("group at threshold (3 same-tool lifecycles) → 1 group-head + 3 group-member", () => {
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    ...pair(4, "Read"),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(4);
  expect(hints[0].kind).toBe("group-head");
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.toolName).toBe("Read");
  expect(head.messageIndices).toEqual([0, 2, 4]);
  expect(head.aggregateStatus).toEqual({ kind: "all-success", total: 3 });
  expect(hints[1].kind).toBe("group-member");
  expect(hints[2].kind).toBe("group-member");
  expect(hints[3].kind).toBe("group-member");
  const m0 = hints[1] as Extract<RenderHint, { kind: "group-member" }>;
  expect(m0.messageIndex).toBe(0);
  expect(m0.pairWithIndex).toBe(1);
  expect(m0.groupHeadIndex).toBe(0);
});

test("group above threshold (5 same-tool lifecycles) → 1 group-head + 5 group-member", () => {
  const messages: Message[] = [
    ...pair(0, "Bash"),
    ...pair(2, "Bash"),
    ...pair(4, "Bash"),
    ...pair(6, "Bash"),
    ...pair(8, "Bash"),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(6);
  expect(hints[0].kind).toBe("group-head");
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.toolName).toBe("Bash");
  expect(head.messageIndices).toHaveLength(5);
  for (let i = 1; i < 6; i++) {
    expect(hints[i].kind).toBe("group-member");
  }
});

test("group reset by boundary: 3 toolA, boundary, 3 toolA → 2 separate groups", () => {
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    ...pair(4, "Read"),
    makeMessage({
      messageIndex: 6,
      kind: "boundary",
      boundarySubtype: "session_resumed",
    }),
    ...pair(7, "Read"),
    ...pair(9, "Read"),
    ...pair(11, "Read"),
  ];
  const hints = renderHints(messages, []);
  // Expect: group-head + 3 member + boundary + group-head + 3 member
  expect(hints).toHaveLength(9);
  expect(hints[0].kind).toBe("group-head");
  expect(hints[4].kind).toBe("boundary");
  expect(hints[5].kind).toBe("group-head");
  const head1 = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  const head2 = hints[5] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head1.messageIndices).toEqual([0, 2, 4]);
  expect(head2.messageIndices).toEqual([7, 9, 11]);
});

test("mixed-tool grouping (post-7c polish): 3 Read + 1 Bash → 1 group of 4 with toolNames=['Read','Bash']", () => {
  // Post-Phase-7c polish: grouping no longer requires the same tool
  // name. 4 consecutive lifecycles of any tool mix collapse into one
  // group when count >= GROUP_THRESHOLD.
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    ...pair(4, "Read"),
    ...pair(6, "Bash"),
  ];
  const hints = renderHints(messages, []);
  // group-head + 4 members
  expect(hints).toHaveLength(5);
  expect(hints[0].kind).toBe("group-head");
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.toolName).toBe("Read");
  expect(head.toolNames).toEqual(["Read", "Bash"]);
  expect(head.messageIndices).toEqual([0, 2, 4, 6]);
  // Members come right after the head.
  for (let i = 1; i <= 4; i++) {
    expect(hints[i].kind).toBe("group-member");
  }
});

test("aggregate status all-success when 3 paired lifecycles all succeed", () => {
  const messages: Message[] = [
    ...pair(0, "Read", "ok"),
    ...pair(2, "Read", "fine"),
    ...pair(4, "Read", "done"),
  ];
  const hints = renderHints(messages, []);
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.aggregateStatus).toEqual({ kind: "all-success", total: 3 });
});

test("aggregate status mixed when 1 of 3 fails (per detectFailure)", () => {
  const messages: Message[] = [
    ...pair(0, "Read", "ok"),
    ...pair(2, "Read", "exit_code: 1\nfailed"),
    ...pair(4, "Read", "ok"),
  ];
  const hints = renderHints(messages, []);
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.aggregateStatus).toEqual({ kind: "mixed", total: 3, failed: 1 });
});

test("aggregate status all-failed when all 3 fail", () => {
  const messages: Message[] = [
    ...pair(0, "Read", "exit_code: 1"),
    ...pair(2, "Read", '{"is_error":true}'),
    ...pair(4, "Read", "status: error"),
  ];
  const hints = renderHints(messages, []);
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.aggregateStatus).toEqual({ kind: "all-failed", total: 3 });
});

test("aggregate status in-flight when at least 1 of 3 is orphan", () => {
  // Two pairs + one orphan use. All sharing toolName 'Read', all
  // consecutive. The third lifecycle has pairWithIndex=null.
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    orphanUse(4, "Read"),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(4);
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.aggregateStatus).toEqual({
    kind: "in-flight",
    total: 3,
    pending: 1,
  });
});

test("group-member carries groupHeadIndex pointer correctly", () => {
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    ...pair(4, "Read"),
  ];
  const hints = renderHints(messages, []);
  for (let i = 1; i < 4; i++) {
    const m = hints[i] as Extract<RenderHint, { kind: "group-member" }>;
    expect(m.groupHeadIndex).toBe(0);
  }
});

test("group-member preserves warnings attached to the underlying lifecycle", () => {
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    ...pair(4, "Read"),
  ];
  // Warning attached to the second tool_use's lifecycle (its merge
  // collects warnings from the tool_result half too, but here we
  // attach to the use half).
  const warnings: ParseWarning[] = [w("error", "payload", 2, "bad input")];
  const hints = renderHints(messages, warnings);
  const member1 = hints[2] as Extract<RenderHint, { kind: "group-member" }>;
  expect(member1.messageIndex).toBe(2);
  expect(member1.warnings).toBeDefined();
  expect(member1.warnings).toHaveLength(1);
  expect(member1.warnings![0].classification).toBe("render-normally");
});

test("mixed run split by a user-text delimiter → 2 separate groups, one on each side", () => {
  // Post-polish-r2: user messages remain delimiters (a new turn
  // resets the tool batch). 2 lifecycles + user + 2 lifecycles
  // produces TWO groups (threshold=2), separated by the user.
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    makeMessage({ messageIndex: 4, kind: "user", text: "interrupt" }),
    ...pair(5, "Read"),
    ...pair(7, "Read"),
  ];
  const hints = renderHints(messages, []);
  const heads = hints.filter((h) => h.kind === "group-head");
  expect(heads).toHaveLength(2);
  // The user standalone sits BETWEEN the two groups, not inside either.
  const userIndex = hints.findIndex((h) => h.kind === "standalone");
  expect(userIndex).toBeGreaterThan(0);
  const headA = heads[0] as Extract<RenderHint, { kind: "group-head" }>;
  const headB = heads[1] as Extract<RenderHint, { kind: "group-head" }>;
  expect(headA.messageIndices).toEqual([0, 2]);
  expect(headB.messageIndices).toEqual([5, 7]);
});

test("single-element stream continues to work post-grouping", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "alone" }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("standalone");
});

test("a single lifecycle (no neighbors) stays as a lifecycle hint, NOT a group", () => {
  // Post-polish-r2: threshold=2 means 1 lifecycle stays solo.
  // 2+ lifecycles in a tool batch will group.
  const messages: Message[] = [...pair(0, "Read")];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("lifecycle");
});

test("mixed-tool grouping (post-7c polish): 3 Read + 3 Bash consecutive → 1 group of 6 with toolNames=['Read','Bash']", () => {
  // Post-Phase-7c polish: the original M3 same-tool grouping required
  // tool-name match. That fragmented real sessions (alternating tools
  // stayed un-grouped). The polish collapses any run of consecutive
  // lifecycles, with `toolNames` carrying the distinct-list in
  // first-appearance order.
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    ...pair(4, "Read"),
    ...pair(6, "Bash"),
    ...pair(8, "Bash"),
    ...pair(10, "Bash"),
  ];
  const hints = renderHints(messages, []);
  // Expect: 1 group-head + 6 group-member.
  expect(hints).toHaveLength(7);
  expect(hints[0].kind).toBe("group-head");
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.toolName).toBe("Read");
  expect(head.toolNames).toEqual(["Read", "Bash"]);
  expect(head.messageIndices).toEqual([0, 2, 4, 6, 8, 10]);
  // All six members point back to the canonical head index = 0.
  for (let i = 1; i < 7; i++) {
    expect(hints[i].kind).toBe("group-member");
    const m = hints[i] as Extract<RenderHint, { kind: "group-member" }>;
    expect(m.groupHeadIndex).toBe(0);
  }
});

test("mixed-tool grouping: toolNames preserves first-appearance order across 3 distinct tools", () => {
  const messages: Message[] = [
    ...pair(0, "Edit"),
    ...pair(2, "Bash"),
    ...pair(4, "Read"),
    ...pair(6, "Edit"),
  ];
  const hints = renderHints(messages, []);
  const head = hints[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.toolNames).toEqual(["Edit", "Bash", "Read"]);
});

test("two Edits across a boundary stay ungrouped (1 lifecycle on each side; sub-threshold)", () => {
  // Boundaries (chapter breaks) remain delimiters. 1 Edit + boundary
  // + 1 Edit → 2 separate lifecycle hints flanking the boundary;
  // neither side reaches threshold=2.
  const messages: Message[] = [
    ...pair(0, "Edit"),
    makeMessage({
      messageIndex: 2,
      kind: "boundary",
      boundarySubtype: "compacted",
    }),
    ...pair(3, "Edit"),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(3);
  expect(hints[0].kind).toBe("lifecycle");
  expect(hints[1].kind).toBe("boundary");
  expect(hints[2].kind).toBe("lifecycle");
});

test("the user's reported scenario: 2 Edits with assistant text between them → 1 group of 2 (Edit, Edit)", () => {
  // This is the exact real-session shape from the user report.
  // Claude Code emits assistant.content[].text + tool_use as SEPARATE
  // Messages, so a turn with "I'll edit X" + Edit-1 + "Now edit Y" +
  // Edit-2 produces a stream where assistant-text messages sit
  // between the lifecycle pairs. Pre-polish-r2 the assistant text
  // broke the run; post-polish-r2 it's pulled into the group via
  // passthrough buffering.
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "Please edit X and Y" }),
    makeMessage({
      messageIndex: 1,
      kind: "assistant",
      text: "I'll edit X first.",
    }),
    ...pair(2, "Edit"), // messageIndex 2 (use), 3 (result)
    makeMessage({
      messageIndex: 4,
      kind: "assistant",
      text: "Now editing Y.",
    }),
    ...pair(5, "Edit"), // 5 (use), 6 (result)
    makeMessage({ messageIndex: 7, kind: "assistant", text: "Done." }),
  ];
  const hints = renderHints(messages, []);
  // Expected stream: standalone(user), group-head, group-text-member
  // (leading assistant), group-member (Edit-1), group-text-member
  // (middle assistant), group-member (Edit-2), group-text-member
  // (trailing assistant). 7 entries total.
  const heads = hints.filter((h) => h.kind === "group-head");
  expect(heads).toHaveLength(1);
  const head = heads[0] as Extract<RenderHint, { kind: "group-head" }>;
  // Count badge = number of LIFECYCLE members (2), not total members.
  expect(head.messageIndices).toEqual([2, 5]);
  expect(head.toolNames).toEqual(["Edit"]);
  // Lifecycle members:
  const lifecycleMembers = hints.filter((h) => h.kind === "group-member");
  expect(lifecycleMembers).toHaveLength(2);
  // Text members carrying the agent's commentary:
  const textMembers = hints.filter((h) => h.kind === "group-text-member");
  expect(textMembers).toHaveLength(3); // leading + middle + trailing
  // User stays as a standalone delimiter BEFORE the group, NOT inside.
  expect(hints[0].kind).toBe("standalone");
  expect(hints[1].kind).toBe("group-head");
});

test("two boundaries between identical-tool lifecycles produce two ungrouped lifecycles around the chapter break", () => {
  // 1 toolA, boundary, 1 toolA → not enough on either side to group.
  const messages: Message[] = [
    ...pair(0, "Read"),
    makeMessage({
      messageIndex: 2,
      kind: "boundary",
      boundarySubtype: "compacted",
    }),
    ...pair(3, "Read"),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(3);
  expect(hints[0].kind).toBe("lifecycle");
  expect(hints[1].kind).toBe("boundary");
  expect(hints[2].kind).toBe("lifecycle");
});

// ---------------------------------------------------------------------------
// Empty-body user/assistant suppression (post-Phase-7c polish)
// ---------------------------------------------------------------------------

test("empty-body assistant message (no warnings) → no hint emitted", () => {
  // The Codex parser emits an empty-text assistant row when the
  // source `event_msg.agent_message` payload is missing `message`.
  // The matching warning has NO messageIndex (banner-only); when no
  // attached inline warning exists, the renderer suppresses the row
  // entirely.
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "ask" }),
    makeMessage({ messageIndex: 1, kind: "assistant", text: "" }),
  ];
  const hints = renderHints(messages, []);
  // Only the user message renders; the empty assistant is dropped.
  expect(hints).toHaveLength(1);
  const first = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(first.kind).toBe("standalone");
  expect(first.messageIndex).toBe(0);
});

test("empty-body assistant message (whitespace-only) → no hint emitted", () => {
  // Whitespace-only text counts as empty (text.trim() === "").
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "assistant", text: "   \n\t  " }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(0);
});

test("empty-body user message (no warnings) → no hint emitted", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "user", text: "" }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(0);
});

test("empty-body assistant message WITH attached warning → warning-only hint (no card; banner stays)", () => {
  // If a parser path ever attaches an inline-routable warning to an
  // empty-body row, the renderer routes it as `warning-only` so the
  // chip surface is empty (no inline chip on a non-existent card)
  // and the session banner still carries the warning.
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "assistant", text: "" }),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "payload", 0, "agent_message missing message"),
  ];
  const hints = renderHints(messages, warnings);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("warning-only");
  const wo = hints[0] as Extract<RenderHint, { kind: "warning-only" }>;
  expect(wo.messageIndex).toBe(0);
  expect(wo.warnings).toHaveLength(1);
  expect(wo.warnings[0].reason).toBe("agent_message missing message");
});

test("non-empty assistant message still renders as standalone (suppression is targeted)", () => {
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "assistant", text: "hello" }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("standalone");
});

test("empty-body system message is NOT suppressed (suppression scope is user/assistant only)", () => {
  // System messages have their own "system ·" glyph; an empty
  // body is unusual but doesn't manifest the same visual-noise
  // problem as Assistant cards.
  const messages: Message[] = [
    makeMessage({ messageIndex: 0, kind: "system", text: "" }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("standalone");
});

// ---------------------------------------------------------------------------
// Delimiter coverage for polish-r2 passthrough grouping
// ---------------------------------------------------------------------------
//
// The polish-r2 `groupLifecycles` pass treats certain hint kinds as
// PASSTHROUGH (assistant/system standalones without taskLifecycle stamps,
// non-empty bodies) and others as DELIMITERS (everything else, which
// flushes the run). The QA coverage review (round 1) flagged four
// delimiter branches with no test coverage. These tests close the gap.
//
// Each test sets up a "tool batch on each side of a delimiter" shape and
// asserts the algorithm produces TWO separate groups (one before, one
// after the delimiter) — i.e. the delimiter does NOT get pulled into a
// single coalesced group.

test("delimiter: system standalone (e.g. Codex event_msg.error) BETWEEN lifecycles flushes the run → 2 separate groups", () => {
  // Codex external review (round 2) caught this: an earlier draft
  // of `isPassthroughStandalone` allowed `system` standalones into
  // tool-batch groups, which would have hidden Codex error rows
  // (`event_msg.error` → `kind:"system"` per codex.ts:681) inside
  // collapsed groups. Errors must stay top-level. The
  // `isPassthroughStandalone` predicate now restricts passthrough
  // to `assistant` only — system kind is a delimiter.
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    // Stand-in for a Codex event_msg.error: kind=system, plain text,
    // no taskLifecycle stamp, no attached warning.
    makeMessage({
      messageIndex: 4,
      kind: "system",
      text: "rate limited — retrying",
    }),
    ...pair(5, "Read"),
    ...pair(7, "Read"),
  ];
  const hints = renderHints(messages, []);
  const heads = hints.filter((h) => h.kind === "group-head");
  expect(heads).toHaveLength(2);
  // The system error standalone surfaces at top level, NOT inside
  // any group's expanded body.
  expect(hints.filter((h) => h.kind === "group-text-member")).toHaveLength(0);
  const standalones = hints.filter((h) => h.kind === "standalone");
  expect(standalones).toHaveLength(1);
  const sysHint = standalones[0] as Extract<
    RenderHint,
    { kind: "standalone" }
  >;
  expect(sysHint.messageIndex).toBe(4);
  // Verify the underlying message is still a system kind (the
  // delimiter test isn't accidentally re-classifying the message).
  expect(sysHint.taskLifecycle).toBeUndefined();
});

test("delimiter: orphan tool_result (stray) BETWEEN lifecycles flushes the run → 2 separate groups", () => {
  // `isPassthroughStandalone` excludes underlying msg.kind === "tool_result"
  // so the orphan stray-result hint is a delimiter. The user must see
  // the stray-result chip at top level; it must NOT be absorbed into a
  // group's expanded body.
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    // Orphan tool_result at index 4 — no preceding tool_use.
    makeMessage({
      messageIndex: 4,
      kind: "tool_result",
      toolName: "Read",
      text: "stray result body",
    }),
    ...pair(5, "Read"),
    ...pair(7, "Read"),
  ];
  const hints = renderHints(messages, []);
  const heads = hints.filter((h) => h.kind === "group-head");
  expect(heads).toHaveLength(2);
  // The orphan's standalone hint sits between the two groups at top
  // level — verify it's NOT inside any group as a text-member.
  const textMembers = hints.filter((h) => h.kind === "group-text-member");
  expect(textMembers).toHaveLength(0);
  // The stray standalone carries the stray-result chip.
  const standalones = hints.filter((h) => h.kind === "standalone");
  expect(standalones).toHaveLength(1);
  const stray = standalones[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(stray.messageIndex).toBe(4);
  expect(stray.warnings?.some((w) => w.reason.includes("stray"))).toBe(true);
});

test("delimiter: warning-only hint BETWEEN lifecycles flushes the run → 2 separate groups", () => {
  // A `warning-only` hint emerges when EVERY attached warning on a
  // user/assistant/system message classifies as `warning-only`
  // (severity=warning + category=meta). `groupLifecycles` must flush
  // the run on `warning-only` so the structural intent (warning is
  // banner-only) survives — pulling it silently into a group's body
  // would render NOTHING for the warning row, hiding the parser
  // anomaly that produced it.
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    makeMessage({
      messageIndex: 4,
      kind: "assistant",
      text: "thinking aloud",
    }),
    ...pair(5, "Read"),
    ...pair(7, "Read"),
  ];
  const warnings: ParseWarning[] = [
    w("warning", "meta", 4, "meta-only annotation"),
  ];
  const hints = renderHints(messages, warnings);
  const heads = hints.filter((h) => h.kind === "group-head");
  expect(heads).toHaveLength(2);
  // The warning-only hint sits between the two groups at top level.
  const warningOnly = hints.filter((h) => h.kind === "warning-only");
  expect(warningOnly).toHaveLength(1);
  // No text members — the warning-only hint did NOT get absorbed.
  expect(hints.filter((h) => h.kind === "group-text-member")).toHaveLength(0);
});

test("delimiter: task-lifecycle (task_complete) standalone BETWEEN lifecycles flushes the run → 2 separate groups", () => {
  // `task_started · turn X` / `task_complete · turn X` system
  // messages are chapter markers. They must NOT be absorbed into a
  // group as plain text members, even though their underlying
  // msg.kind is `system`. The `isPassthroughStandalone` predicate
  // checks `hint.taskLifecycle` first and excludes such hints.
  const messages: Message[] = [
    ...pair(0, "Read"),
    ...pair(2, "Read"),
    makeMessage({
      messageIndex: 4,
      kind: "system",
      text: "task_complete · turn t1",
    }),
    ...pair(5, "Read"),
    ...pair(7, "Read"),
  ];
  const hints = renderHints(messages, []);
  const heads = hints.filter((h) => h.kind === "group-head");
  expect(heads).toHaveLength(2);
  // The task-lifecycle standalone surfaces at top level with the
  // taskLifecycle stamp set.
  const standalones = hints.filter((h) => h.kind === "standalone");
  expect(standalones).toHaveLength(1);
  const taskHint = standalones[0] as Extract<
    RenderHint,
    { kind: "standalone" }
  >;
  expect(taskHint.taskLifecycle).toBe("complete");
  // No text members — task-lifecycle did NOT get absorbed.
  expect(hints.filter((h) => h.kind === "group-text-member")).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Parser-driven integration test (post-polish-r2)
// ---------------------------------------------------------------------------
//
// This test was added after a user reported that the unit tests passed
// but the visible bug (2 Edits not grouping) persisted in a real
// session. Root cause: the synthetic `pair(0,...)` + `pair(2,...)` test
// helpers placed lifecycle pairs back-to-back with NO intervening
// messages. Real Claude Code sessions emit assistant.content[].text
// + tool_use as SEPARATE Messages, so a turn with two Edit calls has
// an assistant-text Message between each pair.
//
// The fixture `tests/fixtures/render-hints/claude_code/two-edits-
// with-assistant-text.jsonl` mirrors the real-session shape exactly
// (6 JSONL lines). This integration test parses it through
// `dispatchParser` (the real pipeline used by the production
// `useParsedSession` hook) and then feeds the output to
// `renderHints`. Asserting on the resulting hint shape catches the
// real-world regression even when the unit-test invariants are happy.
//
// Lesson: pure-function tests over synthetic data prove the algorithm
// is correct; fixture-driven tests prove the algorithm matches what
// the parser actually emits. Both are necessary.

test("integration: real Claude Code turn (user + assistant + 2 Edits with text between) collapses to one group", async () => {
  const raw = await Bun.file(
    join(FIXTURE_ROOT, "claude_code", "two-edits-with-assistant-text.jsonl"),
  ).text();
  const parsed = dispatchParser("claude_code", raw, {
    totalBytes: new TextEncoder().encode(raw).byteLength,
    truncated: false,
  });

  // Sanity: parser emitted the expected typed-message stream.
  // Order: user, assistant(text), tool_use(Edit-1), tool_result,
  // assistant(text), tool_use(Edit-2), tool_result, assistant(text).
  expect(parsed.messages.length).toBe(8);
  expect(parsed.messages[0].kind).toBe("user");
  expect(parsed.messages[1].kind).toBe("assistant");
  expect(parsed.messages[2].kind).toBe("tool_use");
  expect((parsed.messages[2] as Message).toolName).toBe("Edit");
  expect(parsed.messages[3].kind).toBe("tool_result");
  expect(parsed.messages[4].kind).toBe("assistant");
  expect(parsed.messages[5].kind).toBe("tool_use");
  expect((parsed.messages[5] as Message).toolName).toBe("Edit");
  expect(parsed.messages[6].kind).toBe("tool_result");
  expect(parsed.messages[7].kind).toBe("assistant");

  // The render-hint output must collapse the tool batch into ONE
  // group containing both Edit lifecycles + the interleaved assistant
  // commentary.
  const hints = renderHints(parsed.messages, parsed.warnings);
  const heads = hints.filter((h) => h.kind === "group-head");
  expect(heads).toHaveLength(1);
  const head = heads[0] as Extract<RenderHint, { kind: "group-head" }>;
  expect(head.toolNames).toEqual(["Edit"]); // distinct tool names
  expect(head.messageIndices).toHaveLength(2); // 2 calls
  expect(head.aggregateStatus.kind).toBe("all-success");

  // The leading user message stays as a standalone delimiter BEFORE
  // the group (user-kind is not passthrough).
  expect(hints[0].kind).toBe("standalone");
  const first = hints[0] as Extract<RenderHint, { kind: "standalone" }>;
  expect(first.messageIndex).toBe(0);
  expect(hints[1].kind).toBe("group-head");

  // Inside the group: 3 text members (the 3 assistant texts) +
  // 2 lifecycle members (the 2 Edits).
  const groupMembers = hints.filter((h) => h.kind === "group-member");
  const groupTextMembers = hints.filter(
    (h) => h.kind === "group-text-member",
  );
  expect(groupMembers).toHaveLength(2);
  expect(groupTextMembers).toHaveLength(3);

  // Top-level renderable rows (everything that's NOT a group-member or
  // group-text-member): user + group-head = 2.
  const topLevel = hints.filter(
    (h) =>
      h.kind !== "group-member" &&
      h.kind !== "group-text-member",
  );
  expect(topLevel).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// Phase 7d — metadata hint emission + clustering
// ---------------------------------------------------------------------------

test("METADATA_COLLAPSE_THRESHOLD is locked at 2 per Phase 7d design round-2", () => {
  expect(METADATA_COLLAPSE_THRESHOLD).toBe(2);
});

test("renderHints: single metadata Message → singleton metadata hint", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "metadata",
      metaCategory: "control",
      text: "permission mode → default",
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  expect(hints[0].kind).toBe("metadata");
  if (hints[0].kind === "metadata") {
    expect(hints[0].metadata.category).toBe("control");
    expect(hints[0].metadata.display).toBe("permission mode → default");
    expect(hints[0].metadata.ariaLabel).toBe(
      "Metadata: permission mode → default",
    );
  }
});

test("renderHints: echo metadata Message carries echoOf payload", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "metadata",
      metaCategory: "echo",
      text: "",
      echoOf: { lineOrdinal: 7, canonicalKind: "user" },
    }),
  ];
  const hints = renderHints(messages, []);
  expect(hints).toHaveLength(1);
  if (hints[0].kind !== "metadata") throw new Error("expected metadata hint");
  expect(hints[0].metadata.category).toBe("echo");
  expect(hints[0].metadata.display).toBe("");
  expect(hints[0].metadata.echoOf).toEqual({
    lineOrdinal: 7,
    canonicalKind: "user",
  });
  expect(hints[0].metadata.ariaLabel).toBe(
    "Echo: duplicate of canonical user message at line 7",
  );
});

test("renderHints: 2 adjacent metadata Messages → cluster head + 2 members (threshold = 2)", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "metadata",
      metaCategory: "control",
      text: "permission mode → default",
    }),
    makeMessage({
      messageIndex: 1,
      kind: "metadata",
      metaCategory: "prompt",
      text: "last prompt: “do it”",
    }),
  ];
  const hints = renderHints(messages, []);
  // 1 head + 2 members.
  expect(hints).toHaveLength(3);
  expect(hints[0].kind).toBe("metadata-cluster-head");
  expect(hints[1].kind).toBe("metadata-cluster-member");
  expect(hints[2].kind).toBe("metadata-cluster-member");
  if (hints[0].kind === "metadata-cluster-head") {
    expect(hints[0].messageIndices).toEqual([0, 1]);
    expect(hints[0].members).toHaveLength(2);
    expect(hints[0].members[0].category).toBe("control");
    expect(hints[0].members[1].category).toBe("prompt");
  }
  if (hints[1].kind === "metadata-cluster-member") {
    expect(hints[1].clusterHeadIndex).toBe(0);
  }
});

test("renderHints: 1 metadata + non-metadata + 1 metadata → 2 singletons (no cluster)", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "metadata",
      metaCategory: "control",
      text: "permission mode → default",
    }),
    makeMessage({
      messageIndex: 1,
      kind: "user",
      text: "hi",
    }),
    makeMessage({
      messageIndex: 2,
      kind: "metadata",
      metaCategory: "title",
      text: "auto title: “x”",
    }),
  ];
  const hints = renderHints(messages, []);
  // user message breaks the run; each metadata stays as its own
  // singleton hint.
  expect(hints).toHaveLength(3);
  expect(hints.map((h) => h.kind)).toEqual([
    "metadata",
    "standalone",
    "metadata",
  ]);
});

test("renderHints: mixed cluster (control + echo) collapses together", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "metadata",
      metaCategory: "control",
      text: "permission mode → default",
    }),
    makeMessage({
      messageIndex: 1,
      kind: "metadata",
      metaCategory: "echo",
      text: "",
      echoOf: { lineOrdinal: 1, canonicalKind: "user" },
    }),
    makeMessage({
      messageIndex: 2,
      kind: "metadata",
      metaCategory: "telemetry",
      text: "tokens: 10↓ 5↑",
    }),
  ];
  const hints = renderHints(messages, []);
  // 1 head + 3 members.
  expect(hints).toHaveLength(4);
  expect(hints[0].kind).toBe("metadata-cluster-head");
  if (hints[0].kind === "metadata-cluster-head") {
    expect(hints[0].members.map((m) => m.category)).toEqual([
      "control",
      "echo",
      "telemetry",
    ]);
  }
});

test("renderHints: metadata hint flushes tool-batch buffer (delimiter)", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "tool_use",
      toolName: "Edit",
      text: "{}",
    }),
    makeMessage({
      messageIndex: 1,
      kind: "tool_result",
      toolName: "Edit",
      text: "ok",
    }),
    makeMessage({
      messageIndex: 2,
      kind: "tool_use",
      toolName: "Edit",
      text: "{}",
    }),
    makeMessage({
      messageIndex: 3,
      kind: "tool_result",
      toolName: "Edit",
      text: "ok",
    }),
    // Metadata at midpoint — flushes the lifecycle buffer.
    makeMessage({
      messageIndex: 4,
      kind: "metadata",
      metaCategory: "control",
      text: "permission mode → bypassPermissions",
    }),
    makeMessage({
      messageIndex: 5,
      kind: "tool_use",
      toolName: "Edit",
      text: "{}",
    }),
    makeMessage({
      messageIndex: 6,
      kind: "tool_result",
      toolName: "Edit",
      text: "ok",
    }),
  ];
  const hints = renderHints(messages, []);
  // Expected at top level: 1 group-head (the FIRST batch, 2 tool calls)
  // + 1 metadata + then NEW grouping of the second batch (only 1 tool
  // call so it stays a lone lifecycle below threshold).
  const topLevel = hints.filter(
    (h) =>
      h.kind !== "group-member" &&
      h.kind !== "group-text-member" &&
      h.kind !== "metadata-cluster-member",
  );
  expect(topLevel.map((h) => h.kind)).toEqual([
    "group-head",
    "metadata",
    "lifecycle",
  ]);
});

// ---------------------------------------------------------------------------
// Phase 7d — parser-driven integration: real fixture exercises metadata route
// ---------------------------------------------------------------------------

test("renderHints integration: synthetic Claude Code session with a permission-mode mid-stream emits metadata + flushes the surrounding turn", () => {
  // Build a 4-line synthetic Claude Code session with a permission-mode
  // event sandwiched between an assistant message and a user message.
  // The parser produces 1 assistant + 1 metadata + 1 user; renderHints
  // produces 3 standalones (the metadata sits between the canonical
  // rows).
  const raw = [
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Working on it." }],
      },
    }),
    JSON.stringify({ type: "permission-mode", permissionMode: "default" }),
    JSON.stringify({
      type: "user",
      message: { role: "user", content: "follow-up" },
    }),
  ].join("\n");
  const parsed = dispatchParser("claude_code", raw, {
    totalBytes: new TextEncoder().encode(raw).byteLength,
    truncated: false,
  });
  expect(parsed.messages.map((m) => m.kind)).toEqual([
    "assistant",
    "metadata",
    "user",
  ]);
  const hints = renderHints(parsed.messages, parsed.warnings);
  expect(hints.map((h) => h.kind)).toEqual([
    "standalone",
    "metadata",
    "standalone",
  ]);
});
