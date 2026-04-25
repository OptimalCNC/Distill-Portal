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
//
// `App.tsx` retains ownership of fetch state, the merged + filtered
// row sets (memoized once + passed in), the `selected` set, the
// filter state hook, and every mutation handler. SessionsView is
// presentational.
import { isImportable } from "./types";
import type { SessionRow } from "./types";
import { SessionFilters } from "./SessionFilters";
import { SessionsTable } from "./SessionsTable";
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
  /** Merged + filtered + sorted rows. The table consumes only this. */
  filteredRows: SessionRow[];
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
  // Per `working/phase-4.md` §Filter, Sort, Search → Empty States:
  //
  //   (1) "No sessions at all" — both fetches resolved to empty,
  //       i.e. mergedRows is itself empty. The table cannot render
  //       (no rows). The empty-state surface fully replaces the
  //       table area.
  //   (2) "No matches after filter/search" — mergedRows > 0 but the
  //       filter pipeline produced zero rows. Affordance: "Clear
  //       filters". The table cannot render (no rows). The empty-
  //       state surface fully replaces the table area.
  //   (3) "Nothing to import in the current filter" — matching rows
  //       EXIST (filteredRows > 0) but every visible row is
  //       non-importable (`up_to_date` or `source_missing`).
  //       Affordance: "Show importable only" (flips `importableOnly`
  //       to true, which narrows the effective status filter to
  //       `["not_stored", "outdated"]`). Unlike branches (1) and
  //       (2), the user-visible rows here are informative — they
  //       describe what the user CAN see — so the empty-state
  //       surface renders ALONGSIDE the table (above it) rather
  //       than displacing it. The user gets both the explanatory
  //       copy AND the row context.
  //
  // Branch (3) is checked AFTER (1) and (2) so the all-empty cases
  // surface their dedicated copy first.
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
          renders zero rows in those branches. */}
      {filteredRows.length > 0 ? (
        <SessionsTable
          rows={filteredRows}
          selected={selected}
          onToggle={onToggle}
          onToggleAll={onToggleAll}
          now={now}
        />
      ) : null}
    </>
  );
}

type EmptyStateKind =
  | "no_sessions_at_all"
  | "no_matches_after_filter"
  | "nothing_to_import";
