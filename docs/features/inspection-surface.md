# Inspection Surface

## What This Feature Does

The inspection surface lists discovered source sessions, shows what is already stored, lets the user save selected sessions, and links to stored raw payloads. In Phase 2 the frontend owns the page and talks to the backend only through HTTP plus the shared contracts crate.

## Frontend Files To Modify

- `apps/frontend/src/app.rs`
- `apps/frontend/src/backend_client.rs`

## Backend Files To Modify

- `apps/backend/src/http_api.rs`
- `apps/backend/src/app.rs`

## Component Files That Must Stay Aligned

- `components/ui-api-contracts/src/lib.rs`
- `components/collector-runtime/src/scanner.rs`
- `components/ingest-service/src/service.rs`
- `components/raw-session-store/src/sqlite.rs`

## API Endpoints Involved

- `GET /api/v1/source-sessions`
- `POST /api/v1/source-sessions/import`
- `GET /api/v1/sessions`
- `GET /api/v1/sessions/{session_uid}`
- `GET /api/v1/sessions/{session_uid}/raw`
- `POST /api/v1/admin/rescan`
- `GET /api/v1/admin/scan-errors`

## Tests

- `apps/backend/tests/http_api.rs`
- `tests/e2e/tests/inspection_surface.rs`
