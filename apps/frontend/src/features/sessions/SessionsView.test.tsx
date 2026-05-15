// Component-level tests for the M2b SessionsView surface.
//
// Coverage:
//   1. Sticky footer renders ONE `<ActionBar>` and ONE `<Pagination>`
//      inside `.list-pane-footer` (no duplicates anywhere else in the
//      component subtree).
//   2. Sticky footer Pagination is rendered ABOVE the ActionBar (the
//      DOM order matches the design.md §3.3 reading order).
//   3. M2b: SessionsView no longer mounts the Phase-4 modal drawer.
//      Asserting `<dialog>` is NOT in the SessionsView render tree
//      protects against a regression to the M1b shape (where
//      forwardRef + a `<Drawer>` sibling lived in this component).
//
// M2b removed the M1b drawer-trigger tests (the imperative
// `openDetail` ref handle + the drawer-body filter regression
// guard). Phase 5 M6 (2026-05-11) then deleted `Drawer.tsx` +
// `SessionDetail.tsx` and their sibling CSS / test files from disk
// per Resolved Decision #6 — the four-tab shell on `SessionView`
// is the only remaining detail surface.
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { SessionsView } from "./SessionsView";
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
    titleSource: null,
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

function harness(overrides: { rows?: SessionRow[] } = {}) {
  const rows = overrides.rows ?? [buildRow()];
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
  const utils = render(<SessionsView {...props} />);
  return { ...utils, props };
}

test("SessionsView M2b: sticky footer renders ONE <ActionBar> and ONE <Pagination> (no duplicates)", () => {
  const { container } = harness();
  const footers = container.querySelectorAll(".list-pane-footer");
  expect(footers.length).toBe(1);
  const actionBars = container.querySelectorAll(".action-bar");
  expect(actionBars.length).toBe(1);
  const paginations = container.querySelectorAll("nav.pagination");
  expect(paginations.length).toBe(1);
  expect(footers[0]?.querySelector(".action-bar")).not.toBeNull();
  expect(footers[0]?.querySelector("nav.pagination")).not.toBeNull();
});

test("SessionsView M2b: footer renders Pagination ABOVE ActionBar (DOM order matches reading order)", () => {
  const { container } = harness();
  const footer = container.querySelector(".list-pane-footer");
  expect(footer).not.toBeNull();
  const children = Array.from(footer!.children);
  expect(children[0]?.tagName).toBe("NAV");
  expect(children[0]?.classList.contains("pagination")).toBe(true);
  expect(children[1]?.classList.contains("action-bar")).toBe(true);
});

test("SessionsView M2b: NO <dialog> element renders inside the SessionsView render tree", () => {
  // The M1b modal drawer was removed in M2b; selection now flows
  // through the right-pane SessionView with its four-tab shell.
  // SessionsView's render tree must NOT contain any <dialog>
  // elements (the Phase-4 Drawer + SessionDetail files were deleted
  // from disk at Phase 5 M6 per Resolved Decision #6, so no
  // reachable component can mount one).
  const { container } = harness();
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.querySelector("dialog.drawer")).toBeNull();
});
