use rusqlite::{Connection, OptionalExtension};

pub const CURRENT_VERSION: i64 = 1;

const MIGRATIONS: &[(i64, &str)] = &[(
    1,
    r#"
CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_blobs (
  content_addr TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  refcount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
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

CREATE TABLE IF NOT EXISTS scan_errors (
  error_id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  source_path TEXT NOT NULL,
  fingerprint TEXT,
  message TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
"#,
)];

pub fn apply(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
         )",
        [],
    )?;

    for (version, sql) in MIGRATIONS {
        let already_applied = connection
            .query_row(
                "SELECT 1 FROM migrations WHERE version = ?1",
                [version],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();
        if already_applied {
            continue;
        }

        let transaction = connection.unchecked_transaction()?;
        transaction.execute_batch(sql)?;
        transaction.execute(
            "INSERT OR REPLACE INTO migrations (version, applied_at) VALUES (?1, ?2)",
            rusqlite::params![version, now_rfc3339()],
        )?;
        transaction.commit()?;
    }

    Ok(())
}

fn now_rfc3339() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .expect("valid RFC3339 timestamp")
}
