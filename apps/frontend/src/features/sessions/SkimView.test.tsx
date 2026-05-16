// Component tests for the Phase-5 / M5 SkimView.
//
// SkimView is the second visible UI surface in Phase 5 that consumes
// the M3 parser pipeline. Test coverage maps 1:1 to m5-plan §8 +
// design.md §15 (state machine, four block-kind rendering, banner
// family, three-magnitude rhythm CSS source check, stagger animation,
// keep-mounted contract, a11y).
//
// Mocking strategy:
//   - useParsedSession is mocked via bun:test `mock.module` (same
//     pattern as TranscriptView.test.tsx). Each test passes in a
//     hand-rolled state. No fetch is fired.
//   - Per-block fixtures are hand-rolled minimal `ParsedSession`
//     literals via the local `makeMessage` / `makeBlock` /
//     `makeParsed` helpers (per planner Q6).
//
// IMPORTANT: bun:test's `mock.module` is process-wide and
// `mock.restore()` does NOT reset module mocks. We restore the
// original module at `afterAll` by re-installing the real export so
// other test files in the same `bun test` invocation see the
// production hook.

import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { SkimView } from "./SkimView";
import type {
  Message,
  ParsedSession,
  ParseWarning,
  SkimBlock,
} from "./parsers";
import type { SessionRow } from "./types";
import * as useParsedSessionModule from "./useParsedSession";

// Spec-literal copy constants — every test asserts against these exact
// strings (codex catch precedent #1: spec literal violation).
const COPY_DISABLED_PLACEHOLDER =
  'Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent\'s response inline.';
const COPY_EXPAND_TO_RAW = "Expand to raw messages";
const COPY_TRUNCATION =
  "Truncated at 5 MB — full payload not parsed. Use the Open raw anchor in the session header to inspect the full payload.";
const COPY_SKIM_OUTLINE_LABEL = "Session skim outline";

type HookState =
  | { state: "idle" }
  | { state: "no_raw"; reason: "source_only" }
  | { state: "loading" }
  | { state: "success"; parsed: ParsedSession }
  | { state: "truncated"; parsed: ParsedSession }
  | { state: "error"; error: Error };

let mockedHookState: HookState = { state: "idle" };
let mockedRetryFn: () => void = () => {};

const REAL_USE_PARSED_SESSION = useParsedSessionModule.useParsedSession;
const REAL_USE_PARSED_SESSION_CACHE_MAX =
  useParsedSessionModule.USE_PARSED_SESSION_CACHE_MAX;
const REAL_BUMP_CACHE_EPOCH = useParsedSessionModule.bumpCacheEpoch;
const REAL_RESET_FOR_TESTS = useParsedSessionModule._resetForTests;

