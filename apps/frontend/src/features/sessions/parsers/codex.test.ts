// Coverage map (one test per truth-table row at spec lines 769-783 plus
// totality + anchor-principle + timestamp fallback + real-fixture):
//   1. session_meta first occurrence → system message summarizing cwd / cli / provider
//   2. session_meta SECOND occurrence → boundary message of subtype session_resumed
//   3. response_item.message role=user → SKIPPED (anchor principle, no message, no warning)
//   4. response_item.message role=assistant → SKIPPED
//   5. response_item.function_call → tool_use with toolName = payload.name
//   6. response_item.function_call missing name → tool_use with toolName fallback
//   7. response_item with unknown payload type → unknown + warning
//   8. turn_context → silently skipped
//   9. event_msg.user_message → user
//  10. event_msg.agent_message → assistant
//  11. event_msg.agent_reasoning → assistant (text from payload.text or fallback)
//  12. event_msg.task_started → system
//  13. event_msg.task_complete → system
//  14. event_msg.exec_command → tool_use toolName="exec"
//  15. event_msg.exec_command_output → tool_result toolName="exec"
//  16. event_msg.error → system
//  17. event_msg unknown payload.type → unknown + warning
//  18. event_msg missing payload.type → unknown + warning
//  19. malformed JSON → warning, skipped, sequential messageIndex preserved
//  20. unknown top-level type → unknown + warning
//  21. timestamp: top-level preferred over payload; falls back when missing
//  22. totality: adversarial input does not throw
//  23. End-to-end real fixture: anchor principle skips response_item.user

import { expect, test } from "bun:test";
import { join } from "node:path";
import { parseCodex } from "./codex";

test("session_meta first occurrence emits a system message summarizing the session", () => {
  const raw = JSON.stringify({
    timestamp: "2026-04-11T11:05:37.639Z",
    type: "session_meta",
    payload: {
      cwd: "/home/huwei/example",
      cli_version: "0.120.0",
      model_provider: "OpenAI",
    },
  });
  const out = parseCodex(raw);
  expect(out.warnings).toEqual([]);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].kind).toBe("system");
  expect(out.messages[0].text).toContain("/home/huwei/example");
  expect(out.messages[0].text).toContain("0.120.0");
  expect(out.messages[0].text).toContain("OpenAI");
  expect(out.messages[0].timestamp).toBe("2026-04-11T11:05:37.639Z");
});

test("second session_meta in stream becomes a boundary message of subtype session_resumed", () => {
  const raw = [
    JSON.stringify({
      timestamp: "2026-04-11T11:05:37.639Z",
      type: "session_meta",
      payload: { cwd: "/a", cli_version: "0.120.0", model_provider: "OpenAI" },
    }),
    JSON.stringify({
      timestamp: "2026-04-11T11:06:00.000Z",
      type: "session_meta",
      payload: { cwd: "/b" },
    }),
  ].join("\n");
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(2);
  expect(out.messages[0].kind).toBe("system");
  expect(out.messages[1].kind).toBe("boundary");
  expect(out.messages[1].boundarySubtype).toBe("session_resumed");
});

test("anchor principle: response_item.message role=user is SKIPPED (no message, no warning)", () => {
  const raw = JSON.stringify({
    timestamp: "2026-04-11T11:05:37.642Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Introduce omx and its subcommands." }],
    },
  });
  const out = parseCodex(raw);
  expect(out.messages).toEqual([]);
  expect(out.warnings).toEqual([]);
});

test("anchor principle: response_item.message role=assistant is also SKIPPED", () => {
  const raw = JSON.stringify({
    timestamp: "2026-04-11T11:05:38.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Sure!" }],
    },
  });
  const out = parseCodex(raw);
  expect(out.messages).toEqual([]);
  expect(out.warnings).toEqual([]);
});

