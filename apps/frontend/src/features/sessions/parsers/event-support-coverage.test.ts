import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseClaudeCode } from "./claude_code";
import { parseCodex } from "./codex";
import type { MessageKind, ParserOutput } from "./types";

type Tool = "claude_code" | "codex";

type Route =
  | { type: "messages"; kinds: MessageKind[]; warnings: "none" | "some" }
  | { type: "skipped"; warnings: "none" | "some" };

type ParserMatrixRow = {
  anchor: string;
  tool: Tool;
  current: Route;
  future?: Route;
  skipMarker?: string;
};

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../tests/fixtures/parser-events",
);

const ROWS: ParserMatrixRow[] = [
  {
    anchor: "claude-code-agent-name",
    tool: "claude_code",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "skipped", warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "claude-code-ai-title",
    tool: "claude_code",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "skipped", warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "claude-code-assistant-content-text",
    tool: "claude_code",
    current: { type: "messages", kinds: ["assistant"], warnings: "none" },
  },
  {
    anchor: "claude-code-assistant-content-thinking",
    tool: "claude_code",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["assistant"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "claude-code-assistant-content-tool-use",
    tool: "claude_code",
    current: { type: "messages", kinds: ["tool_use"], warnings: "none" },
  },
  {
    anchor: "claude-code-attachment",
    tool: "claude_code",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "skipped", warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "claude-code-custom-title",
    tool: "claude_code",
    current: { type: "skipped", warnings: "some" },
  },
  {
    anchor: "claude-code-file-history-snapshot",
    tool: "claude_code",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "skipped", warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "claude-code-last-prompt",
    tool: "claude_code",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "skipped", warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "claude-code-permission-mode",
    tool: "claude_code",
    current: { type: "skipped", warnings: "some" },
  },
  {
    anchor: "claude-code-queue-operation",
    tool: "claude_code",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "skipped", warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "claude-code-system",
    tool: "claude_code",
    current: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "claude-code-user-content-text",
    tool: "claude_code",
    current: { type: "messages", kinds: ["user"], warnings: "none" },
  },
  {
    anchor: "claude-code-user-content-tool-result",
    tool: "claude_code",
    current: { type: "messages", kinds: ["tool_result"], warnings: "none" },
  },
  {
    anchor: "claude-code-user-message-content-string",
    tool: "claude_code",
    current: { type: "messages", kinds: ["user"], warnings: "none" },
  },
  {
    anchor: "codex-compacted",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["boundary"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-agent-message",
    tool: "codex",
    current: { type: "messages", kinds: ["assistant"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-agent-reasoning",
    tool: "codex",
    current: { type: "messages", kinds: ["assistant"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-collab-agent-interaction-end",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-collab-agent-spawn-end",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-collab-close-end",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-collab-waiting-end",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-context-compacted",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["boundary"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-entered-review-mode",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-error",
    tool: "codex",
    current: { type: "messages", kinds: ["system"], warnings: "some" },
  },
  {
    anchor: "codex-event-msg-exec-command-end",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["tool_result"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-exited-review-mode",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-item-completed",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-mcp-tool-call-end",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["tool_result"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-patch-apply-end",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["tool_result"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-task-complete",
    tool: "codex",
    current: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-task-started",
    tool: "codex",
    current: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-thread-rolled-back",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["boundary"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-token-count",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "skipped", warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-turn-aborted",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-event-msg-user-message",
    tool: "codex",
    current: { type: "messages", kinds: ["user"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-web-search-end",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["tool_result"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-response-item-custom-tool-call",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["tool_use"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-response-item-custom-tool-call-output",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["tool_result"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-response-item-function-call",
    tool: "codex",
    current: { type: "messages", kinds: ["tool_use"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-function-call-output",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["tool_result"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-response-item-message-role-assistant",
    tool: "codex",
    current: { type: "skipped", warnings: "none" },
  },
  {
    anchor: "codex-response-item-message-role-developer",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["system"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-response-item-message-role-user",
    tool: "codex",
    current: { type: "skipped", warnings: "none" },
  },
  {
    anchor: "codex-response-item-reasoning",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["assistant"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-response-item-web-search-call",
    tool: "codex",
    current: { type: "messages", kinds: ["unknown"], warnings: "some" },
    future: { type: "messages", kinds: ["tool_use"], warnings: "none" },
    skipMarker: "@unskip Phase 7b",
  },
  {
    anchor: "codex-session-meta",
    tool: "codex",
    current: { type: "messages", kinds: ["system", "boundary"], warnings: "none" },
  },
  {
    anchor: "codex-turn-context",
    tool: "codex",
    current: { type: "skipped", warnings: "none" },
  },
];

for (const row of ROWS) {
  const run = row.skipMarker ? test.skip : test;
  run(`matrix: ${row.anchor} parser route${row.skipMarker ? ` [${row.skipMarker}]` : ""}`, () => {
    const output = parseFixture(row.tool, row.anchor);
    assertRoute(output, row.skipMarker ? row.future ?? row.current : row.current);
  });
}

test("matrix parser coverage has one row per fixture", () => {
  expect(ROWS).toHaveLength(48);
  const rowAnchors = new Set(ROWS.map((row) => row.anchor));
  const fixtureAnchors = listFixtureAnchors();
  expect(fixtureAnchors).toHaveLength(ROWS.length);
  expect(fixtureAnchors.filter((anchor) => !rowAnchors.has(anchor))).toEqual([]);
  for (const row of ROWS) {
    expect(loadFixture(row.tool, row.anchor).trim().length).toBeGreaterThan(0);
  }
});

function parseFixture(tool: Tool, anchor: string): ParserOutput {
  const raw = loadFixture(tool, anchor);
  return tool === "claude_code" ? parseClaudeCode(raw) : parseCodex(raw);
}

function loadFixture(tool: Tool, anchor: string): string {
  return readFileSync(
    join(FIXTURE_ROOT, tool, `${anchor}.jsonl`),
    "utf8",
  );
}

function listFixtureAnchors(): string[] {
  return ["claude_code", "codex"].flatMap((tool) =>
    readdirSync(join(FIXTURE_ROOT, tool))
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => entry.replace(/\.jsonl$/, "")),
  );
}

function assertRoute(output: ParserOutput, route: Route) {
  if (route.type === "skipped") {
    expect(output.messages).toEqual([]);
  } else {
    expect(output.messages.map((message) => message.kind)).toEqual(route.kinds);
  }

  if (route.warnings === "none") {
    expect(output.warnings).toEqual([]);
  } else {
    expect(output.warnings.length).toBeGreaterThan(0);
  }
}
