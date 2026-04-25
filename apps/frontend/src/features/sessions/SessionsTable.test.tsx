// Component-level tests for the unified `SessionsTable`.
//
// Coverage:
//   1. Empty state: with `rows: []`, the component renders the spec's
//      empty-state copy and no `<table>` element.
//   2. Importability rendering: per-row checkbox is in the DOM exactly
//      on importable rows. Asserted both via `aria-label` per row and
//      via the gross checkbox count.
//   3. Header bulk-select: clicking the header checkbox fires
//      `onToggleAll` exactly once.
//   4. statusConflict affordance: a row with `statusConflict: true`
//      renders the muted "(refresh)" affordance next to the badge; a
//      row with `statusConflict: false` does not.
//   5. sourcePathIsStale rendering: the source-path cell carries the
//      `title=` hover hint when the flag is true; no `title=` when
//      false.
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { SessionsTable } from "./SessionsTable";
import type { SessionRow } from "./types";

// Pinned `now` for deterministic relative-time rendering across tests.
const NOW = "2026-04-25T12:00:00Z";

afterEach(() => {
  cleanup();
});

function buildRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    rowKey: "claude_code:row-1",
    sourceSessionKey: "claude_code:row-1",
    tool: "claude_code",
    sourceSessionId: "row-1",
    title: "Row one",
    projectPath: "/projects/row-1",
    sourcePath: "/srv/sessions/row-1.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-row-1",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-22T00:01:00Z",
    ingestedAt: null,
    storedSessionUid: null,
    storedRawRef: null,
    hasSubagentSidecars: false,
    status: "not_stored",
    statusConflict: false,
    presence: "source_only",
    ...overrides,
  };
}

test("SessionsTable: empty rows renders empty-state copy and no <table>", () => {
  const onToggle = mock(() => {});
  const onToggleAll = mock(() => {});
  const { container } = render(
    <SessionsTable
      rows={[]}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      now={NOW}
    />,
  );
  expect(container.querySelector("table")).toBeNull();
  expect(
    container.textContent?.includes(
      "No sessions have been discovered or stored yet.",
    ),
  ).toBe(true);
});

test("SessionsTable: per-row checkboxes ONLY on importable rows", () => {
  // Build one row in every legal (presence × status) combination.
  const rows: SessionRow[] = [
    // source_only + not_stored — importable
    buildRow({
      rowKey: "claude_code:so-not-stored",
      sourceSessionKey: "claude_code:so-not-stored",
      sourceSessionId: "so-not-stored",
      status: "not_stored",
      presence: "source_only",
    }),
    // both + up_to_date — NOT importable
    buildRow({
      rowKey: "claude_code:both-uptodate",
      sourceSessionKey: "claude_code:both-uptodate",
      sourceSessionId: "both-uptodate",
      status: "up_to_date",
      presence: "both",
      storedSessionUid: "uid-uptodate",
      storedRawRef: "raw/uid-uptodate.ndjson",
      ingestedAt: "2026-04-22T00:05:00Z",
    }),
    // both + outdated — importable
    buildRow({
      rowKey: "claude_code:both-outdated",
      sourceSessionKey: "claude_code:both-outdated",
      sourceSessionId: "both-outdated",
      status: "outdated",
      presence: "both",
      storedSessionUid: "uid-outdated",
      storedRawRef: "raw/uid-outdated.ndjson",
      ingestedAt: "2026-04-22T00:05:00Z",
    }),
    // stored_only + up_to_date — NOT importable
    buildRow({
      rowKey: "stored:uid-so-uptodate",
      sourceSessionKey: null,
      sourceSessionId: "so-uptodate",
      status: "up_to_date",
      presence: "stored_only",
      storedSessionUid: "uid-so-uptodate",
      storedRawRef: "raw/uid-so-uptodate.ndjson",
      ingestedAt: "2026-04-22T00:09:00Z",
    }),
    // stored_only + outdated — NOT importable
    buildRow({
      rowKey: "stored:uid-so-outdated",
      sourceSessionKey: null,
      sourceSessionId: "so-outdated",
      status: "outdated",
      presence: "stored_only",
      storedSessionUid: "uid-so-outdated",
      storedRawRef: "raw/uid-so-outdated.ndjson",
      ingestedAt: "2026-04-22T00:10:00Z",
    }),
    // stored_only + source_missing — NOT importable
    buildRow({
      rowKey: "stored:uid-so-missing",
      sourceSessionKey: null,
      sourceSessionId: "so-missing",
      status: "source_missing",
      presence: "stored_only",
      sourcePathIsStale: true,
      sourcePath: "/last/known/path.jsonl",
      storedSessionUid: "uid-so-missing",
      storedRawRef: "raw/uid-so-missing.ndjson",
      ingestedAt: "2026-04-22T00:11:00Z",
    }),
  ];
  const onToggle = mock(() => {});
  const onToggleAll = mock(() => {});
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      now={NOW}
    />,
  );
  // Header checkbox plus per-row checkboxes; importable rows = 2.
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  // 1 header + 2 importable rows = 3 checkboxes total.
  expect(checkboxes.length).toBe(3);
  // The two importable rows expose their `aria-label="Select <key>"`.
  expect(
    container.querySelector(
      'input[aria-label="Select claude_code:so-not-stored"]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelector(
      'input[aria-label="Select claude_code:both-outdated"]',
    ),
  ).not.toBeNull();
  // None of the four non-importable rows expose a checkbox.
  expect(
    container.querySelector(
      'input[aria-label="Select claude_code:both-uptodate"]',
    ),
  ).toBeNull();
  expect(
    container.querySelector('input[aria-label^="Select stored:"]'),
  ).toBeNull();
});

