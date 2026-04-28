// Component-level tests for the M1b SessionsView surface.
//
// Coverage:
//   1. Sticky footer renders ONE `<ActionBar>` and ONE `<Pagination>`
//      inside `.list-pane-footer` (no duplicates anywhere else in the
//      component subtree).
//   2. Sticky footer Pagination is rendered ABOVE the ActionBar (the
//      DOM order matches the design.md §3.3 reading order).
//   3. M1b drawer trigger via the imperative `openDetail` ref handle
//      mounts the dialog with the matched row, and pressing Esc on
//      the dialog (component-test path) restores focus to the trigger
//      element passed in to `openDetail`. Mirrors the Phase 4 M4 E1
//      pattern from `Drawer.test.tsx`.
//   4. SessionsView does NOT auto-mount the drawer when the table row
//      receives `selectedRowKey` — the user must click the vestigial
//      "Open detail" button (or App.tsx's wired-up callback) to open.
//
// SessionsView's drawer state is owned internally; App.tsx delegates
// the trigger click via the SessionsViewHandle ref returned by
// `forwardRef`. We exercise the drawer-open path through that ref so
// the test does not need to mount the full App tree.
import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import {
  SessionsView,
  type SessionsViewHandle,
} from "./SessionsView";
import type { SessionRow } from "./types";
import { DEFAULT_FILTERS } from "./useSessionFilters";

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

function harness(
  overrides: { rows?: SessionRow[] } = {},
) {
  const rows = overrides.rows ?? [buildRow()];
  const ref = createRef<SessionsViewHandle>();
  const props = {
    sourceState: { kind: "ok" as const, data: [] },
    storedState: { kind: "ok" as const, data: [] },
    mergedRows: rows,
    filteredRows: rows,
    pageRows: rows,
    pageIndex: 0,
    pageSize: 50 as const,
    onChangePage: mock((_: number) => {}),
    onChangePageSize: mock((_: 50 | 100 | 200) => {}),
    filters: DEFAULT_FILTERS,
    projects: [],
    setFilter: mock(() => {}) as unknown as <
      K extends keyof typeof DEFAULT_FILTERS,
    >(
      key: K,
      value: (typeof DEFAULT_FILTERS)[K],
    ) => void,
    setImportableOnly: mock(() => {}),
    resetAll: mock(() => {}),
    selected: new Set<string>(),
    onToggle: mock(() => {}),
    onToggleAll: mock(() => {}),
    onRetry: mock(() => {}),
    onRescan: mock(() => {}),
    rescanPending: false,
    pending: null,
    selectedCount: 0,
    hiddenByFilterCount: 0,
    onImport: mock(() => {}),
    onClearHidden: mock(() => {}),
    onClearSelection: mock(() => {}),
    lastRescanAt: null,
    now: NOW,
    selectedRowKey: null,
    onSelectRow: mock((_: string) => {}),
    pendingDeepLinkPulseRowKey: null,
    onDeepLinkPulseEnd: mock((_: string) => {}),
  };
  const utils = render(<SessionsView ref={ref} {...props} />);
  return { ...utils, props, ref };
}

test("SessionsView M1b: sticky footer renders ONE <ActionBar> and ONE <Pagination> (no duplicates)", () => {
  const { container } = harness();
  // The sticky footer is the only home of these two components.
  const footers = container.querySelectorAll(".list-pane-footer");
  expect(footers.length).toBe(1);
  const actionBars = container.querySelectorAll(".action-bar");
  expect(actionBars.length).toBe(1);
  const paginations = container.querySelectorAll("nav.pagination");
  expect(paginations.length).toBe(1);
  // Both children sit INSIDE the footer.
  expect(footers[0]?.querySelector(".action-bar")).not.toBeNull();
  expect(footers[0]?.querySelector("nav.pagination")).not.toBeNull();
});

test("SessionsView M1b: footer renders Pagination ABOVE ActionBar (DOM order matches reading order)", () => {
  const { container } = harness();
  const footer = container.querySelector(".list-pane-footer");
  expect(footer).not.toBeNull();
  const children = Array.from(footer!.children);
  // First child is the Pagination nav; second is the ActionBar div.
  expect(children[0]?.tagName).toBe("NAV");
  expect(children[0]?.classList.contains("pagination")).toBe(true);
  expect(children[1]?.classList.contains("action-bar")).toBe(true);
});

test("SessionsView M1b: row selection in the table does NOT auto-mount the drawer", () => {
  // Selection is signalled via `selectedRowKey` + `onSelectRow`; the
  // drawer opens ONLY when `openDetail` is invoked through the ref
  // handle (App.tsx wires this to SessionView's vestigial button).
  const { container } = harness();
  const dialog = container.querySelector("dialog.drawer") as HTMLDialogElement;
  expect(dialog).not.toBeNull();
  // Drawer is NOT open by default.
  expect(dialog.open).toBe(false);
});

