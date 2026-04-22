use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    str::FromStr,
    sync::Mutex,
};

use distill_portal_ui_api_contracts::{PersistedScanError, StoredSessionRecord, Tool};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::{blob_store::StoreError, migrations, ScanErrorInput, StoredSessionInput};

#[derive(Debug)]
pub struct SqliteStore {
    connection: Mutex<Connection>,
    path: PathBuf,
}

#[derive(Clone, Debug)]
pub struct ReplaceResult {
    pub session: StoredSessionRecord,
    pub obsolete_blob: Option<String>,
}

impl SqliteStore {
    pub fn open(path: PathBuf) -> Result<Self, StoreError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let connection = Connection::open(&path)?;
        connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        migrations::apply(&connection)?;

        Ok(Self {
            connection: Mutex::new(connection),
            path,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn get_session_by_source_key(
        &self,
        tool: Tool,
        source_session_id: &str,
    ) -> Result<Option<StoredSessionRecord>, StoreError> {
        let connection = self.connection()?;
        query_session(
            &connection,
            "SELECT session_uid, tool, source_session_id, source_path, source_fingerprint, raw_ref,
                    created_at, source_updated_at, ingested_at, project_path, title, has_subagent_sidecars
             FROM sessions
             WHERE tool = ?1 AND source_session_id = ?2",
            params![tool.as_str(), source_session_id],
        )
    }

    pub fn get_session(
        &self,
        session_uid: &str,
    ) -> Result<Option<StoredSessionRecord>, StoreError> {
        let connection = self.connection()?;
        query_session(
            &connection,
            "SELECT session_uid, tool, source_session_id, source_path, source_fingerprint, raw_ref,
                    created_at, source_updated_at, ingested_at, project_path, title, has_subagent_sidecars
             FROM sessions
             WHERE session_uid = ?1",
            params![session_uid],
        )
    }

    pub fn list_sessions(&self) -> Result<Vec<StoredSessionRecord>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT session_uid, tool, source_session_id, source_path, source_fingerprint, raw_ref,
                    created_at, source_updated_at, ingested_at, project_path, title, has_subagent_sidecars
             FROM sessions
             ORDER BY ingested_at DESC, session_uid DESC",
        )?;
        let rows = statement.query_map([], map_session_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
    }

    pub fn list_scan_errors(&self) -> Result<Vec<PersistedScanError>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT error_id, tool, source_path, fingerprint, message, first_seen_at, last_seen_at
             FROM scan_errors
             ORDER BY last_seen_at DESC, error_id DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(PersistedScanError {
                error_id: row.get(0)?,
                tool: tool_from_db(&row.get::<_, String>(1)?)?,
                source_path: row.get(2)?,
                fingerprint: row.get(3)?,
                message: row.get(4)?,
                first_seen_at: row.get(5)?,
                last_seen_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
    }

    pub fn record_scan_error(&self, error: &ScanErrorInput) -> Result<(), StoreError> {
        let connection = self.connection()?;
        let now = now_rfc3339();
        let error_id = scan_error_id(error.tool, Path::new(&error.source_path));
        connection.execute(
            "INSERT INTO scan_errors (error_id, tool, source_path, fingerprint, message, first_seen_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(error_id) DO UPDATE SET
               fingerprint = excluded.fingerprint,
               message = excluded.message,
               last_seen_at = excluded.last_seen_at",
            params![
                error_id,
                error.tool.as_str(),
                error.source_path.display().to_string(),
                error.fingerprint,
                error.message,
                now
            ],
        )?;
        Ok(())
    }

    pub fn clear_scan_error(&self, tool: Tool, source_path: &Path) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "DELETE FROM scan_errors WHERE error_id = ?1",
            [scan_error_id(tool, source_path)],
        )?;
        Ok(())
    }

    pub fn referenced_blobs(&self) -> Result<HashSet<String>, StoreError> {
        let connection = self.connection()?;
        let mut statement =
            connection.prepare("SELECT content_addr FROM raw_blobs WHERE refcount > 0")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<HashSet<_>, _>>()
            .map_err(StoreError::from)
    }

