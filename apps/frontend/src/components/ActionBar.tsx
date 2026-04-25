// Action bar for the unified session inspection list.
//
// Renders the two mutation buttons — "Rescan" and "Import selected (N)" —
// plus a textual summary of the most recent mutation result. As of
// Phase 4 Milestone 3 the bar also surfaces:
//   - a `+K hidden by filters` caption when the user's raw selection
//     contains keys that are still importable in the merged set but
//     fell out of the current filter window
//   - a `Clear hidden` button that drops only the hidden-by-filter
//     keys (leaves the visible-importable selection intact)
//   - a `Clear selection` button that drops EVERY selected key
//     (visible AND hidden)
//
// The bar still consumes typed `RescanReport` / `ImportReport`
// contracts directly so the DOM copy stays in sync with whatever
// fields the backend reports. State is owned by `App.tsx` and passed
// down as props; this component is stateless.
import type { ImportReport, RescanReport } from "../lib/contracts";

export type LastReport =
  | { kind: "rescan"; report: RescanReport }
  | { kind: "import"; report: ImportReport }
  | { kind: "error"; message: string };

type ActionBarProps = {
  selectedCount: number;
  /** Per spec §Action Bar and Mutation UX: when the user's raw
   *  selection contains keys hidden by the current filter, surface a
   *  `+K hidden by filters` caption. Defaults to 0 (M2 callers can
   *  omit this prop without changing behavior). */
  hiddenByFilterCount?: number;
  pending: "rescan" | "import" | null;
  lastReport: LastReport | null;
  onRescan: () => void;
  onImport: () => void;
  /** Drop only the hidden-by-filter keys from `selected` (leaves the
   *  visible-importable selection intact). Optional for M2 callers. */
  onClearHidden?: () => void;
  /** Drop every key from `selected` (visible AND hidden). Optional
   *  for M2 callers. */
  onClearSelection?: () => void;
};

export function ActionBar({
  selectedCount,
  hiddenByFilterCount = 0,
  pending,
  lastReport,
  onRescan,
  onImport,
  onClearHidden,
  onClearSelection,
}: ActionBarProps) {
  const rescanDisabled = pending !== null;
  const importDisabled = pending !== null || selectedCount === 0;
  const showClearAffordances =
    selectedCount > 0 || hiddenByFilterCount > 0;
  return (
    <div className="action-bar">
      <div className="action-bar-buttons">
        <button
          type="button"
          onClick={onRescan}
          disabled={rescanDisabled}
        >
          {pending === "rescan" ? "Rescanning..." : "Rescan"}
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={importDisabled}
        >
          {pending === "import"
            ? `Importing ${selectedCount}...`
            : `Import selected (${selectedCount})`}
        </button>
        {hiddenByFilterCount > 0 ? (
          <span className="muted action-bar-hidden-caption">
            +{hiddenByFilterCount} hidden by filters
          </span>
        ) : null}
        {showClearAffordances && onClearHidden && hiddenByFilterCount > 0 ? (
          <button
            type="button"
            className="action-bar-clear"
            onClick={onClearHidden}
          >
            Clear hidden
          </button>
        ) : null}
        {showClearAffordances && onClearSelection ? (
          <button
            type="button"
            className="action-bar-clear"
            onClick={onClearSelection}
          >
            Clear selection
          </button>
        ) : null}
      </div>
      <p className="action-bar-report" role="status">
        {renderReport(lastReport)}
      </p>
    </div>
  );
}

function renderReport(report: LastReport | null): string {
  if (report === null) {
    return "No recent mutation.";
  }
  if (report.kind === "error") {
    return report.message;
  }
  if (report.kind === "rescan") {
    const r = report.report;
    return (
      `Rescan: ${r.discovered_files} discovered_files, ` +
      `${r.parsed_sessions} parsed_sessions, ` +
      `${r.not_stored_sessions} not_stored_sessions, ` +
      `${r.outdated_sessions} outdated_sessions, ` +
      `${r.up_to_date_sessions} up_to_date_sessions, ` +
      `${r.scan_errors} scan_errors`
    );
  }
  const i = report.report;
  return (
    `Import: ${i.requested_sessions} requested_sessions, ` +
    `${i.inserted_sessions} inserted_sessions, ` +
    `${i.updated_sessions} updated_sessions, ` +
    `${i.unchanged_sessions} unchanged_sessions`
  );
}