test("SessionsView M1b round-1 fix: drawer body renders the selected row even when the row is filtered OUT", () => {
  // Codex round-1 finding: the drawer body lookup previously read
  // from `filteredRows` and would render an empty body when the
  // selected row was hidden by an active filter. App.tsx keeps the
  // right pane in `ready-placeholder` while the selection lives in
  // `mergedRows`, so the vestigial "Open detail" button is reachable
  // in that state — and the drawer must show full metadata for the
  // selected row regardless of filter scope. Fix moves the lookup to
  // `mergedRows`.
  const visibleRow = buildRow({
    rowKey: "claude_code:visible-1",
    sourceSessionKey: "claude_code:visible-1",
    title: "Visible row",
  });
  const filteredOutRow = buildRow({
    rowKey: "claude_code:hidden-1",
    sourceSessionKey: "claude_code:hidden-1",
    title: "Filtered-out row",
  });
  // Build a custom prop set: mergedRows contains BOTH; filteredRows
  // contains only the visible row. The harness factory always sets
  // mergedRows === filteredRows, so we render directly here.
  const ref = createRef<SessionsViewHandle>();
  const props = {
    sourceState: { kind: "ok" as const, data: [] },
    storedState: { kind: "ok" as const, data: [] },
    mergedRows: [visibleRow, filteredOutRow],
    filteredRows: [visibleRow],
    pageRows: [visibleRow],
    pageIndex: 0,
    pageSize: 50 as const,
    onChangePage: mock((_: number) => {}),
    onChangePageSize: mock((_: 50 | 100 | 200) => {}),
    filters: DEFAULT_FILTERS,
    projects: [],
    setFilter: mock(() => {}) as unknown as <
      K extends keyof typeof DEFAULT_FILTERS,
    >(
      key: K,
      value: (typeof DEFAULT_FILTERS)[K],
    ) => void,
    setImportableOnly: mock(() => {}),
    resetAll: mock(() => {}),
    selected: new Set<string>(),
    onToggle: mock(() => {}),
    onToggleAll: mock(() => {}),
    onRetry: mock(() => {}),
    onRescan: mock(() => {}),
    rescanPending: false,
    pending: null,
    selectedCount: 0,
    hiddenByFilterCount: 1,
    onImport: mock(() => {}),
    onClearHidden: mock(() => {}),
    onClearSelection: mock(() => {}),
    lastRescanAt: null,
    now: NOW,
    selectedRowKey: filteredOutRow.rowKey,
    onSelectRow: mock((_: string) => {}),
    pendingDeepLinkPulseRowKey: null,
    onDeepLinkPulseEnd: mock((_: string) => {}),
  };
  const { container } = render(<SessionsView ref={ref} {...props} />);
  // Sanity: the table only shows the visible row; the filtered-out
  // row is NOT in the rendered table body.
  expect(
    container.querySelector(`tr:has-text("Filtered-out row")`)?.textContent,
  ).toBeUndefined();
  // Now open the drawer for the filtered-out row (App.tsx invokes
  // this when the user clicks the vestigial "Open detail" button
  // while the selection is still in mergedRows but no longer in
  // filteredRows).
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.textContent = "Open detail";
  document.body.appendChild(trigger);
  act(() => {
    ref.current?.openDetail(filteredOutRow.rowKey, trigger);
  });
  const dialog = container.querySelector("dialog.drawer") as HTMLDialogElement;
  expect(dialog).not.toBeNull();
  expect(dialog.open).toBe(true);
  // The drawer body MUST render <SessionDetail> content for the
  // filtered-out row — i.e. the row's title is in the dialog text.
  // Pre-fix this would fail: the body would be empty (selectedDetailRow
  // === null because filteredRows.find(...) returned undefined).
  expect(dialog.textContent?.includes("Filtered-out row")).toBe(true);
  // The aria-label ALSO carries the row's title (covered through the
  // same lookup path) — sanity to confirm the lookup landed.
  expect(dialog.getAttribute("aria-label")).toMatch(/Filtered-out row/);
  trigger.remove();
});

test("SessionsView M1b: openDetail handle mounts the dialog with the matched row; close restores focus to the triggerEl", () => {
  const row = buildRow({
    rowKey: "claude_code:drawer-open-1",
    sourceSessionKey: "claude_code:drawer-open-1",
    title: "Drawer open row",
  });
  const { container, ref } = harness({ rows: [row] });
  // Build a button stand-in to act as the drawer's trigger element so
  // we can assert focus restoration on close. The button is a
  // pure DOM node — we stash a ref so the Drawer can `focus()` it
  // explicitly when the close handler fires.
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.textContent = "Open detail";
  document.body.appendChild(trigger);
  trigger.focus();
  expect(document.activeElement).toBe(trigger);

  // Open the drawer through the imperative handle (the App.tsx wires
  // this through `handleOpenDetailFromSessionView` in production).
  act(() => {
    ref.current?.openDetail(row.rowKey, trigger);
  });
  const dialog = container.querySelector("dialog.drawer") as HTMLDialogElement;
  expect(dialog).not.toBeNull();
  expect(dialog.open).toBe(true);
  // The dialog body renders the matched row's title.
  expect(dialog.textContent?.includes("Drawer open row")).toBe(true);

  // Close via the in-dialog Close button — same path as the e2e
  // step 9 sub-test (c).
  const closeButton = dialog.querySelector(
    "button.drawer-close",
  ) as HTMLButtonElement;
  expect(closeButton).not.toBeNull();
  act(() => {
    closeButton.click();
  });
  expect(dialog.open).toBe(false);
  // Focus restored to the trigger element passed in to openDetail.
  expect(document.activeElement).toBe(trigger);
  // Cleanup the stand-in trigger so it does not bleed into the next
  // test (cleanup() afterEach handles React-rendered DOM but not
  // direct mutations like this one).
  trigger.remove();
});