mock.module("./useParsedSession", () => ({
  useParsedSession: () => ({ ...mockedHookState, retry: mockedRetryFn }),
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

const NOW = "2026-04-25T12:00:00Z";

afterEach(() => {
  cleanup();
  mockedHookState = { state: "idle" };
  mockedRetryFn = () => {};
});

let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function buildRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    rowKey: "claude_code:skim-fixture",
    sourceSessionKey: "claude_code:skim-fixture",
    tool: "claude_code",
    sourceSessionId: "skim-fixture",
    title: "Skim fixture",
    titleSource: null,
    projectPath: "/projects/skim",
    sourcePath: "/srv/sessions/skim-fixture.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-skim",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-25T11:55:00Z",
    ingestedAt: "2026-04-25T11:50:00Z",
    storedSessionUid: "uid-skim-fixture",
    storedRawRef: "raw/uid-skim-fixture.ndjson",
    hasSubagentSidecars: false,
    status: "up_to_date",
    statusConflict: false,
    presence: "both",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  const base: Message = {
    lineOrdinal: 0,
    messageIndex: 0,
    timestamp: "2026-04-25T11:55:00Z",
    kind: "user",
    text: "Hello",
    raw: '{"type":"user"}',
    bytes: 5,
  };
  return { ...base, ...overrides };
}

function makeBlock(overrides: Partial<SkimBlock> & { kind: SkimBlock["kind"] }): SkimBlock {
  const base: SkimBlock = {
    kind: overrides.kind,
    start: 0,
    end: 0,
  };
  return { ...base, ...overrides };
}

function makeParsed(
  messages: Message[],
  skim: SkimBlock[],
  extras: Partial<ParsedSession> = {},
): ParsedSession {
  return {
    tool: "claude_code",
    messages,
    skim,
    totalBytes: messages.reduce((acc, m) => acc + m.bytes, 0),
    truncated: false,
    warnings: [],
    ...extras,
  };
}

// ==========================================================================
// State machine
// ==========================================================================

test("state idle → 'Select a session' empty copy", () => {
  mockedHookState = { state: "idle" };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(container.querySelector(".skim-empty")?.textContent).toBe(
    "Select a session to read its skim outline.",
  );
});

test("state no_raw → 'not yet imported' copy with bolded Import", () => {
  mockedHookState = { state: "no_raw", reason: "source_only" };
  const { container } = render(
    <SkimView row={buildRow({ storedSessionUid: null })} now={NOW} />,
  );
  const p = container.querySelector(".skim-not-imported");
  expect(p?.textContent).toContain("This session has not been imported yet");
  expect(p?.querySelector("strong")?.textContent).toBe("Import");
});

test("state loading → 'Reading session…' verbatim", () => {
  mockedHookState = { state: "loading" };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(container.querySelector(".skim-loading")?.textContent).toBe(
    "Reading session…",
  );
});

test("state error → error message + Retry button; click Retry calls result.retry()", () => {
  let retried = 0;
  mockedRetryFn = () => {
    retried += 1;
  };
  mockedHookState = {
    state: "error",
    error: new Error("network blew up"),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const errorBlock = container.querySelector(".skim-error-block");
  expect(errorBlock).not.toBeNull();
  expect(errorBlock?.textContent).toContain("Could not load session:");
  expect(errorBlock?.textContent).toContain("network blew up");
  const retryBtn = errorBlock?.querySelector(
    ".skim-retry",
  ) as HTMLButtonElement | null;
  expect(retryBtn?.textContent).toBe("Retry");
  act(() => {
    retryBtn?.click();
  });
  expect(retried).toBe(1);
});

test("state success with empty skim array → 'No skim blocks parsed.' copy", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], []),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(
    container.querySelector(".skim-empty-stream")?.textContent,
  ).toBe("No skim blocks parsed.");
});

// ==========================================================================
// user_turn rendering
// ==========================================================================

