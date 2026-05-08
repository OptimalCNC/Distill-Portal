// Component-level tests for the M2b Metadata tab body.
//
// The 18-field `<dl>` is byte-equivalent to the Phase-4
// SessionDetail drawer body; tests adapt the relevant assertions
// from `SessionDetail.test.tsx`. M2b ADDS the inline subagent
// sidecar badge and removes the drawer header (the minimal header
// at M2b lives in SessionView, NOT in this component).
//
// Coverage:
//   1. All 18 <dt> labels render in order (snake_case + the source-
//      path label swap).
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

test("SessionMetadata: renders all 18 <dt> labels in snake_case order", () => {
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
