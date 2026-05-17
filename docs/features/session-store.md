# Session Store

## What This Feature Does

The session store persists ingested session metadata in SQLite and raw JSONL blobs in the content-addressed blob store. The backend exposes stored metadata and raw payload access through JSON and raw-content routes; the frontend surfaces that state through the inspection page.

## SQLite Schema

`sessions` columns (full set, as of Phase 6):

- `session_uid` (PRIMARY KEY)
- `tool`
- `source_session_id`
- `source_path`
- `source_fingerprint`
- `raw_ref` (foreign key to `raw_blobs.content_addr`)
- `created_at`
- `source_updated_at`
- `ingested_at`
- `project_path`
- `title`
- `title_source` — Phase 6 addition. Nullable `TEXT`. Stores the snake_case
  representation of the `TitleSource` enum (`custom`, `first_user_message`,
  `slug`, `generated`) declared in `components/ui-api-contracts/src/lib.rs`.
  Round-trips through `StoredSessionInput.title_source` and the
  `map_session_row` helper in `components/raw-session-store/src/sqlite.rs`.
- `has_subagent_sidecars`

## Migrations

Migrations live in `components/raw-session-store/src/migrations.rs` as a
`(version, sql)` tuple list applied inside a single transaction per version.
Current versions:

- v1 — initial schema (`sessions`, `raw_blobs`, `scan_errors`, `migrations`).
- v2 — Phase 6: `ALTER TABLE sessions ADD COLUMN title_source TEXT;`. Applied
  in place on existing databases. **No backfill**: rows ingested before this
  migration return `title_source = NULL`, which the read path maps to
  `Option::None`. To repopulate provenance for those rows, rescan the source
  and re-import — the parser will emit the field fresh.

## Frontend Files To Modify

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/features/sessions/` (unified session list, right-pane session view + four-tab shell, per-tool parsers + skim builder, URL-synced selection, and the pure merge / filter / pagination / streaming-raw-preview helpers; co-located sibling `.css` files for each component)
- `apps/frontend/src/components/` (shared React primitives — action bar, scan-errors callout, accessible Tabs primitive, pagination strip, toast — and their sibling `.css` files)
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/contracts.ts`

## Backend Files To Modify

- `apps/backend/src/app.rs`
- `apps/backend/src/http_api.rs`

## Component Files That Must Stay Aligned

- `components/raw-session-store/src/sqlite.rs`
- `components/raw-session-store/src/local_fs_blob_store.rs`
- `components/raw-session-store/src/blob_store.rs`
- `components/ingest-service/src/service.rs`
- `components/ui-api-contracts/src/lib.rs`

## API Endpoints Involved

- `GET /api/v1/sessions`
- `GET /api/v1/sessions/{session_uid}`
- `GET /api/v1/sessions/{session_uid}/raw`
- `POST /api/v1/import` (submits an `import_sessions` operation)
- `GET /api/v1/operations/{operation_id}`
- `GET /api/v1/operations`

## Tests

- `apps/backend/tests/http_api.rs`
- `tests/e2e/tests/inspection_surface.rs`