test("user_turn renders the user message body inline inside the accent panel", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "Hi there", messageIndex: 0 }),
        makeMessage({ kind: "assistant", text: "Sure", messageIndex: 1 }),
      ],
      [makeBlock({ kind: "user_turn", start: 0, end: 1 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const panel = container.querySelector(".skim-user-panel");
  expect(panel).not.toBeNull();
  expect(panel?.querySelector(".skim-user-body")?.textContent).toContain(
    "Hi there",
  );
});

test("user_turn renders code-fenced segments via renderBodyWithCode", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "user",
          text: "before\n```\ncode here\n```\nafter",
          messageIndex: 0,
        }),
      ],
      [makeBlock({ kind: "user_turn", start: 0, end: 0 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const pre = container.querySelector(".skim-user-body .msg-code-block");
  expect(pre).not.toBeNull();
  expect(pre?.textContent).toContain("code here");
});

test("user_turn 'Agent reaction (N messages)' summary uses N = block.end - block.start", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "u", messageIndex: 0 }),
        makeMessage({ kind: "assistant", text: "a1", messageIndex: 1 }),
        makeMessage({ kind: "assistant", text: "a2", messageIndex: 2 }),
        makeMessage({ kind: "assistant", text: "a3", messageIndex: 3 }),
      ],
      [makeBlock({ kind: "user_turn", start: 0, end: 3 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const summary = container.querySelector(".skim-agent-reaction-summary");
  expect(summary?.textContent).toBe("Agent reaction (3 messages)");
});

test("user_turn N=0 (no agent reaction) → 'Agent reaction (0 messages)'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [makeMessage({ kind: "user", text: "u", messageIndex: 0 })],
      [makeBlock({ kind: "user_turn", start: 0, end: 0 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(
    container.querySelector(".skim-agent-reaction-summary")?.textContent,
  ).toBe("Agent reaction (0 messages)");
});

test("user_turn N=1 → 'Agent reaction (1 messages)' (spec literal beats grammar)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "u", messageIndex: 0 }),
        makeMessage({ kind: "assistant", text: "a", messageIndex: 1 }),
      ],
      [makeBlock({ kind: "user_turn", start: 0, end: 1 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(
    container.querySelector(".skim-agent-reaction-summary")?.textContent,
  ).toBe("Agent reaction (1 messages)");
});

test("user_turn disabled placeholder copy renders verbatim per spec line 687", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [makeMessage({ kind: "user", text: "u", messageIndex: 0 })],
      [makeBlock({ kind: "user_turn", start: 0, end: 0 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const placeholder = container.querySelector(".skim-summary-disabled");
  expect(placeholder?.textContent).toBe(COPY_DISABLED_PLACEHOLDER);
});

test("user_turn 'Expand to raw messages' affordance is present + activatable", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "u", messageIndex: 0 }),
        makeMessage({ kind: "assistant", text: "a", messageIndex: 1 }),
      ],
      [makeBlock({ kind: "user_turn", start: 0, end: 1 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const summary = container.querySelector(".skim-expand-raw-summary");
  expect(summary).not.toBeNull();
  expect(summary?.textContent).toBe(COPY_EXPAND_TO_RAW);
});

test("user_turn expand-to-raw mounts a scoped TranscriptView with messageRange={start+1, end}", () => {
  // Three-message stream: user (idx 0), assistant (1), assistant (2).
  // user_turn block: {start:0, end:2} → expand reveals only messages
  // 1, 2 (the agent reaction). NB: the inner <details> body is in the
  // DOM regardless of open state (native <details> hides the body via
  // `display: none` but leaves it mounted).
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "u", messageIndex: 0 }),
        makeMessage({ kind: "assistant", text: "first agent", messageIndex: 1 }),
        makeMessage({ kind: "assistant", text: "second agent", messageIndex: 2 }),
      ],
      [makeBlock({ kind: "user_turn", start: 0, end: 2 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const innerBody = container.querySelector(".skim-expand-raw-body");
  expect(innerBody).not.toBeNull();
  // The scoped TranscriptView renders only messages [start+1, end]
  // inclusive: messages at index 1 and 2.
  expect(innerBody?.textContent).toContain("first agent");
  expect(innerBody?.textContent).toContain("second agent");
  // The user message at index 0 is NOT rendered inside the scoped
  // TranscriptView (it's the panel above).
  expect(innerBody?.querySelectorAll(".msg-li").length).toBe(2);
});

// ==========================================================================
// boundary rendering
// ==========================================================================

test("boundary block with subtype='session_resumed' renders 'SESSION RESUMED'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "boundary",
          boundarySubtype: "session_resumed",
          messageIndex: 0,
          text: "",
        }),
      ],
      [
        makeBlock({
          kind: "boundary",
          start: 0,
          end: 0,
          meta: { subtype: "session_resumed" },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const label = container.querySelector(".boundary-row-label");
  expect(label?.textContent).toBe("SESSION RESUMED");
});

test("boundary block with subtype='compacted' renders 'CONVERSATION COMPACTED'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "boundary",
          boundarySubtype: "compacted",
          messageIndex: 0,
          text: "",
        }),
      ],
      [
        makeBlock({
          kind: "boundary",
          start: 0,
          end: 0,
          meta: { subtype: "compacted" },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(
    container.querySelector(".boundary-row-label")?.textContent,
  ).toBe("CONVERSATION COMPACTED");
});

test("boundary block carries role='separator' and aria-orientation='horizontal'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "boundary",
          boundarySubtype: "session_resumed",
          messageIndex: 0,
          text: "",
        }),
      ],
      [
        makeBlock({
          kind: "boundary",
          start: 0,
          end: 0,
          meta: { subtype: "session_resumed" },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const sep = container.querySelector('[role="separator"]');
  expect(sep).not.toBeNull();
  expect(sep?.getAttribute("aria-orientation")).toBe("horizontal");
});

test("boundary block uses BoundaryRow shared component (byte-equivalent class names)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "boundary",
          boundarySubtype: "session_resumed",
          messageIndex: 0,
          text: "",
        }),
      ],
      [
        makeBlock({
          kind: "boundary",
          start: 0,
          end: 0,
          meta: { subtype: "session_resumed" },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const li = container.querySelector('[role="separator"]') as HTMLElement;
  expect(li.classList.contains("boundary-row")).toBe(true);
  expect(li.classList.contains("msg-boundary")).toBe(true);
});

// ==========================================================================
// agent_only rendering
// ==========================================================================

test("agent_only summary text 'Agent-only session (N messages)' uses N = end - start + 1", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "system", text: "boot", messageIndex: 0 }),
        makeMessage({ kind: "assistant", text: "a1", messageIndex: 1 }),
        makeMessage({ kind: "assistant", text: "a2", messageIndex: 2 }),
      ],
      [makeBlock({ kind: "agent_only", start: 0, end: 2 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(
    container.querySelector(".skim-agent-only-summary")?.textContent,
  ).toBe("Agent-only session (3 messages)");
});

test("agent_only N=1 → 'Agent-only session (1 messages)' (spec literal beats grammar)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [makeMessage({ kind: "assistant", text: "lone", messageIndex: 0 })],
      [makeBlock({ kind: "agent_only", start: 0, end: 0 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(
    container.querySelector(".skim-agent-only-summary")?.textContent,
  ).toBe("Agent-only session (1 messages)");
});

test("agent_only is collapsed by default (<details> without 'open')", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [makeMessage({ kind: "assistant", text: "x", messageIndex: 0 })],
      [makeBlock({ kind: "agent_only", start: 0, end: 0 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const details = container.querySelector(
    ".skim-agent-only",
  ) as HTMLDetailsElement;
  expect(details.open).toBe(false);
});

test("agent_only body mounts a scoped TranscriptView spanning [start, end]", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "system", text: "sys", messageIndex: 0 }),
        makeMessage({ kind: "assistant", text: "alpha", messageIndex: 1 }),
      ],
      [makeBlock({ kind: "agent_only", start: 0, end: 1 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const body = container.querySelector(".skim-agent-only-body");
  expect(body).not.toBeNull();
  expect(body?.textContent).toContain("sys");
  expect(body?.textContent).toContain("alpha");
});

test("agent_only empty-stream sentinel ({start:0, end:-1}) → 'Agent-only session (0 messages)'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [],
      [
        makeBlock({
          kind: "agent_only",
          start: 0,
          end: -1,
          meta: { empty: 1 },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(
    container.querySelector(".skim-agent-only-summary")?.textContent,
  ).toBe("Agent-only session (0 messages)");
  // The expanded body, when revealed, mounts a TranscriptView with an
  // empty range → "No messages parsed." (TranscriptView's empty
  // copy).
  const body = container.querySelector(".skim-agent-only-body");
  expect(body?.textContent).toContain("No messages parsed.");
});

// ==========================================================================
// oversized_user_message rendering
// ==========================================================================

test("oversized summary text 'Oversized user message (N KB) — collapsed by default' uses Math.round", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "user",
          text: "x".repeat(70_000),
          messageIndex: 0,
          bytes: 70_000,
        }),
      ],
      [
        makeBlock({
          kind: "oversized_user_message",
          start: 0,
          end: 0,
          meta: { sizeBytes: 70_000 },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  // Math.round(70000/1024) = Math.round(68.359375) = 68.
  expect(
    container.querySelector(".skim-oversized-summary")?.textContent,
  ).toBe("Oversized user message (68 KB) — collapsed by default");
});

test("oversized is collapsed by default (<details> without 'open')", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "user",
          text: "x".repeat(65_537),
          messageIndex: 0,
          bytes: 65_537,
        }),
      ],
      [
        makeBlock({
          kind: "oversized_user_message",
          start: 0,
          end: 0,
          meta: { sizeBytes: 65_537 },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const details = container.querySelector(
    ".skim-oversized",
  ) as HTMLDetailsElement;
  expect(details.open).toBe(false);
});

test("oversized body shows verbatim text in <pre class='skim-oversized-pre'>", () => {
  const verbatim = "first line\nsecond line\nthird line";
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "user",
          text: verbatim,
          messageIndex: 0,
          bytes: 65_537,
        }),
      ],
      [
        makeBlock({
          kind: "oversized_user_message",
          start: 0,
          end: 0,
          meta: { sizeBytes: 65_537 },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const pre = container.querySelector(".skim-oversized-pre");
  expect(pre?.tagName.toLowerCase()).toBe("pre");
  expect(pre?.textContent).toBe(verbatim);
});

test("oversized text is rendered VERBATIM (not summarized)", () => {
  const longText = "a".repeat(100_000);
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "user",
          text: longText,
          messageIndex: 0,
          bytes: 100_000,
        }),
      ],
      [
        makeBlock({
          kind: "oversized_user_message",
          start: 0,
          end: 0,
          meta: { sizeBytes: 100_000 },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const pre = container.querySelector(".skim-oversized-pre");
  expect(pre?.textContent?.length).toBe(100_000);
});

test("oversized block has class 'skim-block-oversized' (warn-tinted left border target)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "user",
          text: "huge",
          messageIndex: 0,
          bytes: 65_537,
        }),
      ],
      [
        makeBlock({
          kind: "oversized_user_message",
          start: 0,
          end: 0,
          meta: { sizeBytes: 65_537 },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(container.querySelector(".skim-block-oversized")).not.toBeNull();
});

// ==========================================================================
// Truncation banner + parse-warnings banner
// ==========================================================================

test("state truncated → truncation banner with verbatim spec copy", () => {
  mockedHookState = {
    state: "truncated",
    parsed: { ...makeParsed([], []), truncated: true },
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const banner = container.querySelector(".skim-banner-truncation");
  expect(banner).not.toBeNull();
  expect(banner?.getAttribute("role")).toBe("status");
  expect(banner?.textContent).toBe(COPY_TRUNCATION);
  expect(banner?.querySelector("strong")?.textContent).toBe("Open raw");
});

test("state success (not truncated) → NO truncation banner", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [makeMessage({ kind: "user", text: "x", messageIndex: 0 })],
      [makeBlock({ kind: "user_turn", start: 0, end: 0 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(container.querySelector(".skim-banner-truncation")).toBeNull();
});

const ONE_WARNING: ParseWarning[] = [
  {
    lineOrdinal: 12,
    severity: "warning",
    category: "schema",
    reason: "unknown role",
  },
];
const TWO_WARNINGS: ParseWarning[] = [
  {
    lineOrdinal: 12,
    severity: "warning",
    category: "schema",
    reason: "unknown role",
  },
  {
    lineOrdinal: 47,
    severity: "error",
    category: "payload",
    reason: "missing field",
  },
];

test("warnings.length > 0 → banner renders ('1 parse warnings' for N=1)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], [], { warnings: ONE_WARNING }),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  expect(
    container.querySelector(".skim-banner-warnings summary")?.textContent,
  ).toBe("1 parse warnings — click to view.");
});

test("clicking Dismiss unmounts the warnings banner (component-local state)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], [], { warnings: ONE_WARNING }),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const dismissBtn = container.querySelector(
    ".skim-banner-dismiss",
  ) as HTMLButtonElement;
  expect(dismissBtn.textContent).toBe("Dismiss");
  act(() => {
    dismissBtn.click();
  });
  expect(container.querySelector(".skim-banner-warnings")).toBeNull();
});

test("warnings banner re-arrives after row.rowKey changes (defensive reset)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], [], { warnings: TWO_WARNINGS }),
  };
  const { container, rerender } = render(
    <SkimView row={buildRow({ rowKey: "claude_code:row-A" })} now={NOW} />,
  );
  // Dismiss.
  act(() => {
    (
      container.querySelector(".skim-banner-dismiss") as HTMLButtonElement
    ).click();
  });
  expect(container.querySelector(".skim-banner-warnings")).toBeNull();
  // rowKey change → defensive useEffect resets dismissed state.
  rerender(
    <SkimView row={buildRow({ rowKey: "claude_code:row-B" })} now={NOW} />,
  );
  expect(container.querySelector(".skim-banner-warnings")).not.toBeNull();
});

