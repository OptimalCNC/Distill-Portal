use std::{
    path::{Path, PathBuf},
    str::FromStr,
    sync::Mutex,
};

use distill_portal_ui_api_contracts::{
    Operation, OperationKind, OperationStatus, OperationsListQuery,
};
use rusqlite::{
    params, params_from_iter,
    types::{Type, Value as SqlValue},
    Connection, OptionalExtension,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::migrations;

const SELECT_OPERATION_BY_ID: &str =
    "SELECT id, kind, canonical_params_hash, input_version, status, params_json,
        result_json, error_json, submitted_at, started_at, finished_at,
        cancel_requested_at
     FROM operations
     WHERE id = ?1";

#[derive(Debug)]
pub struct OperationsStore {
    connection: Mutex<Connection>,
    path: PathBuf,
}

#[derive(Clone, Debug)]
pub struct NewOperation {
    pub kind: OperationKind,
    pub canonical_params_hash: String,
    pub input_version: String,
    pub params_json: Value,
}

#[derive(Clone, Debug)]
pub enum CancelRequestOutcome {
    Requested(Operation),
    Conflict(Operation),
    NotFound,
}

#[derive(Debug, thiserror::Error)]
pub enum OperationsError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("operations store lock poisoned")]
    LockPoisoned,
    #[error("operation not found: {0}")]
    OperationNotFound(String),
    #[error("finish requires a terminal operation status, got {0}")]
    NonTerminalFinish(OperationStatus),
}

