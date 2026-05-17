use rusqlite::{Connection, OptionalExtension};

pub const CURRENT_VERSION: i64 = 1;

const MIGRATIONS: &[(i64, &str)] = &[(
    1,
    r#"
CREATE TABLE IF NOT EXISTS operations_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  canonical_params_hash TEXT NOT NULL,
  input_version TEXT NOT NULL,
  status TEXT NOT NULL,
  params_json TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  submitted_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  cancel_requested_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS operations_active_idempotency_idx
  ON operations(kind, canonical_params_hash, input_version)
  WHERE status IN ('queued', 'running', 'cancel_requested', 'succeeded');

CREATE INDEX IF NOT EXISTS operations_status_idx ON operations(status);
CREATE INDEX IF NOT EXISTS operations_submitted_at_idx ON operations(submitted_at DESC);
"#,
)];

pub fn apply(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS operations_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
         )",
        [],
    )?;

    for (version, sql) in MIGRATIONS {
        let already_applied = connection
            .query_row(
                "SELECT 1 FROM operations_migrations WHERE version = ?1",
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
            "INSERT OR REPLACE INTO operations_migrations (version, applied_at) VALUES (?1, ?2)",
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