test("response_item.function_call emits a tool_use with toolName from payload.name", () => {
  const raw = JSON.stringify({
    timestamp: "2026-04-11T11:05:38.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      name: "search_docs",
      arguments: { query: "omx subcommands" },
    },
  });
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0]).toMatchObject({
    kind: "tool_use",
    toolName: "search_docs",
  });
  expect(out.messages[0].text).toContain("omx subcommands");
  expect(out.warnings).toEqual([]);
});

test("response_item.function_call with STRING arguments emits text wrapped in JSON quotes (spec line 773 literal)", () => {
  const raw = JSON.stringify({
    type: "response_item",
    payload: { type: "function_call", name: "search", arguments: "raw string args" },
  });
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].kind).toBe("tool_use");
  // Spec mandates JSON.stringify regardless of input type. JSON.stringify("raw string args") → '"raw string args"'
  expect(out.messages[0].text).toBe('"raw string args"');
});

test("response_item missing payload entirely emits unknown + warning (totality)", () => {
  const raw = JSON.stringify({ type: "response_item" });
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings[0]).toMatchObject({ severity: "error", category: "schema" });
  expect(out.warnings.some((w) => w.reason === "response_item missing payload")).toBe(true);
});

test("response_item.function_call missing name falls back to 'function_call'", () => {
  const raw = JSON.stringify({
    type: "response_item",
    payload: { type: "function_call", arguments: { x: 1 } },
  });
  const out = parseCodex(raw);
  expect(out.messages[0].toolName).toBe("function_call");
});

test("response_item with unknown payload type emits unknown + warning", () => {
  const raw = JSON.stringify({
    type: "response_item",
    payload: { type: "totally_new_thing" },
  });
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "schema" });
  expect(out.warnings[0].reason).toContain("unknown response_item payload.type");
});

test("turn_context is silently skipped (adapter metadata, not timeline)", () => {
  const raw = JSON.stringify({
    type: "turn_context",
    payload: { cwd: "/a", current_date: "2026-04-11" },
  });
  const out = parseCodex(raw);
  expect(out.messages).toEqual([]);
  expect(out.warnings).toEqual([]);
});

test("event_msg.user_message emits a user message", () => {
  const raw = JSON.stringify({
    timestamp: "2026-04-11T11:05:37.642Z",
    type: "event_msg",
    payload: { type: "user_message", message: "do the thing" },
  });
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.messages[0]).toMatchObject({
    kind: "user",
    text: "do the thing",
    timestamp: "2026-04-11T11:05:37.642Z",
  });
});

test("event_msg.agent_message emits an assistant message", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "agent_message", message: "doing it" },
  });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "assistant", text: "doing it" });
});

test("event_msg.agent_reasoning emits an assistant message with payload.text", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "agent_reasoning", text: "thinking..." },
  });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "assistant", text: "thinking..." });
});

test("event_msg.agent_reasoning falls back to payload.message if text missing", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "agent_reasoning", message: "alt body" },
  });
  const out = parseCodex(raw);
  expect(out.messages[0].text).toBe("alt body");
});

test("event_msg.user_message missing payload.message warns + emits empty-text user", () => {
  const raw = JSON.stringify({ type: "event_msg", payload: { type: "user_message" } });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "user", text: "" });
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "payload" });
  expect(out.warnings.some((w) => w.reason.includes("user_message missing"))).toBe(true);
});

test("event_msg.agent_message missing payload.message warns", () => {
  const raw = JSON.stringify({ type: "event_msg", payload: { type: "agent_message" } });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "assistant", text: "" });
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "payload" });
  expect(out.warnings.some((w) => w.reason.includes("agent_message missing"))).toBe(true);
});

test("event_msg.agent_reasoning missing both payload.text and payload.message warns", () => {
  const raw = JSON.stringify({ type: "event_msg", payload: { type: "agent_reasoning" } });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "assistant", text: "" });
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "payload" });
  expect(out.warnings.some((w) => w.reason.includes("agent_reasoning missing"))).toBe(true);
});

