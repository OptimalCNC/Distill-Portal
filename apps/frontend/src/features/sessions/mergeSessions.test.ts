// Truth-table coverage for the source ⊕ stored join.
//
// The join produces a `SessionRow` per distinct `(tool, source_session_id)`
// identity. This file enumerates every legal `(presence × status)`
// combination per `working/phase-4.md` §Data Model in the Browser:
//
//   - source_only × {not_stored}
//     (the source view CAN'T encode up_to_date / outdated without a
//     stored counterpart, and source_missing is impossible for a row
//     the source side returned at all)
//   - both × {up_to_date, outdated}
//     (the source view computes status from the stored fingerprint
//     comparison; a discoverable + stored session is one of these two
//     except for the rare race where a delete lands between rescan and
//     list)
//   - stored_only × {up_to_date, outdated, source_missing}
//     (the stored side gets its status from the source-status map;
//     when no source row matches, it falls through to source_missing)
//
// Pruned as unreachable per the backend's status derivation (NOT covered
// by separate tests because the source/stored views can't produce them):
//   - source_only × {up_to_date, outdated, source_missing}
//   - stored_only × {not_stored}
//   - both × {not_stored, source_missing}
// If a future backend change makes any of these reachable, add the
// corresponding test cell here AND check `mergeSessions.ts` handles it.
//
// Plus the disagreement branch (`presence === "both"` with the
// stored-side status differing from the source-side); the join must
// set `statusConflict: true` and keep the source-side status.
//
// Plus the `sourcePathIsStale` invariant: true exactly when
// `presence === "stored_only" && status === "source_missing"`,
// false everywhere else.
//
// Plus `rowKey` shape: `${tool}:${source_session_id}` for source-backed
// rows, `stored:${session_uid}` for stored-only rows.
//
// Plus null timestamp propagation: a null source-side `created_at` /
// `source_updated_at` must remain null on the merged row, never coerced
// to "" or a placeholder marker.
import { expect, test } from "bun:test";
import { mergeSessions } from "./mergeSessions";
import { isImportable } from "./types";
import type {
  SessionSyncStatus,
  SourceSessionView,
  StoredSessionView,
} from "../../lib/contracts";

function buildSource(
  overrides: Partial<SourceSessionView> = {},
): SourceSessionView {
  return {
    session_key: "claude_code:src-1",
    tool: "claude_code",
    source_session_id: "src-1",
    source_path: "/srv/sessions/src-1.jsonl",
    source_fingerprint: "fp-src-1",
    created_at: "2026-04-22T00:00:00Z",
    source_updated_at: "2026-04-22T00:01:00Z",
    project_path: "/projects/src-1",
    title: "Source one",
    has_subagent_sidecars: false,
    status: "not_stored",
    session_uid: null,
    stored_ingested_at: null,
    ...overrides,
  };
}

