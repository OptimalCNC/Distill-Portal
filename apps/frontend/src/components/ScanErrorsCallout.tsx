// Collapsible callout for persisted scan errors.
//
// Per `working/phase-4.md` §Phase 4 Goals → "6. Collapse what is
// rarely non-empty", when the errors list is empty (the common case),
// the component renders `null` — no header, no border, no whitespace.
// This trades a small loss of "the panel is here, just empty" affordance
// for a much cleaner page when nothing is wrong.
//
// When non-empty, the component renders:
//   - a one-line summary explaining how many errors are recorded
//   - a `<table>` with the same column vocabulary the previous
//     always-rendered scan-errors panel used (Tool, Path, Message,
//     Last Seen) so the existing test selectors and the visual cues
//     users are used to stay valid
//
// Reuses the structural CSS selectors set by M1 (`.panel`, `.muted`,
// `.mono`, `.table-wrap`). No feature-local CSS.
import type { PersistedScanError } from "../lib/contracts";

export type ScanErrorsCalloutProps = { errors: PersistedScanError[] };

export function ScanErrorsCallout({ errors }: ScanErrorsCalloutProps) {
  if (errors.length === 0) {
    // M2 deliverable: collapse to nothing visible when the rare-non-empty
    // list is empty. Returning `null` (vs an empty fragment) so React
    // does not emit any DOM node at all.
    return null;
  }
  const summary =
    errors.length === 1
      ? "1 scan error observed since the last rescan."
      : `${errors.length} scan errors observed since the last rescan.`;
  return (
    <section className="panel" aria-label="Scan errors">
      <h2>Scan Errors</h2>
      <p className="muted">{summary}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Path</th>
              <th>Message</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error) => (
              <tr key={error.error_id}>
                <td className="mono">{error.tool}</td>
                <td className="mono">{error.source_path}</td>
                <td>{error.message}</td>
                <td className="mono">{error.last_seen_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