impl OperationsStore {
    pub fn open(path: PathBuf) -> Result<Self, OperationsError> {
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

    pub fn insert(&self, input: NewOperation) -> Result<Operation, OperationsError> {
        let id = Uuid::now_v7().to_string();
        let now = now_rfc3339();
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO operations (
                 id, kind, canonical_params_hash, input_version, status, params_json,
                 submitted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.kind.as_str(),
                input.canonical_params_hash,
                input.input_version,
                OperationStatus::Queued.as_str(),
                serde_json::to_string(&input.params_json)?,
                now,
            ],
        )?;
        drop(connection);
        self.get_by_id(&id)?
            .ok_or_else(|| OperationsError::OperationNotFound(id))
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<Operation>, OperationsError> {
        let connection = self.connection()?;
        query_operation(
            &connection,
            "SELECT id, kind, canonical_params_hash, input_version, status, params_json,
                    result_json, error_json, submitted_at, started_at, finished_at,
                    cancel_requested_at
             FROM operations
             WHERE id = ?1",
            params![id],
        )
    }

    pub fn find_by_idempotency_key(
        &self,
        kind: OperationKind,
        canonical_params_hash: &str,
        input_version: &str,
    ) -> Result<Option<Operation>, OperationsError> {
        let connection = self.connection()?;
        query_operation(
            &connection,
            "SELECT id, kind, canonical_params_hash, input_version, status, params_json,
                    result_json, error_json, submitted_at, started_at, finished_at,
                    cancel_requested_at
             FROM operations
             WHERE kind = ?1
               AND canonical_params_hash = ?2
               AND input_version = ?3
               AND status IN ('queued', 'running', 'cancel_requested', 'succeeded')
             ORDER BY submitted_at DESC, id DESC
             LIMIT 1",
            params![kind.as_str(), canonical_params_hash, input_version],
        )
    }

    pub fn claim_next_queued(
        &self,
        kind: OperationKind,
    ) -> Result<Option<Operation>, OperationsError> {
        let now = now_rfc3339();
        let connection = self.connection()?;
        let transaction = connection.unchecked_transaction()?;
        let id = transaction
            .query_row(
                "SELECT id
                 FROM operations
                 WHERE kind = ?1 AND status = 'queued'
                 ORDER BY submitted_at ASC, id ASC
                 LIMIT 1",
                params![kind.as_str()],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        let Some(id) = id else {
            transaction.commit()?;
            return Ok(None);
        };

        let updated = transaction.execute(
            "UPDATE operations
             SET status = 'running',
                 started_at = COALESCE(started_at, ?2)
             WHERE id = ?1 AND status = 'queued'",
            params![id, now],
        )?;
        if updated == 0 {
            transaction.commit()?;
            return Ok(None);
        }

        let claimed = query_operation(&transaction, SELECT_OPERATION_BY_ID, params![id])?;
        transaction.commit()?;
        Ok(claimed)
    }

    pub fn complete_next_queued_cancellation(
        &self,
        kind: OperationKind,
    ) -> Result<Option<Operation>, OperationsError> {
        let connection = self.connection()?;
        let transaction = connection.unchecked_transaction()?;
        let id = transaction
            .query_row(
                "SELECT id
                 FROM operations
                 WHERE kind = ?1
                   AND status = 'cancel_requested'
                   AND started_at IS NULL
                 ORDER BY submitted_at ASC, id ASC
                 LIMIT 1",
                params![kind.as_str()],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        let Some(id) = id else {
            transaction.commit()?;
            return Ok(None);
        };

        update_cancelled(&transaction, &id, None)?;
        let cancelled = query_operation(&transaction, SELECT_OPERATION_BY_ID, params![id])?;
        transaction.commit()?;
        Ok(cancelled)
    }

    pub fn request_cancel(&self, id: &str) -> Result<CancelRequestOutcome, OperationsError> {
        let now = now_rfc3339();
        let connection = self.connection()?;
        let transaction = connection.unchecked_transaction()?;
        let Some(existing) = query_operation(&transaction, SELECT_OPERATION_BY_ID, params![id])?
        else {
            transaction.commit()?;
            return Ok(CancelRequestOutcome::NotFound);
        };

        if !matches!(
            existing.status,
            OperationStatus::Queued | OperationStatus::Running
        ) {
            transaction.commit()?;
            return Ok(CancelRequestOutcome::Conflict(existing));
        }

        let updated = transaction.execute(
            "UPDATE operations
             SET status = 'cancel_requested',
                 cancel_requested_at = COALESCE(cancel_requested_at, ?2)
             WHERE id = ?1 AND status IN ('queued', 'running')",
            params![id, now],
        )?;
        if updated == 0 {
            let current = query_operation(&transaction, SELECT_OPERATION_BY_ID, params![id])?
                .ok_or_else(|| OperationsError::OperationNotFound(id.to_string()))?;
            transaction.commit()?;
            return Ok(CancelRequestOutcome::Conflict(current));
        }

        let requested = query_operation(&transaction, SELECT_OPERATION_BY_ID, params![id])?
            .ok_or_else(|| OperationsError::OperationNotFound(id.to_string()))?;
        transaction.commit()?;
        Ok(CancelRequestOutcome::Requested(requested))
    }

    pub fn is_cancel_requested(&self, id: &str) -> Result<bool, OperationsError> {
        let connection = self.connection()?;
        let status = connection
            .query_row(
                "SELECT status FROM operations WHERE id = ?1",
                params![id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        Ok(matches!(
            status
                .as_deref()
                .and_then(|value| OperationStatus::from_str(value).ok()),
            Some(OperationStatus::CancelRequested)
        ))
    }

    pub fn complete_success(
        &self,
        id: &str,
        result_json: Value,
    ) -> Result<Option<Operation>, OperationsError> {
        self.complete_terminal_conditional(
            id,
            OperationStatus::Succeeded,
            Some(result_json),
            None,
            "status IN ('running', 'cancel_requested')",
        )
    }

    pub fn complete_failure(
        &self,
        id: &str,
        error_json: Value,
    ) -> Result<Option<Operation>, OperationsError> {
        self.complete_terminal_conditional(
            id,
            OperationStatus::Failed,
            None,
            Some(error_json),
            "status IN ('running', 'cancel_requested')",
        )
    }

    pub fn complete_cancelled(
        &self,
        id: &str,
        result_json: Option<Value>,
    ) -> Result<Option<Operation>, OperationsError> {
        let connection = self.connection()?;
        let transaction = connection.unchecked_transaction()?;
        let updated = update_cancelled(&transaction, id, result_json.as_ref())?;
        let operation = if updated == 0 {
            None
        } else {
            query_operation(&transaction, SELECT_OPERATION_BY_ID, params![id])?
        };
        transaction.commit()?;
        Ok(operation)
    }

    pub fn reconcile_interrupted(&self) -> Result<usize, OperationsError> {
        let now = now_rfc3339();
        let connection = self.connection()?;
        connection
            .execute(
                "UPDATE operations
                 SET status = 'interrupted',
                     finished_at = COALESCE(finished_at, ?1)
                 WHERE status IN ('running', 'cancel_requested')",
                params![now],
            )
            .map_err(OperationsError::from)
    }

    pub fn list(&self, query: OperationsListQuery) -> Result<Vec<Operation>, OperationsError> {
        let mut sql = String::from(
            "SELECT id, kind, canonical_params_hash, input_version, status, params_json,
                    result_json, error_json, submitted_at, started_at, finished_at,
                    cancel_requested_at
             FROM operations",
        );
        let mut clauses = Vec::new();
        let mut values = Vec::new();

        if let Some(statuses) = query.status.filter(|statuses| !statuses.is_empty()) {
            clauses.push(format!(
                "status IN ({})",
                std::iter::repeat("?")
                    .take(statuses.len())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
            values.extend(
                statuses
                    .into_iter()
                    .map(|status| SqlValue::Text(status.as_str().to_string())),
            );
        }

        if let Some(kinds) = query.kind.filter(|kinds| !kinds.is_empty()) {
            clauses.push(format!(
                "kind IN ({})",
                std::iter::repeat("?")
                    .take(kinds.len())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
            values.extend(
                kinds
                    .into_iter()
                    .map(|kind| SqlValue::Text(kind.as_str().to_string())),
            );
        }

        if !clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&clauses.join(" AND "));
        }
        sql.push_str(" ORDER BY submitted_at DESC, id DESC LIMIT ?");
        values.push(SqlValue::Integer(normalize_limit(query.limit) as i64));

        let connection = self.connection()?;
        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(values), map_operation_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(OperationsError::from)
    }

    pub fn update_status(
        &self,
        id: &str,
        status: OperationStatus,
    ) -> Result<Option<Operation>, OperationsError> {
        let Some(existing) = self.get_by_id(id)? else {
            return Ok(None);
        };
        let now = now_rfc3339();
        let started_at = if status == OperationStatus::Running && existing.started_at.is_none() {
            Some(now.clone())
        } else {
            existing.started_at
        };
        let finished_at = if status.is_terminal() && existing.finished_at.is_none() {
            Some(now.clone())
        } else {
            existing.finished_at
        };
        let cancel_requested_at = if status == OperationStatus::CancelRequested
            && existing.cancel_requested_at.is_none()
        {
            Some(now)
        } else {
            existing.cancel_requested_at
        };

        let connection = self.connection()?;
        connection.execute(
            "UPDATE operations
             SET status = ?2,
                 started_at = ?3,
                 finished_at = ?4,
                 cancel_requested_at = ?5
             WHERE id = ?1",
            params![
                id,
                status.as_str(),
                started_at,
                finished_at,
                cancel_requested_at,
            ],
        )?;
        drop(connection);
        self.get_by_id(id)
    }

    pub fn finish(
        &self,
        id: &str,
        status: OperationStatus,
        result_json: Option<Value>,
        error_json: Option<Value>,
    ) -> Result<Option<Operation>, OperationsError> {
        if !status.is_terminal() {
            return Err(OperationsError::NonTerminalFinish(status));
        }
        let Some(existing) = self.get_by_id(id)? else {
            return Ok(None);
        };
        let finished_at = existing.finished_at.unwrap_or_else(now_rfc3339);
        let connection = self.connection()?;
        connection.execute(
            "UPDATE operations
             SET status = ?2,
                 finished_at = ?3,
                 result_json = ?4,
                 error_json = ?5
             WHERE id = ?1",
            params![
                id,
                status.as_str(),
                finished_at,
                serialize_optional_json(result_json.as_ref())?,
                serialize_optional_json(error_json.as_ref())?,
            ],
        )?;
        drop(connection);
        self.get_by_id(id)
    }

    fn complete_terminal_conditional(
        &self,
        id: &str,
        status: OperationStatus,
        result_json: Option<Value>,
        error_json: Option<Value>,
        predicate: &str,
    ) -> Result<Option<Operation>, OperationsError> {
        let finished_at = now_rfc3339();
        let connection = self.connection()?;
        let transaction = connection.unchecked_transaction()?;
        let sql = format!(
            "UPDATE operations
             SET status = ?2,
                 finished_at = ?3,
                 result_json = ?4,
                 error_json = ?5
             WHERE id = ?1 AND {predicate}"
        );
        let updated = transaction.execute(
            &sql,
            params![
                id,
                status.as_str(),
                finished_at,
                serialize_optional_json(result_json.as_ref())?,
                serialize_optional_json(error_json.as_ref())?,
            ],
        )?;
        let operation = if updated == 0 {
            None
        } else {
            query_operation(&transaction, SELECT_OPERATION_BY_ID, params![id])?
        };
        transaction.commit()?;
        Ok(operation)
    }

    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, OperationsError> {
        self.connection
            .lock()
            .map_err(|_| OperationsError::LockPoisoned)
    }
}

fn normalize_limit(limit: Option<usize>) -> usize {
    limit.unwrap_or(50).clamp(1, 200)
}

fn query_operation(
    connection: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Option<Operation>, OperationsError> {
    connection
        .query_row(sql, params, map_operation_row)
        .optional()
        .map_err(OperationsError::from)
}

fn map_operation_row(row: &rusqlite::Row<'_>) -> Result<Operation, rusqlite::Error> {
    Ok(Operation {
        id: row.get(0)?,
        kind: operation_kind_from_db(&row.get::<_, String>(1)?)?,
        canonical_params_hash: row.get(2)?,
        input_version: row.get(3)?,
        status: operation_status_from_db(&row.get::<_, String>(4)?)?,
        params_json: parse_json_column(row.get::<_, String>(5)?, 5)?,
        result_json: parse_optional_json_column(row.get::<_, Option<String>>(6)?, 6)?,
        error_json: parse_optional_json_column(row.get::<_, Option<String>>(7)?, 7)?,
        submitted_at: row.get(8)?,
        started_at: row.get(9)?,
        finished_at: row.get(10)?,
        cancel_requested_at: row.get(11)?,
    })
}

fn operation_kind_from_db(value: &str) -> Result<OperationKind, rusqlite::Error> {
    OperationKind::from_str(value).map_err(|_| from_sql_text_error(1, "operation kind", value))
}

fn operation_status_from_db(value: &str) -> Result<OperationStatus, rusqlite::Error> {
    OperationStatus::from_str(value).map_err(|_| from_sql_text_error(4, "operation status", value))
}

fn parse_json_column(value: String, column: usize) -> Result<Value, rusqlite::Error> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column, Type::Text, Box::new(error))
    })
}

fn parse_optional_json_column(
    value: Option<String>,
    column: usize,
) -> Result<Option<Value>, rusqlite::Error> {
    value
        .map(|value| parse_json_column(value, column))
        .transpose()
}

fn from_sql_text_error(column: usize, label: &str, value: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        column,
        Type::Text,
        format!("unknown {label}: {value}").into(),
    )
}

fn serialize_optional_json(value: Option<&Value>) -> Result<Option<String>, serde_json::Error> {
    value.map(serde_json::to_string).transpose()
}

fn update_cancelled(
    connection: &Connection,
    id: &str,
    result_json: Option<&Value>,
) -> Result<usize, OperationsError> {
    let finished_at = now_rfc3339();
    connection
        .execute(
            "UPDATE operations
             SET status = 'cancelled',
                 finished_at = ?2,
                 result_json = ?3,
                 error_json = NULL
             WHERE id = ?1 AND status = 'cancel_requested'",
            params![id, finished_at, serialize_optional_json(result_json)?],
        )
        .map_err(OperationsError::from)
}

pub fn decode_operation_params<T: DeserializeOwned>(
    operation: &Operation,
) -> Result<T, OperationsError> {
    serde_json::from_value(operation.params_json.clone()).map_err(OperationsError::from)
}

pub fn result_json<T: Serialize>(value: T) -> Value {
    serde_json::to_value(value).unwrap_or_else(|error| {
        json!({
            "message": format!("operation result serialization failed: {error}")
        })
    })
}

pub fn error_json(message: impl Into<String>) -> Value {
    json!({ "message": message.into() })
}

fn now_rfc3339() -> String {
    format_time(OffsetDateTime::now_utc())
}

fn format_time(value: OffsetDateTime) -> String {
    value.format(&Rfc3339).expect("valid RFC3339 timestamp")
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use serde_json::json;
    use tempfile::TempDir;

    use super::{CancelRequestOutcome, NewOperation, OperationsError, OperationsStore};
    use crate::{migrations, OperationKind, OperationStatus, OperationsListQuery};

    fn fresh_store(tempdir: &TempDir) -> OperationsStore {
        OperationsStore::open(tempdir.path().join("operations.db")).expect("open operations store")
    }

    fn new_operation(kind: OperationKind, suffix: &str) -> NewOperation {
        NewOperation {
            kind,
            canonical_params_hash: format!(
                "{suffix:0<64}",
                suffix = suffix.chars().take(64).collect::<String>()
            ),
            input_version: format!("input-{suffix}"),
            params_json: json!({ "suffix": suffix }),
        }
    }

    #[test]
    fn migration_creates_operations_table_and_partial_unique_index() {
        let tempdir = TempDir::new().unwrap();
        let db_path = tempdir.path().join("operations.db");
        let _store = OperationsStore::open(db_path.clone()).unwrap();
        let connection = Connection::open(db_path).unwrap();

        let version: i64 = connection
            .query_row(
                "SELECT MAX(version) FROM operations_migrations",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, migrations::CURRENT_VERSION);

        let index_sql: String = connection
            .query_row(
                "SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = 'operations_active_idempotency_idx'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(index_sql.contains("WHERE status IN"));
        assert!(index_sql.contains("'succeeded'"));
    }

    #[test]
    fn insert_get_find_and_list_round_trip_operation() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let inserted = store
            .insert(new_operation(OperationKind::ImportSessions, "a"))
            .unwrap();

        assert_eq!(inserted.kind, OperationKind::ImportSessions);
        assert_eq!(inserted.status, OperationStatus::Queued);
        assert_eq!(inserted.params_json, json!({ "suffix": "a" }));
        assert!(inserted.started_at.is_none());
        assert!(inserted.finished_at.is_none());

        let fetched = store.get_by_id(&inserted.id).unwrap().unwrap();
        assert_eq!(fetched.id, inserted.id);

        let found = store
            .find_by_idempotency_key(
                inserted.kind,
                &inserted.canonical_params_hash,
                &inserted.input_version,
            )
            .unwrap()
            .unwrap();
        assert_eq!(found.id, inserted.id);

        let listed = store.list(OperationsListQuery::default()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, inserted.id);
    }

    #[test]
    fn every_status_and_kind_round_trips_through_sqlite() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);

        for kind in OperationKind::ALL {
            for status in OperationStatus::ALL {
                let inserted = store
                    .insert(new_operation(
                        kind,
                        &format!("{}-{}", kind.as_str(), status.as_str()),
                    ))
                    .unwrap();
                let updated = store.update_status(&inserted.id, status).unwrap().unwrap();
                let fetched = store.get_by_id(&inserted.id).unwrap().unwrap();

                assert_eq!(updated.status, status);
                assert_eq!(fetched.status, status);
                assert_eq!(fetched.kind, kind);
            }
        }
    }

    #[test]
    fn partial_unique_index_blocks_dedupe_statuses_but_allows_retries_after_failures() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let input = new_operation(OperationKind::ImportSessions, "same");
        let first = store.insert(input.clone()).unwrap();

        let duplicate_active = store.insert(input.clone()).unwrap_err();
        assert!(matches!(duplicate_active, OperationsError::Sqlite(_)));

        store
            .update_status(&first.id, OperationStatus::Failed)
            .unwrap()
            .unwrap();
        assert!(store
            .find_by_idempotency_key(
                input.kind,
                &input.canonical_params_hash,
                &input.input_version
            )
            .unwrap()
            .is_none());

        let retry = store.insert(input.clone()).unwrap();
        assert_ne!(retry.id, first.id);

        let duplicate_retry = store.insert(input).unwrap_err();
        assert!(matches!(duplicate_retry, OperationsError::Sqlite(_)));
    }