test("SessionsTable: header checkbox click fires onToggleAll exactly once", () => {
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "claude_code:hdr-1",
      sourceSessionKey: "claude_code:hdr-1",
      sourceSessionId: "hdr-1",
      status: "not_stored",
      presence: "source_only",
    }),
  ];
  const onToggle = mock(() => {});
  const onToggleAll = mock(() => {});
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      now={NOW}
    />,
  );
  const headerCheckbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select all importable sessions"]',
  );
  expect(headerCheckbox).not.toBeNull();
  expect(headerCheckbox?.disabled).toBe(false);
  headerCheckbox?.click();
  expect(onToggleAll).toHaveBeenCalledTimes(1);
  expect(onToggle).toHaveBeenCalledTimes(0);
});

test("SessionsTable: header checkbox is disabled when zero rows are importable", () => {
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "stored:uid-only",
      sourceSessionKey: null,
      sourceSessionId: "uid-only",
      status: "source_missing",
      presence: "stored_only",
      sourcePathIsStale: true,
      storedSessionUid: "uid-only",
      storedRawRef: "raw/uid-only.ndjson",
      ingestedAt: "2026-04-22T00:00:00Z",
    }),
  ];
  const onToggle = mock(() => {});
  const onToggleAll = mock(() => {});
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      now={NOW}
    />,
  );
  const headerCheckbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select all importable sessions"]',
  );
  expect(headerCheckbox).not.toBeNull();
  expect(headerCheckbox?.disabled).toBe(true);
});

test("SessionsTable: statusConflict=true renders the (refresh) affordance; false does not", () => {
  const conflictRow = buildRow({
    rowKey: "claude_code:conflict-1",
    sourceSessionKey: "claude_code:conflict-1",
    sourceSessionId: "conflict-1",
    status: "outdated",
    presence: "both",
    statusConflict: true,
    storedSessionUid: "uid-conflict",
    storedRawRef: "raw/uid-conflict.ndjson",
    ingestedAt: "2026-04-22T00:05:00Z",
  });
  const noConflictRow = buildRow({
    rowKey: "claude_code:noconflict-1",
    sourceSessionKey: "claude_code:noconflict-1",
    sourceSessionId: "noconflict-1",
    status: "outdated",
    presence: "both",
    statusConflict: false,
    storedSessionUid: "uid-noconflict",
    storedRawRef: "raw/uid-noconflict.ndjson",
    ingestedAt: "2026-04-22T00:05:00Z",
  });
  const onToggle = mock(() => {});
  const onToggleAll = mock(() => {});
  const { container } = render(
    <SessionsTable
      rows={[conflictRow, noConflictRow]}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      now={NOW}
    />,
  );
  // Exactly one (refresh) affordance in the DOM.
  const refreshSpans = Array.from(
    container.querySelectorAll("span.muted"),
  ).filter((el) => el.textContent === "(refresh)");
  expect(refreshSpans.length).toBe(1);
  // The conflict span carries the explanatory hover hint.
  expect(refreshSpans[0]?.getAttribute("title")).toBe(
    "Source and stored status disagreed during load — refresh to re-fetch.",
  );
});

