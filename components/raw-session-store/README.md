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

## Schema (`sessions` table)

| Column | Type | Notes |
|---|---|---|
| `session_uid` | `TEXT PRIMARY KEY` | UUID generated at INSERT time. |
| `tool` | `TEXT NOT NULL` | `claude_code` \| `codex`. |
| `source_session_id` | `TEXT NOT NULL` | UNIQUE per tool. |
| `source_path` | `TEXT NOT NULL` | Absolute path to the source JSONL. |
| `source_fingerprint` | `TEXT NOT NULL` | SHA-256 of the source bytes. |
| `raw_ref` | `TEXT NOT NULL` | FK into `raw_blobs.content_addr`. |
| `created_at` | `TEXT` | RFC3339; nullable when source has none. |
| `source_updated_at` | `TEXT` | RFC3339; nullable. |
| `ingested_at` | `TEXT NOT NULL` | RFC3339; written by the store. |
| `project_path` | `TEXT` | Nullable. |
| `title` | `TEXT` | Nullable; full-length per Phase 6 §Resolved Decision #6. |
| `title_source` | `TEXT` | Phase 6 addition. Nullable. Stores the snake_case `TitleSource` enum representation: `custom` / `first_user_message` / `slug` / `generated`. `NULL` round-trips to `Option::None`. Pre-Phase-6 rows return `NULL` until rescan + re-ingest. |
| `has_subagent_sidecars` | `INTEGER NOT NULL DEFAULT 0` | Boolean. |

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
