// Pure client-side join of `SourceSessionView[]` ⊕ `StoredSessionView[]`.
//
// Identity for joining is `(tool, source_session_id)`. Both APIs return
// rows keyed on that pair (the source side carries it as `session_key`,
// already formatted by the Rust `source_key` helper as
// `${tool}:${source_session_id}` with a single colon; the stored side
// carries the components separately). We index sources by
// `${tool}:${source_session_id}` and stored rows by the same key, then
// emit one `SessionRow` per distinct identity.
//
// Per `working/phase-4.md` §Data Model in the Browser:
//   - A row appears if the session exists in either list.
//   - `rowKey` is the backend-provided `session_key` for source-backed
//     rows; for `stored_only` rows we synthesize the React-only fallback
//     `stored:${session_uid}`. The `stored:...` fallback NEVER enters
//     the import POST (`isImportable` returns false for these rows).
//   - `sourcePath` is always populated: source-side when discoverable,
//     otherwise the stored-side last-known path.
//   - `sourcePathIsStale` is true exactly when
//     `presence === "stored_only" && status === "source_missing"`.
//   - When both lists carry the session, the source-side `status` is
//     authoritative. If the stored-side `status` disagrees,
//     `statusConflict` is set so the UI can surface the
//     "fetched state changed during load — refresh" affordance.
import type { SourceSessionView, StoredSessionView } from "../../lib/contracts";
import type { Presence, SessionRow } from "./types";

/**
 * Build the unified session-row list from the two backend payloads.
 * Pure: no side effects, no React imports. Idempotent for any input
 * pair regardless of order; output is ordered source-first, then any
 * stored_only rows in their input order.
 */
export function mergeSessions(
  sources: SourceSessionView[],
  stored: StoredSessionView[],
): SessionRow[] {
  // Index stored rows so the `source_only` / `both` pass below can look
  // them up by the same identity the source row carries.
  const storedByKey = new Map<string, StoredSessionView>();
  for (const s of stored) {
    storedByKey.set(`${s.tool}:${s.source_session_id}`, s);
  }

  const rows: SessionRow[] = [];
  const consumedStoredKeys = new Set<string>();

  // Pass 1: every source row becomes a SessionRow. If a stored row joins
  // it on the same `(tool, source_session_id)`, presence is "both" and
  // we surface the disagreement via `statusConflict`.
  for (const src of sources) {
    const key = `${src.tool}:${src.source_session_id}`;
    const matchedStored = storedByKey.get(key);
    if (matchedStored !== undefined) {
      consumedStoredKeys.add(key);
      const presence: Presence = "both";
      // Source-side wins on disagreement (it can encode `not_stored`,
      // which the stored side cannot express). Conflict flag captures
      // the divergence for the UI affordance.
      const statusConflict = matchedStored.status !== src.status;
      rows.push({
        rowKey: src.session_key,
        sourceSessionKey: src.session_key,
        tool: src.tool,
        sourceSessionId: src.source_session_id,
        title: src.title,
        projectPath: src.project_path,
        sourcePath: src.source_path,
        sourcePathIsStale: false,
        sourceFingerprint: src.source_fingerprint,
        createdAt: src.created_at,
        sourceUpdatedAt: src.source_updated_at,
        ingestedAt:
          matchedStored.ingested_at ?? src.stored_ingested_at ?? null,
        storedSessionUid: matchedStored.session_uid,
        storedRawRef: matchedStored.raw_ref,
        hasSubagentSidecars: src.has_subagent_sidecars,
        status: src.status,
        statusConflict,
        presence,
      });
    } else {
      const presence: Presence = "source_only";
      rows.push({
        rowKey: src.session_key,
        sourceSessionKey: src.session_key,
        tool: src.tool,
        sourceSessionId: src.source_session_id,
        title: src.title,
        projectPath: src.project_path,
        sourcePath: src.source_path,
        sourcePathIsStale: false,
        sourceFingerprint: src.source_fingerprint,
        createdAt: src.created_at,
        sourceUpdatedAt: src.source_updated_at,
        // Source-only rows cannot have a stored_ingested_at the source
        // view didn't already report, but the source view sometimes
        // populates `stored_ingested_at` during a transient race.
        // Prefer the source-side hint over null when present so the
        // UI can still surface "previously stored" hints.
        ingestedAt: src.stored_ingested_at ?? null,
        storedSessionUid: src.session_uid,
        storedRawRef: null,
        hasSubagentSidecars: src.has_subagent_sidecars,
        status: src.status,
        statusConflict: false,
        presence,
      });
    }
  }

  // Pass 2: stored rows that did not join with any source row become
  // `stored_only` rows. These are not importable (no backend-provided
  // `session_key` is available) so `sourceSessionKey` is null and the
  // React `rowKey` falls back to `stored:${session_uid}`.
  for (const st of stored) {
    const key = `${st.tool}:${st.source_session_id}`;
    if (consumedStoredKeys.has(key)) continue;
    const presence: Presence = "stored_only";
    const sourcePathIsStale = st.status === "source_missing";
    rows.push({
      rowKey: `stored:${st.session_uid}`,
      sourceSessionKey: null,
      tool: st.tool,
      sourceSessionId: st.source_session_id,
      title: st.title,
      projectPath: st.project_path,
      sourcePath: st.source_path,
      sourcePathIsStale,
      sourceFingerprint: st.source_fingerprint,
      createdAt: st.created_at,
      sourceUpdatedAt: st.source_updated_at,
      ingestedAt: st.ingested_at,
      storedSessionUid: st.session_uid,
      storedRawRef: st.raw_ref,
      hasSubagentSidecars: st.has_subagent_sidecars,
      status: st.status,
      statusConflict: false,
      presence,
    });
  }

  return rows;
}