function buildStored(
  overrides: Partial<StoredSessionView> = {},
): StoredSessionView {
  return {
    status: "up_to_date",
    session_uid: "stored-uid-1",
    tool: "claude_code",
    source_session_id: "src-1",
    source_path: "/srv/sessions/src-1.jsonl",
    source_fingerprint: "fp-src-1",
    raw_ref: "raw/stored-uid-1.ndjson",
    created_at: "2026-04-22T00:00:00Z",
    source_updated_at: "2026-04-22T00:01:00Z",
    ingested_at: "2026-04-22T00:02:00Z",
    project_path: "/projects/src-1",
    title: "Stored one",
    has_subagent_sidecars: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Empty inputs
// ---------------------------------------------------------------------------

test("mergeSessions: empty inputs produce empty output", () => {
  expect(mergeSessions([], [])).toEqual([]);
});

// ---------------------------------------------------------------------------
// presence: source_only
// ---------------------------------------------------------------------------

test("mergeSessions: source_only + not_stored asserts every field", () => {
  const src = buildSource({
    session_key: "claude_code:so-not-stored",
    source_session_id: "so-not-stored",
    status: "not_stored",
    session_uid: null,
    stored_ingested_at: null,
    title: null,
    project_path: null,
    created_at: null,
    source_updated_at: null,
  });
  const rows = mergeSessions([src], []);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.rowKey).toBe("claude_code:so-not-stored");
  expect(row.sourceSessionKey).toBe("claude_code:so-not-stored");
  expect(row.tool).toBe("claude_code");
  expect(row.sourceSessionId).toBe("so-not-stored");
  expect(row.title).toBeNull();
  expect(row.projectPath).toBeNull();
  expect(row.sourcePath).toBe("/srv/sessions/src-1.jsonl");
  expect(row.sourcePathIsStale).toBe(false);
  expect(row.sourceFingerprint).toBe("fp-src-1");
  expect(row.createdAt).toBeNull();
  expect(row.sourceUpdatedAt).toBeNull();
  expect(row.ingestedAt).toBeNull();
  expect(row.storedSessionUid).toBeNull();
  expect(row.storedRawRef).toBeNull();
  expect(row.hasSubagentSidecars).toBe(false);
  expect(row.status).toBe("not_stored");
  expect(row.statusConflict).toBe(false);
  expect(row.presence).toBe("source_only");
  expect(isImportable(row)).toBe(true);
});

// ---------------------------------------------------------------------------
// presence: both — agreement branch
// ---------------------------------------------------------------------------

test("mergeSessions: both + up_to_date (agreement) asserts every field", () => {
  const src = buildSource({
    session_key: "claude_code:both-uptodate",
    source_session_id: "both-uptodate",
    status: "up_to_date",
    session_uid: "uid-uptodate",
    stored_ingested_at: "2026-04-22T00:05:00Z",
  });
  const st = buildStored({
    session_uid: "uid-uptodate",
    source_session_id: "both-uptodate",
    status: "up_to_date",
    ingested_at: "2026-04-22T00:05:00Z",
    raw_ref: "raw/uid-uptodate.ndjson",
  });
  const rows = mergeSessions([src], [st]);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.rowKey).toBe("claude_code:both-uptodate");
  expect(row.sourceSessionKey).toBe("claude_code:both-uptodate");
  expect(row.tool).toBe("claude_code");
  expect(row.sourceSessionId).toBe("both-uptodate");
  expect(row.title).toBe("Source one");
  expect(row.projectPath).toBe("/projects/src-1");
  expect(row.sourcePath).toBe("/srv/sessions/src-1.jsonl");
  expect(row.sourcePathIsStale).toBe(false);
  expect(row.sourceFingerprint).toBe("fp-src-1");
  expect(row.createdAt).toBe("2026-04-22T00:00:00Z");
  expect(row.sourceUpdatedAt).toBe("2026-04-22T00:01:00Z");
  expect(row.ingestedAt).toBe("2026-04-22T00:05:00Z");
  expect(row.storedSessionUid).toBe("uid-uptodate");
  expect(row.storedRawRef).toBe("raw/uid-uptodate.ndjson");
  expect(row.hasSubagentSidecars).toBe(false);
  expect(row.status).toBe("up_to_date");
  expect(row.statusConflict).toBe(false);
  expect(row.presence).toBe("both");
  expect(isImportable(row)).toBe(false);
});

test("mergeSessions: both + outdated (agreement) asserts every field", () => {
  const src = buildSource({
    session_key: "claude_code:both-outdated",
    source_session_id: "both-outdated",
    source_fingerprint: "fp-new",
    status: "outdated",
    session_uid: "uid-outdated",
    stored_ingested_at: "2026-04-22T00:05:00Z",
  });
  const st = buildStored({
    session_uid: "uid-outdated",
    source_session_id: "both-outdated",
    source_fingerprint: "fp-old",
    status: "outdated",
    ingested_at: "2026-04-22T00:05:00Z",
    raw_ref: "raw/uid-outdated.ndjson",
  });
  const rows = mergeSessions([src], [st]);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.rowKey).toBe("claude_code:both-outdated");
  expect(row.sourceSessionKey).toBe("claude_code:both-outdated");
  expect(row.tool).toBe("claude_code");
  expect(row.sourceSessionId).toBe("both-outdated");
  expect(row.title).toBe("Source one");
  expect(row.projectPath).toBe("/projects/src-1");
  expect(row.sourcePath).toBe("/srv/sessions/src-1.jsonl");
  expect(row.sourcePathIsStale).toBe(false);
  // Source-side fingerprint wins on the merged row (the stored side
  // carries the at-ingest-time fingerprint, which is now stale).
  expect(row.sourceFingerprint).toBe("fp-new");
  expect(row.createdAt).toBe("2026-04-22T00:00:00Z");
  expect(row.sourceUpdatedAt).toBe("2026-04-22T00:01:00Z");
  expect(row.ingestedAt).toBe("2026-04-22T00:05:00Z");
  expect(row.storedSessionUid).toBe("uid-outdated");
  expect(row.storedRawRef).toBe("raw/uid-outdated.ndjson");
  expect(row.hasSubagentSidecars).toBe(false);
  expect(row.status).toBe("outdated");
  expect(row.statusConflict).toBe(false);
  expect(row.presence).toBe("both");
  expect(isImportable(row)).toBe(true);
});

