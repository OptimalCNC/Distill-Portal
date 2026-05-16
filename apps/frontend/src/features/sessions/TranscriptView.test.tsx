// Component tests for the Phase-5 / M4 TranscriptView.
//
// The TranscriptView is the first visible UI surface in Phase 5
// that consumes parsed message data. Test coverage maps 1:1 to
// m4-plan §8 (state machine, per-kind rendering, boundary
// subtypes, timestamp display, truncation banner, parse-warnings
// banner, tool_result expand, code-fence detection, keep-mounted
// regression, a11y).
//
// Mocking strategy:
//   - useParsedSession is mocked via bun:test `mock.module` so each
//     test passes in a hand-rolled state. No fetch is fired.
//   - Per-kind rendering tests build minimal `Message` objects
//     directly via a `makeMessage` helper.
//   - Component-local state (warnings dismissal) is exercised
//     through real interactions.
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import {
  TranscriptView,
  renderUnknownLine,
  splitToolResult,
} from "./TranscriptView";
import type {
  Message,
  ParsedSession,
  ParseWarning,
  SkimBlock,
} from "./parsers";
import type { SessionRow } from "./types";
import * as useParsedSessionModule from "./useParsedSession";

// Bun's `mock.module` lets us swap useParsedSession at module load.
// CRITICAL: bun:test's `mock.module` is process-wide and `mock.restore()`
// does NOT reset module mocks (per
// https://bun.sh/docs/test/mocks). We restore the original module at
// `afterAll` by re-installing the real export so other test files in
// the same `bun test` invocation (e.g. SessionView.test.tsx,
// useParsedSession.test.ts) see the production hook.
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
  // Restore the real hook so subsequent test files in this `bun
  // test` invocation see the production implementation.
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

function buildRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    rowKey: "claude_code:transcript-fixture",
    sourceSessionKey: "claude_code:transcript-fixture",
    tool: "claude_code",
    sourceSessionId: "transcript-fixture",
    title: "Transcript fixture",
    titleSource: null,
    projectPath: "/projects/transcript",
    sourcePath: "/srv/sessions/transcript-fixture.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-transcript",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-25T11:55:00Z",
    ingestedAt: "2026-04-25T11:50:00Z",
    storedSessionUid: "uid-transcript-fixture",
    storedRawRef: "raw/uid-transcript-fixture.ndjson",
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

function makeParsed(
  messages: Message[],
  extras: Partial<ParsedSession> = {},
): ParsedSession {
  const skim: SkimBlock[] = extras.skim ?? [];
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

let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ==========================================================================
// State machine
// ==========================================================================

test("state idle → 'Select a session' empty copy", () => {
  mockedHookState = { state: "idle" };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".transcript-empty")?.textContent).toBe(
    "Select a session to read its transcript.",
  );
});

test("state no_raw → 'not yet imported' copy with bolded Import", () => {
  mockedHookState = { state: "no_raw", reason: "source_only" };
  const { container } = render(
    <TranscriptView
      row={buildRow({ storedSessionUid: null })}
      now={NOW}
    />,
  );
  const p = container.querySelector(".transcript-not-imported");
  expect(p?.textContent).toContain(
    "This session has not been imported yet",
  );
  expect(p?.querySelector("strong")?.textContent).toBe("Import");
});

test("state loading → 'Reading session…' verbatim", () => {
  mockedHookState = { state: "loading" };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".transcript-loading")?.textContent).toBe(
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
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const errorBlock = container.querySelector(".transcript-error-block");
  expect(errorBlock).not.toBeNull();
  expect(errorBlock?.textContent).toContain("Could not load session:");
  expect(errorBlock?.textContent).toContain("network blew up");
  const retryBtn = errorBlock?.querySelector(
    ".transcript-retry",
  ) as HTMLButtonElement | null;
  expect(retryBtn).not.toBeNull();
  expect(retryBtn?.textContent).toBe("Retry");
  act(() => {
    retryBtn?.click();
  });
  expect(retried).toBe(1);
});

test("state success with empty messages → 'No messages parsed.' copy", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(
    container.querySelector(".transcript-empty-stream")?.textContent,
  ).toBe("No messages parsed.");
});

// ==========================================================================
// Per-kind rendering
// ==========================================================================

test("renders user kind with attribution row + body + relative time", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "user",
        text: "Hi there",
        timestamp: "2026-04-25T11:55:00Z",
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const panel = container.querySelector(".msg-user");
  expect(panel).not.toBeNull();
  expect(panel?.querySelector(".msg-attr")?.textContent).toContain("User");
  expect(panel?.querySelector(".msg-body")?.textContent).toContain(
    "Hi there",
  );
  // Relative time should render (5m ago).
  const time = panel?.querySelector("time");
  expect(time?.getAttribute("dateTime")).toBe("2026-04-25T11:55:00Z");
  expect(time?.textContent).toBe("5m ago");
});

test("renders assistant kind with msg-assistant modifier", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "assistant", text: "Sure" }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".msg-assistant")).not.toBeNull();
  expect(container.querySelector(".msg-user")).toBeNull();
});

test("renders lone tool_use as an orphan lifecycle card (in-flight)", () => {
  // Phase 7c: a lone `tool_use` with no following `tool_result` is an
  // orphan lifecycle — the renderHints layer emits `kind: "lifecycle"`
  // with `pairWithIndex: null` and the visual is `.msg-lifecycle[data-
  // status="in-flight"]`. Per design.md §3.5 (orphan affordances).
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_use",
        toolName: "Read",
        text: '{\n  "path": "/foo"\n}',
        bytes: 20,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const lifecycle = container.querySelector(".msg-lifecycle");
  expect(lifecycle).not.toBeNull();
  expect(lifecycle?.getAttribute("data-status")).toBe("in-flight");
  // No standalone .msg-tool-use panel (the lifecycle owns the surface).
  expect(container.querySelector(".msg-tool-use")).toBeNull();
  expect(container.querySelector(".tool-name")?.textContent).toBe("Read");
});

test("renders tool_result UNDER 2 KB without expand affordance", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_result",
        toolName: "Read",
        text: "short result",
        bytes: 12,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".msg-tool-result")).not.toBeNull();
  expect(
    container.querySelector(".msg-tool-result-head")?.textContent,
  ).toBe("short result");
  expect(container.querySelector(".msg-tool-overflow")).toBeNull();
});

