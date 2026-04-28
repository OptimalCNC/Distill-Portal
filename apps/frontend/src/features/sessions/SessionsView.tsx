// Section-level wrapper for the unified inspection list.
//
// `SessionsView` owns:
//   - rendering the SessionFilters control bar above the table
//     (the bar wraps in a `<details>` disclosure below 1100 px per
//     M1b; the wrap is internal to `SessionFilters.tsx`)
//   - the per-section error banner when ONE side fetch failed
//     (per-panel error isolation rule carried over from Phase 3 F1:
//     a source 500 must not blank the stored-side rows, and vice
//     versa)
//   - dispatching to one of the four empty-state branches per
//     `working/phase-4.md` §Filter, Sort, Search → Empty States:
//       (1) "No sessions at all" — both fetches resolved to empty
//       (2) "No matches after filter/search" — merged > 0 but
//           filtered === 0 because of an active filter
//       (3) "Nothing to import in the current filter" — filtered > 0
//           but zero importable rows
//       (4) "Partial fetch failure" — one of (source, stored) errored;
//           the per-section banner from M2 still renders + the
//           unified table shows the surviving rows
//   - the M4 detail drawer state (`detailRowKey`) plus the trigger
//     ref. The drawer is always rendered as a sibling of the table
//     (one drawer at a time per spec); `isOpen` controls its modal
//     state. As of M1b the trigger ref captures the vestigial
//     "Open detail" BUTTON (NOT the row — Phase 4 used the row).
//     The vestigial button lives in `SessionView` (the right pane);
//     `App.tsx` plumbs the click through to this component's
//     `handleOpenDetail` so drawer ownership stays in `SessionsView`
//     — minimizes diff vs the Phase 4 pattern.
//   - As of M1b the view also relocates `<ActionBar>` and
//     `<Pagination>` into a single `.list-pane-footer` strip at the
//     bottom of the list pane. The strip is `position: sticky;
//     bottom: 0` so the footer is always visible regardless of
//     scroll. Pagination renders ABOVE ActionBar inside the footer
//     (per spec lines 555 + design.md §3.3).
//
// `App.tsx` retains ownership of fetch state, the merged + filtered
// + paginated row sets (memoized once + passed in), the `selected`
// set, the filter state hook, every mutation handler, AND the
// URL-synced selection (per Resolved Decision #20). SessionsView is
// presentational except for the drawer state.
//
// Important pagination invariant: `filteredRows` is the FULL
// post-filter set (every page); `pageRows` is the slice for the
// active page. Empty-state branch math reads from `mergedRows` and
// `filteredRows` (NOT `pageRows`) — a paginated list with rows on
// page 2 and an empty page 1 is NOT the same as "no matches after
// filter". The drawer body, however, reads from `mergedRows` so a
// row that is currently filtered OUT (e.g. user selected a row,
// then narrowed the tool filter) still opens with full metadata
// when the vestigial "Open detail" button is clicked. App.tsx keeps
// the right pane in `ready-placeholder` while the selection lives
// in `mergedRows`, so the button stays reachable in that state.
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { isImportable } from "./types";
import type { SessionRow } from "./types";
import { SessionFilters } from "./SessionFilters";
import { SessionsTable } from "./SessionsTable";
import { SessionDetail } from "./SessionDetail";
import { Drawer } from "../../components/Drawer";
import { ActionBar } from "../../components/ActionBar";
import { Pagination } from "../../components/Pagination";
import type { PageSize } from "./applyPagination";
import type { SessionFiltersState } from "./useSessionFilters";
import type { SourceSessionView, StoredSessionView } from "../../lib/contracts";
import "./SessionsView.css";

export type PanelState<T> =
  | { kind: "loading" }
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string };

export type SessionsViewHandle = {
  /** M1b: drawer-trigger entry point for App.tsx. The vestigial
   *  "Open detail" button in `SessionView` invokes a callback in
   *  `App.tsx` that delegates here so the drawer state stays
   *  encapsulated in this component (Phase 4 pattern preserved). */
  openDetail: (rowKey: string, triggerEl: HTMLElement | null) => void;
};

