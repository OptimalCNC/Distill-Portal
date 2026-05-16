// Coverage map (one test per truth-table row at spec lines 750-757 plus
// totality + role-mismatch + timestamp + split-content discipline +
// real-fixture sanity check):
//   1. user with string content → 1 user message
//   2. user with array content (text + tool_result) → 2 messages, share lineOrdinal, sequential messageIndex
//   3. assistant with string content → 1 assistant message
//   4. assistant with array content (text + tool_use) → 2 messages, second carries toolName
//   5. summary → system message with leafUuid: prefix
//   6. system → system message
//   7. custom-title → no message and no warning
//   8. permission-mode → no message and no warning
//   9. unknown top-level type → unknown message + warning
//  10. malformed JSON line → warning, no message; subsequent lines parsed
//  11. role mismatch (top-level type=user, /message/role=assistant) → warning + emit using top-level type
//  12. timestamp parse: valid RFC3339 → preserved; missing → null; unparseable → null + warning
//  13. totality: parser does not throw on adversarial input
//  14. messageIndex monotonicity across split content
//  15. End-to-end fixture (tests/fixtures/claude_code/sample_session.jsonl)

import { expect, test } from "bun:test";
import { join } from "node:path";
import { parseClaudeCode } from "./claude_code";

test("user with string content emits one user message", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "user", content: "Hello" },
    timestamp: "2026-04-18T14:19:29.506Z",
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([]);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0]).toMatchObject({
    lineOrdinal: 0,
    messageIndex: 0,
    kind: "user",
    text: "Hello",
    timestamp: "2026-04-18T14:19:29.506Z",
  });
});

test("user with array content splits into multiple messages sharing lineOrdinal", () => {
  const raw = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "text", text: "tool gave me bad data" },
        { type: "tool_result", tool_use_id: "tu_123", content: "stderr: oops" },
      ],
    },
    timestamp: "2026-04-18T14:19:29.506Z",
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([]);
  expect(out.messages).toHaveLength(2);
  // Both share lineOrdinal=0; messageIndex is sequential.
  expect(out.messages[0]).toMatchObject({
    lineOrdinal: 0,
    messageIndex: 0,
    kind: "user",
    text: "tool gave me bad data",
  });
  expect(out.messages[1]).toMatchObject({
    lineOrdinal: 0,
    messageIndex: 1,
    kind: "tool_result",
    text: "stderr: oops",
    toolName: "tu_123",
  });
});

test("user content array with unknown item type emits unknown row + warning", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "weird_item", data: 42 }] },
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "payload" });
  expect(out.warnings[0].reason).toContain("unknown user content item type");
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].kind).toBe("unknown");
});

test("user content array with primitive (non-object) item emits warning + skips item", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "user", content: ["primitive string item", { type: "text", text: "kept" }] },
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([
    {
      lineOrdinal: 0,
      severity: "warning",
      category: "payload",
      reason: "non-object item in content array",
    },
  ]);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].text).toBe("kept");
});

test("assistant with string content emits one assistant message", () => {
  const raw = JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: "Implementing the slice." },
    timestamp: "2026-04-18T14:20:00.000Z",
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([]);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0]).toMatchObject({
    lineOrdinal: 0,
    messageIndex: 0,
    kind: "assistant",
    text: "Implementing the slice.",
    timestamp: "2026-04-18T14:20:00.000Z",
  });
});

test("assistant with array content splits text + tool_use", () => {
  const raw = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "I'll search the codebase." },
        {
          type: "tool_use",
          id: "tu_42",
          name: "Grep",
          input: { pattern: "foo", path: "src" },
        },
      ],
    },
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([]);
  expect(out.messages).toHaveLength(2);
  expect(out.messages[0]).toMatchObject({
    lineOrdinal: 0,
    messageIndex: 0,
    kind: "assistant",
    text: "I'll search the codebase.",
  });
  expect(out.messages[1]).toMatchObject({
    lineOrdinal: 0,
    messageIndex: 1,
    kind: "tool_use",
    toolName: "Grep",
  });
  // Verify input is JSON-stringified with 2-space indentation per spec line 753.
  expect(out.messages[1].text).toContain("\"pattern\"");
  expect(out.messages[1].text).toContain("\"foo\"");
});

