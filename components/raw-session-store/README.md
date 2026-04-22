# Raw Session Store

## Purpose

Owns SQLite session metadata, scan-error persistence, and content-addressed raw blob storage.

## Owned Files

- `src/blob_store.rs`
- `src/local_fs_blob_store.rs`
- `src/migrations.rs`
- `src/sqlite.rs`
- `src/lib.rs`

## Public API / Entry Points

- `SqliteStore`
- `LocalFsBlobStore`
- `StoredSessionInput`
- `ScanErrorInput`

## Important Internal Files

- `src/sqlite.rs`
- `src/local_fs_blob_store.rs`
- `src/migrations.rs`

## Dependencies It May Rely On

- `components/ui-api-contracts`

## Read Before Modifying

- `src/sqlite.rs`
- `src/local_fs_blob_store.rs`
- `apps/backend/src/app.rs`
- `components/ingest-service/src/service.rs`

## Tests

- `src/local_fs_blob_store.rs`
- `apps/backend/tests/http_api.rs`
