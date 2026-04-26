// Component-level tests for the SessionDetail drawer body.
//
// Coverage map (mirrors §What to implement → Chunk E1 §4 in the
// dispatch brief):
//
//   1. Every one of the 18 SessionRow fields renders in the metadata
//      list (asserted via the <dt> labels).
//   2. Timestamps render absolute ISO + relative pair via
//      `relativeTimeFrom(now, value)`.
//   3. Source-clock annotation lands on `created_at` AND
//      `source_updated_at`.
//   4. Backend-clock annotation lands on `ingested_at`.
//   5. `statusConflict: true` row renders the "Conflict" badge in the
//      header AND the "(disagreed during load)" muted note in the
//      status row.
//   6. `sourcePathIsStale: true` row labels the source-path block
//      "Last seen source path" instead of "Source path".
//   7. Copy-to-clipboard button calls
//      `navigator.clipboard.writeText(row.sourcePath)` on click; the
//      "Copied" hint appears.
//   8. Copy-to-clipboard fallback: when `navigator.clipboard` is
//      undefined, clicking does NOT throw and the fallback hint
//      "Selected — press Ctrl/Cmd + C to copy" appears.
//   9. "View raw" anchor renders only when `storedSessionUid !== null`
//      (i.e. stored sessions only).
//  10. Raw preview placeholder renders only for stored sessions.
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { SessionDetail } from "./SessionDetail";
import type { SessionRow } from "./types";

// Pinned `now` so relative-time renderings stay deterministic. Chosen
// 5 minutes after the fixture rows' source_updated_at so the relative
// form reads "5m ago".
const NOW = "2026-04-25T12:00:00Z";

// Reusable fixture builder — every test starts from a populated stored
// row and mutates only what it cares about.
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