export type SessionsViewProps = {
  sourceState: PanelState<SourceSessionView[]>;
  storedState: PanelState<StoredSessionView[]>;
  /** Merged but unfiltered rows. Used to distinguish "no sessions at all"
   *  from "no matches after filter/search". */
  mergedRows: SessionRow[];
  /** Merged + filtered + sorted rows (full set across all pages). The
   *  empty-state math reads from this; the table itself reads from
   *  `pageRows`. The drawer body reads from `mergedRows` so a row
   *  that is currently filtered out stays openable via the vestigial
   *  "Open detail" button. */
  filteredRows: SessionRow[];
  /** Active page slice from `applyPagination(filteredRows, pageIndex,
   *  pageSize)`. Always a subarray of `filteredRows`. */
  pageRows: SessionRow[];
  /** 0-based index of the active page. Owned by `App.tsx`. */
  pageIndex: number;
  /** Page size in effect (50/100/200). Owned by useSessionFilters. */
  pageSize: PageSize;
  /** Pagination dispatchers. */
  onChangePage: (next: number) => void;
  onChangePageSize: (size: PageSize) => void;
  filters: SessionFiltersState;
  projects: string[];
  setFilter: <K extends keyof SessionFiltersState>(
    key: K,
    value: SessionFiltersState[K],
  ) => void;
  setImportableOnly: (v: boolean) => void;
  resetAll: () => void;
  selected: Set<string>;
  onToggle: (sourceSessionKey: string) => void;
  onToggleAll: () => void;
  onRetry: () => void;
  onRescan: () => void;
  rescanPending: boolean;
  /** M1b: pending mutation kind from App.tsx, threaded through to the
   *  in-footer ActionBar (drives Rescan/Import disabled states). */
  pending: "rescan" | "import" | null;
  /** M1b: selection metadata for the in-footer ActionBar. */
  selectedCount: number;
  hiddenByFilterCount: number;
  onImport: () => void;
  onClearHidden: () => void;
  onClearSelection: () => void;
  /** M1b: last-rescan-from-this-browser timestamp + pinned now for
   *  the in-footer ActionBar caption. */
  lastRescanAt: string | null;
  /** Pinned-`now` ISO string used by the relative-time cell renderer.
   *  Shared with the in-footer ActionBar so the two relative-time
   *  fields agree on the same instant. */
  now: string;
  /** M1a: rowKey of the currently URL-selected session (passed
   *  through to SessionsTable for `aria-current="true"` styling +
   *  the selected-row visual treatment). */
  selectedRowKey?: string | null;
  /** M1a: setter for the URL-synced selection. Row click invokes
   *  this. Per M1b the row click no longer auto-mounts the drawer;
   *  the vestigial button in SessionView is the new drawer entry
   *  point. */
  onSelectRow?: (rowKey: string) => void;
  /** M1a: rowKey of the row that should fire the deep-link pulse on
   *  the next paint (URL-driven mount only — never click-driven). */
  pendingDeepLinkPulseRowKey?: string | null;
  /** M1a: notify the parent that the deep-link pulse animation has
   *  ended on `rowKey` so the parent can clear
   *  `pendingDeepLinkPulseRowKey`. */
  onDeepLinkPulseEnd?: (rowKey: string) => void;
};

