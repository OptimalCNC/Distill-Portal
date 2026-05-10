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

test("renders tool_use with <details><summary>Arguments</summary><pre>{text}</pre></details>", () => {
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
  expect(container.querySelector(".msg-tool-use")).not.toBeNull();
  expect(
    container.querySelector(".msg-tool-name")?.textContent,
  ).toBe("Read");
  expect(
    container.querySelector(".msg-tool-disclosure summary")?.textContent,
  ).toBe("Arguments");
  expect(
    container.querySelector(".msg-tool-pre")?.textContent,
  ).toContain('"path": "/foo"');
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
  { lineOrdinal: 12, reason: "unknown role" },
];
const TWO_WARNINGS: ParseWarning[] = [
  { lineOrdinal: 12, reason: "unknown role" },
  { lineOrdinal: 47, reason: "missing field" },
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

test("mixed user → assistant → tool_use → tool_result → assistant renders five panels in order", () => {
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
  expect(stream?.children.length).toBe(5);
  // Order check.
  const kinds = Array.from(stream!.children).map((li) => {
    if (li.querySelector(".msg-user")) return "user";
    if (li.querySelector(".msg-assistant")) return "assistant";
    if (li.querySelector(".msg-tool-use")) return "tool-use";
    if (li.querySelector(".msg-tool-result")) return "tool-result";
    return "?";
  });
  expect(kinds).toEqual([
    "user",
    "assistant",
    "tool-use",
    "tool-result",
    "assistant",
  ]);
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