test("renders system kind as muted single-line with 'system ·' aria-hidden glyph", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "system", text: "Session metadata loaded" }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const sys = container.querySelector(".msg-system");
  expect(sys).not.toBeNull();
  expect(sys?.textContent).toContain("Session metadata loaded");
  const glyph = sys?.querySelector(".msg-system-glyph");
  expect(glyph?.getAttribute("aria-hidden")).toBe("true");
  expect(glyph?.textContent).toBe("system ·");
});

test("renders boundary 'session_resumed' with role=separator + 'SESSION RESUMED' label", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "boundary",
        boundarySubtype: "session_resumed",
        text: "",
        bytes: 0,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const boundary = container.querySelector(".msg-boundary");
  expect(boundary).not.toBeNull();
  expect(boundary?.getAttribute("role")).toBe("separator");
  expect(boundary?.getAttribute("aria-orientation")).toBe("horizontal");
  expect(
    boundary?.querySelector(".msg-boundary-label")?.textContent,
  ).toBe("SESSION RESUMED");
});

test("renders unknown kind with 'Unrecognized line: …' prefix", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "unknown",
        text: "weird payload",
        bytes: 13,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const unk = container.querySelector(".msg-unknown");
  expect(unk).not.toBeNull();
  expect(unk?.textContent).toContain("Unrecognized line:");
  expect(
    unk?.querySelector(".msg-unknown-payload")?.textContent,
  ).toBe("weird payload");
});

// ==========================================================================
// Boundary subtypes
// ==========================================================================

test("boundary subtype 'compacted' → 'CONVERSATION COMPACTED' label", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "boundary",
        boundarySubtype: "compacted",
        text: "",
        bytes: 0,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(
    container.querySelector(".msg-boundary-label")?.textContent,
  ).toBe("CONVERSATION COMPACTED");
});

test("boundary message has NO <time> element (Q7 in m4-plan)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "boundary",
        boundarySubtype: "session_resumed",
        text: "",
        bytes: 0,
        timestamp: "2026-04-25T11:55:00Z",
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const boundary = container.querySelector(".msg-boundary");
  expect(boundary?.querySelector("time")).toBeNull();
});

// ==========================================================================
// Timestamp display
// ==========================================================================

test("non-null timestamp → <time dateTime title> with relative-time text", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "user",
        text: "hi",
        timestamp: "2026-04-25T10:00:00Z",
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const time = container.querySelector("time");
  expect(time?.getAttribute("dateTime")).toBe("2026-04-25T10:00:00Z");
  expect(time?.getAttribute("title")).toBe("2026-04-25T10:00:00Z");
  expect(time?.textContent).toBe("2h ago");
});

test("null timestamp → '—' inside <time> with no dateTime attribute", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "hi", timestamp: null }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const time = container.querySelector("time");
  expect(time?.textContent).toBe("—");
  expect(time?.hasAttribute("dateTime")).toBe(false);
});

// ==========================================================================
// Truncation banner
// ==========================================================================

test("state truncated → truncation banner with verbatim spec copy", () => {
  mockedHookState = {
    state: "truncated",
    parsed: { ...makeParsed([]), truncated: true },
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const banner = container.querySelector(".transcript-banner-truncation");
  expect(banner).not.toBeNull();
  expect(banner?.getAttribute("role")).toBe("status");
  expect(banner?.textContent).toContain(
    "Truncated at 5 MB — full payload not parsed.",
  );
  expect(banner?.textContent).toContain(
    "Use the Open raw anchor in the session header",
  );
  expect(banner?.querySelector("strong")?.textContent).toBe("Open raw");
});

test("state success (not truncated) → NO truncation banner", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([makeMessage({ kind: "user", text: "hi" })]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".transcript-banner-truncation")).toBeNull();
});

// ==========================================================================
// Parse warnings banner
// ==========================================================================

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

test("warnings.length > 0 → banner renders with the verbatim spec copy ('1 parse warnings' for N=1)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], { warnings: ONE_WARNING }),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const summary = container.querySelector(
    ".transcript-banner-warnings summary",
  );
  // Spec literal beats English grammar (design.md §7.1 + IMPORTANT-3).
  expect(summary?.textContent).toBe("1 parse warnings — click to view.");
});

test("warnings.length === 2 → summary reads '2 parse warnings — click to view.'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], { warnings: TWO_WARNINGS }),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(
    container.querySelector(".transcript-banner-warnings summary")?.textContent,
  ).toBe("2 parse warnings — click to view.");
});

test("warnings list shows 'line {N} · {reason}' per warning", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], { warnings: TWO_WARNINGS }),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const items = Array.from(
    container.querySelectorAll(".transcript-warnings-list > li"),
  );
  expect(items).toHaveLength(2);
  expect(items[0].textContent).toBe("line 12 · unknown role");
  expect(items[1].textContent).toBe("line 47 · missing field");
});

test("clicking Dismiss unmounts the warnings banner (component-local state)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], { warnings: ONE_WARNING }),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const dismissBtn = container.querySelector(
    ".transcript-banner-dismiss",
  ) as HTMLButtonElement | null;
  expect(dismissBtn).not.toBeNull();
  expect(dismissBtn?.textContent).toBe("Dismiss");
  act(() => {
    dismissBtn?.click();
  });
  expect(container.querySelector(".transcript-banner-warnings")).toBeNull();
});

test("warnings banner re-arrives after row.rowKey changes (defensive reset)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], { warnings: ONE_WARNING }),
  };
  const { container, rerender } = render(
    <TranscriptView
      row={buildRow({ rowKey: "claude_code:row-A" })}
      now={NOW}
    />,
  );
  // Dismiss the banner.
  act(() => {
    (
      container.querySelector(
        ".transcript-banner-dismiss",
      ) as HTMLButtonElement
    ).click();
  });
  expect(container.querySelector(".transcript-banner-warnings")).toBeNull();
  // Re-render with a different rowKey → defensive useEffect should
  // reset dismissed state.
  rerender(
    <TranscriptView
      row={buildRow({ rowKey: "claude_code:row-B" })}
      now={NOW}
    />,
  );
  expect(
    container.querySelector(".transcript-banner-warnings"),
  ).not.toBeNull();
});

// ==========================================================================
// Tool result expand affordance
// ==========================================================================

test("tool_result body of exactly 2048 bytes → no expand affordance", () => {
  const body = "a".repeat(2048);
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_result",
        toolName: "Bash",
        text: body,
        bytes: 2048,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".msg-tool-overflow")).toBeNull();
});

test("tool_result body of 2049 bytes → expand affordance with '1 more bytes'", () => {
  const body = "a".repeat(2049);
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_result",
        toolName: "Bash",
        text: body,
        bytes: 2049,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const overflow = container.querySelector(".msg-tool-overflow");
  expect(overflow).not.toBeNull();
  expect(overflow?.querySelector("summary")?.textContent).toBe(
    "Expand (1 more bytes)",
  );
});