// ---------------------------------------------------------------------------
// presence: both — disagreement branch (statusConflict)
// ---------------------------------------------------------------------------

test("mergeSessions: both + disagreement (source=outdated, stored=up_to_date) sets statusConflict; source wins", () => {
  const src = buildSource({
    session_key: "claude_code:disagree-1",
    source_session_id: "disagree-1",
    status: "outdated",
    session_uid: "uid-disagree",
    stored_ingested_at: "2026-04-22T00:05:00Z",
  });
  const st = buildStored({
    session_uid: "uid-disagree",
    source_session_id: "disagree-1",
    status: "up_to_date",
    ingested_at: "2026-04-22T00:05:00Z",
  });
  const rows = mergeSessions([src], [st]);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.status).toBe("outdated");
  expect(row.statusConflict).toBe(true);
  expect(row.presence).toBe("both");
  expect(row.storedSessionUid).toBe("uid-disagree");
  expect(isImportable(row)).toBe(true);
});

test("mergeSessions: both + disagreement (source=up_to_date, stored=source_missing) sets statusConflict; source wins", () => {
  // A backend race where the stored side's lookup against
  // source_status_map missed the row (e.g. the rescan finished after
  // /sessions started executing) — produces a stored-side
  // `source_missing`. The source side just observed the fingerprint
  // match, so it reports `up_to_date`. The merged row keeps the
  // source-side truth and surfaces the conflict.
  const src = buildSource({
    session_key: "claude_code:disagree-2",
    source_session_id: "disagree-2",
    status: "up_to_date",
    session_uid: "uid-disagree-2",
    stored_ingested_at: "2026-04-22T00:05:00Z",
  });
  const st = buildStored({
    session_uid: "uid-disagree-2",
    source_session_id: "disagree-2",
    status: "source_missing",
    ingested_at: "2026-04-22T00:05:00Z",
  });
  const rows = mergeSessions([src], [st]);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.status).toBe("up_to_date");
  expect(row.statusConflict).toBe(true);
  expect(row.presence).toBe("both");
  expect(isImportable(row)).toBe(false);
});

// ---------------------------------------------------------------------------
// presence: stored_only
// ---------------------------------------------------------------------------