test("SessionsTable: sourcePathIsStale=true puts a title= hover hint on the source-path cell", () => {
  const staleRow = buildRow({
    rowKey: "stored:uid-stale",
    sourceSessionKey: null,
    sourceSessionId: "stale-1",
    sourcePath: "/last/known/stale.jsonl",
    sourcePathIsStale: true,
    status: "source_missing",
    presence: "stored_only",
    storedSessionUid: "uid-stale",
    storedRawRef: "raw/uid-stale.ndjson",
    ingestedAt: "2026-04-22T00:00:00Z",
  });
  const freshRow = buildRow({
    rowKey: "claude_code:fresh-1",
    sourceSessionKey: "claude_code:fresh-1",
    sourceSessionId: "fresh-1",
    sourcePath: "/srv/sessions/fresh-1.jsonl",
    sourcePathIsStale: false,
    status: "not_stored",
    presence: "source_only",
  });
  const onToggle = mock(() => {});
  const onToggleAll = mock(() => {});
  const { container } = render(
    <SessionsTable
      rows={[staleRow, freshRow]}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      now={NOW}
    />,
  );
  // Locate each row's last cell (source-path column is the rightmost).
  const rowEls = container.querySelectorAll("tbody tr");
  expect(rowEls.length).toBe(2);
  const staleCell = rowEls[0]!.querySelector("td:last-child");
  const freshCell = rowEls[1]!.querySelector("td:last-child");
  expect(staleCell?.textContent).toBe("/last/known/stale.jsonl");
  expect(staleCell?.getAttribute("title")).toBe(
    "last seen source path — source file no longer discoverable",
  );
  expect(freshCell?.textContent).toBe("/srv/sessions/fresh-1.jsonl");
  expect(freshCell?.getAttribute("title")).toBeNull();
});

test("SessionsTable: clicking a per-row checkbox calls onToggle with the sourceSessionKey", () => {
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "claude_code:click-1",
      sourceSessionKey: "claude_code:click-1",
      sourceSessionId: "click-1",
      status: "not_stored",
      presence: "source_only",
    }),
  ];
  const onToggle = mock(() => {});
  const onToggleAll = mock(() => {});
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      now={NOW}
    />,
  );
  const rowCheckbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:click-1"]',
  );
  expect(rowCheckbox).not.toBeNull();
  rowCheckbox?.click();
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onToggle.mock.calls[0]?.[0]).toBe("claude_code:click-1");
});

test("SessionsTable: Updated cell renders relative time against the pinned `now` with absolute on hover", () => {
  // Pinned `now` is 12:00 UTC; this row's source_updated_at is 11:55
  // UTC — exactly 5 minutes earlier. Relative form: "5m ago".
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "claude_code:relative-1",
      sourceSessionKey: "claude_code:relative-1",
      sourceUpdatedAt: "2026-04-25T11:55:00Z",
    }),
    // Null sourceUpdatedAt -> em-dash.
    buildRow({
      rowKey: "stored:uid-null-update",
      sourceSessionKey: null,
      sourceUpdatedAt: null,
      status: "source_missing",
      presence: "stored_only",
      sourcePathIsStale: true,
      storedSessionUid: "uid-null-update",
      storedRawRef: "raw/uid-null-update.ndjson",
      ingestedAt: "2026-04-22T00:00:00Z",
    }),
  ];
  const onToggle = mock(() => {});
  const onToggleAll = mock(() => {});
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      now={NOW}
    />,
  );
  const rowEls = container.querySelectorAll("tbody tr");
  expect(rowEls.length).toBe(2);
  // The "Updated" column is the 6th <td> (after select / status /
  // tool / title / project). Look for it by its `title` attribute
  // for robustness against future column reorders.
  const updatedCells = container.querySelectorAll(
    'td[title="2026-04-25T11:55:00Z"]',
  );
  expect(updatedCells.length).toBe(1);
  expect(updatedCells[0]?.textContent).toBe("5m ago");
  // Null updated -> em-dash; no title attribute.
  const dashCells = Array.from(
    container.querySelectorAll("tbody td.mono"),
  ).filter((el) => el.textContent === "—");
  // At least one em-dash cell exists for the null row's Updated column.
  expect(dashCells.length).toBeGreaterThanOrEqual(1);
});