test("splitToolResult: 2049-byte body splits cleanly", () => {
  const body = "a".repeat(2049);
  const result = splitToolResult(body, 2049);
  expect(result.head.length).toBe(2048);
  expect(result.tail.length).toBe(1);
  expect(result.tailBytes).toBe(1);
  expect(result.head + result.tail).toBe(body);
});

test("splitToolResult: multi-byte UTF-8 body splits at codepoint boundary (no mid-codepoint cut)", () => {
  // Build a body where byte 2048 lands inside a 3-byte CJK codepoint.
  // Each '中' is 3 bytes in UTF-8. 2046 / 3 = 682 → at byte 2046 we
  // are at the boundary of a codepoint; emit 1023 of '中' (3069
  // bytes total = enough to overflow). The byte at offset 2048
  // lands inside the 683rd codepoint (bytes 2046-2048 = its 3
  // bytes). Walk-back must trim it to 2046 bytes.
  const body = "中".repeat(1023);
  const enc = new TextEncoder();
  const totalBytes = enc.encode(body).byteLength;
  const result = splitToolResult(body, totalBytes);
  // The head must end on a codepoint boundary.
  expect(enc.encode(result.head).byteLength % 3).toBe(0);
  // Concatenation reproduces the original.
  expect(result.head + result.tail).toBe(body);
});

// ==========================================================================
// Code-fence detection
// ==========================================================================

test("triple-backtick fenced block becomes <pre class='msg-code-block'>", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "user",
        text: "before\n```\ncode here\n```\nafter",
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const pre = container.querySelector(".msg-body .msg-code-block");
  expect(pre).not.toBeNull();
  expect(pre?.textContent).toContain("code here");
});

test("single-backtick inline becomes <code class='msg-code-inline'>", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "user",
        text: "use the `console.log` function",
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const code = container.querySelector(".msg-body .msg-code-inline");
  expect(code).not.toBeNull();
  expect(code?.textContent).toBe("console.log");
});

test("unterminated triple-backtick fence renders as plain text (no crash)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "user",
        text: "```foo\nbar without closing",
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  // The body is rendered without a code-block child.
  expect(
    container.querySelector(".msg-body .msg-code-block"),
  ).toBeNull();
  expect(container.querySelector(".msg-body")?.textContent).toContain(
    "bar without closing",
  );
});

test("single-backtick spanning a newline renders as plain text (case 6)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "user",
        text: "this `crosses\nlines` here",
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(
    container.querySelector(".msg-body .msg-code-inline"),
  ).toBeNull();
});

test("empty triple-backtick fence renders as empty <pre> (no crash)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "```\n```" }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  // Should render without error; an empty <pre> is acceptable.
  expect(container.querySelector(".msg-body")).not.toBeNull();
});

// ==========================================================================
// Unknown line slicing rule (design.md §3.7)
// ==========================================================================

test("unknown line ≤ 80 chars → no trailing ellipsis", () => {
  const text = "short";
  expect(renderUnknownLine(text)).toBe("short");
});

test("unknown line = 80 chars → no trailing ellipsis", () => {
  const text = "a".repeat(80);
  expect(renderUnknownLine(text)).toBe("a".repeat(80));
  expect(renderUnknownLine(text).endsWith("…")).toBe(false);
});

test("unknown line > 80 chars → slice to 80 + single trailing U+2026", () => {
  const text = "a".repeat(120);
  const result = renderUnknownLine(text);
  expect(result.length).toBe(81);
  expect(result.endsWith("…")).toBe(true);
  expect(result.slice(0, 80)).toBe("a".repeat(80));
});

test("unknown line containing embedded U+2026 at byte 75 → both ellipses visible", () => {
  // 75 chars of 'a', then U+2026, then 50 more 'a' to push past 80.
  const text = "a".repeat(75) + "…" + "a".repeat(50);
  const result = renderUnknownLine(text);
  // Slice keeps the embedded U+2026; renderer appends one more.
  expect(result.length).toBe(81);
  expect(result.charAt(75)).toBe("…");
  expect(result.endsWith("…")).toBe(true);
});

// ==========================================================================
// Mixed-stream + a11y
// ==========================================================================

test("section carries aria-label='Session transcript'", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([makeMessage({ kind: "user", text: "x" })]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const section = container.querySelector(".transcript-body");
  expect(section?.tagName.toLowerCase()).toBe("section");
  expect(section?.getAttribute("aria-label")).toBe("Session transcript");
});

test("mixed user → assistant → tool_use → tool_result → assistant collapses pair into one lifecycle (4 panels)", () => {
  // Phase 7c: adjacent tool_use + tool_result render as a single
  // `.msg-lifecycle` card; the standalone `.msg-tool-use` and
  // `.msg-tool-result` panels do NOT both render.
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
      makeMessage({ kind: "assistant", text: "a1", messageIndex: 1 }),
      makeMessage({
        kind: "tool_use",
        toolName: "Read",
        text: "{}",
        messageIndex: 2,
      }),
      makeMessage({
        kind: "tool_result",
        toolName: "Read",
        text: "ok",
        bytes: 2,
        messageIndex: 3,
      }),
      makeMessage({ kind: "assistant", text: "a2", messageIndex: 4 }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const stream = container.querySelector(".transcript-stream");
  expect(stream?.children.length).toBe(4);
  const kinds = Array.from(stream!.children).map((li) => {
    if (li.querySelector(".msg-user")) return "user";
    if (li.querySelector(".msg-assistant")) return "assistant";
    if (li.querySelector(".msg-lifecycle")) return "lifecycle";
    if (li.querySelector(".msg-tool-use")) return "tool-use";
    if (li.querySelector(".msg-tool-result")) return "tool-result";
    return "?";
  });
  expect(kinds).toEqual(["user", "assistant", "lifecycle", "assistant"]);
});

test("warnings banner <details> summary is keyboard-focusable", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], { warnings: ONE_WARNING }),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const summary = container.querySelector(
    ".transcript-banner-warnings summary",
  ) as HTMLElement | null;
  expect(summary).not.toBeNull();
  // happy-dom doesn't honor focus across a programmatic .focus()
  // perfectly, but it does set document.activeElement.
  summary?.focus();
  expect(document.activeElement === summary).toBe(true);
});

// ==========================================================================
// Keep-mounted regression
// ==========================================================================

