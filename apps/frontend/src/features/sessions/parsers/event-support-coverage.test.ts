import { expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseClaudeCode } from "./claude_code";
import { parseCodex } from "./codex";
import type { MessageKind, MetaCategory, ParserOutput } from "./types";

type Tool = "claude_code" | "codex";

type Route =
  | { type: "messages"; kinds: MessageKind[]; warnings: "none" | "some" }
  | {
      // Phase 7d — the 12 previously-silenced rows now route through
      // `kind:"metadata"` with `metaCategory` discriminating the visual
      // recipe. `kinds` is the per-message kind sequence (always
      // `["metadata"]` for the 12 rows); `metaCategories` carries the
      // expected metaCategory per emitted Message.
      type: "metadata";
      metaCategories: MetaCategory[];
      warnings: "none" | "some";
    };

type ParserMatrixRow = {
  anchor: string;
  tool: Tool;
  route: Route;
};

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../tests/fixtures/parser-events",
);

const ROWS: ParserMatrixRow[] = [
  {
    anchor: "claude-code-agent-name",
    tool: "claude_code",
    route: { type: "metadata", metaCategories: ["agent"], warnings: "none" },
  },
  {
    anchor: "claude-code-ai-title",
    tool: "claude_code",
    route: { type: "metadata", metaCategories: ["title"], warnings: "none" },
  },
  {
    anchor: "claude-code-assistant-content-text",
    tool: "claude_code",
    route: { type: "messages", kinds: ["assistant"], warnings: "none" },
  },
  {
    anchor: "claude-code-assistant-content-thinking",
    tool: "claude_code",
    route: { type: "messages", kinds: ["assistant"], warnings: "none" },
  },
  {
    anchor: "claude-code-assistant-content-tool-use",
    tool: "claude_code",
    route: { type: "messages", kinds: ["tool_use"], warnings: "none" },
  },
  {
    anchor: "claude-code-attachment",
    tool: "claude_code",
    route: { type: "metadata", metaCategories: ["attachment"], warnings: "none" },
  },
  {
    anchor: "claude-code-custom-title",
    tool: "claude_code",
    route: { type: "metadata", metaCategories: ["title"], warnings: "none" },
  },
  {
    anchor: "claude-code-file-history-snapshot",
    tool: "claude_code",
    route: { type: "metadata", metaCategories: ["attachment"], warnings: "none" },
  },
  {
    anchor: "claude-code-last-prompt",
    tool: "claude_code",
    route: { type: "metadata", metaCategories: ["prompt"], warnings: "none" },
  },
  {
    anchor: "claude-code-permission-mode",
    tool: "claude_code",
    route: { type: "metadata", metaCategories: ["control"], warnings: "none" },
  },
  {
    anchor: "claude-code-queue-operation",
    tool: "claude_code",
    route: { type: "metadata", metaCategories: ["control"], warnings: "none" },
  },
  {
    anchor: "claude-code-system",
    tool: "claude_code",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "claude-code-user-content-text",
    tool: "claude_code",
    route: { type: "messages", kinds: ["user"], warnings: "none" },
  },
  {
    anchor: "claude-code-user-content-tool-result",
    tool: "claude_code",
    route: { type: "messages", kinds: ["tool_result"], warnings: "none" },
  },
  {
    anchor: "claude-code-user-message-content-string",
    tool: "claude_code",
    route: { type: "messages", kinds: ["user"], warnings: "none" },
  },
  {
    anchor: "codex-compacted",
    tool: "codex",
    route: { type: "messages", kinds: ["boundary"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-agent-message",
    tool: "codex",
    route: { type: "messages", kinds: ["assistant"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-agent-reasoning",
    tool: "codex",
    route: { type: "messages", kinds: ["assistant"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-collab-agent-interaction-end",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-collab-agent-spawn-end",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-collab-close-end",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-collab-waiting-end",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-context-compacted",
    tool: "codex",
    route: { type: "messages", kinds: ["boundary"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-entered-review-mode",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-error",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-exec-command-end",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_result"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-exited-review-mode",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-item-completed",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-mcp-tool-call-end",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_result"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-patch-apply-end",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_result"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-task-complete",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-task-started",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-thread-rolled-back",
    tool: "codex",
    route: { type: "messages", kinds: ["boundary"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-token-count",
    tool: "codex",
    route: { type: "metadata", metaCategories: ["telemetry"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-turn-aborted",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-user-message",
    tool: "codex",
    route: { type: "messages", kinds: ["user"], warnings: "none" },
  },
  {
    anchor: "codex-event-msg-web-search-end",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_result"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-custom-tool-call",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_use"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-custom-tool-call-output",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_result"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-function-call",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_use"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-function-call-output",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_result"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-message-role-assistant",
    tool: "codex",
    route: { type: "metadata", metaCategories: ["echo"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-message-role-developer",
    tool: "codex",
    route: { type: "messages", kinds: ["system"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-message-role-user",
    tool: "codex",
    route: { type: "metadata", metaCategories: ["echo"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-reasoning",
    tool: "codex",
    route: { type: "messages", kinds: ["assistant"], warnings: "none" },
  },
  {
    anchor: "codex-response-item-web-search-call",
    tool: "codex",
    route: { type: "messages", kinds: ["tool_use"], warnings: "none" },
  },
  {
    anchor: "codex-session-meta",
    tool: "codex",
    route: { type: "messages", kinds: ["system", "boundary"], warnings: "none" },
  },
  {
    anchor: "codex-turn-context",
    tool: "codex",
    route: { type: "metadata", metaCategories: ["context"], warnings: "none" },
  },
];

for (const row of ROWS) {
  test(`matrix: ${row.anchor} parser route`, async () => {
    const output = await parseFixture(row.tool, row.anchor);
    assertRoute(output, row.route);
  });
}

test("matrix parser coverage has one row per fixture", async () => {
  expect(ROWS).toHaveLength(48);
  const rowAnchors = new Set(ROWS.map((row) => row.anchor));
  const fixtureAnchors = listFixtureAnchors();
  expect(fixtureAnchors).toHaveLength(ROWS.length);
  expect(fixtureAnchors.filter((anchor) => !rowAnchors.has(anchor))).toEqual([]);
  for (const row of ROWS) {
    expect((await loadFixture(row.tool, row.anchor)).trim().length).toBeGreaterThan(0);
  }
});

async function parseFixture(tool: Tool, anchor: string): Promise<ParserOutput> {
  const raw = await loadFixture(tool, anchor);
  return tool === "claude_code" ? parseClaudeCode(raw) : parseCodex(raw);
}

async function loadFixture(tool: Tool, anchor: string): Promise<string> {
  return Bun.file(
    join(FIXTURE_ROOT, tool, `${anchor}.jsonl`),
  ).text();
}

function listFixtureAnchors(): string[] {
  return ["claude_code", "codex"].flatMap((tool) =>
    [...new Bun.Glob("*.jsonl").scanSync({ cwd: join(FIXTURE_ROOT, tool) })]
      .map((entry) => entry.replace(/\.jsonl$/, "")),
  );
}

function assertRoute(output: ParserOutput, route: Route) {
  if (route.type === "metadata") {
    expect(output.messages.map((m) => m.kind)).toEqual(
      route.metaCategories.map(() => "metadata" as MessageKind),
    );
    expect(
      output.messages.map((m) => m.metaCategory ?? "(missing)"),
    ).toEqual(route.metaCategories);
  } else {
    expect(output.messages.map((message) => message.kind)).toEqual(route.kinds);
  }

  if (route.warnings === "none") {
    expect(output.warnings).toEqual([]);
  } else {
    expect(output.warnings.length).toBeGreaterThan(0);
  }
}
