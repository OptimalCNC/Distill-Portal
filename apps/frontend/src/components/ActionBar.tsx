// Action bar for the Source Sessions panel.
//
// Renders the two mutation buttons — "Rescan" and "Import selected (N)" —
// plus a textual summary of the most recent mutation result. The summary
// consumes the typed `RescanReport` / `ImportReport` contracts directly so
// the DOM copy stays in sync with whatever fields the backend reports.
//
// State (which mutation is in flight, latest report, selected count) is
// owned by `App.tsx` and passed down as props. This component does not
// own any state of its own.
import type { ImportReport, RescanReport } from "../lib/contracts";

export type LastReport =
  | { kind: "rescan"; report: RescanReport }
  | { kind: "import"; report: ImportReport }
  | { kind: "error"; message: string };

type ActionBarProps = {
  selectedCount: number;
  pending: "rescan" | "import" | null;
  lastReport: LastReport | null;
  onRescan: () => void;
  onImport: () => void;
};

export function ActionBar({
  selectedCount,
  pending,
  lastReport,
  onRescan,
  onImport,
}: ActionBarProps) {
  const rescanDisabled = pending !== null;
  const importDisabled = pending !== null || selectedCount === 0;
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