test("mergeSessions: stored_only + up_to_date asserts every field; stored:${uid} rowKey", () => {
  // A stored row whose `(tool, source_session_id)` did NOT appear in
  // the source list this round — could happen briefly during a refetch
  // window, or if the user removed the source file but the stored side
  // hasn't been recomputed against the new source map. Status is
  // up_to_date because the source-status map still happens to carry it
  // (rare but possible).
  const st = buildStored({
    session_uid: "uid-so-uptodate",
    source_session_id: "so-uptodate",
    source_path: "/srv/last-known/uptodate.jsonl",
    status: "up_to_date",
    ingested_at: "2026-04-22T00:09:00Z",
    raw_ref: "raw/uid-so-uptodate.ndjson",
    title: "Stored only one",
  });
  const rows = mergeSessions([], [st]);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.rowKey).toBe("stored:uid-so-uptodate");
  expect(row.sourceSessionKey).toBeNull();
  expect(row.tool).toBe("claude_code");
  expect(row.sourceSessionId).toBe("so-uptodate");
  expect(row.title).toBe("Stored only one");
  expect(row.projectPath).toBe("/projects/src-1");
  expect(row.sourcePath).toBe("/srv/last-known/uptodate.jsonl");
  expect(row.sourcePathIsStale).toBe(false);
  expect(row.sourceFingerprint).toBe("fp-src-1");
  expect(row.createdAt).toBe("2026-04-22T00:00:00Z");
  expect(row.sourceUpdatedAt).toBe("2026-04-22T00:01:00Z");
  expect(row.ingestedAt).toBe("2026-04-22T00:09:00Z");
  expect(row.storedSessionUid).toBe("uid-so-uptodate");
  expect(row.storedRawRef).toBe("raw/uid-so-uptodate.ndjson");
  expect(row.hasSubagentSidecars).toBe(false);
  expect(row.status).toBe("up_to_date");
  expect(row.statusConflict).toBe(false);
  expect(row.presence).toBe("stored_only");
  expect(isImportable(row)).toBe(false);
});

test("mergeSessions: stored_only + outdated asserts every field", () => {
  const st = buildStored({
    session_uid: "uid-so-outdated",
    source_session_id: "so-outdated",
    status: "outdated",
    ingested_at: "2026-04-22T00:10:00Z",
  });
  const rows = mergeSessions([], [st]);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.rowKey).toBe("stored:uid-so-outdated");
  expect(row.sourceSessionKey).toBeNull();
  expect(row.status).toBe("outdated");
  expect(row.statusConflict).toBe(false);
  expect(row.sourcePathIsStale).toBe(false);
  expect(row.presence).toBe("stored_only");
  expect(row.ingestedAt).toBe("2026-04-22T00:10:00Z");
  expect(isImportable(row)).toBe(false);
});

test("mergeSessions: stored_only + source_missing asserts every field; sourcePathIsStale=true", () => {
  // The canonical "source file removed since last ingest" case. The
  // stored side carries the last-known source path so the user can
  // still find / search by it; `sourcePathIsStale` flags the cell so
  // the UI can label it "last seen source path".
  const st = buildStored({
    session_uid: "uid-so-missing",
    source_session_id: "so-missing",
    source_path: "/last/known/path.jsonl",
    status: "source_missing",
    ingested_at: "2026-04-22T00:11:00Z",
  });
  const rows = mergeSessions([], [st]);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.rowKey).toBe("stored:uid-so-missing");
  expect(row.sourceSessionKey).toBeNull();
  expect(row.sourcePath).toBe("/last/known/path.jsonl");
  expect(row.sourcePathIsStale).toBe(true);
  expect(row.status).toBe("source_missing");
  expect(row.statusConflict).toBe(false);
  expect(row.presence).toBe("stored_only");
  expect(isImportable(row)).toBe(false);
});

// ---------------------------------------------------------------------------
// sourcePathIsStale invariant
// ---------------------------------------------------------------------------

test("mergeSessions: sourcePathIsStale is true ONLY for stored_only + source_missing", () => {
  const cases: Array<[SessionSyncStatus, "source_only" | "stored_only" | "both"]> = [
    ["not_stored", "source_only"],
    ["up_to_date", "both"],
    ["outdated", "both"],
    ["up_to_date", "stored_only"],
    ["outdated", "stored_only"],
    ["source_missing", "stored_only"], // the only true case
  ];
  for (const [status, presence] of cases) {
    const sources: SourceSessionView[] = [];
    const stored: StoredSessionView[] = [];
    if (presence === "source_only") {
      sources.push(buildSource({ status, session_uid: null, stored_ingested_at: null }));
    } else if (presence === "both") {
      const sid = `both-${status}`;
      const uid = `uid-${status}`;
      sources.push(
        buildSource({
          session_key: `claude_code:${sid}`,
          source_session_id: sid,
          status,
          session_uid: uid,
          stored_ingested_at: "2026-04-22T00:00:00Z",
        }),
      );
      stored.push(
        buildStored({
          session_uid: uid,
          source_session_id: sid,
          status,
          ingested_at: "2026-04-22T00:00:00Z",
        }),
      );
    } else {
      const sid = `so-${status}`;
      const uid = `uid-so-${status}`;
      stored.push(
        buildStored({
          session_uid: uid,
          source_session_id: sid,
          status,
        }),
      );
    }
    const rows = mergeSessions(sources, stored);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    const expectedStale = presence === "stored_only" && status === "source_missing";
    expect(row.sourcePathIsStale).toBe(expectedStale);
  }
});