    pub fn insert_session(
        &self,
        input: &StoredSessionInput,
        raw_ref: &str,
        ingested_at: OffsetDateTime,
    ) -> Result<StoredSessionRecord, StoreError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        increment_blob_ref(
            &transaction,
            raw_ref,
            input.raw_size_bytes as i64,
            ingested_at,
        )?;
        let session_uid = Uuid::new_v4().to_string();
        transaction.execute(
            "INSERT INTO sessions (
                 session_uid, tool, source_session_id, source_path, source_fingerprint, raw_ref,
                 created_at, source_updated_at, ingested_at, project_path, title, has_subagent_sidecars
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                session_uid,
                input.tool.as_str(),
                input.source_session_id,
                input.source_path.display().to_string(),
                input.source_fingerprint,
                raw_ref,
                format_optional_time(input.created_at),
                format_optional_time(input.source_updated_at),
                format_time(ingested_at),
                input.project_path.as_ref().map(|path| path.display().to_string()),
                input.title,
                input.has_subagent_sidecars as i64,
            ],
        )?;
        transaction.commit()?;
        drop(connection);
        self.get_session(&session_uid)?
            .ok_or_else(|| StoreError::SessionNotFound(session_uid))
    }

    pub fn replace_session(
        &self,
        existing: &StoredSessionRecord,
        input: &StoredSessionInput,
        raw_ref: &str,
        ingested_at: OffsetDateTime,
    ) -> Result<ReplaceResult, StoreError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        increment_blob_ref(
            &transaction,
            raw_ref,
            input.raw_size_bytes as i64,
            ingested_at,
        )?;
        transaction.execute(
            "UPDATE sessions
             SET source_path = ?2,
                 source_fingerprint = ?3,
                 raw_ref = ?4,
                 created_at = ?5,
                 source_updated_at = ?6,
                 ingested_at = ?7,
                 project_path = ?8,
                 title = ?9,
                 has_subagent_sidecars = ?10
             WHERE session_uid = ?1",
            params![
                existing.session_uid,
                input.source_path.display().to_string(),
                input.source_fingerprint,
                raw_ref,
                format_optional_time(input.created_at),
                format_optional_time(input.source_updated_at),
                format_time(ingested_at),
                input
                    .project_path
                    .as_ref()
                    .map(|path| path.display().to_string()),
                input.title,
                input.has_subagent_sidecars as i64,
            ],
        )?;
        let obsolete_blob = decrement_blob_ref(&transaction, &existing.raw_ref)?;
        transaction.commit()?;
        drop(connection);
        let session = self
            .get_session(&existing.session_uid)?
            .ok_or_else(|| StoreError::SessionNotFound(existing.session_uid.clone()))?;
        Ok(ReplaceResult {
            session,
            obsolete_blob,
        })
    }

    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, StoreError> {
        self.connection.lock().map_err(|_| StoreError::LockPoisoned)
    }
}

fn increment_blob_ref(
    transaction: &Transaction<'_>,
    raw_ref: &str,
    size_bytes: i64,
    created_at: OffsetDateTime,
) -> Result<(), StoreError> {
    transaction.execute(
        "INSERT INTO raw_blobs (content_addr, size_bytes, refcount, created_at)
         VALUES (?1, ?2, 1, ?3)
         ON CONFLICT(content_addr) DO UPDATE SET
           refcount = raw_blobs.refcount + 1,
           size_bytes = excluded.size_bytes",
        params![raw_ref, size_bytes, format_time(created_at)],
    )?;
    Ok(())
}

fn decrement_blob_ref(
    transaction: &Transaction<'_>,
    raw_ref: &str,
) -> Result<Option<String>, StoreError> {
    transaction.execute(
        "UPDATE raw_blobs SET refcount = refcount - 1 WHERE content_addr = ?1",
        [raw_ref],
    )?;
    let refcount: i64 = transaction.query_row(
        "SELECT refcount FROM raw_blobs WHERE content_addr = ?1",
        [raw_ref],
        |row| row.get(0),
    )?;
    if refcount <= 0 {
        transaction.execute("DELETE FROM raw_blobs WHERE content_addr = ?1", [raw_ref])?;
        Ok(Some(raw_ref.to_string()))
    } else {
        Ok(None)
    }
}

fn query_session(
    connection: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Option<StoredSessionRecord>, StoreError> {
    connection
        .query_row(sql, params, map_session_row)
        .optional()
        .map_err(StoreError::from)
}

fn map_session_row(row: &rusqlite::Row<'_>) -> Result<StoredSessionRecord, rusqlite::Error> {
    Ok(StoredSessionRecord {
        session_uid: row.get(0)?,
        tool: tool_from_db(&row.get::<_, String>(1)?)?,
        source_session_id: row.get(2)?,
        source_path: row.get(3)?,
        source_fingerprint: row.get(4)?,
        raw_ref: row.get(5)?,
        created_at: row.get(6)?,
        source_updated_at: row.get(7)?,
        ingested_at: row.get(8)?,
        project_path: row.get(9)?,
        title: row.get(10)?,
        has_subagent_sidecars: row.get::<_, i64>(11)? != 0,
    })
}

fn tool_from_db(value: &str) -> Result<Tool, rusqlite::Error> {
    Tool::from_str(value).map_err(|_| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            format!("unknown tool: {value}").into(),
        )
    })
}

fn scan_error_id(tool: Tool, source_path: &Path) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{}:{}", tool.as_str(), source_path.display()).as_bytes())
    )
}

fn format_optional_time(value: Option<OffsetDateTime>) -> Option<String> {
    value.map(format_time)
}

fn format_time(value: OffsetDateTime) -> String {
    value.format(&Rfc3339).expect("valid RFC3339 timestamp")
}

fn now_rfc3339() -> String {
    format_time(OffsetDateTime::now_utc())
}
