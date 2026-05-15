//! Phase 6 round-trip test for `title_source` through SQLite.
//!
//! Inserts a record carrying each of the four `TitleSource` enum values plus
//! `None` (NULL), reads each one back, and asserts the byte-equivalent enum
//! is recovered. This is the SELECT/INSERT/map_row coverage required by
//! `working/phase-6.md` §Testing line 233.

use std::path::PathBuf;

use distill_portal_raw_session_store::{
    BlobStore, LocalFsBlobStore, SqliteStore, StoredSessionInput,
};
use distill_portal_ui_api_contracts::{TitleSource, Tool};
use tempfile::TempDir;
use time::OffsetDateTime;

fn fresh_store(tempdir: &TempDir) -> (SqliteStore, LocalFsBlobStore) {
    let store = SqliteStore::open(tempdir.path().join("data.db")).expect("open sqlite store");
    let blobs = LocalFsBlobStore::new(tempdir.path().join("blobs")).expect("blob store");
    (store, blobs)
}

fn make_input(
    source_session_id: &str,
    title: Option<&str>,
    title_source: Option<TitleSource>,
    fingerprint: &str,
) -> StoredSessionInput {
    StoredSessionInput {
        tool: Tool::ClaudeCode,
        source_session_id: source_session_id.to_string(),
        source_path: PathBuf::from(format!("/tmp/{source_session_id}.jsonl")),
        source_fingerprint: fingerprint.to_string(),
        created_at: None,
        source_updated_at: None,
        project_path: None,
        title: title.map(str::to_string),
        title_source,
        has_subagent_sidecars: false,
        raw_size_bytes: 1,
    }
}

fn put_blob(blobs: &LocalFsBlobStore, addr: &str) {
    blobs.put(addr, b".").expect("put blob");
}