// Save / restore the navigator mocks across tests so a fallback test
// does not leak into subsequent ones. happy-dom marks
// `navigator.clipboard` as a non-writable property by default, so we
// have to use `Object.defineProperty` (with `configurable: true`) to
// override it.
type ClipboardLike = { writeText?: (s: string) => Promise<void> };
let originalClipboardDescriptor: PropertyDescriptor | undefined;
function setNavigatorClipboard(value: ClipboardLike | undefined) {
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
  // Restore the original clipboard descriptor (happy-dom's getter or
  // undefined). Using `defineProperty` here matches the way we set it
  // above so the property always exists in a mutable form between
  // tests.
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

test("SessionDetail: renders every one of the 18 SessionRow fields in the metadata list", () => {
  const row = buildRow();
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  // The 18 fields in the order rendered by the component. session_uid,
  // session_key, row_key, tool, source_session_id, presence, status,
  // status_conflict, title, project_path, source_path, source_path_is_stale,
  // source_fingerprint, has_subagent_sidecars, stored_raw_ref,
  // created_at, source_updated_at, ingested_at.
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
    "Source path", // becomes "Last seen source path" when sourcePathIsStale=true
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

test("SessionDetail: timestamps render absolute ISO + relative pair", () => {
  const row = buildRow();
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  // source_updated_at = 11:55Z, now = 12:00Z -> "5m ago".
  const text = container.textContent ?? "";
  expect(text).toContain("2026-04-25T11:55:00Z");
  expect(text).toContain("(5m ago)");
  expect(text).toContain("2026-04-25T11:50:00Z"); // ingested_at
  expect(text).toContain("(10m ago)");
  expect(text).toContain("2026-04-22T00:00:00Z"); // created_at
  expect(text).toContain("(3d ago)");
});

test("SessionDetail: source-clock annotation lands on created_at and source_updated_at", () => {
  const row = buildRow();
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("created_at (source clock)");
  expect(dtTexts).toContain("source_updated_at (source clock)");
});

test("SessionDetail: backend-clock annotation lands on ingested_at", () => {
  const row = buildRow();
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("ingested_at (backend clock)");
});

test("SessionDetail: statusConflict=true renders the Conflict badge in the header", () => {
  const row = buildRow({ statusConflict: true });
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const badge = container.querySelector(".drawer-conflict-badge");
  expect(badge).not.toBeNull();
  expect(badge?.textContent).toBe("Conflict");
  expect(badge?.getAttribute("title")).toContain("disagreed during load");
});

test("SessionDetail: statusConflict=false does NOT render the Conflict badge", () => {
  const row = buildRow({ statusConflict: false });
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  expect(container.querySelector(".drawer-conflict-badge")).toBeNull();
});

test("SessionDetail: sourcePathIsStale=true labels the source-path block 'Last seen source path'", () => {
  const row = buildRow({
    sourcePathIsStale: true,
    sourcePath: "/last/known/stale.jsonl",
    presence: "stored_only",
    sourceSessionKey: null,
    rowKey: "stored:uid-stale",
    status: "source_missing",
  });
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("Last seen source path");
  expect(dtTexts).not.toContain("Source path");
  // The actual path still renders.
  expect(container.textContent).toContain("/last/known/stale.jsonl");
});

test("SessionDetail: sourcePathIsStale=false labels the source-path block 'Source path'", () => {
  const row = buildRow({ sourcePathIsStale: false });
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("Source path");
  expect(dtTexts).not.toContain("Last seen source path");
});

test("SessionDetail: copy-to-clipboard button calls navigator.clipboard.writeText with row.sourcePath", async () => {
  const writeText = mock(async (_s: string) => {});
  setNavigatorClipboard({ writeText });
  const row = buildRow({ sourcePath: "/copy/test/path.jsonl" });
  const { container, findByText } = render(
    <SessionDetail row={row} now={NOW} />,
  );
  const copyBtn = container.querySelector(
    "button.drawer-copy-btn",
  ) as HTMLButtonElement;
  expect(copyBtn).not.toBeNull();
  await act(async () => {
    copyBtn.click();
    // Allow the async copy promise to resolve so `setCopyHint("copied")`
    // commits.
    await Promise.resolve();
  });
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0]?.[0]).toBe("/copy/test/path.jsonl");
  // The "Copied" hint should appear after the click resolves.
  const hint = await findByText("Copied");
  expect(hint).not.toBeNull();
});

test("SessionDetail: copy fallback when navigator.clipboard is undefined does NOT throw", async () => {
  // Wipe the clipboard so the hot path falls through to the manual
  // selection branch.
  setNavigatorClipboard(undefined);
  const row = buildRow({ sourcePath: "/fallback/test/path.jsonl" });
  const { container, findByText } = render(
    <SessionDetail row={row} now={NOW} />,
  );
  const copyBtn = container.querySelector(
    "button.drawer-copy-btn",
  ) as HTMLButtonElement;
  expect(copyBtn).not.toBeNull();
  // The click must not throw.
  await act(async () => {
    copyBtn.click();
    await Promise.resolve();
  });
  // The fallback hint should render.
  const hint = await findByText(/Selected/);
  expect(hint).not.toBeNull();
});

test("SessionDetail: 'View raw' anchor renders only when storedSessionUid !== null", () => {
  const sourceOnly = buildRow({
    storedSessionUid: null,
    storedRawRef: null,
    presence: "source_only",
    status: "not_stored",
    ingestedAt: null,
  });
  const { container, rerender } = render(
    <SessionDetail row={sourceOnly} now={NOW} />,
  );
  expect(container.querySelector("a.raw-link")).toBeNull();

  const stored = buildRow({ storedSessionUid: "uid-view-raw" });
  rerender(<SessionDetail row={stored} now={NOW} />);
  const link = container.querySelector("a.raw-link") as HTMLAnchorElement;
  expect(link).not.toBeNull();
  expect(link.getAttribute("href")).toBe(
    "/api/v1/sessions/uid-view-raw/raw",
  );
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});

test("SessionDetail: raw preview placeholder renders only for stored sessions", () => {
  const sourceOnly = buildRow({
    storedSessionUid: null,
    storedRawRef: null,
    presence: "source_only",
    status: "not_stored",
    ingestedAt: null,
  });
  const { container, rerender } = render(
    <SessionDetail row={sourceOnly} now={NOW} />,
  );
  expect(container.querySelector(".drawer-raw-preview")).toBeNull();
  expect(
    container.querySelector(".raw-preview-placeholder"),
  ).toBeNull();

  const stored = buildRow({ storedSessionUid: "uid-preview" });
  rerender(<SessionDetail row={stored} now={NOW} />);
  const section = container.querySelector(".drawer-raw-preview");
  expect(section).not.toBeNull();
  const placeholder = container.querySelector(
    ".raw-preview-placeholder",
  );
  expect(placeholder).not.toBeNull();
  expect(placeholder?.textContent).toContain("Chunk E2");
});