// ==========================================================================
// Stagger animation
// ==========================================================================

test("first block carries style.animationDelay='0ms'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [makeMessage({ kind: "user", text: "u", messageIndex: 0 })],
      [makeBlock({ kind: "user_turn", start: 0, end: 0 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const li = container.querySelector(".skim-block") as HTMLElement;
  expect(li.style.animationDelay).toBe("0ms");
});

test("second block carries style.animationDelay='40ms' (per spec line 75: 40ms × N)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
        makeMessage({ kind: "user", text: "u2", messageIndex: 1 }),
      ],
      [
        makeBlock({ kind: "user_turn", start: 0, end: 0 }),
        makeBlock({ kind: "user_turn", start: 1, end: 1 }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const lis = container.querySelectorAll(".skim-block");
  expect((lis[0] as HTMLElement).style.animationDelay).toBe("0ms");
  expect((lis[1] as HTMLElement).style.animationDelay).toBe("40ms");
});

test("stagger cap at 8 blocks: indices 8, 9, 10 all carry style.animationDelay='320ms'", () => {
  // Build 11 user_turn blocks. Indices 0..7 → 0..280ms; 8..10 → 320ms.
  const messages: Message[] = [];
  const skim: SkimBlock[] = [];
  for (let i = 0; i < 11; i++) {
    messages.push(makeMessage({ kind: "user", text: `u${i}`, messageIndex: i }));
    skim.push(makeBlock({ kind: "user_turn", start: i, end: i }));
  }
  mockedHookState = {
    state: "success",
    parsed: makeParsed(messages, skim),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const lis = container.querySelectorAll(".skim-block");
  expect(lis.length).toBe(11);
  expect((lis[7] as HTMLElement).style.animationDelay).toBe("280ms");
  expect((lis[8] as HTMLElement).style.animationDelay).toBe("320ms");
  expect((lis[9] as HTMLElement).style.animationDelay).toBe("320ms");
  expect((lis[10] as HTMLElement).style.animationDelay).toBe("320ms");
});

// ==========================================================================
// a11y + structural
// ==========================================================================

test("section root carries aria-label='Session skim outline'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [makeMessage({ kind: "user", text: "x", messageIndex: 0 })],
      [makeBlock({ kind: "user_turn", start: 0, end: 0 })],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const section = container.querySelector(".skim-body");
  expect(section?.tagName.toLowerCase()).toBe("section");
  expect(section?.getAttribute("aria-label")).toBe(COPY_SKIM_OUTLINE_LABEL);
});

test("skim stream renders as <ol> with one <li> per block (in order)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
        makeMessage({
          kind: "boundary",
          boundarySubtype: "session_resumed",
          messageIndex: 1,
          text: "",
        }),
        makeMessage({ kind: "user", text: "u2", messageIndex: 2 }),
      ],
      [
        makeBlock({ kind: "user_turn", start: 0, end: 0 }),
        makeBlock({
          kind: "boundary",
          start: 1,
          end: 1,
          meta: { subtype: "session_resumed" },
        }),
        makeBlock({ kind: "user_turn", start: 2, end: 2 }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const ol = container.querySelector(".skim-stream");
  expect(ol?.tagName.toLowerCase()).toBe("ol");
  expect(ol?.children.length).toBe(3);
  const kinds = Array.from(ol!.children).map((li) => {
    if (li.classList.contains("skim-block-user-turn")) return "user_turn";
    if (li.classList.contains("boundary-row")) return "boundary";
    return "?";
  });
  expect(kinds).toEqual(["user_turn", "boundary", "user_turn"]);
});

// ==========================================================================
// Three-magnitude rhythm (CSS source string smoke tests)
// ==========================================================================

test("rhythm rule: 24px between same-kind adjacent skim blocks", async () => {
  const cssPath = new URL("./SkimView.css", import.meta.url).pathname;
  const css = await Bun.file(cssPath).text();
  expect(css).toMatch(
    /\.skim-stream\s*>\s*\.skim-block\s*\+\s*\.skim-block\s*\{[^}]*margin-top:\s*var\(--space-6\)/,
  );
});

test("rhythm rule: 32px override between different-kind adjacent skim blocks", async () => {
  const cssPath = new URL("./SkimView.css", import.meta.url).pathname;
  const css = await Bun.file(cssPath).text();
  expect(css).toMatch(/skim-block-user-turn\s*\+\s*\.skim-block-agent-only/);
  expect(css).toMatch(/skim-block-agent-only\s*\+\s*\.skim-block-oversized/);
});

test("rhythm rule: 32px around .boundary-row blocks", async () => {
  const cssPath = new URL("./SkimView.css", import.meta.url).pathname;
  const css = await Bun.file(cssPath).text();
  expect(css).toMatch(
    /\.skim-stream\s*>\s*\.boundary-row[^{]*\{[^}]*margin-top:\s*var\(--space-8\)/,
  );
});

test("stagger keyframe animates ONLY opacity + transform: translateY (motion budget compliance)", async () => {
  const cssPath = new URL("./SkimView.css", import.meta.url).pathname;
  const css = await Bun.file(cssPath).text();
  expect(css).toMatch(/@keyframes\s+skim-block-fade-in\s*\{/);
  // The keyframe body must NOT mention `top`, `padding`, `width`,
  // `height`, `color`, `border-color`, `background-color`,
  // `font-size`, `letter-spacing`, `line-height`.
  const keyframeBody = css.match(
    /@keyframes\s+skim-block-fade-in\s*\{([^}]+\}[^}]+)\}/,
  )?.[1] ?? "";
  expect(keyframeBody).toMatch(/opacity/);
  expect(keyframeBody).toMatch(/translateY/);
  expect(keyframeBody).not.toMatch(
    /\b(top|padding|width|height|color|border-color|background-color|font-size|letter-spacing|line-height)\s*:/,
  );
});

test("SkimView.css does NOT declare any forbidden transition", async () => {
  const cssPath = new URL("./SkimView.css", import.meta.url).pathname;
  const css = await Bun.file(cssPath).text();
  // Strip block comments before grepping — the file's header comment
  // lists the forbidden transitions in prose for documentation.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  expect(stripped).not.toMatch(
    /transition:\s*(color|border-color|width|height|top|padding|margin|font-size|letter-spacing|line-height)\b/,
  );
});

