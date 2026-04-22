# Session Store

## What This Feature Does

The session store persists ingested session metadata in SQLite and raw JSONL blobs in the content-addressed blob store. The backend exposes stored metadata and raw payload access through JSON and raw-content routes; the frontend surfaces that state through the inspection page.

## Frontend Files To Modify

- `apps/frontend/src/app.rs`
- `apps/frontend/src/backend_client.rs`

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
- `POST /api/v1/source-sessions/import`

## Tests

- `apps/backend/tests/http_api.rs`
- `tests/e2e/tests/inspection_surface.rs`