test("event_msg.task_started emits a system message", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "task_started", turn_id: "abc-123" },
  });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "system" });
  expect(out.messages[0].text).toContain("task_started");
  expect(out.messages[0].text).toContain("abc-123");
});

test("event_msg.task_complete emits a system message", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "task_complete", turn_id: "abc-123" },
  });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "system" });
  expect(out.messages[0].text).toContain("task_complete");
});

test("event_msg.exec_command with array command emits tool_use with JSON.stringify text (spec line 779 literal)", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "exec_command", command: ["ls", "-la"] },
  });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "tool_use", toolName: "exec" });
  // Spec line 779: text: JSON.stringify(payload.command) — array becomes JSON array literal.
  expect(out.messages[0].text).toBe('["ls","-la"]');
});

test("event_msg.exec_command with STRING command JSON.stringify-wraps it in quotes (spec line 779 literal)", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "exec_command", command: "ls -la" },
  });
  const out = parseCodex(raw);
  // Spec mandates JSON.stringify regardless of input type.
  expect(out.messages[0].text).toBe('"ls -la"');
});

test("event_msg.exec_command_output with string output passes through raw (spec line 779: payload.output, NOT JSON.stringify)", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "exec_command_output", output: "total 0\nfoo\n" },
  });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "tool_result", toolName: "exec" });
  // Spec line 779 mandates `text: payload.output` (raw passthrough) for exec_command_output, NOT JSON.stringify.
  // This is asymmetric with exec_command which DOES wrap in JSON.stringify per the same line.
  expect(out.messages[0].text).toBe("total 0\nfoo\n");
});

test("event_msg.exec_command_output with non-string output JSON.stringify-wraps for type safety", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "exec_command_output", output: { exit: 0, stdout: "ok" } },
  });
  const out = parseCodex(raw);
  // Non-string output (array/object) gets JSON.stringify to preserve Message.text: string.
  expect(out.messages[0].text).toBe('{"exit":0,"stdout":"ok"}');
});

test("event_msg.exec_command missing payload.command warns AND emits text='null' (string, not undefined)", () => {
  const raw = JSON.stringify({ type: "event_msg", payload: { type: "exec_command" } });
  const out = parseCodex(raw);
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "payload" });
  expect(out.warnings.some((w) => w.reason.includes("exec_command missing payload.command"))).toBe(true);
  // Regression: Message.text MUST be a string (JSON.stringify(undefined) returns undefined; we normalise to null first).
  expect(typeof out.messages[0].text).toBe("string");
  expect(out.messages[0].text).toBe("null");
});

test("event_msg.exec_command_output missing payload.output warns AND emits text='null' (string, not undefined)", () => {
  const raw = JSON.stringify({ type: "event_msg", payload: { type: "exec_command_output" } });
  const out = parseCodex(raw);
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "payload" });
  expect(out.warnings.some((w) => w.reason.includes("exec_command_output missing payload.output"))).toBe(true);
  expect(typeof out.messages[0].text).toBe("string");
  expect(out.messages[0].text).toBe("null");
});

test("event_msg.error emits a system message without a parser warning", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "error", message: "rate limited" },
  });
  const out = parseCodex(raw);
  expect(out.messages[0]).toMatchObject({ kind: "system", text: "rate limited" });
  expect(out.warnings).toEqual([]);
});

test("event_msg with unknown payload.type emits unknown + warning", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "novel_event" },
  });
  const out = parseCodex(raw);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "schema" });
  expect(out.warnings[0].reason).toContain("unknown event_msg payload.type 'novel_event'");
});

test("event_msg missing payload.type emits unknown + warning", () => {
  const raw = JSON.stringify({ type: "event_msg", payload: {} });
  const out = parseCodex(raw);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings[0]).toMatchObject({ severity: "error", category: "schema" });
  expect(out.warnings[0].reason).toContain("event_msg missing payload.type");
});