// ---------------------------------------------------------------------------
// rowKey shape
// ---------------------------------------------------------------------------

test("mergeSessions: rowKey is `${tool}:${source_session_id}` for source-backed rows; `stored:${uid}` for stored_only", () => {
  const src1 = buildSource({
    session_key: "claude_code:rk-1",
    source_session_id: "rk-1",
    status: "not_stored",
  });
  const src2 = buildSource({
    session_key: "codex:rk-2",
    tool: "codex",
    source_session_id: "rk-2",
    status: "up_to_date",
    session_uid: "uid-rk-2",
    stored_ingested_at: "2026-04-22T00:00:00Z",
  });
  const st2 = buildStored({
    tool: "codex",
    source_session_id: "rk-2",
    session_uid: "uid-rk-2",
    status: "up_to_date",
  });
  const stOnly = buildStored({
    session_uid: "uid-rk-3",
    source_session_id: "rk-3",
    status: "source_missing",
  });
  const rows = mergeSessions([src1, src2], [st2, stOnly]);
  expect(rows).toHaveLength(3);
  const byKey = new Map(rows.map((r) => [r.rowKey, r]));
  expect(byKey.has("claude_code:rk-1")).toBe(true);
  expect(byKey.has("codex:rk-2")).toBe(true);
  expect(byKey.has("stored:uid-rk-3")).toBe(true);
  expect(byKey.get("claude_code:rk-1")?.presence).toBe("source_only");
  expect(byKey.get("codex:rk-2")?.presence).toBe("both");
  expect(byKey.get("stored:uid-rk-3")?.presence).toBe("stored_only");
});

// ---------------------------------------------------------------------------
// sourceSessionKey nullability invariant
// ---------------------------------------------------------------------------

test("mergeSessions: sourceSessionKey is null ONLY for stored_only rows", () => {
  const src = buildSource({
    session_key: "claude_code:src-only",
    source_session_id: "src-only",
    status: "not_stored",
  });
  const both = buildSource({
    session_key: "claude_code:both-key",
    source_session_id: "both-key",
    status: "up_to_date",
    session_uid: "uid-both",
    stored_ingested_at: "2026-04-22T00:00:00Z",
  });
  const bothStored = buildStored({
    source_session_id: "both-key",
    session_uid: "uid-both",
    status: "up_to_date",
  });
  const storedOnly = buildStored({
    source_session_id: "stored-only",
    session_uid: "uid-stored-only",
    status: "source_missing",
  });
  const rows = mergeSessions([src, both], [bothStored, storedOnly]);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    if (row.presence === "stored_only") {
      expect(row.sourceSessionKey).toBeNull();
    } else {
      expect(row.sourceSessionKey).not.toBeNull();
    }
  }
});

// ---------------------------------------------------------------------------
// Null timestamp propagation
// ---------------------------------------------------------------------------

test("mergeSessions: null timestamps propagate cleanly without coercion to ''", () => {
  const src = buildSource({
    session_key: "claude_code:null-ts",
    source_session_id: "null-ts",
    status: "not_stored",
    created_at: null,
    source_updated_at: null,
    title: null,
    project_path: null,
  });
  const rows = mergeSessions([src], []);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.createdAt).toBeNull();
  expect(row.sourceUpdatedAt).toBeNull();
  expect(row.ingestedAt).toBeNull();
  expect(row.title).toBeNull();
  expect(row.projectPath).toBeNull();
});

// ---------------------------------------------------------------------------
// Mixed input ordering
// ---------------------------------------------------------------------------

