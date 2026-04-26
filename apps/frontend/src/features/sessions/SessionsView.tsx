// Section-level wrapper for the unified inspection list.
//
// `SessionsView` owns:
//   - rendering the SessionFilters control bar above the table
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
//     state. The trigger ref captures the row that opened the
//     drawer so focus can be restored to it on close (the explicit
//     restoration is the path under test in component tests; in
//     real Chromium the platform restoration also fires).
//   - As of M5 the view also renders a `<Pagination>` strip below
//     the table. The strip is a controlled component; `App.tsx`
//     owns the `pageIndex` state (and the `pageSize` field, persisted
//     via `useSessionFilters`). The page-size selector and the
//     prev/next buttons dispatch back through `onChangePage` /
//     `onChangePageSize`. The strip renders even when the page set
//     is empty so the layout doesn't shift.
//
// `App.tsx` retains ownership of fetch state, the merged + filtered
// + paginated row sets (memoized once + passed in), the `selected`
// set, the filter state hook, and every mutation handler.
// SessionsView is presentational except for the drawer state.
//
// Important pagination invariant: `filteredRows` is the FULL
// post-filter set (every page); `pageRows` is the slice for the
// active page. Empty-state branch math reads from `mergedRows` and
// `filteredRows` (NOT `pageRows`) — a paginated list with rows on
// page 2 and an empty page 1 is NOT the same as "no matches after
// filter". The drawer also reads from `filteredRows` so a row that
// is currently off-page is still openable if it's still in the
// filter window (the M4 contract).
import { useRef, useState } from "react";
import { isImportable } from "./types";
import type { SessionRow } from "./types";
import { SessionFilters } from "./SessionFilters";
import { SessionsTable } from "./SessionsTable";
import { SessionDetail } from "./SessionDetail";
import { Drawer } from "../../components/Drawer";
import { Pagination } from "../../components/Pagination";
import type { PageSize } from "./applyPagination";
import type { SessionFiltersState } from "./useSessionFilters";
import type { SourceSessionView, StoredSessionView } from "../../lib/contracts";

export type PanelState<T> =
  | { kind: "loading" }
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string };

export type SessionsViewProps = {
  sourceState: PanelState<SourceSessionView[]>;
  storedState: PanelState<StoredSessionView[]>;
  /** Merged but unfiltered rows. Used to distinguish "no sessions at all"
   *  from "no matches after filter/search". */
  mergedRows: SessionRow[];
  /** Merged + filtered + sorted rows (full set across all pages). The
   *  empty-state math + drawer lookup read from this; the table
   *  itself reads from `pageRows`. */
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
  /** Pinned-`now` ISO string used by the relative-time cell renderer. */
  now: string;
};

export function SessionsView({
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
  now,
}: SessionsViewProps) {
  // Detail drawer state. `detailRowKey === null` -> closed; otherwise
  // the value is a `SessionRow.rowKey` (NOT a backend session_key —
  // stored_only rows must be openable too, so we use the React-level
  // identity that always exists).
  const [detailRowKey, setDetailRowKey] = useState<string | null>(null);
  // Capture the row trigger element so we can restore focus on close.
  // `useRef<HTMLElement | null>(null)` lets us pass the same ref into
  // the Drawer's `restoreFocusRef` prop without re-binding on every
  // render.
  const triggerRef = useRef<HTMLElement | null>(null);
  // Pick the merged row to render in the drawer body. Read from
  // `filteredRows` (NOT `pageRows`) so the drawer always shows
  // whatever the user can currently see in the filter window, even
  // if the row is on a different page from the one currently
  // displayed. This mirrors the M3 selection model (which is also
  // filter-window scoped, not page-window scoped).
  const selectedDetailRow: SessionRow | null =
    detailRowKey === null
      ? null
      : filteredRows.find((r) => r.rowKey === detailRowKey) ?? null;

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
        <>
          <SessionsTable
            rows={pageRows}
            selected={selected}
            onToggle={onToggle}
            onToggleAll={onToggleAll}
            now={now}
            onOpenDetail={handleOpenDetail}
          />
          <Pagination
            pageSize={pageSize}
            pageIndex={pageIndex}
            totalRows={filteredRows.length}
            onChangePage={onChangePage}
            onChangePageSize={onChangePageSize}
          />
        </>
      ) : null}
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
}

type EmptyStateKind =
  | "no_sessions_at_all"
  | "no_matches_after_filter"
  | "nothing_to_import";
