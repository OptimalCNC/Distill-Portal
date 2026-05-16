import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  formatSweepResult,
  parseArgs,
  runSweep,
  type SweepRoot,
} from "./parser-warning-sweep";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

test("parser-warning-sweep exits cleanly for a clean fixture corpus", async () => {
  const root = await tempRoot("clean");
  await writeFile(
    join(root, "session.jsonl"),
    JSON.stringify({
      type: "event_msg",
      payload: { type: "user_message", message: "clean" },
    }),
  );

  const result = await runSweep([{ tool: "codex", path: root }]);
  expect(result.warnings).toEqual([]);
  expect(formatSweepResult(result)).toContain("Result: zero parser warnings");
});

test("parser-warning-sweep reports structured warning counts for warning fixtures", async () => {
  const root = await tempRoot("warning");
  await writeFile(join(root, "bad.jsonl"), "{ not json");

  const result = await runSweep([{ tool: "claude_code", path: root }]);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0].warning).toMatchObject({
    severity: "error",
    category: "lexer",
    reason: "malformed JSON",
  });
  expect(result.counts.get("claude_code/error/lexer")).toBe(1);
  expect(formatSweepResult(result)).toContain("claude_code/error/lexer: 1");
});

test("parser-warning-sweep skips missing roots instead of failing", async () => {
  const missing = join(process.cwd(), ".missing-parser-warning-sweep-root");
  const result = await runSweep([{ tool: "codex", path: missing }]);
  expect(result.roots).toEqual([
    { tool: "codex", path: missing, exists: false, files: 0 },
  ]);
  expect(result.warnings).toEqual([]);
});

test("parseArgs accepts repeated root overrides", () => {
  const roots = parseArgs([
    "--claude-root",
    "/tmp/claude-a",
    "--claude-root",
    "/tmp/claude-b",
    "--codex-root",
    "/tmp/codex",
  ]);
  expect(roots).toEqual<SweepRoot[]>([
    { tool: "claude_code", path: "/tmp/claude-a" },
    { tool: "claude_code", path: "/tmp/claude-b" },
    { tool: "codex", path: "/tmp/codex" },
  ]);
});

async function tempRoot(name: string): Promise<string> {
  const root = join(
    process.cwd(),
    ".tmp",
    `parser-warning-sweep-${name}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
  await mkdir(root, { recursive: true });
  tempRoots.push(root);
  return root;
}
