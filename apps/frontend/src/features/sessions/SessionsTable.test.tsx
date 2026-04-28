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
//   4. M1b 4-essentials: header carries Title + Status + Project +
//      Updated (in addition to the Select column).
//   5. M1b dropped columns: Tool / Stored Copy / Source Path do NOT
//      appear in `<thead>` or `<tbody>`.
//   6. M1b Title cell stack: bold title (line 1) + tool badge inline
//      on line 1; muted mono rowKey on line 2.
//   7. M1b `(refresh)` affordance: a row with `statusConflict: true`
//      renders the `(refresh)` marker INSIDE the Title cell; a row
//      with `statusConflict: false` does not.
//   8. M1b row click: clicking a row (NOT the checkbox cell) fires
//      `onSelectRow(row.rowKey)`. The Phase-4 `onOpenDetail` prop is
//      gone — the drawer entry point shifts to the vestigial button.
//   9. M1b Enter keydown on a focused row fires `onSelectRow`.
//   10. Clicking the checkbox cell does NOT call `onSelectRow` (the
//       importability rule's stopPropagation guard preserved verbatim
//       from Phase 4).
import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
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

test("SessionsTable: M1b header renders 5 columns (Select + Title + Status + Project + Updated); dropped columns absent", () => {
  // The M1b column compression: 5 essentials only. The dropped Phase-4
  // columns (Tool / Stored Copy / Source Path) must not appear in
  // `<thead>` or `<tbody>` — staleness + stored-uid + tool surface
  // through the still-mounted Phase-4 `<Drawer>` until M2's Metadata
  // tab takes over.
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "claude_code:m1b-1",
      sourceSessionKey: "claude_code:m1b-1",
      sourceSessionId: "m1b-1",
      status: "not_stored",
      presence: "source_only",
    }),
  ];
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={mock(() => {})}
      onToggleAll={mock(() => {})}
      now={NOW}
    />,
  );
  const headers = Array.from(container.querySelectorAll("thead th")).map((th) =>
    th.textContent?.trim(),
  );
  expect(headers).toEqual(["", "Title", "Status", "Project", "Updated"]);
  // Sanity: the `<thead>` does not name any of the dropped columns.
  const headerText = container.querySelector("thead")?.textContent ?? "";
  expect(headerText.includes("Tool")).toBe(false);
  expect(headerText.includes("Stored Copy")).toBe(false);
  expect(headerText.includes("Source Path")).toBe(false);
});

test("SessionsTable: M1b Title cell stack — bold title + tool badge + mono rowKey", () => {
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "claude_code:m1b-stack",
      sourceSessionKey: "claude_code:m1b-stack",
      sourceSessionId: "m1b-stack",
      title: "M1b stack title",
      tool: "claude_code",
      status: "not_stored",
      presence: "source_only",
    }),
  ];
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={mock(() => {})}
      onToggleAll={mock(() => {})}
      now={NOW}
    />,
  );
  // Title cell wrapper exists.
  const titleCell = container.querySelector(".title-cell");
  expect(titleCell).not.toBeNull();
  // Line 1: title + tool.
  const title = titleCell?.querySelector(".title-cell-title");
  expect(title?.textContent).toBe("M1b stack title");
  const tool = titleCell?.querySelector(".title-cell-tool");
  expect(tool?.textContent).toBe("claude_code");
  // Line 2: rowKey.
  const rowKey = titleCell?.querySelector(".title-cell-rowkey");
  expect(rowKey?.textContent).toBe("claude_code:m1b-stack");
});

test("SessionsTable: M1b (refresh) marker lives INSIDE the Title cell when statusConflict=true; absent otherwise", () => {
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
  const { container } = render(
    <SessionsTable
      rows={[conflictRow, noConflictRow]}
      selected={new Set()}
      onToggle={mock(() => {})}
      onToggleAll={mock(() => {})}
      now={NOW}
    />,
  );
  // Exactly one (refresh) affordance in the DOM (on the conflict row).
  const refreshSpans = Array.from(
    container.querySelectorAll(".title-cell-refresh"),
  );
  expect(refreshSpans.length).toBe(1);
  expect(refreshSpans[0]?.textContent).toBe("(refresh)");
  expect(refreshSpans[0]?.getAttribute("title")).toBe(
    "Source and stored status disagreed during load — refresh to re-fetch.",
  );
  // The marker lives inside the Title cell, NOT in a separate column.
  const containingTitleCell = refreshSpans[0]?.closest(".title-cell");
  expect(containingTitleCell).not.toBeNull();
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
  expect(
    (onToggle.mock.calls as readonly unknown[][])[0]?.[0],
  ).toBe("claude_code:click-1");
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
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={mock(() => {})}
      onToggleAll={mock(() => {})}
      now={NOW}
    />,
  );
  const rowEls = container.querySelectorAll("tbody tr");
  expect(rowEls.length).toBe(2);
  // The Updated column has the title= attribute equal to ISO timestamp.
  const updatedCells = container.querySelectorAll(
    'td[title="2026-04-25T11:55:00Z"]',
  );
  expect(updatedCells.length).toBe(1);
  expect(updatedCells[0]?.textContent).toBe("5m ago");
  // Null updated -> em-dash; no title attribute.
  const dashCells = Array.from(
    container.querySelectorAll("tbody td.updated-cell"),
  ).filter((el) => el.textContent === "—");
  expect(dashCells.length).toBe(1);
});

