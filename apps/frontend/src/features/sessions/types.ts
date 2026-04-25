// UI-local row type for the unified inspection list.
//
// `SessionRow` is the join of `SourceSessionView` ⊕ `StoredSessionView`
// produced by `mergeSessions.ts`. The rest of the unified-list code
// (table, action handlers) consumes only this type so it does not have
// to branch on whichever side a row originated from.
//
// Identity rules (per `working/phase-4.md` §Data Model in the Browser):
//   - **Import identity** is always `SourceSessionView.session_key` as
//     returned by the backend (`${tool}:${source_session_id}` — single
//     colon, produced by the Rust `source_key` helper). The UI never
//     constructs or mutates this value. Rows with `presence === "stored_only"`
//     have `sourceSessionKey === null` and are not selectable.
//   - **React row identity** (`rowKey`) is the same `session_key` for
//     source-backed rows; for `stored_only` rows we synthesize the
//     fallback `stored:${session_uid}`. Row identity is used only for
//     React keys and for tracking which rows the UI is talking about;
//     the `stored:...` fallback never enters the import POST.
import type { SessionSyncStatus, Tool } from "../../lib/contracts";

export type Presence = "source_only" | "stored_only" | "both";

export type SessionRow = {
  /** React key. `${tool}:${source_session_id}` for source-backed rows; `stored:${session_uid}` for stored_only. */
  rowKey: string;
  /** Backend-provided `SourceSessionView.session_key` when present; null for stored_only. The only value that may enter the import POST. */
  sourceSessionKey: string | null;
  tool: Tool;
  sourceSessionId: string;
  title: string | null;
  projectPath: string | null;
  /** Always populated. Source-side `source_path` when discoverable; otherwise the last-known `StoredSessionView.source_path`. */
  sourcePath: string;
  /** True when `presence === "stored_only" && status === "source_missing"` — `sourcePath` is a last-known location, not currently discoverable. */
  sourcePathIsStale: boolean;
  sourceFingerprint: string;
  createdAt: string | null;
  sourceUpdatedAt: string | null;
  ingestedAt: string | null;
  storedSessionUid: string | null;
  storedRawRef: string | null;
  hasSubagentSidecars: boolean;
  /** Authoritative status. When both sides report status, source-side wins; the stored-side disagreement is recorded in `statusConflict`. */
  status: SessionSyncStatus;
  /** True when both lists carried the session and reported different statuses (a rescan landed between the two GETs). */
  statusConflict: boolean;
  presence: Presence;
};

/**
 * Single source of truth for the importability rule. A row is importable
 * if it has a backend-provided `sourceSessionKey` (i.e. `presence` is
 * `source_only` or `both`) AND its status is `not_stored` or `outdated`.
 *
 * Both `SessionsTable` (which decides whether to render a checkbox) and
 * `App.tsx`'s `handleImport` (which derives the POST payload) consume
 * this helper so the rendered selectability and the wire payload cannot
 * drift apart.
 */
export function isImportable(row: SessionRow): boolean {
  if (row.sourceSessionKey === null) return false;
  return row.status === "not_stored" || row.status === "outdated";
}
