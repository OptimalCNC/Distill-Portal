// Coverage map:
//   1. Registry exhaustiveness vs. `Tool` union — runtime check that
//      `Object.keys(PARSERS).sort()` matches the hard-coded expected set.
//      A static `Record<Tool, ParserFn>` type alone won't catch a future
//      maintainer who casts to silence TS, so a runtime assertion is the
//      second line of defence.
//   2. dispatchParser routes claude_code → parseClaudeCode.
//   3. dispatchParser routes codex → parseCodex.
//   4. dispatchParser builds the skim from parser output.
//   5. dispatchParser propagates streamMeta (totalBytes / truncated) verbatim.
//   6. Unknown tool → empty session + warning, never throws.
//   7. dispatchParser is total: never throws on any combination.

import { expect, test } from "bun:test";
import {
  buildSkim,
  dispatchParser,
  parseClaudeCode,
  parseCodex,
  PARSERS,
  USER_MSG_OVERSIZE_THRESHOLD,
} from "./index";
import type { StreamMeta } from "./types";

// Hard-coded expected set mirrors `Tool` from
// `components/ui-api-contracts/bindings/Tool.ts` ("claude_code" | "codex").
// If `Tool` ever grows a third variant, both this constant and the PARSERS
// record must be updated together — the runtime assertion below fails the
// suite if they drift apart.
const EXPECTED_TOOLS: ReadonlyArray<string> = ["claude_code", "codex"];

test("PARSERS registry exhaustiveness matches Tool union", () => {
  expect(Object.keys(PARSERS).sort()).toEqual([...EXPECTED_TOOLS].sort());
});

test("PARSERS entries are the expected per-tool functions", () => {
  expect(PARSERS.claude_code).toBe(parseClaudeCode);
  expect(PARSERS.codex).toBe(parseCodex);
});

test("dispatchParser routes claude_code to parseClaudeCode", () => {
  const raw = JSON.stringify({
    type: "user",
    message: { role: "user", content: "hi" },
  });
  const result = dispatchParser("claude_code", raw, { totalBytes: 100, truncated: false });
  expect(result.tool).toBe("claude_code");
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]).toMatchObject({ kind: "user", text: "hi" });
});

test("dispatchParser routes codex to parseCodex", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    payload: { type: "user_message", message: "hi from codex" },
  });
  const result = dispatchParser("codex", raw, { totalBytes: 200, truncated: false });
  expect(result.tool).toBe("codex");
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]).toMatchObject({ kind: "user", text: "hi from codex" });
});

test("dispatchParser computes skim from parser output", () => {
  const raw = [
    JSON.stringify({ type: "user", message: { role: "user", content: "a" } }),
    JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: "b" },
    }),
  ].join("\n");
  const result = dispatchParser("claude_code", raw, {
    totalBytes: raw.length,
    truncated: false,
  });
  // Verify skim is consistent with running buildSkim independently.
  const independentSkim = buildSkim(result.messages, USER_MSG_OVERSIZE_THRESHOLD);
  expect(result.skim).toEqual(independentSkim);
  expect(result.skim).toEqual([{ kind: "user_turn", start: 0, end: 1 }]);
});

test("dispatchParser propagates streamMeta verbatim", () => {
  const meta: StreamMeta = { totalBytes: 5_242_880, truncated: true };
  const result = dispatchParser("claude_code", "", meta);
  expect(result.totalBytes).toBe(5_242_880);
  expect(result.truncated).toBe(true);
});

test("dispatchParser empty input + truncated=false propagates correctly", () => {
  const result = dispatchParser("codex", "", { totalBytes: 0, truncated: false });
  expect(result.messages).toEqual([]);
  expect(result.totalBytes).toBe(0);
  expect(result.truncated).toBe(false);
  expect(result.skim).toEqual([
    { kind: "agent_only", start: 0, end: -1, meta: { empty: 1 } },
  ]);
});

test("dispatchParser unknown tool returns empty session + warning, never throws", () => {
  // Cast through unknown to simulate a future Tool variant the build doesn't
  // know about (or a programmer error feeding a string at runtime).
  const result = dispatchParser(
    "future_tool" as unknown as Parameters<typeof dispatchParser>[0],
    "anything",
    { totalBytes: 0, truncated: false },
  );
  expect(result.messages).toEqual([]);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0].reason).toContain("future_tool");
  expect(result.skim).toEqual([
    { kind: "agent_only", start: 0, end: -1, meta: { empty: 1 } },
  ]);
});

test("dispatchParser totality: does not throw on any combination of inputs", () => {
  const inputs: Array<{
    tool: Parameters<typeof dispatchParser>[0];
    raw: string;
  }> = [
    { tool: "claude_code", raw: "" },
    { tool: "codex", raw: "" },
    { tool: "claude_code", raw: "garbage\nmore garbage" },
    { tool: "codex", raw: "garbage\n{ truncated" },
    {
      tool: "future_tool" as unknown as Parameters<typeof dispatchParser>[0],
      raw: "anything",
    },
  ];
  for (const { tool, raw } of inputs) {
    expect(() => dispatchParser(tool, raw, { totalBytes: 0, truncated: false })).not.toThrow();
  }
});

test("dispatchParser preserves parser warnings on the result", () => {
  const raw = JSON.stringify({
    type: "custom-title",
    customTitle: "x",
  });
  const result = dispatchParser("claude_code", raw, { totalBytes: 0, truncated: false });
  expect(result.messages).toEqual([]);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0].reason).toContain("Skipping Claude-meta type");
});