test("assistant content array with unknown item type emits unknown row + warning", () => {
  const raw = JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "weird", x: 1 }] },
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "payload" });
  expect(out.warnings[0].reason).toContain("unknown assistant content item type");
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].kind).toBe("unknown");
});

test("assistant content array with non-object item emits warning + skips item", () => {
  const raw = JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [42, { type: "text", text: "kept" }] },
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([
    {
      lineOrdinal: 0,
      severity: "warning",
      category: "payload",
      reason: "non-object item in content array",
    },
  ]);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].text).toBe("kept");
});

test("summary record emits a system message with leafUuid prefix", () => {
  const raw = JSON.stringify({
    type: "summary",
    leafUuid: "abc-1234",
    summary: "Phase 1 backend foundation landed.",
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([]);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0]).toMatchObject({
    kind: "system",
    text: "abc-1234: Phase 1 backend foundation landed.",
  });
});

test("system record emits a system message with content", () => {
  const raw = JSON.stringify({ type: "system", content: "system note" });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([]);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0]).toMatchObject({
    kind: "system",
    text: "system note",
  });
});

test("custom-title is silenced from messages and warnings", () => {
  const raw = JSON.stringify({
    type: "custom-title",
    customTitle: "phase-1-backend-foundation",
  });
  const out = parseClaudeCode(raw);
  expect(out.messages).toEqual([]);
  expect(out.warnings).toEqual([]);
});

test("permission-mode is silenced from messages and warnings", () => {
  const raw = JSON.stringify({ type: "permission-mode", permissionMode: "default" });
  const out = parseClaudeCode(raw);
  expect(out.messages).toEqual([]);
  expect(out.warnings).toEqual([]);
});

test("unknown top-level type emits unknown row + warning", () => {
  const raw = JSON.stringify({ type: "totally_new_kind", foo: 1 });
  const out = parseClaudeCode(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "schema" });
  expect(out.warnings[0].reason).toContain("unknown top-level type 'totally_new_kind'");
});

test("malformed JSON line is captured as warning and subsequent lines still parse", () => {
  const raw = [
    JSON.stringify({ type: "user", message: { role: "user", content: "first" } }),
    "{ this is not valid json",
    JSON.stringify({ type: "user", message: { role: "user", content: "third" } }),
  ].join("\n");
  const out = parseClaudeCode(raw);
  expect(out.messages).toHaveLength(2);
  expect(out.messages[0].text).toBe("first");
  expect(out.messages[0].lineOrdinal).toBe(0);
  expect(out.messages[1].text).toBe("third");
  expect(out.messages[1].lineOrdinal).toBe(2);
  expect(out.messages[1].messageIndex).toBe(1); // sequential — no gap from skipped line
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0]).toEqual({
    lineOrdinal: 1,
    severity: "error",
    category: "lexer",
    reason: "malformed JSON",
  });
});

test("role mismatch warns but emits using top-level type", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "assistant", content: "ambiguous" },
  });
  const out = parseClaudeCode(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].kind).toBe("user"); // top-level type is authoritative
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "schema" });
  expect(out.warnings[0].reason).toContain("/message/role is 'assistant'");
});

test("missing timestamp leaves Message.timestamp null without warning", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "user", content: "no ts" },
  });
  const out = parseClaudeCode(raw);
  expect(out.warnings).toEqual([]);
  expect(out.messages[0].timestamp).toBeNull();
});

test("unparseable timestamp warns and yields null Message.timestamp", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "user", content: "bad ts" },
    timestamp: "not-a-real-date",
  });
  const out = parseClaudeCode(raw);
  expect(out.messages[0].timestamp).toBeNull();
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "timestamp" });
  expect(out.warnings[0].reason).toContain("unparseable RFC3339 timestamp");
});

test("non-string timestamp warns", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "user", content: "x" },
    timestamp: 12345,
  });
  const out = parseClaudeCode(raw);
  expect(out.messages[0].timestamp).toBeNull();
  expect(out.warnings.some((w) => w.reason === "timestamp field is not a string")).toBe(true);
});

test("missing top-level type emits unknown row + warning", () => {
  const raw = JSON.stringify({ foo: 1 });
  const out = parseClaudeCode(raw);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings.some((w) => w.reason === "missing top-level 'type' field")).toBe(true);
});

