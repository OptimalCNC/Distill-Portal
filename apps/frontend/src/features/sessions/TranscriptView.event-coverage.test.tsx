import "../../../test-setup";
import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TranscriptView } from "./TranscriptView";
import { dispatchParser, type ParsedSession } from "./parsers";
import type { SessionRow } from "./types";
import * as useParsedSessionModule from "./useParsedSession";

type Tool = "claude_code" | "codex";

type RenderTreatment =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system"
  | "boundary"
  | "system_with_boundary"
  | "unknown"
  | "skipped"
  | "task_lifecycle";

type RenderMatrixRow = {
  anchor: string;
  tool: Tool;
  treatment: RenderTreatment;
  skipMarker?: string;
};

type HookState =
  | { state: "idle" }
  | { state: "success"; parsed: ParsedSession };

let mockedHookState: HookState = { state: "idle" };

const REAL_USE_PARSED_SESSION = useParsedSessionModule.useParsedSession;
const REAL_USE_PARSED_SESSION_CACHE_MAX =
  useParsedSessionModule.USE_PARSED_SESSION_CACHE_MAX;
const REAL_BUMP_CACHE_EPOCH = useParsedSessionModule.bumpCacheEpoch;
const REAL_RESET_FOR_TESTS = useParsedSessionModule._resetForTests;

mock.module("./useParsedSession", () => ({
  useParsedSession: () => ({ ...mockedHookState, retry: () => {} }),
  USE_PARSED_SESSION_CACHE_MAX: REAL_USE_PARSED_SESSION_CACHE_MAX,
  bumpCacheEpoch: REAL_BUMP_CACHE_EPOCH,
  _resetForTests: REAL_RESET_FOR_TESTS,
}));

afterAll(() => {
  mock.module("./useParsedSession", () => ({
    useParsedSession: REAL_USE_PARSED_SESSION,
    USE_PARSED_SESSION_CACHE_MAX: REAL_USE_PARSED_SESSION_CACHE_MAX,
    bumpCacheEpoch: REAL_BUMP_CACHE_EPOCH,
    _resetForTests: REAL_RESET_FOR_TESTS,
  }));
});

afterEach(() => {
  cleanup();
  mockedHookState = { state: "idle" };
});

const NOW = "2026-05-16T03:00:00Z";

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../tests/fixtures/parser-events",
);

const ROWS: RenderMatrixRow[] = [
  { anchor: "claude-code-agent-name", tool: "claude_code", treatment: "skipped" },
  { anchor: "claude-code-ai-title", tool: "claude_code", treatment: "skipped" },
  { anchor: "claude-code-assistant-content-text", tool: "claude_code", treatment: "assistant" },
  { anchor: "claude-code-assistant-content-thinking", tool: "claude_code", treatment: "assistant" },
  { anchor: "claude-code-assistant-content-tool-use", tool: "claude_code", treatment: "tool_use" },
  { anchor: "claude-code-attachment", tool: "claude_code", treatment: "skipped" },
  { anchor: "claude-code-custom-title", tool: "claude_code", treatment: "skipped" },
  { anchor: "claude-code-file-history-snapshot", tool: "claude_code", treatment: "skipped" },
  { anchor: "claude-code-last-prompt", tool: "claude_code", treatment: "skipped" },
  { anchor: "claude-code-permission-mode", tool: "claude_code", treatment: "skipped" },
  { anchor: "claude-code-queue-operation", tool: "claude_code", treatment: "skipped" },
  { anchor: "claude-code-system", tool: "claude_code", treatment: "system" },
  { anchor: "claude-code-user-content-text", tool: "claude_code", treatment: "user" },
  { anchor: "claude-code-user-content-tool-result", tool: "claude_code", treatment: "tool_result" },
  { anchor: "claude-code-user-message-content-string", tool: "claude_code", treatment: "user" },
  { anchor: "codex-compacted", tool: "codex", treatment: "boundary" },
  { anchor: "codex-event-msg-agent-message", tool: "codex", treatment: "assistant" },
  { anchor: "codex-event-msg-agent-reasoning", tool: "codex", treatment: "assistant" },
  { anchor: "codex-event-msg-collab-agent-interaction-end", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-collab-agent-spawn-end", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-collab-close-end", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-collab-waiting-end", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-context-compacted", tool: "codex", treatment: "boundary" },
  { anchor: "codex-event-msg-entered-review-mode", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-error", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-exec-command-end", tool: "codex", treatment: "tool_result" },
  { anchor: "codex-event-msg-exited-review-mode", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-item-completed", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-mcp-tool-call-end", tool: "codex", treatment: "tool_result" },
  { anchor: "codex-event-msg-patch-apply-end", tool: "codex", treatment: "tool_result" },
  { anchor: "codex-event-msg-task-complete", skipMarker: "@unskip Phase 7c", tool: "codex", treatment: "task_lifecycle" },
  { anchor: "codex-event-msg-task-started", skipMarker: "@unskip Phase 7c", tool: "codex", treatment: "task_lifecycle" },
  { anchor: "codex-event-msg-thread-rolled-back", tool: "codex", treatment: "boundary" },
  { anchor: "codex-event-msg-token-count", tool: "codex", treatment: "skipped" },
  { anchor: "codex-event-msg-turn-aborted", tool: "codex", treatment: "system" },
  { anchor: "codex-event-msg-user-message", tool: "codex", treatment: "user" },
  { anchor: "codex-event-msg-web-search-end", tool: "codex", treatment: "tool_result" },
  { anchor: "codex-response-item-custom-tool-call", tool: "codex", treatment: "tool_use" },
  { anchor: "codex-response-item-custom-tool-call-output", tool: "codex", treatment: "tool_result" },
  { anchor: "codex-response-item-function-call", tool: "codex", treatment: "tool_use" },
  { anchor: "codex-response-item-function-call-output", tool: "codex", treatment: "tool_result" },
  { anchor: "codex-response-item-message-role-assistant", tool: "codex", treatment: "skipped" },
  { anchor: "codex-response-item-message-role-developer", tool: "codex", treatment: "system" },
  { anchor: "codex-response-item-message-role-user", tool: "codex", treatment: "skipped" },
  { anchor: "codex-response-item-reasoning", tool: "codex", treatment: "assistant" },
  { anchor: "codex-response-item-web-search-call", tool: "codex", treatment: "tool_use" },
  { anchor: "codex-session-meta", tool: "codex", treatment: "system_with_boundary" },
  { anchor: "codex-turn-context", tool: "codex", treatment: "skipped" },
];

