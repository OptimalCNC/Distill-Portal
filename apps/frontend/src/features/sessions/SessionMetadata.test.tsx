// Component-level tests for the M2b Metadata tab body.
//
// The 18-field `<dl>` of M2b grew to 19 in Phase 6 M2 (Resolved
// Decision #12): a new "Title source" row sits immediately after the
// `title` field. The added row reuses the existing `<dt>`/`<dd>` grid
// — no new component, no JS popover — and carries the longer
// explanatory tooltip on the `<dd>` via the native HTML `title=`
// attribute. Tests adapt the relevant assertions from
// `SessionDetail.test.tsx`. M2b ADDS the inline subagent sidecar badge
// and removes the drawer header (the minimal header at M2b lives in
// SessionView, NOT in this component).
//
// Coverage:
//   1. All 19 <dt> labels render in order (snake_case + the source-
//      path label swap + Phase-6 Title source row).
//   2. Timestamps render absolute ISO + relative pair.
//   3. Source-clock + backend-clock annotations.
//   4. statusConflict=true renders "(disagreed during load)" muted
//      note in the status <dd>.
//   5. sourcePathIsStale=true swaps the source-path <dt> label.
//   6. hasSubagentSidecars=true renders the subagent informational
//      chip inline on the has_subagent_sidecars <dd>.
//   7. Copy path button calls navigator.clipboard.writeText with
//      sourcePath.
//   8. Copy fallback when navigator.clipboard is undefined.
//   9. "View raw" anchor renders only when storedSessionUid !== null.
//   10. Phase-6 Title source caption row: one test case per
//       TitleSource enum value + the legacy `null` case. Asserts the
//       visible caption equals the spec terse-caption string AND the
//       `<dd>`'s HTML `title=` attribute equals the spec tooltip.
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { SessionMetadata } from "./SessionMetadata";
import type { SessionRow } from "./types";

const NOW = "2026-04-25T12:00:00Z";

function buildRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    rowKey: "claude_code:fixture-1",
    sourceSessionKey: "claude_code:fixture-1",
    tool: "claude_code",
    sourceSessionId: "fixture-1",
    title: "Fixture title",
    titleSource: "custom",
    projectPath: "/projects/fixture",
    sourcePath: "/srv/sessions/fixture-1.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-fixture-1",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-25T11:55:00Z",
    ingestedAt: "2026-04-25T11:50:00Z",
    storedSessionUid: "uid-fixture-1",
    storedRawRef: "raw/uid-fixture-1.ndjson",
    hasSubagentSidecars: true,
    status: "up_to_date",
    statusConflict: false,
    presence: "both",
    ...overrides,
  };
}

let originalClipboardDescriptor: PropertyDescriptor | undefined;
function setNavigatorClipboard(
  value: { writeText?: (s: string) => Promise<void> } | undefined,
) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

beforeEach(() => {
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
    globalThis.navigator,
    "clipboard",
  );
});

afterEach(() => {
  cleanup();
  if (originalClipboardDescriptor !== undefined) {
    Object.defineProperty(
      globalThis.navigator,
      "clipboard",
      originalClipboardDescriptor,
    );
  } else {
    setNavigatorClipboard(undefined);
  }
});

test("SessionMetadata: renders all 19 <dt> labels in expected order", () => {
  const row = buildRow();
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const dtTexts = Array.from(
    container.querySelectorAll("dl.metadata-meta dt"),
  ).map((el) => el.textContent ?? "");
  const expectedLabels = [
    "session_key",
    "session_uid",
    "row_key",
    "tool",
    "source_session_id",
    "presence",
    "status",
    "status_conflict",
    "title",
    // Phase 6 M2: Title source row sits immediately after `title`.
    "Title source",
    "project_path",
    "Source path",
    "source_path_is_stale",
    "source_fingerprint",
    "has_subagent_sidecars",
    "stored_raw_ref",
    "created_at (source clock)",
    "source_updated_at (source clock)",
    "ingested_at (backend clock)",
  ];
  expect(dtTexts.length).toBe(expectedLabels.length);
  for (const label of expectedLabels) {
    expect(dtTexts).toContain(label);
  }
});

test("SessionMetadata: timestamps render absolute ISO + relative pair", () => {
  const row = buildRow();
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const text = container.textContent ?? "";
  expect(text).toContain("2026-04-25T11:55:00Z");
  expect(text).toContain("(5m ago)");
  expect(text).toContain("2026-04-25T11:50:00Z");
  expect(text).toContain("(10m ago)");
  expect(text).toContain("2026-04-22T00:00:00Z");
  expect(text).toContain("(3d ago)");
});