test("non-object top-level JSON warns and skips", () => {
  const raw = "[1,2,3]";
  const out = parseClaudeCode(raw);
  expect(out.messages).toEqual([]);
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0].reason).toContain("not an object");
});

test("user with non-string non-array content warns", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "user", content: 42 },
  });
  const out = parseClaudeCode(raw);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings.some((w) =>
    w.reason.includes("user record /message/content is neither string nor array"),
  )).toBe(true);
});

test("assistant with non-string non-array content warns", () => {
  const raw = JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: 99 },
  });
  const out = parseClaudeCode(raw);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings.some((w) =>
    w.reason.includes("assistant record /message/content is neither string nor array"),
  )).toBe(true);
});

test("empty rawText returns empty output without errors", () => {
  const out = parseClaudeCode("");
  expect(out.messages).toEqual([]);
  expect(out.warnings).toEqual([]);
});

test("trailing newline is stripped silently", () => {
  const raw = JSON.stringify({ type: "user", message: { role: "user", content: "x" } }) + "\n";
  const out = parseClaudeCode(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.warnings).toEqual([]);
});

test("empty mid-document line emits an 'empty line' warning", () => {
  const raw = [
    JSON.stringify({ type: "user", message: { role: "user", content: "a" } }),
    "",
    JSON.stringify({ type: "user", message: { role: "user", content: "b" } }),
  ].join("\n");
  const out = parseClaudeCode(raw);
  expect(out.messages).toHaveLength(2);
  expect(out.warnings).toEqual([
    {
      lineOrdinal: 1,
      severity: "error",
      category: "lexer",
      reason: "empty line",
    },
  ]);
});

// ===== Totality =====
test("totality: parser does not throw on adversarial input", () => {
  const adversarial = [
    "",
    "null",
    "[]",
    "{}",
    "this is not json at all",
    JSON.stringify({ type: "user" }), // missing message
    JSON.stringify({ type: "user", message: null }),
    JSON.stringify({ type: 123 }), // type is not a string
    JSON.stringify({ type: "assistant", message: { content: { weird: true } } }),
    JSON.stringify({ type: "summary" }), // missing summary + leafUuid
    "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":[", // truncated
  ].join("\n");
  expect(() => parseClaudeCode(adversarial)).not.toThrow();
});

// ===== End-to-end fixture =====
test("end-to-end: real fixture (tests/fixtures/claude_code/sample_session.jsonl)", async () => {
  const fixturePath = join(
    process.cwd(),
    "../../tests/fixtures/claude_code/sample_session.jsonl",
  );
  const raw = await Bun.file(fixturePath).text();
  const out = parseClaudeCode(raw);

  // 4 lines. permission-mode (line 0) → silenced;
  // user (line 1) → 1 user msg;
  // assistant (line 2) → 1 assistant msg;
  // custom-title (line 3) → silenced.
  // Expected: 2 messages, 0 warnings.
  expect(out.messages).toHaveLength(2);
  expect(out.messages[0]).toMatchObject({
    kind: "user",
    text: "Build the phase 1 backend foundation.",
    lineOrdinal: 1,
    messageIndex: 0,
  });
  expect(out.messages[1]).toMatchObject({
    kind: "assistant",
    text: "Implementing the storage-first slice.",
    lineOrdinal: 2,
    messageIndex: 1,
  });
  expect(out.warnings).toEqual([]);
});

test("parser warning fixtures all emit structured warnings", async () => {
  const fixtureRoot = join(
    process.cwd(),
    "../../tests/fixtures/parser-warnings/claude_code",
  );
  for (const entry of new Bun.Glob("*.jsonl").scanSync({ cwd: fixtureRoot })) {
    const raw = await Bun.file(join(fixtureRoot, entry)).text();
    const out = parseClaudeCode(raw);
    expect(out.warnings.length, entry).toBeGreaterThan(0);
    for (const warning of out.warnings) {
      expect(warning.severity, entry).toBeOneOf(["error", "warning", "info"]);
      expect(warning.category, entry).toBeOneOf([
        "lexer",
        "schema",
        "payload",
        "timestamp",
        "meta",
      ]);
      expect(warning.reason.length, entry).toBeGreaterThan(0);
    }
  }
});