for (const row of ROWS) {
  const run = row.skipMarker ? test.skip : test;
  run(`matrix: ${row.anchor} render treatment${row.skipMarker ? ` [${row.skipMarker}]` : ""}`, async () => {
    mockedHookState = {
      state: "success",
      parsed: await parseFixture(row.tool, row.anchor),
    };

    const { container } = render(
      <TranscriptView row={buildRow(row.tool, row.anchor)} now={NOW} />,
    );

    assertTreatment(container, row.treatment);
  });
}

test("matrix render coverage has one row per fixture", () => {
  expect(ROWS).toHaveLength(48);
  const rowAnchors = new Set(ROWS.map((row) => row.anchor));
  const fixtureAnchors = listFixtureAnchors();
  expect(fixtureAnchors).toHaveLength(ROWS.length);
  expect(fixtureAnchors.filter((anchor) => !rowAnchors.has(anchor))).toEqual([]);
});

async function parseFixture(tool: Tool, anchor: string): Promise<ParsedSession> {
  const raw = await Bun.file(
    join(FIXTURE_ROOT, tool, `${anchor}.jsonl`),
  ).text();
  return dispatchParser(tool, raw, {
    totalBytes: new TextEncoder().encode(raw).byteLength,
    truncated: false,
  });
}

function listFixtureAnchors(): string[] {
  return ["claude_code", "codex"].flatMap((tool) =>
    [...new Bun.Glob("*.jsonl").scanSync({ cwd: join(FIXTURE_ROOT, tool) })]
      .map((entry) => entry.replace(/\.jsonl$/, "")),
  );
}

function assertTreatment(container: HTMLElement, treatment: RenderTreatment) {
  switch (treatment) {
    case "user":
      expect(container.querySelector(".msg-user")).not.toBeNull();
      break;
    case "assistant":
      expect(container.querySelector(".msg-assistant")).not.toBeNull();
      break;
    case "tool_use":
      expect(container.querySelector(".msg-tool-use")).not.toBeNull();
      break;
    case "tool_result":
      expect(container.querySelector(".msg-tool-result")).not.toBeNull();
      break;
    case "system":
      expect(container.querySelector(".msg-system")).not.toBeNull();
      break;
    case "boundary":
      expect(container.querySelector(".msg-boundary")).not.toBeNull();
      break;
    case "system_with_boundary":
      expect(container.querySelector(".msg-system")).not.toBeNull();
      expect(container.querySelector(".msg-boundary")).not.toBeNull();
      break;
    case "unknown":
      expect(container.querySelector(".msg-unknown")).not.toBeNull();
      break;
    case "skipped":
      expect(container.querySelector(".transcript-empty-stream")).not.toBeNull();
      break;
    case "task_lifecycle":
      expect(container.querySelector(".msg-task-lifecycle")).not.toBeNull();
      break;
    default: {
      const _exhaustive: never = treatment;
      void _exhaustive;
    }
  }
}

function buildRow(tool: Tool, anchor: string): SessionRow {
  return {
    rowKey: `${tool}:${anchor}`,
    sourceSessionKey: `${tool}:${anchor}`,
    tool,
    sourceSessionId: anchor,
    title: anchor,
    titleSource: null,
    projectPath: "/workspace/distill-portal",
    sourcePath: `/workspace/distill-portal/${anchor}.jsonl`,
    sourcePathIsStale: false,
    sourceFingerprint: `fp-${anchor}`,
    createdAt: "2026-05-16T00:00:00Z",
    sourceUpdatedAt: "2026-05-16T00:00:00Z",
    ingestedAt: "2026-05-16T00:00:00Z",
    storedSessionUid: `uid-${anchor}`,
    storedRawRef: `raw/${anchor}.jsonl`,
    hasSubagentSidecars: false,
    status: "up_to_date",
    statusConflict: false,
    presence: "both",
  };
}
