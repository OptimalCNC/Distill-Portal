# Inspection Surface

## What This Feature Does

The inspection surface lists discovered source sessions, shows what is already stored, lets the user save selected sessions, and links to stored raw payloads. The Bun + Vite + React frontend owns the page and talks to the backend only through HTTP, consuming typed TypeScript bindings generated from the shared contracts crate.

## Frontend Files To Modify

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/features/sessions/` (unified session list — `SessionsView`, `SessionsTable`, `mergeSessions`, `types`, plus per-feature tests)
- `apps/frontend/src/components/` (shared primitives — `ActionBar`, `StatusBadge`, `ScanErrorsCallout`, plus per-component tests)
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/contracts.ts`

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
- `apps/frontend/src/App.test.tsx`
- `apps/frontend/src/features/sessions/` test files: `*.test.tsx` for the table component, `*.test.ts` for the pure `mergeSessions` join
- `apps/frontend/src/components/*.test.tsx` (shared-primitive tests)
- `apps/frontend/e2e/` (Playwright)