    #[test]
    fn list_filters_by_status_kind_and_limit() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let import = store
            .insert(new_operation(OperationKind::ImportSessions, "import"))
            .unwrap();
        let rescan = store
            .insert(new_operation(OperationKind::RescanSources, "rescan"))
            .unwrap();
        store
            .update_status(&rescan.id, OperationStatus::Succeeded)
            .unwrap()
            .unwrap();

        let running_imports = store
            .list(OperationsListQuery {
                status: Some(vec![OperationStatus::Queued]),
                kind: Some(vec![OperationKind::ImportSessions]),
                limit: Some(10),
            })
            .unwrap();
        assert_eq!(running_imports.len(), 1);
        assert_eq!(running_imports[0].id, import.id);

        let succeeded = store
            .list(OperationsListQuery {
                status: Some(vec![OperationStatus::Succeeded]),
                kind: None,
                limit: Some(10),
            })
            .unwrap();
        assert_eq!(succeeded.len(), 1);
        assert_eq!(succeeded[0].id, rescan.id);

        let limited = store
            .list(OperationsListQuery {
                status: None,
                kind: None,
                limit: Some(1),
            })
            .unwrap();
        assert_eq!(limited.len(), 1);
    }

    #[test]
    fn update_status_sets_transition_timestamps() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let inserted = store
            .insert(new_operation(OperationKind::ImportSessions, "timestamps"))
            .unwrap();

        let running = store
            .update_status(&inserted.id, OperationStatus::Running)
            .unwrap()
            .unwrap();
        assert!(running.started_at.is_some());
        assert!(running.finished_at.is_none());

        let cancel_requested = store
            .update_status(&inserted.id, OperationStatus::CancelRequested)
            .unwrap()
            .unwrap();
        assert!(cancel_requested.cancel_requested_at.is_some());

        let finished = store
            .finish(
                &inserted.id,
                OperationStatus::Cancelled,
                Some(json!({ "cancelled": true })),
                None,
            )
            .unwrap()
            .unwrap();
        assert!(finished.finished_at.is_some());
        assert_eq!(finished.result_json, Some(json!({ "cancelled": true })));
    }

    #[test]
    fn claim_next_queued_claims_fifo_for_kind_only() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let first_import = store
            .insert(new_operation(OperationKind::ImportSessions, "first-import"))
            .unwrap();
        let rescan = store
            .insert(new_operation(OperationKind::RescanSources, "rescan"))
            .unwrap();
        let second_import = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "second-import",
            ))
            .unwrap();

        let claimed = store
            .claim_next_queued(OperationKind::ImportSessions)
            .unwrap()
            .unwrap();
        assert_eq!(claimed.id, first_import.id);
        assert_eq!(claimed.status, OperationStatus::Running);
        assert!(claimed.started_at.is_some());

        let next = store
            .claim_next_queued(OperationKind::ImportSessions)
            .unwrap()
            .unwrap();
        assert_eq!(next.id, second_import.id);

        let rescan_claim = store
            .claim_next_queued(OperationKind::RescanSources)
            .unwrap()
            .unwrap();
        assert_eq!(rescan_claim.id, rescan.id);
    }

    #[test]
    fn request_cancel_transitions_queued_and_running_but_conflicts_terminal() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let queued = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "queued-cancel",
            ))
            .unwrap();
        let running = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "running-cancel",
            ))
            .unwrap();
        store
            .update_status(&running.id, OperationStatus::Running)
            .unwrap()
            .unwrap();
        let succeeded = store
            .insert(new_operation(
                OperationKind::RescanSources,
                "terminal-cancel",
            ))
            .unwrap();
        store
            .update_status(&succeeded.id, OperationStatus::Succeeded)
            .unwrap()
            .unwrap();

        let queued_outcome = store.request_cancel(&queued.id).unwrap();
        let CancelRequestOutcome::Requested(queued_cancel) = queued_outcome else {
            panic!("queued cancel should be requested");
        };
        assert_eq!(queued_cancel.status, OperationStatus::CancelRequested);
        assert!(queued_cancel.cancel_requested_at.is_some());

        let running_outcome = store.request_cancel(&running.id).unwrap();
        let CancelRequestOutcome::Requested(running_cancel) = running_outcome else {
            panic!("running cancel should be requested");
        };
        assert_eq!(running_cancel.status, OperationStatus::CancelRequested);
        assert!(running_cancel.started_at.is_some());
        assert!(store.is_cancel_requested(&running.id).unwrap());

        let conflict = store.request_cancel(&succeeded.id).unwrap();
        assert!(matches!(conflict, CancelRequestOutcome::Conflict(_)));
        assert!(matches!(
            store.request_cancel("missing").unwrap(),
            CancelRequestOutcome::NotFound
        ));
    }

    #[test]
    fn terminal_writes_are_conditional() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let queued = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "queued-terminal",
            ))
            .unwrap();
        assert!(store
            .complete_success(&queued.id, json!({ "ok": true }))
            .unwrap()
            .is_none());

        let running = store
            .claim_next_queued(OperationKind::ImportSessions)
            .unwrap()
            .unwrap();
        let succeeded = store
            .complete_success(&running.id, json!({ "ok": true }))
            .unwrap()
            .unwrap();
        assert_eq!(succeeded.status, OperationStatus::Succeeded);
        assert_eq!(succeeded.result_json, Some(json!({ "ok": true })));
        assert!(succeeded.finished_at.is_some());

        let cancel = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "cancel-terminal",
            ))
            .unwrap();
        store.request_cancel(&cancel.id).unwrap();
        let cancelled = store.complete_cancelled(&cancel.id, None).unwrap().unwrap();
        assert_eq!(cancelled.status, OperationStatus::Cancelled);

        assert!(matches!(
            store.finish(&cancelled.id, OperationStatus::Running, None, None),
            Err(OperationsError::NonTerminalFinish(OperationStatus::Running))
        ));
    }

    #[test]
    fn success_terminal_write_closes_late_cancel_window() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let operation = store
            .insert(new_operation(OperationKind::ImportSessions, "late-cancel"))
            .unwrap();
        store
            .update_status(&operation.id, OperationStatus::Running)
            .unwrap()
            .unwrap();
        store.request_cancel(&operation.id).unwrap();

        let succeeded = store
            .complete_success(&operation.id, json!({ "ok": true }))
            .unwrap()
            .unwrap();

        assert_eq!(succeeded.status, OperationStatus::Succeeded);
        assert_eq!(succeeded.result_json, Some(json!({ "ok": true })));
        assert!(succeeded.finished_at.is_some());
    }

    #[test]
    fn reconcile_interrupted_marks_running_and_cancel_requested_only() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let queued = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "reconcile-queued",
            ))
            .unwrap();
        let running = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "reconcile-running",
            ))
            .unwrap();
        let cancel_requested = store
            .insert(new_operation(
                OperationKind::RescanSources,
                "reconcile-cancel",
            ))
            .unwrap();
        let succeeded = store
            .insert(new_operation(
                OperationKind::RescanSources,
                "reconcile-success",
            ))
            .unwrap();

        store
            .update_status(&running.id, OperationStatus::Running)
            .unwrap()
            .unwrap();
        store.request_cancel(&cancel_requested.id).unwrap();
        store
            .update_status(&succeeded.id, OperationStatus::Succeeded)
            .unwrap()
            .unwrap();

        assert_eq!(store.reconcile_interrupted().unwrap(), 2);
        assert_eq!(
            store.get_by_id(&queued.id).unwrap().unwrap().status,
            OperationStatus::Queued
        );
        assert_eq!(
            store.get_by_id(&running.id).unwrap().unwrap().status,
            OperationStatus::Interrupted
        );
        assert_eq!(
            store
                .get_by_id(&cancel_requested.id)
                .unwrap()
                .unwrap()
                .status,
            OperationStatus::Interrupted
        );
        assert_eq!(
            store.get_by_id(&succeeded.id).unwrap().unwrap().status,
            OperationStatus::Succeeded
        );

        let retry_input = new_operation(OperationKind::ImportSessions, "reconcile-running");
        assert!(store.insert(retry_input).is_ok());
    }
}