test("mergeSessions: a mixed input set produces source rows first, then stored_only in input order", () => {
  const src1 = buildSource({
    session_key: "claude_code:order-src-1",
    source_session_id: "order-src-1",
    status: "not_stored",
  });
  const src2 = buildSource({
    session_key: "claude_code:order-src-2",
    source_session_id: "order-src-2",
    status: "up_to_date",
    session_uid: "uid-2",
    stored_ingested_at: "2026-04-22T00:00:00Z",
  });
  const stMatch = buildStored({
    source_session_id: "order-src-2",
    session_uid: "uid-2",
    status: "up_to_date",
  });
  const stOnlyA = buildStored({
    source_session_id: "order-stored-A",
    session_uid: "uid-A",
    status: "source_missing",
  });
  const stOnlyB = buildStored({
    source_session_id: "order-stored-B",
    session_uid: "uid-B",
    status: "outdated",
  });
  const rows = mergeSessions([src1, src2], [stMatch, stOnlyA, stOnlyB]);
  expect(rows.map((r) => r.rowKey)).toEqual([
    "claude_code:order-src-1",
    "claude_code:order-src-2",
    "stored:uid-A",
    "stored:uid-B",
  ]);
});

// ---------------------------------------------------------------------------
// Tool axis: claude_code vs codex
// ---------------------------------------------------------------------------

test("mergeSessions: same source_session_id under different tools does NOT join", () => {
  // The join identity is `(tool, source_session_id)`, not the bare
  // session id. A claude_code:abc must not collide with a codex:abc.
  const srcClaude = buildSource({
    session_key: "claude_code:abc",
    tool: "claude_code",
    source_session_id: "abc",
    status: "not_stored",
  });
  const stCodex = buildStored({
    tool: "codex",
    source_session_id: "abc",
    session_uid: "uid-codex-abc",
    status: "source_missing",
  });
  const rows = mergeSessions([srcClaude], [stCodex]);
  expect(rows).toHaveLength(2);
  const claude = rows.find((r) => r.tool === "claude_code");
  const codex = rows.find((r) => r.tool === "codex");
  expect(claude?.presence).toBe("source_only");
  expect(claude?.rowKey).toBe("claude_code:abc");
  expect(codex?.presence).toBe("stored_only");
  expect(codex?.rowKey).toBe("stored:uid-codex-abc");
  expect(codex?.sourcePathIsStale).toBe(true);
});

// ---------------------------------------------------------------------------
// isImportable rule
// ---------------------------------------------------------------------------

test("isImportable: only rows with non-null sourceSessionKey AND status=not_stored|outdated are importable", () => {
  const cases: Array<{ presence: "source_only" | "both" | "stored_only"; status: SessionSyncStatus; importable: boolean }> = [
    { presence: "source_only", status: "not_stored", importable: true },
    { presence: "both", status: "up_to_date", importable: false },
    { presence: "both", status: "outdated", importable: true },
    { presence: "stored_only", status: "up_to_date", importable: false },
    { presence: "stored_only", status: "outdated", importable: false },
    { presence: "stored_only", status: "source_missing", importable: false },
  ];
  for (const { presence, status, importable } of cases) {
    const sources: SourceSessionView[] = [];
    const stored: StoredSessionView[] = [];
    if (presence === "source_only") {
      sources.push(buildSource({ status, session_uid: null, stored_ingested_at: null }));
    } else if (presence === "both") {
      const sid = `imp-both-${status}`;
      const uid = `uid-${status}`;
      sources.push(
        buildSource({
          session_key: `claude_code:${sid}`,
          source_session_id: sid,
          status,
          session_uid: uid,
          stored_ingested_at: "2026-04-22T00:00:00Z",
        }),
      );
      stored.push(
        buildStored({
          source_session_id: sid,
          session_uid: uid,
          status,
        }),
      );
    } else {
      const sid = `imp-so-${status}`;
      const uid = `uid-so-${status}`;
      stored.push(
        buildStored({
          source_session_id: sid,
          session_uid: uid,
          status,
        }),
      );
    }
    const [row] = mergeSessions(sources, stored);
    expect(row).toBeDefined();
    expect(isImportable(row!)).toBe(importable);
  }
});
