// Stored sessions panel table (read-only).
//
// Columns: Status, Tool, Title (stacked with source_session_id), Project,
// Ingested (ingested_at), Source Updated, Session UID (anchor to the
// metadata endpoint + fingerprint line), Raw (anchor to the raw NDJSON
// endpoint). Empty-state copy: "The store is currently empty."
//
// The Raw link uses a same-origin relative path; the Vite dev proxy (see
// `apps/frontend/vite.config.ts`) forwards `/api/v1/**` to the backend.
// The panel is intentionally read-only: no selection checkbox, no mutation
// handlers.
import type { StoredSessionView } from "../lib/contracts";
import { StatusBadge } from "./StatusBadge";

type StoredSessionsTableProps = { sessions: StoredSessionView[] };

export function StoredSessionsTable({ sessions }: StoredSessionsTableProps) {
  if (sessions.length === 0) {
    return <div className="empty">The store is currently empty.</div>;
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
            <th>Ingested</th>
            <th>Source Updated</th>
            <th>Session UID</th>
            <th>Raw</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((stored) => {
            const rawLink = `/api/v1/sessions/${stored.session_uid}/raw`;
            const metadataLink = `/api/v1/sessions/${stored.session_uid}`;
            return (
              <tr key={stored.session_uid}>
                <td>
                  <StatusBadge status={stored.status} />
                </td>
                <td className="mono">{stored.tool}</td>
                <td className="stack">
                  <strong>{stored.title ?? "(untitled)"}</strong>
                  <span className="muted mono">{stored.source_session_id}</span>
                </td>
                <td>{stored.project_path ?? "\u2014"}</td>
                <td className="mono">{stored.ingested_at}</td>
                <td className="mono">{stored.source_updated_at ?? "\u2014"}</td>
                <td className="stack">
                  <a className="raw-link mono" href={metadataLink}>
                    {stored.session_uid}
                  </a>
                  <span className="muted mono">
                    fingerprint: {stored.source_fingerprint}
                  </span>
                </td>
                <td>
                  <a className="raw-link" href={rawLink}>
                    View Raw
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