// ==========================================================================
// Keep-mounted regression
// ==========================================================================

test("native <details> open state survives a 'now' prop change", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "u", messageIndex: 0 }),
        makeMessage({ kind: "assistant", text: "a", messageIndex: 1 }),
      ],
      [makeBlock({ kind: "user_turn", start: 0, end: 1 })],
    ),
  };
  const { container, rerender } = render(
    <SkimView row={buildRow()} now={NOW} />,
  );
  const details = container.querySelector(
    ".skim-agent-reaction",
  ) as HTMLDetailsElement;
  // Open the disclosure directly (the native element manages this
  // attribute; programmatic toggle works in happy-dom).
  details.open = true;
  expect(details.open).toBe(true);
  // Bump `now` only — same row identity. The component must not
  // remount its tree, so the same <details> element retains open=true.
  rerender(<SkimView row={buildRow()} now="2026-04-25T12:01:00Z" />);
  const detailsAfter = container.querySelector(
    ".skim-agent-reaction",
  ) as HTMLDetailsElement;
  expect(detailsAfter).toBe(details);
  expect(detailsAfter.open).toBe(true);
});

test("SkimView root is a <section> element with NO key attribute (keep-mounted contract)", async () => {
  // Smoke test on the source — codex precedent #2 guards against
  // accidental key= on the root.
  const tsxPath = new URL("./SkimView.tsx", import.meta.url).pathname;
  const tsx = await Bun.file(tsxPath).text();
  // The <section className="skim-body" ...> opening tag must NOT
  // carry key= on the same line.
  expect(tsx).toMatch(
    /<section[^>]*className="skim-body"[^>]*aria-label="Session skim outline"[^>]*>/,
  );
  // No key= attribute on that section opening tag.
  const sectionMatch = tsx.match(
    /<section[^>]*className="skim-body"[^>]*>/,
  );
  expect(sectionMatch?.[0]).not.toMatch(/\skey=/);
});