test("SessionsTable: M1b row click invokes onSelectRow(row.rowKey) exactly once", () => {
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "claude_code:select-1",
      sourceSessionKey: "claude_code:select-1",
      sourceSessionId: "select-1",
      status: "not_stored",
      presence: "source_only",
    }),
  ];
  const onSelectRow = mock((_rowKey: string) => {});
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={mock(() => {})}
      onToggleAll={mock(() => {})}
      onSelectRow={onSelectRow}
      now={NOW}
    />,
  );
  const tr = container.querySelector("tbody tr") as HTMLTableRowElement;
  expect(tr).not.toBeNull();
  // Click a non-checkbox cell — the Title cell with the `.title-cell`
  // wrapper.
  const titleCell = tr.querySelector(".title-cell") as HTMLElement;
  expect(titleCell).not.toBeNull();
  act(() => {
    titleCell.click();
  });
  expect(onSelectRow).toHaveBeenCalledTimes(1);
  expect(onSelectRow.mock.calls[0]?.[0]).toBe("claude_code:select-1");
});

test("SessionsTable: M1b Enter keydown on a focused row invokes onSelectRow", () => {
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "claude_code:enter-1",
      sourceSessionKey: "claude_code:enter-1",
      sourceSessionId: "enter-1",
      status: "not_stored",
      presence: "source_only",
    }),
  ];
  const onSelectRow = mock((_rowKey: string) => {});
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={mock(() => {})}
      onToggleAll={mock(() => {})}
      onSelectRow={onSelectRow}
      now={NOW}
    />,
  );
  const tr = container.querySelector("tbody tr") as HTMLTableRowElement;
  expect(tr).not.toBeNull();
  expect(tr.getAttribute("tabindex")).toBe("0");
  const KeyboardEventCtor =
    (globalThis as unknown as { window: { KeyboardEvent: typeof KeyboardEvent } })
      .window.KeyboardEvent;
  const enter = new KeyboardEventCtor("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    tr.dispatchEvent(enter);
  });
  expect(onSelectRow).toHaveBeenCalledTimes(1);
  expect(onSelectRow.mock.calls[0]?.[0]).toBe("claude_code:enter-1");
});

test("SessionsTable: clicking the checkbox cell calls onToggle but NOT onSelectRow", () => {
  const rows: SessionRow[] = [
    buildRow({
      rowKey: "claude_code:checkbox-1",
      sourceSessionKey: "claude_code:checkbox-1",
      sourceSessionId: "checkbox-1",
      status: "not_stored",
      presence: "source_only",
    }),
  ];
  const onToggle = mock(() => {});
  const onSelectRow = mock((_rowKey: string) => {});
  const { container } = render(
    <SessionsTable
      rows={rows}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={mock(() => {})}
      onSelectRow={onSelectRow}
      now={NOW}
    />,
  );
  const checkbox = container.querySelector(
    'input[type="checkbox"][aria-label="Select claude_code:checkbox-1"]',
  ) as HTMLInputElement;
  expect(checkbox).not.toBeNull();
  act(() => {
    checkbox.click();
  });
  // Selection toggle fired.
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(
    (onToggle.mock.calls as readonly unknown[][])[0]?.[0],
  ).toBe("claude_code:checkbox-1");
  // Row-open path did NOT fire — the checkbox cell guard short-circuited.
  expect(onSelectRow).toHaveBeenCalledTimes(0);
});

test("SessionsTable: inlined status badge renders all 4 variants with the correct class + label transform (M6 StatusBadge retirement)", () => {
  // Phase 4 Milestone 6 retired StatusBadge.tsx; the JSX is now inlined
  // at SessionsTable.tsx (Status cell). This test pins the byte-for-byte
  // contract that StatusBadge.test.tsx used to enforce: every legal
  // SessionSyncStatus value renders as
  // `<span class="badge {status.replace(/_/g, "-")}">{status.replace(/_/g, " ")}</span>`.
  const variants = [
    {
      status: "up_to_date" as const,
      cssClass: "up-to-date",
      label: "up to date",
    },
    {
      status: "not_stored" as const,
      cssClass: "not-stored",
      label: "not stored",
    },
    {
      status: "outdated" as const,
      cssClass: "outdated",
      label: "outdated",
    },
    {
      status: "source_missing" as const,
      cssClass: "source-missing",
      label: "source missing",
    },
  ];
  for (const variant of variants) {
    const { container } = render(
      <SessionsTable
        rows={[buildRow({ status: variant.status })]}
        selected={new Set()}
        onToggle={mock(() => {})}
        onToggleAll={mock(() => {})}
        now={NOW}
      />,
    );
    const badges = container.querySelectorAll(`span.badge.${variant.cssClass}`);
    expect(badges.length).toBe(1);
    expect(badges[0]?.textContent).toBe(variant.label);
    cleanup();
  }
});