test("warnings dismissed state survives a 'now' prop change", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([], { warnings: ONE_WARNING }),
  };
  const { container, rerender } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  act(() => {
    (
      container.querySelector(
        ".transcript-banner-dismiss",
      ) as HTMLButtonElement
    ).click();
  });
  expect(container.querySelector(".transcript-banner-warnings")).toBeNull();
  // Bump `now` only — same row identity. Defensive useEffect must
  // NOT reset because rowKey is unchanged.
  rerender(
    <TranscriptView
      row={buildRow()}
      now="2026-04-25T12:01:00Z"
    />,
  );
  expect(container.querySelector(".transcript-banner-warnings")).toBeNull();
});

// ==========================================================================
// Truncation banner copy literal exact match
// ==========================================================================

test("truncation banner copy is exactly the spec line 715 literal", () => {
  mockedHookState = {
    state: "truncated",
    parsed: { ...makeParsed([]), truncated: true },
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const banner = container.querySelector(".transcript-banner-truncation");
  expect(banner?.textContent).toBe(
    "Truncated at 5 MB — full payload not parsed. Use the Open raw anchor in the session header to inspect the full payload.",
  );
});

// ==========================================================================
// messageRange prop (M5 composition)
// ==========================================================================

test("messageRange prop omitted → renders all messages (M4 default behaviour)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
      makeMessage({ kind: "assistant", text: "a1", messageIndex: 1 }),
      makeMessage({ kind: "assistant", text: "a2", messageIndex: 2 }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const stream = container.querySelector(".transcript-stream");
  expect(stream?.children.length).toBe(3);
});

test("messageRange={start:1, end:2} → renders only messages at index 1, 2 (inclusive)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
      makeMessage({ kind: "assistant", text: "a1", messageIndex: 1 }),
      makeMessage({ kind: "assistant", text: "a2", messageIndex: 2 }),
      makeMessage({ kind: "assistant", text: "a3", messageIndex: 3 }),
    ]),
  };
  const { container } = render(
    <TranscriptView
      row={buildRow()}
      now={NOW}
      messageRange={{ start: 1, end: 2 }}
    />,
  );
  const stream = container.querySelector(".transcript-stream");
  expect(stream?.children.length).toBe(2);
  expect(stream?.textContent).toContain("a1");
  expect(stream?.textContent).toContain("a2");
  expect(stream?.textContent).not.toContain("u1");
  expect(stream?.textContent).not.toContain("a3");
});

test("messageRange={start:0, end:0} → renders single message (inclusive both ends)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "only", messageIndex: 0 }),
      makeMessage({ kind: "assistant", text: "agent", messageIndex: 1 }),
    ]),
  };
  const { container } = render(
    <TranscriptView
      row={buildRow()}
      now={NOW}
      messageRange={{ start: 0, end: 0 }}
    />,
  );
  expect(container.querySelector(".transcript-stream")?.children.length).toBe(
    1,
  );
});

test("messageRange with start > end → renders empty-stream copy (defensive)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
    ]),
  };
  const { container } = render(
    <TranscriptView
      row={buildRow()}
      now={NOW}
      messageRange={{ start: 5, end: 1 }}
    />,
  );
  expect(
    container.querySelector(".transcript-empty-stream")?.textContent,
  ).toBe("No messages parsed.");
});

test("messageRange with empty-stream sentinel {start:0, end:-1} → renders 'No messages parsed.' (no crash)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([]),
  };
  const { container } = render(
    <TranscriptView
      row={buildRow()}
      now={NOW}
      messageRange={{ start: 0, end: -1 }}
    />,
  );
  expect(
    container.querySelector(".transcript-empty-stream")?.textContent,
  ).toBe("No messages parsed.");
});

test("messageRange with end > messages.length-1 → clamps to last index (no out-of-bounds)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
      makeMessage({ kind: "assistant", text: "a1", messageIndex: 1 }),
    ]),
  };
  const { container } = render(
    <TranscriptView
      row={buildRow()}
      now={NOW}
      messageRange={{ start: 0, end: 999 }}
    />,
  );
  expect(container.querySelector(".transcript-stream")?.children.length).toBe(
    2,
  );
});

test("messageRange with start < 0 → clamps to 0", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
      makeMessage({ kind: "assistant", text: "a1", messageIndex: 1 }),
    ]),
  };
  const { container } = render(
    <TranscriptView
      row={buildRow()}
      now={NOW}
      messageRange={{ start: -5, end: 1 }}
    />,
  );
  expect(container.querySelector(".transcript-stream")?.children.length).toBe(
    2,
  );
});

// ==========================================================================
// BoundaryRow composition (M5 extraction byte-equivalence)
// ==========================================================================

test("boundary message uses BoundaryRow shared component (carries 'boundary-row' class alongside legacy 'msg-boundary')", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "boundary",
        boundarySubtype: "session_resumed",
        text: "",
        bytes: 0,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const boundary = container.querySelector('[role="separator"]') as HTMLElement;
  expect(boundary).not.toBeNull();
  expect(boundary.classList.contains("boundary-row")).toBe(true);
  expect(boundary.classList.contains("msg-boundary")).toBe(true);
  expect(boundary.classList.contains("msg")).toBe(true);
});

// ==========================================================================
// Phase 7c / M2 — Lifecycle pairing
// ==========================================================================

test("adjacent tool_use + tool_result render a single .msg-lifecycle card (paired success)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_use",
        toolName: "Read",
        text: '{"path":"/foo"}',
        messageIndex: 0,
      }),
      makeMessage({
        kind: "tool_result",
        toolName: "toolu_abc",
        text: "ok",
        bytes: 2,
        messageIndex: 1,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const lifecycle = container.querySelector(".msg-lifecycle");
  expect(lifecycle).not.toBeNull();
  expect(lifecycle?.getAttribute("data-status")).toBe("all-success");
  // No standalone .msg-tool-use or .msg-tool-result panel.
  expect(container.querySelector(".msg-tool-use")).toBeNull();
  expect(container.querySelector(".msg-tool-result")).toBeNull();
  // Only ONE list item in the stream.
  expect(
    container.querySelector(".transcript-stream")?.children.length,
  ).toBe(1);
  // Lifecycle body contains both Arguments and Result disclosures.
  const summaries = lifecycle?.querySelectorAll(".lifecycle-body summary");
  expect(summaries?.length).toBe(2);
});

test("lifecycle status flips to all-failed when tool_result text matches failure heuristic", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_use",
        toolName: "bun",
        text: '{"cmd":"bun test"}',
        messageIndex: 0,
      }),
      makeMessage({
        kind: "tool_result",
        toolName: "exec",
        text: "exit_code: 1\n3 tests failed",
        bytes: 30,
        messageIndex: 1,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const lifecycle = container.querySelector(".msg-lifecycle");
  expect(lifecycle?.getAttribute("data-status")).toBe("all-failed");
});