test("SessionMetadata: source-clock annotation lands on created_at + source_updated_at; backend-clock on ingested_at", () => {
  const row = buildRow();
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const dtTexts = Array.from(
    container.querySelectorAll("dl.metadata-meta dt"),
  ).map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("created_at (source clock)");
  expect(dtTexts).toContain("source_updated_at (source clock)");
  expect(dtTexts).toContain("ingested_at (backend clock)");
});

test("SessionMetadata: statusConflict=true renders '(disagreed during load)' muted note in status <dd>", () => {
  const row = buildRow({ statusConflict: true });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const text = container.textContent ?? "";
  expect(text).toContain("(disagreed during load)");
  // status_conflict bool <dd> is also "true".
  const dts = Array.from(
    container.querySelectorAll("dl.metadata-meta dt"),
  );
  const dds = Array.from(
    container.querySelectorAll("dl.metadata-meta dd"),
  );
  const idx = dts.findIndex((el) => el.textContent === "status_conflict");
  expect(dds[idx]?.textContent).toBe("true");
});

test("SessionMetadata: statusConflict=false omits the muted note", () => {
  const row = buildRow({ statusConflict: false });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  expect(container.textContent ?? "").not.toContain("(disagreed during load)");
});

test("SessionMetadata: sourcePathIsStale=true swaps the <dt> label to 'Last seen source path'", () => {
  const row = buildRow({
    sourcePathIsStale: true,
    sourcePath: "/last/known/stale.jsonl",
    presence: "stored_only",
    sourceSessionKey: null,
    rowKey: "stored:uid-stale",
    status: "source_missing",
  });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const dtTexts = Array.from(
    container.querySelectorAll("dl.metadata-meta dt"),
  ).map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("Last seen source path");
  expect(dtTexts).not.toContain("Source path");
  expect(container.textContent).toContain("/last/known/stale.jsonl");
});

test("SessionMetadata: hasSubagentSidecars=true renders the inline subagent badge", () => {
  const row = buildRow({ hasSubagentSidecars: true });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const badge = container.querySelector(".metadata-subagent-badge");
  expect(badge).not.toBeNull();
  expect(badge?.textContent).toMatch(
    /Has Claude Code subagent sidecars on disk/,
  );
  // The badge sits on the SAME <dd> as the has_subagent_sidecars value
  // (NOT a top-of-pane banner).
  const dts = Array.from(
    container.querySelectorAll("dl.metadata-meta dt"),
  );
  const dds = Array.from(
    container.querySelectorAll("dl.metadata-meta dd"),
  );
  const idx = dts.findIndex(
    (el) => el.textContent === "has_subagent_sidecars",
  );
  expect(dds[idx]?.querySelector(".metadata-subagent-badge")).not.toBeNull();
});

test("SessionMetadata: hasSubagentSidecars=false omits the badge", () => {
  const row = buildRow({ hasSubagentSidecars: false });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  expect(container.querySelector(".metadata-subagent-badge")).toBeNull();
});

test("SessionMetadata: Copy path button calls navigator.clipboard.writeText with row.sourcePath", async () => {
  const writeText = mock(async (_s: string) => {});
  setNavigatorClipboard({ writeText });
  const row = buildRow({ sourcePath: "/copy/test/path.jsonl" });
  const { container, findByText } = render(
    <SessionMetadata row={row} now={NOW} />,
  );
  const btn = container.querySelector(
    "button.metadata-copy-btn",
  ) as HTMLButtonElement;
  expect(btn).not.toBeNull();
  await act(async () => {
    btn.click();
    await Promise.resolve();
  });
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0]?.[0]).toBe("/copy/test/path.jsonl");
  const hint = await findByText("Copied");
  expect(hint).not.toBeNull();
});

test("SessionMetadata: Copy fallback when navigator.clipboard is undefined renders 'Selected …' hint", async () => {
  setNavigatorClipboard(undefined);
  const row = buildRow({ sourcePath: "/fallback/test/path.jsonl" });
  const { container, findByText } = render(
    <SessionMetadata row={row} now={NOW} />,
  );
  const btn = container.querySelector(
    "button.metadata-copy-btn",
  ) as HTMLButtonElement;
  expect(btn).not.toBeNull();
  await act(async () => {
    btn.click();
    await Promise.resolve();
  });
  const hint = await findByText(/Selected/);
  expect(hint).not.toBeNull();
});