export const SessionsView = forwardRef<SessionsViewHandle, SessionsViewProps>(
  function SessionsView(
    {
      sourceState,
      storedState,
      mergedRows,
      filteredRows,
      pageRows,
      pageIndex,
      pageSize,
      onChangePage,
      onChangePageSize,
      filters,
      projects,
      setFilter,
      setImportableOnly,
      resetAll,
      selected,
      onToggle,
      onToggleAll,
      onRetry,
      onRescan,
      rescanPending,
      pending,
      selectedCount,
      hiddenByFilterCount,
      onImport,
      onClearHidden,
      onClearSelection,
      lastRescanAt,
      now,
      selectedRowKey,
      onSelectRow,
      pendingDeepLinkPulseRowKey,
      onDeepLinkPulseEnd,
    },
    ref,
  ) {
    // Detail drawer state. `detailRowKey === null` -> closed; otherwise
    // the value is a `SessionRow.rowKey` (NOT a backend session_key —
    // stored_only rows must be openable too, so we use the React-level
    // identity that always exists).
    const [detailRowKey, setDetailRowKey] = useState<string | null>(null);
    // Capture the trigger element so we can restore focus on close.
    // `useRef<HTMLElement | null>(null)` lets us pass the same ref into
    // the Drawer's `restoreFocusRef` prop without re-binding on every
    // render. M1b shifts the trigger from the row (Phase 4) to the
    // vestigial "Open detail" button in SessionView.
    const triggerRef = useRef<HTMLElement | null>(null);

    const handleOpenDetail = (
      rowKey: string,
      triggerEl: HTMLElement | null,
    ) => {
      triggerRef.current = triggerEl;
      setDetailRowKey(rowKey);
    };
    const handleCloseDetail = () => {
      setDetailRowKey(null);
    };

    // Expose the drawer-trigger to `App.tsx` via a ref handle. App.tsx
    // resolves `selectedRowKey` against the merged set and passes the
    // result here so this component does not need to know about the
    // selection model itself (selection ownership stays in App.tsx
    // per Resolved Decision #20).
    useImperativeHandle(
      ref,
      () => ({ openDetail: handleOpenDetail }),
      [],
    );

    // Pick the merged row to render in the drawer body. Read from
    // `mergedRows` (NOT `filteredRows` or `pageRows`) so the drawer
    // always shows the selected row's metadata even if the active
    // filter currently hides it from the table. App.tsx keeps the
    // right pane in `ready-placeholder` whenever the selection exists
    // in `mergedRows`, so the vestigial "Open detail" button is
    // reachable while the row is filtered out — and the codex review
    // (M1b round 1) flagged that scoping the lookup to `filteredRows`
    // would render an empty drawer body in that case. The selection
    // model is already merge-scoped (App.tsx); this mirrors it.
    const selectedDetailRow: SessionRow | null =
      detailRowKey === null
        ? null
        : mergedRows.find((r) => r.rowKey === detailRowKey) ?? null;

    // Both sides still loading: render a single "loading" hint. This
    // mirrors the Phase 3 PanelBody behavior so the user sees feedback
    // during the initial fetch.
    if (sourceState.kind === "loading" && storedState.kind === "loading") {
      return <p>Loading sessions...</p>;
    }

    // Both sides errored: full-section "no sessions could be loaded"
    // with a Retry. The other partial-fetch-failure branches (one side
    // ok, one side errored) render the unified table built from the
    // surviving side ONLY, plus a banner.
    if (sourceState.kind === "error" && storedState.kind === "error") {
      return (
        <div className="empty">
          <p role="alert">
            No sessions could be loaded. Source error:{" "}
            {sourceState.message}. Stored error: {storedState.message}.
          </p>
          <p>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </p>
        </div>
      );
    }

    // Decide which empty-state branch (if any) fires for the current
    // (mergedRows, filteredRows) tuple. The branches are mutually
    // exclusive; falling through means we render the table.
    //
    // NOTE: empty-state math reads from `filteredRows`, not `pageRows`.
    // A 100-row filter that pages to "page 2 with 0 items because the
    // user's stale pageIndex landed past the last page" still has
    // matching rows; the pagination clamp in App.tsx fixes the index
    // before the next render lands.
    let emptyState: EmptyStateKind | null = null;
    if (mergedRows.length === 0) {
      emptyState = "no_sessions_at_all";
    } else if (filteredRows.length === 0) {
      emptyState = "no_matches_after_filter";
    } else if (filteredRows.every((r) => !isImportable(r))) {
      emptyState = "nothing_to_import";
    }

    return (
      <>
        {sourceState.kind === "error" ? (
          <p role="alert">
            Failed to load source sessions: {sourceState.message}{" "}
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </p>
        ) : null}
        {storedState.kind === "error" ? (
          <p role="alert">
            Failed to load stored sessions: {storedState.message}{" "}
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </p>
        ) : null}
        <SessionFilters
          filters={filters}
          projects={projects}
          setFilter={setFilter}
          setImportableOnly={setImportableOnly}
        />
        {emptyState === "no_sessions_at_all" ? (
          <div className="empty">
            <p>No sessions have been discovered or stored yet.</p>
            <p>
              <button
                type="button"
                onClick={onRescan}
                disabled={rescanPending}
              >
                {rescanPending ? "Rescanning..." : "Rescan"}
              </button>
            </p>
          </div>
        ) : null}
        {emptyState === "no_matches_after_filter" ? (
          <div className="empty">
            <p>No sessions match the current filter.</p>
            <p>
              <button type="button" onClick={resetAll}>
                Clear filters
              </button>
            </p>
          </div>
        ) : null}
        {emptyState === "nothing_to_import" ? (
          <div className="empty">
            <p>Nothing to import in the current filter.</p>
            <p>
              <button
                type="button"
                onClick={() => setImportableOnly(true)}
              >
                Show importable only
              </button>
            </p>
          </div>
        ) : null}
        {/* Render the table when filteredRows > 0, regardless of
            whether the "Nothing to import" empty state is also up.
            The table is informative (rows describe what the user CAN
            see) and the empty-state copy + affordance complement it
            rather than replace it. The two table-suppressing branches
            ("no_sessions_at_all" and "no_matches_after_filter") only
            fire when filteredRows.length === 0, so the table never
            renders zero rows in those branches.

            The table receives `pageRows` (NOT `filteredRows`) — the
            slice math lives in `applyPagination` and is clamped per
            render so a stale `pageIndex` from React state never
            renders an empty page when filteredRows is non-empty. */}
        {filteredRows.length > 0 ? (
          <SessionsTable
            rows={pageRows}
            selected={selected}
            onToggle={onToggle}
            onToggleAll={onToggleAll}
            now={now}
            selectedRowKey={selectedRowKey ?? null}
            onSelectRow={onSelectRow}
            pendingDeepLinkPulseRowKey={pendingDeepLinkPulseRowKey ?? null}
            onDeepLinkPulseEnd={onDeepLinkPulseEnd}
          />
        ) : null}
        {/* M1b sticky list-pane footer. Pagination ABOVE ActionBar
            (top-down: Table -> Pagination -> ActionBar — per spec
            line 555 + design.md §3.3). The footer's `border-top`
            hairline is the sole separator from the table content;
            the inner ActionBar `border-top` is preserved as the
            secondary separator between Pagination and the buttons
            row (two stacked hairlines is intentional per the UI/UX
            reviewer's notes). */}
        <div className="list-pane-footer">
          {filteredRows.length > 0 ? (
            <Pagination
              pageSize={pageSize}
              pageIndex={pageIndex}
              totalRows={filteredRows.length}
              onChangePage={onChangePage}
              onChangePageSize={onChangePageSize}
            />
          ) : null}
          <ActionBar
            selectedCount={selectedCount}
            hiddenByFilterCount={hiddenByFilterCount}
            pending={pending}
            onRescan={onRescan}
            onImport={onImport}
            onClearHidden={onClearHidden}
            onClearSelection={onClearSelection}
            lastRescanAt={lastRescanAt}
            now={now}
          />
        </div>
        {/* Drawer is ALWAYS rendered — `isOpen` controls the platform
            modal state. A conditional unmount would break the
            showModal()/close() lifecycle and lose the dialog ref between
            opens. */}
        <Drawer
          isOpen={detailRowKey !== null}
          onClose={handleCloseDetail}
          restoreFocusRef={triggerRef}
          ariaLabel={
            selectedDetailRow !== null
              ? `Session detail: ${selectedDetailRow.title ?? "(untitled)"}`
              : "Session detail"
          }
        >
          {selectedDetailRow !== null ? (
            <SessionDetail row={selectedDetailRow} now={now} />
          ) : null}
        </Drawer>
      </>
    );
  },
);

type EmptyStateKind =
  | "no_sessions_at_all"
  | "no_matches_after_filter"
  | "nothing_to_import";