test("orphan tool_use renders .msg-lifecycle[data-status='in-flight'] with awaiting-result pill", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_use",
        toolName: "Bash",
        text: '{"cmd":"sleep 1"}',
        messageIndex: 0,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const lifecycle = container.querySelector(".msg-lifecycle");
  expect(lifecycle?.getAttribute("data-status")).toBe("in-flight");
  expect(lifecycle?.querySelector(".lifecycle-pill")?.textContent).toBe(
    "awaiting result",
  );
  expect(lifecycle?.querySelector(".lifecycle-no-result")).not.toBeNull();
});

test("orphan tool_result renders .msg-tool-result standalone card with a stray-result chip", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_result",
        toolName: "(unknown)",
        text: "loose result",
        bytes: 12,
        messageIndex: 0,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".msg-tool-result")).not.toBeNull();
  // Stray-result inline chip is present.
  const chipLabel = container.querySelector(".chip .chip-label");
  expect(chipLabel?.textContent).toContain("stray tool_result");
});

test("boundary between tool_use and tool_result blocks pairing (orphan + boundary + stray)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "tool_use",
        toolName: "Bash",
        text: "{}",
        messageIndex: 0,
      }),
      makeMessage({
        kind: "boundary",
        boundarySubtype: "session_resumed",
        text: "",
        bytes: 0,
        messageIndex: 1,
      }),
      makeMessage({
        kind: "tool_result",
        toolName: "toolu_x",
        text: "leftover",
        bytes: 8,
        messageIndex: 2,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const lifecycle = container.querySelector(".msg-lifecycle");
  expect(lifecycle?.getAttribute("data-status")).toBe("in-flight");
  expect(container.querySelector(".msg-boundary")).not.toBeNull();
  expect(container.querySelector(".msg-tool-result")).not.toBeNull();
  expect(
    container.querySelector(".chip .chip-label")?.textContent,
  ).toContain("stray tool_result");
});

// ==========================================================================
// Phase 7c / M2 — Inline warning chip classification (4 buckets)
// ==========================================================================

test("render-normally bucket renders a visible chip below the message body", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "user", text: "hello", messageIndex: 0 }),
      ],
      {
        warnings: [
          {
            lineOrdinal: 1,
            severity: "error",
            category: "payload",
            reason: "unknown user content item type 'image'",
            messageIndex: 0,
          },
        ],
      },
    ),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const chipWrapper = container.querySelector(".msg-user .chip-wrapper");
  expect(chipWrapper).not.toBeNull();
  const chip = chipWrapper?.querySelector(".chip");
  expect(chip).not.toBeNull();
  expect(chip?.getAttribute("data-classification")).toBe("render-normally");
  expect(chip?.querySelector(".chip-label")?.textContent).toBe(
    "unknown user content item type 'image'",
  );
});

test("collapse-by-default bucket renders a chip with generic '1 warning' summary", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "assistant", text: "running", messageIndex: 0 }),
      ],
      {
        warnings: [
          {
            lineOrdinal: 1,
            severity: "warning",
            category: "timestamp",
            reason: "timestamp 'x' could not be parsed",
            messageIndex: 0,
          },
        ],
      },
    ),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const chip = container.querySelector(".msg-assistant .chip");
  expect(chip).not.toBeNull();
  expect(chip?.getAttribute("data-classification")).toBe(
    "collapse-by-default",
  );
  expect(chip?.querySelector(".chip-label")?.textContent).toBe("1 warning");
});

test("hide-with-inspect bucket nests chip behind a corner Inspect link", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "assistant", text: "done", messageIndex: 0 }),
      ],
      {
        warnings: [
          {
            lineOrdinal: 1,
            severity: "info",
            category: "meta",
            reason: "info-only note",
            messageIndex: 0,
          },
        ],
      },
    ),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const affordance = container.querySelector(
    ".msg-assistant .inspect-affordance",
  );
  expect(affordance).not.toBeNull();
  expect(affordance?.querySelector(".inspect-link")?.textContent).toContain(
    "Inspect",
  );
  const chip = affordance?.querySelector(".chip");
  expect(chip?.getAttribute("data-classification")).toBe("hide-with-inspect");
});

test("warning-only bucket renders NO chip and suppresses the message body (banner-only)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({ kind: "assistant", text: "ready", messageIndex: 0 }),
      ],
      {
        warnings: [
          {
            lineOrdinal: 1,
            severity: "warning",
            category: "meta",
            reason: "meta annotation",
            messageIndex: 0,
          },
        ],
      },
    ),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  // No chip on the message body; the message body itself is
  // suppressed (warning-only RenderHint renders nothing for the
  // message). The banner still lists the warning.
  expect(container.querySelector(".msg-assistant")).toBeNull();
  expect(container.querySelector(".chip")).toBeNull();
  expect(
    container.querySelector(".transcript-banner-warnings"),
  ).not.toBeNull();
});

// ==========================================================================
// Phase 7c / M2 — Task-lifecycle chapter marker
// ==========================================================================

test("system message text starting with 'task_started · turn ' renders .msg-task-lifecycle", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "system",
        text: "task_started · turn abc123",
        messageIndex: 0,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const card = container.querySelector(".msg-task-lifecycle");
  expect(card).not.toBeNull();
  expect(card?.getAttribute("data-task")).toBe("started");
  expect(card?.getAttribute("aria-label")).toBe(
    "Task started for turn abc123",
  );
  expect(card?.querySelector(".task-label")?.textContent).toBe(
    "Task started",
  );
  expect(card?.querySelector(".task-turn")?.textContent).toBe("turn abc123");
  // The generic .msg-system shell is NOT rendered for this row.
  expect(container.querySelector(".msg-system")).toBeNull();
});

test("system message text starting with 'task_complete · turn ' renders .msg-task-lifecycle complete", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "system",
        text: "task_complete · turn xyz789",
        messageIndex: 0,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const card = container.querySelector(".msg-task-lifecycle");
  expect(card?.getAttribute("data-task")).toBe("complete");
  expect(card?.querySelector(".task-label")?.textContent).toBe(
    "Task complete",
  );
});