test("SessionMetadata: 'View raw' anchor renders only when storedSessionUid !== null", () => {
  // source-only row: anchor absent.
  const sourceOnly = buildRow({
    storedSessionUid: null,
    storedRawRef: null,
    presence: "source_only",
    status: "not_stored",
    ingestedAt: null,
  });
  const { container, rerender } = render(
    <SessionMetadata row={sourceOnly} now={NOW} />,
  );
  expect(container.querySelector("a.raw-link")).toBeNull();
  // stored row: anchor renders + carries the right href + new-tab attrs.
  const stored = buildRow({ storedSessionUid: "uid-view-raw" });
  rerender(<SessionMetadata row={stored} now={NOW} />);
  const link = container.querySelector("a.raw-link") as HTMLAnchorElement;
  expect(link).not.toBeNull();
  expect(link.getAttribute("href")).toBe(
    "/api/v1/sessions/uid-view-raw/raw",
  );
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});

// ---------------------------------------------------------------------------
// Phase 6 M2 — Title source caption row.
//
// Spec §Frontend Rendering — "Metadata tab — title source caption"
// (working/phase-6.md lines 152-157). Each `TitleSource` enum value
// (plus the legacy `null` case for pre-Phase-6 stored rows) renders a
// terse caption in the `<dd>` text + a longer explanatory tooltip on
// the same `<dd>`'s HTML `title=` attribute. Strings are pinned
// verbatim here so a future spec drift surfaces immediately.
// ---------------------------------------------------------------------------

function findTitleSourceDd(container: ParentNode): HTMLElement {
  const dts = Array.from(
    container.querySelectorAll<HTMLElement>("dl.metadata-meta dt"),
  );
  const dds = Array.from(
    container.querySelectorAll<HTMLElement>("dl.metadata-meta dd"),
  );
  const idx = dts.findIndex((el) => el.textContent === "Title source");
  expect(idx).toBeGreaterThan(-1);
  const dd = dds[idx];
  expect(dd).toBeDefined();
  return dd as HTMLElement;
}

test("SessionMetadata: titleSource='custom' renders 'Origin' caption + tooltip", () => {
  const row = buildRow({ titleSource: "custom" });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const dd = findTitleSourceDd(container);
  expect(dd.textContent).toBe("Origin");
  expect(dd.getAttribute("title")).toBe(
    "Title brought in from the original coding session (e.g. Claude Code's customTitle record).",
  );
});

test("SessionMetadata: titleSource='first_user_message' renders 'Opening message' caption + tooltip", () => {
  const row = buildRow({ titleSource: "first_user_message" });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const dd = findTitleSourceDd(container);
  expect(dd.textContent).toBe("Opening message");
  expect(dd.getAttribute("title")).toBe(
    "Extracted from the first user message in this session.",
  );
});

test("SessionMetadata: titleSource='slug' renders 'Path slug' caption + tooltip", () => {
  const row = buildRow({ titleSource: "slug" });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const dd = findTitleSourceDd(container);
  expect(dd.textContent).toBe("Path slug");
  expect(dd.getAttribute("title")).toBe(
    "Derived from the session's source path as a fallback when no usable message text was found.",
  );
});

test("SessionMetadata: titleSource='generated' renders 'Generated' caption + tooltip", () => {
  const row = buildRow({ titleSource: "generated" });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const dd = findTitleSourceDd(container);
  expect(dd.textContent).toBe("Generated");
  expect(dd.getAttribute("title")).toBe(
    "AI-generated title (reserved for a later phase; not produced in Phase 6).",
  );
});

test("SessionMetadata: titleSource=null renders 'Unknown' caption + legacy-row tooltip", () => {
  // The legacy / pre-Phase-6 case: stored row imported before
  // `title_source` tracking existed. Frontend renders the "Unknown"
  // caption with the rescan-to-populate tooltip — no UI suggests an
  // error state.
  const row = buildRow({ titleSource: null });
  const { container } = render(<SessionMetadata row={row} now={NOW} />);
  const dd = findTitleSourceDd(container);
  expect(dd.textContent).toBe("Unknown");
  expect(dd.getAttribute("title")).toBe(
    "This session was imported before title-source tracking was added; rescan to populate.",
  );
});