test("malformed JSON line warns and the next line still parses", () => {
  const raw = [
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "first" } }),
    "{ corrupted",
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "third" } }),
  ].join("\n");
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(2);
  expect(out.messages[0].text).toBe("first");
  expect(out.messages[1].text).toBe("third");
  expect(out.messages[1].messageIndex).toBe(1);
  expect(out.warnings[0]).toEqual({
    lineOrdinal: 1,
    severity: "error",
    category: "lexer",
    reason: "malformed JSON",
  });
});

test("unknown top-level type emits unknown + warning", () => {
  const raw = JSON.stringify({ type: "totally_new_kind", foo: 1 });
  const out = parseCodex(raw);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings[0]).toMatchObject({ severity: "warning", category: "schema" });
  expect(out.warnings[0].reason).toContain("unknown top-level type 'totally_new_kind'");
});

test("missing top-level type emits unknown + warning", () => {
  const raw = JSON.stringify({ payload: { type: "user_message", message: "x" } });
  const out = parseCodex(raw);
  expect(out.messages[0].kind).toBe("unknown");
  expect(out.warnings.some((w) => w.reason === "missing top-level 'type' field")).toBe(true);
});

test("non-object top-level JSON warns and skips", () => {
  const raw = "42";
  const out = parseCodex(raw);
  expect(out.messages).toEqual([]);
  expect(out.warnings).toHaveLength(1);
  expect(out.warnings[0]).toMatchObject({ severity: "error", category: "lexer" });
  expect(out.warnings[0].reason).toContain("not an object");
});

test("timestamp: top-level preferred when valid", () => {
  const raw = JSON.stringify({
    timestamp: "2026-04-11T11:05:37.639Z",
    type: "event_msg",
    payload: {
      timestamp: "2999-01-01T00:00:00.000Z",
      type: "user_message",
      message: "x",
    },
  });
  const out = parseCodex(raw);
  expect(out.messages[0].timestamp).toBe("2026-04-11T11:05:37.639Z");
});

test("timestamp: falls back to payload.timestamp when top-level missing", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: {
      timestamp: "2026-04-11T11:05:37.642Z",
      type: "user_message",
      message: "x",
    },
  });
  const out = parseCodex(raw);
  expect(out.messages[0].timestamp).toBe("2026-04-11T11:05:37.642Z");
});

test("timestamp: unparseable top-level falls through to payload, both unparseable → null + 2 warnings", () => {
  const raw = JSON.stringify({
    timestamp: "broken",
    type: "event_msg",
    payload: {
      timestamp: "also-broken",
      type: "user_message",
      message: "x",
    },
  });
  const out = parseCodex(raw);
  expect(out.messages[0].timestamp).toBeNull();
  expect(out.warnings.filter((w) => w.reason.includes("unparseable"))).toHaveLength(2);
});

test("timestamp: non-string top-level warns and falls through", () => {
  const raw = JSON.stringify({
    timestamp: 12345,
    type: "event_msg",
    payload: {
      timestamp: "2026-04-11T11:05:37.642Z",
      type: "user_message",
      message: "x",
    },
  });
  const out = parseCodex(raw);
  expect(out.messages[0].timestamp).toBe("2026-04-11T11:05:37.642Z");
  expect(out.warnings.some((w) => w.reason === "top-level timestamp is not a string")).toBe(true);
});

test("non-string payload.timestamp warns and yields null timestamp", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "user_message", message: "x", timestamp: 12345 },
  });
  const out = parseCodex(raw);
  expect(out.messages[0].timestamp).toBeNull();
  expect(out.warnings.some((w) => w.reason === "payload.timestamp is not a string")).toBe(true);
});

test("trailing newline stripped silently", () => {
  const raw =
    JSON.stringify({
      type: "event_msg",
      payload: { type: "user_message", message: "x" },
    }) + "\n";
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(1);
  expect(out.warnings).toEqual([]);
});