#[test]
fn round_trip_preserves_all_enum_values_and_null() {
    let tempdir = TempDir::new().unwrap();
    let (store, blobs) = fresh_store(&tempdir);

    // Pad each fingerprint to 64 hex chars so the blob store accepts it.
    let cases: [(&str, Option<&str>, Option<TitleSource>, &str); 5] = [
        (
            "session-custom",
            Some("custom title"),
            Some(TitleSource::Custom),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
        (
            "session-first-user",
            Some("user prompt"),
            Some(TitleSource::FirstUserMessage),
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ),
        (
            "session-slug",
            Some("slug-text"),
            Some(TitleSource::Slug),
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        ),
        (
            "session-generated",
            Some("ai title"),
            Some(TitleSource::Generated),
            "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        ),
        (
            "session-none",
            None,
            None,
            "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        ),
    ];

    for (session_id, title, title_source, addr) in cases {
        put_blob(&blobs, addr);
        let input = make_input(session_id, title, title_source, addr);
        let inserted = store
            .insert_session(&input, addr, OffsetDateTime::now_utc())
            .expect("insert session");
        assert_eq!(inserted.title.as_deref(), title);
        assert_eq!(inserted.title_source, title_source);

        // Read back via every code path that exists today.
        let by_uid = store
            .get_session(&inserted.session_uid)
            .expect("get_session ok")
            .expect("session present");
        assert_eq!(by_uid.title.as_deref(), title);
        assert_eq!(by_uid.title_source, title_source);

        let by_key = store
            .get_session_by_source_key(Tool::ClaudeCode, session_id)
            .expect("get_session_by_source_key ok")
            .expect("session present");
        assert_eq!(by_key.title.as_deref(), title);
        assert_eq!(by_key.title_source, title_source);
    }

    let listed = store.list_sessions().expect("list_sessions ok");
    assert_eq!(listed.len(), 5);
    // Sanity: every variant we inserted is present in the list as expected.
    let observed: std::collections::HashMap<&str, Option<TitleSource>> = listed
        .iter()
        .map(|record| (record.source_session_id.as_str(), record.title_source))
        .collect();
    assert_eq!(observed.get("session-custom").copied(), Some(Some(TitleSource::Custom)));
    assert_eq!(
        observed.get("session-first-user").copied(),
        Some(Some(TitleSource::FirstUserMessage))
    );
    assert_eq!(observed.get("session-slug").copied(), Some(Some(TitleSource::Slug)));
    assert_eq!(
        observed.get("session-generated").copied(),
        Some(Some(TitleSource::Generated))
    );
    assert_eq!(observed.get("session-none").copied(), Some(None));
}

#[test]
fn replace_session_overwrites_title_source() {
    let tempdir = TempDir::new().unwrap();
    let (store, blobs) = fresh_store(&tempdir);

    let addr_v1 = "1111111111111111111111111111111111111111111111111111111111111111";
    let addr_v2 = "2222222222222222222222222222222222222222222222222222222222222222";
    put_blob(&blobs, addr_v1);
    put_blob(&blobs, addr_v2);

    let v1 = make_input(
        "session-replace",
        Some("first prompt"),
        Some(TitleSource::FirstUserMessage),
        addr_v1,
    );
    let inserted = store
        .insert_session(&v1, addr_v1, OffsetDateTime::now_utc())
        .expect("insert");
    assert_eq!(inserted.title_source, Some(TitleSource::FirstUserMessage));

    let v2 = make_input(
        "session-replace",
        Some("Custom Hand-Set Title"),
        Some(TitleSource::Custom),
        addr_v2,
    );
    let replaced = store
        .replace_session(&inserted, &v2, addr_v2, OffsetDateTime::now_utc())
        .expect("replace");
    assert_eq!(replaced.session.title.as_deref(), Some("Custom Hand-Set Title"));
    assert_eq!(replaced.session.title_source, Some(TitleSource::Custom));

    let fresh = store
        .get_session(&inserted.session_uid)
        .expect("get_session ok")
        .expect("session present");
    assert_eq!(fresh.title_source, Some(TitleSource::Custom));
}

#[test]
fn legacy_v1_database_migrates_and_reads_null_title_source() {
    // Simulate a database created before Phase 6: open with the v1 schema,
    // insert a row that has NO title_source column data, then reopen the
    // store and confirm:
    //   1. The v2 ALTER TABLE migration applies cleanly without losing data.
    //   2. Existing rows surface as `title_source = None` (i.e. NULL maps to
    //      `Option::None`) — the spec §Risks line 245 entry.
    let tempdir = TempDir::new().unwrap();
    let db_path = tempdir.path().join("data.db");

    {
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute_batch(
            r#"
PRAGMA foreign_keys = ON;
CREATE TABLE migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE raw_blobs (
  content_addr TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  refcount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  session_uid TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  raw_ref TEXT NOT NULL REFERENCES raw_blobs(content_addr),
  created_at TEXT,
  source_updated_at TEXT,
  ingested_at TEXT NOT NULL,
  project_path TEXT,
  title TEXT,
  has_subagent_sidecars INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tool, source_session_id)
);
CREATE TABLE scan_errors (
  error_id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  source_path TEXT NOT NULL,
  fingerprint TEXT,
  message TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
INSERT INTO migrations (version, applied_at) VALUES (1, '2026-04-30T00:00:00Z');
INSERT INTO raw_blobs (content_addr, size_bytes, refcount, created_at)
  VALUES ('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 1, 1, '2026-04-30T00:00:00Z');
INSERT INTO sessions (
  session_uid, tool, source_session_id, source_path, source_fingerprint, raw_ref,
  created_at, source_updated_at, ingested_at, project_path, title, has_subagent_sidecars
) VALUES (
  'legacy-uid', 'claude_code', 'legacy-id', '/tmp/legacy.jsonl',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  NULL, NULL, '2026-04-30T00:00:00Z', NULL, 'legacy title', 0
);
"#,
        )
        .unwrap();
    }

    // Reopen via SqliteStore::open — should apply the v2 ALTER TABLE
    // migration in place and surface the legacy row with title_source=None.
    let store = SqliteStore::open(db_path).expect("reopen and migrate");
    let record = store
        .get_session("legacy-uid")
        .expect("get_session ok")
        .expect("legacy session present");
    assert_eq!(record.title.as_deref(), Some("legacy title"));
    assert!(record.title_source.is_none());
}
