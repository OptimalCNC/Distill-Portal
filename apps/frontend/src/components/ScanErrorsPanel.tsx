// Scan errors panel (read-only).
//
// Columns match `apps/frontend/src/app.rs` (the Rust reference) exactly:
// Tool, Path (source_path), Message, Last Seen (last_seen_at). Empty-state
// copy ports the Rust reference's "No scan errors are currently recorded."
// message.
import type { PersistedScanError } from "../lib/contracts";

type ScanErrorsPanelProps = { errors: PersistedScanError[] };

export function ScanErrorsPanel({ errors }: ScanErrorsPanelProps) {
  if (errors.length === 0) {
    return <div className="empty">No scan errors are currently recorded.</div>;
  }
  return (
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
  );
}