// ==========================================================================
// Stream order with mixed block kinds
// ==========================================================================

test("mixed user_turn → boundary → agent_only → oversized renders four blocks in order", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
        makeMessage({
          kind: "boundary",
          boundarySubtype: "compacted",
          messageIndex: 1,
          text: "",
        }),
        makeMessage({ kind: "assistant", text: "agent", messageIndex: 2 }),
        makeMessage({
          kind: "user",
          text: "x".repeat(70_000),
          messageIndex: 3,
          bytes: 70_000,
        }),
      ],
      [
        makeBlock({ kind: "user_turn", start: 0, end: 0 }),
        makeBlock({
          kind: "boundary",
          start: 1,
          end: 1,
          meta: { subtype: "compacted" },
        }),
        makeBlock({ kind: "agent_only", start: 2, end: 2 }),
        makeBlock({
          kind: "oversized_user_message",
          start: 3,
          end: 3,
          meta: { sizeBytes: 70_000 },
        }),
      ],
    ),
  };
  const { container } = render(<SkimView row={buildRow()} now={NOW} />);
  const ol = container.querySelector(".skim-stream");
  expect(ol?.children.length).toBe(4);
  const childKinds = Array.from(ol!.children).map((li) => {
    if (li.classList.contains("skim-block-user-turn")) return "user_turn";
    if (li.classList.contains("boundary-row")) return "boundary";
    if (li.classList.contains("skim-block-agent-only")) return "agent_only";
    if (li.classList.contains("skim-block-oversized")) return "oversized";
    return "?";
  });
  expect(childKinds).toEqual([
    "user_turn",
    "boundary",
    "agent_only",
    "oversized",
  ]);
});
