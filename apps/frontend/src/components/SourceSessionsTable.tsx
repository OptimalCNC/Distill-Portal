// Source sessions panel table (read-only).
//
// Columns match `apps/frontend/src/app.rs` (the Rust reference) exactly:
// Status, Tool, Title (stacked with source_session_id), Project,
// Updated (source_updated_at), Stored Copy (session_uid + stored_ingested_at),
// Source Path. Empty-state copy ports the Rust reference's
// "No source sessions are currently discoverable." message.
//
// F1 is read-only: no selection checkbox, no buttons, no mutation handlers.
// Selection / rescan / import are owned by Chunk F2.
import type { SourceSessionView } from "../lib/contracts";
import { StatusBadge } from "./StatusBadge";

type SourceSessionsTableProps = { sessions: SourceSessionView[] };

export function SourceSessionsTable({ sessions }: SourceSessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="empty">No source sessions are currently discoverable.</div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Tool</th>
            <th>Title</th>
            <th>Project</th>
            <th>Updated</th>
            <th>Stored Copy</th>
            <th>Source Path</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.session_key}>
              <td>
                <StatusBadge status={session.status} />
              </td>
              <td className="mono">{session.tool}</td>
              <td className="stack">
                <strong>{session.title ?? "(untitled)"}</strong>
                <span className="muted mono">{session.session_key}</span>
              </td>
              <td>{session.project_path ?? "\u2014"}</td>
              <td className="mono">{session.source_updated_at ?? "\u2014"}</td>
              <td className="stack">
                <span className="mono">
                  {session.session_uid ?? "not stored"}
                </span>
                <span className="muted mono">
                  ingested: {session.stored_ingested_at ?? "\u2014"}
                </span>
              </td>
              <td className="mono">{session.source_path}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