test("empty mid-document line emits an 'empty line' warning", () => {
  const raw = [
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "a" } }),
    "",
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "b" } }),
  ].join("\n");
  const out = parseCodex(raw);
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
    "garbage",
    JSON.stringify({ type: "session_meta" }), // no payload
    JSON.stringify({ type: "event_msg" }), // no payload
    JSON.stringify({ type: "event_msg", payload: null }),
    JSON.stringify({ type: "event_msg", payload: { type: 42 } }), // payload.type not a string
    JSON.stringify({ type: "response_item" }), // no payload
    JSON.stringify({ type: 999 }), // type not string
    "{ truncated",
  ].join("\n");
  expect(() => parseCodex(adversarial)).not.toThrow();
});

// ===== Anchor principle: end-to-end fixture =====
test("end-to-end: real fixture verifies anchor principle (response_item.user is SKIPPED)", async () => {
  const fixturePath = join(
    process.cwd(),
    "../../tests/fixtures/codex/sample_session.jsonl",
  );
  const raw = await Bun.file(fixturePath).text();
  const out = parseCodex(raw);

  // 4 lines:
  //   0: session_meta            → system (kept)
  //   1: response_item.user      → SKIPPED by anchor principle (no msg, no warning)
  //   2: event_msg.user_message  → user (kept) — CANONICAL
  //   3: turn_context            → silently skipped
  // Expect 2 messages: system + user; no warnings.
  expect(out.messages).toHaveLength(2);
  expect(out.messages[0]).toMatchObject({
    kind: "system",
    lineOrdinal: 0,
    messageIndex: 0,
  });
  expect(out.messages[0].text).toContain("/home/huwei/ai_codings/oh-my-codex");
  expect(out.messages[0].text).toContain("0.120.0");
  expect(out.messages[1]).toMatchObject({
    kind: "user",
    lineOrdinal: 2, // skipped lines do NOT shift lineOrdinal
    messageIndex: 1, // sequential after the system
    text: "Introduce omx and its subcommands.",
  });
  expect(out.warnings).toEqual([]);
});

test("CODEX_FORKED_FIXTURE-style stream emits a session_resumed boundary on the second session_meta", () => {
  // Compact reproduction of CODEX_FORKED_FIXTURE (parsers.rs:16) — two
  // session_meta lines back-to-back. Verifies the boundary emission for the
  // embedded-parent-meta scenario without depending on the upstream Rust fixture.
  const raw = [
    JSON.stringify({
      timestamp: "2026-04-24T06:04:16.612Z",
      type: "session_meta",
      payload: {
        id: "child",
        timestamp: "2026-04-24T06:04:16.605Z",
        cwd: "/child",
        cli_version: "0.130.0",
        model_provider: "OpenAI",
      },
    }),
    JSON.stringify({
      timestamp: "2026-04-24T06:04:16.615Z",
      type: "session_meta",
      payload: { id: "parent", timestamp: "2026-04-24T05:58:39.481Z", cwd: "/parent" },
    }),
    JSON.stringify({
      timestamp: "2026-04-24T06:04:18.763Z",
      type: "event_msg",
      payload: { type: "user_message", message: "child prompt" },
    }),
  ].join("\n");
  const out = parseCodex(raw);
  expect(out.messages).toHaveLength(3);
  expect(out.messages[0].kind).toBe("system");
  expect(out.messages[1].kind).toBe("boundary");
  expect(out.messages[1].boundarySubtype).toBe("session_resumed");
  expect(out.messages[2]).toMatchObject({ kind: "user", text: "child prompt" });
});

test("parser warning fixtures all emit structured warnings", async () => {
  const fixtureRoot = join(
    process.cwd(),
    "../../tests/fixtures/parser-warnings/codex",
  );
  for (const entry of new Bun.Glob("*.jsonl").scanSync({ cwd: fixtureRoot })) {
    const raw = await Bun.file(join(fixtureRoot, entry)).text();
    const out = parseCodex(raw);
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