test("task_started system message with attached warning-only warning still renders .msg-task-lifecycle (chapter marker survives)", () => {
  // Precedence regression guard: a `task_started · turn ...` system
  // message that also carries a `warning/meta` warning (the bucket
  // that classifies to `warning-only`) must STILL render the chapter
  // marker. The warning-only short-circuit in renderHints must yield
  // to the task-lifecycle stamp.
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        makeMessage({
          kind: "system",
          text: "task_started · turn abc123",
          messageIndex: 0,
        }),
      ],
      {
        warnings: [
          {
            lineOrdinal: 5,
            severity: "warning",
            category: "meta",
            reason: "meta annotation",
            messageIndex: 0,
          },
        ],
      },
    ),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const card = container.querySelector(".msg-task-lifecycle");
  expect(card).not.toBeNull();
  expect(card?.getAttribute("data-task")).toBe("started");
  // The generic .msg-system shell is NOT rendered — the chapter
  // marker fully replaces it, even with an attached warning-only
  // warning.
  expect(container.querySelector(".msg-system")).toBeNull();
  // The banner still surfaces the warning (banner stays loud per
  // Resolved Decision #6).
  expect(
    container.querySelector(".transcript-banner-warnings"),
  ).not.toBeNull();
});

test("unrelated system message still renders the generic .msg-system shell", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "system",
        text: "Session metadata loaded",
        messageIndex: 0,
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".msg-task-lifecycle")).toBeNull();
  expect(container.querySelector(".msg-system")).not.toBeNull();
});

// ==========================================================================
// Phase 7c / M3 — Same-tool grouping
// ==========================================================================

/** Helper: build a pair of tool_use + tool_result messages at the
 * given starting index, both naming `tool`. */
function toolPair(start: number, tool: string, resultText: string = "ok"): Message[] {
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
      bytes: resultText.length,
    }),
  ];
}

test("M3: 3 same-tool lifecycles collapse into one .group-card with count badge + aggregate label", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read"),
      ...toolPair(2, "Read"),
      ...toolPair(4, "Read"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const group = container.querySelector(".group-card");
  expect(group).not.toBeNull();
  expect(group?.getAttribute("data-status")).toBe("all-success");
  expect(group?.querySelector("summary .tool-name")?.textContent).toBe("Read");
  expect(group?.querySelector(".count-badge")?.textContent).toBe("3 calls");
  expect(
    group?.querySelector(".aggregate-label")?.textContent,
  ).toContain("all succeeded");
  // The stream contains exactly one top-level <li> — the group head.
  const stream = container.querySelector(".transcript-stream");
  expect(stream?.children.length).toBe(1);
});

test("Polish-r2: 2 same-tool lifecycles now collapse into a single .group-card (threshold lowered to 2)", () => {
  // Post-polish-r2: threshold = 2, so 2 consecutive lifecycles
  // collapse into one group. The previous M3 behavior (kept solo
  // below threshold=3) is replaced.
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read"),
      ...toolPair(2, "Read"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const groups = container.querySelectorAll(".group-card");
  expect(groups.length).toBe(1);
  const group = groups[0];
  expect(group.querySelector("summary .tool-name")?.textContent).toBe("Read");
  expect(group.querySelector(".count-badge")?.textContent).toBe("2 calls");
  // The 2 members render as group members inside the expanded body.
  expect(
    group.querySelectorAll(".group-members .group-member.lifecycle-card")
      .length,
  ).toBe(2);
});

test("M3: expanded group reveals N member lifecycle cards on the raised surface", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read"),
      ...toolPair(2, "Read"),
      ...toolPair(4, "Read"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const group = container.querySelector(".group-card");
  expect(group).not.toBeNull();
  // Native <details> is closed by default — but the member cards
  // are present in the DOM (happy-dom renders them inside the
  // disclosure regardless of `open`); the visibility is browser-
  // controlled.
  const members = group?.querySelectorAll(".group-member.lifecycle-card");
  expect(members?.length).toBe(3);
  // Each member is built from the lifecycle recipe: header + body.
  expect(
    group?.querySelectorAll(".group-member .lifecycle-head").length,
  ).toBe(3);
});

test("M3: aggregate status flips to mixed when one of three fails", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read", "ok"),
      ...toolPair(2, "Read", "exit_code: 1\nfailed"),
      ...toolPair(4, "Read", "ok"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const group = container.querySelector(".group-card");
  expect(group?.getAttribute("data-status")).toBe("mixed");
  expect(
    group?.querySelector(".aggregate-label")?.textContent,
  ).toContain("2 succeeded · 1 failed");
});

test("M3: aggregate status in-flight when one of three is orphan", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Bash"),
      ...toolPair(2, "Bash"),
      // Lone tool_use (no following tool_result) → orphan.
      makeMessage({
        messageIndex: 4,
        kind: "tool_use",
        toolName: "Bash",
        text: "{}",
      }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const group = container.querySelector(".group-card");
  expect(group?.getAttribute("data-status")).toBe("in-flight");
  expect(
    group?.querySelector(".aggregate-label")?.textContent,
  ).toContain("running 2 of 3");
});

test("M3: aggregate status all-failed when every lifecycle in the run fails", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read", "exit_code: 1"),
      ...toolPair(2, "Read", '{"is_error":true}'),
      ...toolPair(4, "Read", "status: error"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const group = container.querySelector(".group-card");
  expect(group?.getAttribute("data-status")).toBe("all-failed");
  expect(
    group?.querySelector(".aggregate-label")?.textContent,
  ).toContain("all failed");
});

test("M3: group head uses native <details> (no controlled `open` attribute)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read"),
      ...toolPair(2, "Read"),
      ...toolPair(4, "Read"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const group = container.querySelector(".group-card") as HTMLElement;
  expect(group?.tagName.toLowerCase()).toBe("details");
  // No `open` attribute on the rendered DOM — the browser owns the
  // expand state.
  expect(group.hasAttribute("open")).toBe(false);
});

test("M3: boundary between same-tool runs splits into two separate groups", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read"),
      ...toolPair(2, "Read"),
      ...toolPair(4, "Read"),
      makeMessage({
        messageIndex: 6,
        kind: "boundary",
        boundarySubtype: "session_resumed",
        text: "",
        bytes: 0,
      }),
      ...toolPair(7, "Read"),
      ...toolPair(9, "Read"),
      ...toolPair(11, "Read"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelectorAll(".group-card").length).toBe(2);
});

