// Source sessions panel table.
//
// Columns: Select (checkbox, added in Chunk F2), Status, Tool, Title
// (stacked with source_session_id), Project, Updated (source_updated_at),
// Stored Copy (session_uid + stored_ingested_at), Source Path.
// Empty-state copy: "No source sessions are currently discoverable."
//
// Selection is lifted to `App.tsx`: this component is a controlled view of
// whatever `selected` set the parent owns. `onToggle(sessionKey)` toggles a
// single row; `onToggleAll()` is invoked by the header-row checkbox and
// should switch between "all selected" and "none selected" in the parent.
// Rows are keyed by `session_key` (globally unique).
import type { SourceSessionView } from "../lib/contracts";
import { StatusBadge } from "./StatusBadge";

type SourceSessionsTableProps = {
  sessions: SourceSessionView[];
  selected: Set<string>;
  onToggle: (sessionKey: string) => void;
  onToggleAll: () => void;
};

export function SourceSessionsTable({
  sessions,
  selected,
  onToggle,
  onToggleAll,
}: SourceSessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="empty">No source sessions are currently discoverable.</div>
    );
  }
  const selectedCount = sessions.reduce(
    (acc, s) => (selected.has(s.session_key) ? acc + 1 : acc),
    0,
  );
  const allChecked = selectedCount === sessions.length;
  const someChecked = selectedCount > 0 && selectedCount < sessions.length;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="select-col">
              <input
                type="checkbox"
                aria-label="Select all source sessions"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={onToggleAll}
              />
            </th>
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
              <td className="select-col">
                <input
                  type="checkbox"
                  aria-label={`Select ${session.session_key}`}
                  checked={selected.has(session.session_key)}
                  onChange={() => onToggle(session.session_key)}
                />
              </td>
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