test("M3: warning on a group member surfaces only inside the expanded group (no collapsed-head chip)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed(
      [
        ...toolPair(0, "Read"),
        ...toolPair(2, "Read"),
        ...toolPair(4, "Read"),
      ],
      {
        warnings: [
          {
            lineOrdinal: 3,
            severity: "error",
            category: "payload",
            reason: "weird payload on member",
            messageIndex: 3,
          },
        ],
      },
    ),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const group = container.querySelector(".group-card") as HTMLElement;
  // The group head's summary is the only collapsed surface; it
  // carries NO chip (chips live inside the member cards). The
  // summary's direct children are tool name / divider / count badge
  // / aggregate-label, not a chip wrapper.
  expect(group?.querySelector(":scope > summary .chip")).toBeNull();
  expect(group?.querySelector(":scope > summary .chip-wrapper")).toBeNull();
  // The chip IS attached to its member's body (inside the expanded
  // members container).
  const memberChip = group?.querySelector(".group-members .chip");
  expect(memberChip).not.toBeNull();
  expect(memberChip?.querySelector(".chip-label")?.textContent).toContain(
    "weird payload on member",
  );
});

test("Polish: 3 Read + 1 Bash consecutive → 1 mixed-tool group of 4 with tool-name list 'Read, Bash'", () => {
  // Post-Phase-7c polish: grouping no longer requires same tool name.
  // 4 consecutive lifecycles of any mix collapse into one group.
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read"),
      ...toolPair(2, "Read"),
      ...toolPair(4, "Read"),
      ...toolPair(6, "Bash"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const groups = container.querySelectorAll(".group-card");
  expect(groups.length).toBe(1);
  const group = groups[0];
  // Summary shows comma-joined distinct tool names in first-appearance
  // order ("Read, Bash") + "4 calls" count badge.
  expect(group.querySelector("summary .tool-name")?.textContent).toBe(
    "Read, Bash",
  );
  expect(group.querySelector(".count-badge")?.textContent).toBe("4 calls");
  // All 4 lifecycles are members of the single group.
  expect(
    group.querySelectorAll(".group-members .group-member.lifecycle-card")
      .length,
  ).toBe(4);
});

test("Polish: 3 Read + 3 Bash consecutive → 1 mixed-tool group of 6 (codex M3 r2 finding #1 regression — renderTopLevelHints bound check still holds defensively)", () => {
  // Under mixed-tool grouping, this run collapses into ONE group of
  // 6. The original M3-round-2 codex finding was about adjacent
  // SAME-tool groups potentially swallowing each other's members;
  // under the new policy, two same-tool runs join into a single
  // group, so the "adjacent groups" scenario doesn't materialize via
  // the public renderHints output anymore. The renderTopLevelHints
  // bound check (count cap + canonical head pointer match) stays in
  // the code as defensive guards against any future hint-emit path
  // that might re-introduce adjacent groups; the load-bearing
  // assertion in this test is the new positive behavior.
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read"),
      ...toolPair(2, "Read"),
      ...toolPair(4, "Read"),
      ...toolPair(6, "Bash"),
      ...toolPair(8, "Bash"),
      ...toolPair(10, "Bash"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const groups = container.querySelectorAll(".group-card");
  expect(groups.length).toBe(1);
  const group = groups[0];
  expect(group.querySelector("summary .tool-name")?.textContent).toBe(
    "Read, Bash",
  );
  expect(group.querySelector(".count-badge")?.textContent).toBe("6 calls");
  expect(
    group.querySelectorAll(".group-members .group-member.lifecycle-card")
      .length,
  ).toBe(6);
  // Top-level stream has exactly 1 <li> — one group head.
  expect(
    container.querySelector(".transcript-stream")?.children.length,
  ).toBe(1);
});

test("M3: each group-member <article> carries the group-member class and is inside .group-members (codex M3 r2 finding #2 regression — CSS selector reach)", () => {
  // Regression guard for the CSS selector mismatch: the
  // `.group-member` class must be present on the rendered
  // `<article>`s inside the group's `<div class="group-members">`
  // container, so the descendant selector
  // `.group-card .group-members .group-member` reaches them and the
  // raised-surface backdrop applies. The previous direct-child
  // selector `.group-card > .group-members > .group-member` is
  // brittle to any future DOM nesting change; the descendant
  // combinator + this structural assertion together pin the contract.
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      ...toolPair(0, "Read"),
      ...toolPair(2, "Read"),
      ...toolPair(4, "Read"),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const group = container.querySelector(".group-card") as HTMLElement;
  expect(group).not.toBeNull();
  const groupMembersDiv = group.querySelector(".group-members") as HTMLElement;
  expect(groupMembersDiv).not.toBeNull();
  // Each member <article> carries .group-member AND .lifecycle-card.
  const articles = group.querySelectorAll(
    ".group-members article.lifecycle-card",
  );
  expect(articles.length).toBe(3);
  for (const article of Array.from(articles)) {
    expect(article.classList.contains("group-member")).toBe(true);
    expect(article.classList.contains("lifecycle-card")).toBe(true);
    // Each article is reachable from the descendant selector that
    // owns the raised-surface backdrop override. The structural
    // proof is: the article matches the selector against the live
    // DOM via .matches().
    expect(
      article.matches(".group-card .group-members .group-member"),
    ).toBe(true);
  }
  // Each <article> sits inside the .group-members container (not a
  // sibling of it).
  for (const article of Array.from(articles)) {
    expect(groupMembersDiv.contains(article)).toBe(true);
  }
});

test("Polish-r2: top-level transcript stream collapses tool batch + trailing assistant text into a single group card", () => {
  // Post-polish-r2: trailing assistant text after a tool batch gets
  // pulled INTO the group's expanded body via passthrough buffering.
  // Top-level stream is: user (delimiter) + group-card (containing 3
  // lifecycles + the trailing "done" assistant text) = 2 <li>s.
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "u1", messageIndex: 0 }),
      ...toolPair(1, "Read"),
      ...toolPair(3, "Read"),
      ...toolPair(5, "Read"),
      makeMessage({ kind: "assistant", text: "done", messageIndex: 7 }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const stream = container.querySelector(".transcript-stream");
  expect(stream?.children.length).toBe(2);
  // The trailing "done" assistant text appears INSIDE the group's
  // expanded body, not at the top level.
  const group = container.querySelector(".group-card");
  expect(group).not.toBeNull();
  expect(group?.querySelector(".count-badge")?.textContent).toBe("3 calls");
  // The "done" assistant standalone is now a text-member inside the
  // group's expanded body.
  expect(
    group?.querySelector(".group-members .msg-assistant"),
  ).not.toBeNull();
});

test("Polish-r2: real-session scenario — 2 Edits with assistant text between them collapse into a single group card", () => {
  // This is the user's reported scenario as it actually manifests
  // in the parser output. Claude Code emits assistant.content[].text
  // + tool_use as separate Messages, so a turn with "I'll edit X" +
  // Edit-1 + "Now edit Y" + Edit-2 produces a stream where assistant
  // text sits between the tool pairs. Polish-r2 pulls the assistant
  // commentary INTO the group via passthrough buffering, so the user
  // sees a single collapsed "2 calls · Edit" card instead of two
  // separate lifecycle cards.
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({
        kind: "user",
        text: "Please make 2 edits",
        messageIndex: 0,
      }),
      makeMessage({
        kind: "assistant",
        text: "I'll edit X first.",
        messageIndex: 1,
      }),
      ...toolPair(2, "Edit"),
      makeMessage({
        kind: "assistant",
        text: "Now editing Y.",
        messageIndex: 4,
      }),
      ...toolPair(5, "Edit"),
      makeMessage({ kind: "assistant", text: "Done.", messageIndex: 7 }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  // Top level: user + group = 2 rows.
  const stream = container.querySelector(".transcript-stream");
  expect(stream?.children.length).toBe(2);
  // Single group card with "2 calls · Edit".
  const groups = container.querySelectorAll(".group-card");
  expect(groups.length).toBe(1);
  const group = groups[0];
  expect(group.querySelector("summary .tool-name")?.textContent).toBe("Edit");
  expect(group.querySelector(".count-badge")?.textContent).toBe("2 calls");
  // The 3 assistant texts are inside the group's expanded body
  // (leading + middle + trailing); the 2 lifecycle members are also
  // inside.
  expect(
    group.querySelectorAll(".group-members .msg-assistant").length,
  ).toBe(3);
  expect(
    group.querySelectorAll(".group-members .group-member.lifecycle-card")
      .length,
  ).toBe(2);
  // The user message stays at the top level (delimiter, not pulled in).
  expect(
    container.querySelector(".transcript-stream > .msg-li > .msg-user"),
  ).not.toBeNull();
});

test("Polish: empty-body assistant message renders no .msg-assistant card", () => {
  // Real-session bug from user report: Codex `agent_message` payload
  // missing `message` field produced "Assistant · 8d ago" cards with
  // no body. Post-7c-polish: those rows are suppressed entirely; the
  // session banner remains the surface for the parser anomaly.
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "ask", messageIndex: 0 }),
      makeMessage({ kind: "assistant", text: "", messageIndex: 1 }),
      makeMessage({ kind: "assistant", text: "", messageIndex: 2 }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  // The user message renders. No assistant cards.
  expect(container.querySelectorAll(".msg-user").length).toBe(1);
  expect(container.querySelectorAll(".msg-assistant").length).toBe(0);
  // Top-level stream has exactly 1 <li> (the user); the two empty
  // assistants emit no hint at all.
  expect(
    container.querySelector(".transcript-stream")?.children.length,
  ).toBe(1);
});

test("Polish: non-empty assistant message still renders normally (suppression scope is empty-body only)", () => {
  mockedHookState = {
    state: "success",
    parsed: makeParsed([
      makeMessage({ kind: "user", text: "ask", messageIndex: 0 }),
      makeMessage({ kind: "assistant", text: "answer", messageIndex: 1 }),
    ]),
  };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelectorAll(".msg-assistant").length).toBe(1);
  expect(container.querySelector(".msg-assistant")?.textContent).toContain(
    "answer",
  );
});

// ==========================================================================
// Phase 7d — metadata hairline + echo glyph + cluster
// ==========================================================================

test("Phase 7d: single hairline metadata renders .msg-metadata[data-meta-category=control] with formatted text", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "metadata",
      metaCategory: "control",
      text: "permission mode → default",
    }),
  ];
  mockedHookState = { state: "success", parsed: makeParsed(messages) };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const row = container.querySelector(
    '.msg-metadata[data-meta-category="control"]',
  );
  expect(row).not.toBeNull();
  expect(row?.querySelector(".meta-text")?.textContent).toBe(
    "permission mode → default",
  );
  expect(row?.getAttribute("aria-label")).toBe(
    "Metadata: permission mode → default",
  );
  // Echo class is NOT present on hairline rows.
  expect(container.querySelector(".msg-metadata-echo")).toBeNull();
});

test("Phase 7d: echo metadata renders the ↺ glyph and an aria-label that resolves the back-pointer", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "metadata",
      metaCategory: "echo",
      text: "",
      echoOf: { lineOrdinal: 42, canonicalKind: "user" },
    }),
  ];
  mockedHookState = { state: "success", parsed: makeParsed(messages) };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const row = container.querySelector(
    '.msg-metadata-echo[data-meta-category="echo"]',
  );
  expect(row).not.toBeNull();
  // Glyph span.
  expect(row?.querySelector(".meta-prefix-echo")?.textContent).toBe("↺");
  // Aria-label resolves to the canonical line.
  expect(row?.getAttribute("aria-label")).toBe(
    "Echo: duplicate of canonical user message at line 42",
  );
  // Hover tooltip.
  expect(row?.getAttribute("title")).toBe(
    "duplicate of event_msg.user_message at line 42",
  );
});

test("Phase 7d: 2+ adjacent metadata Messages collapse into a single <details class='msg-metadata-cluster'>", () => {
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
  mockedHookState = { state: "success", parsed: makeParsed(messages) };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  const cluster = container.querySelector(".msg-metadata-cluster");
  expect(cluster).not.toBeNull();
  expect(cluster?.querySelector(".meta-cluster-count")?.textContent).toBe(
    "2 metadata events",
  );
  // Summary aria-label exposes the count + interaction cue.
  expect(cluster?.querySelector("summary")?.getAttribute("aria-label")).toBe(
    "2 metadata events, click to expand",
  );
  // Body re-renders both rows in original order.
  const rows = cluster?.querySelectorAll(
    ".meta-cluster-body .msg-metadata",
  );
  expect(rows?.length).toBe(2);
  expect(rows?.[0].getAttribute("data-meta-category")).toBe("control");
  expect(rows?.[1].getAttribute("data-meta-category")).toBe("prompt");
});

test("Phase 7d: single metadata below threshold stays as a singleton (no cluster)", () => {
  const messages: Message[] = [
    makeMessage({
      messageIndex: 0,
      kind: "metadata",
      metaCategory: "telemetry",
      text: "tokens: 100↓ 50↑",
    }),
  ];
  mockedHookState = { state: "success", parsed: makeParsed(messages) };
  const { container } = render(
    <TranscriptView row={buildRow()} now={NOW} />,
  );
  expect(container.querySelector(".msg-metadata-cluster")).toBeNull();
  expect(
    container.querySelector('.msg-metadata[data-meta-category="telemetry"]'),
  ).not.toBeNull();
});
