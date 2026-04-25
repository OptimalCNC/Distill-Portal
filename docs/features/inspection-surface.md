# Inspection Surface

## What This Feature Does

The inspection surface lists discovered source sessions, shows what is already stored, lets the user save selected sessions, and links to stored raw payloads. The Bun + Vite + React frontend owns the page and talks to the backend only through HTTP, consuming typed TypeScript bindings generated from the shared contracts crate.

As of Phase 4 Milestone 3 the unified session list is filterable, sortable, and searchable client-side. The filter bar sits above the table and offers chip groups for `tool`, `storage`, and the multi-select status set (with a "Show importable only" boolean shortcut equivalent to selecting `[not_stored, outdated]`); a `<datalist>`-backed `<input>` for the dynamic project-path filter; a substring search box; and a sort field + direction selector. State persists to `localStorage` under the versioned key `distill-portal:inspection-filters:v1`; corrupt or missing persisted values silently fall back to defaults via a small total decoder. Sort honors a strict null-handling rule (ascending puts nulls first, descending puts nulls last) plus a deterministic tiebreaker chain (`source_updated_at → ingested_at → created_at → title → rowKey`). Relative-time rendering in the "Updated" column reads against a single `now` captured at refetch time so the page does not ticker-update; the absolute ISO timestamp stays available via the cell's `title=` hover hint. The list exposes four distinct empty/degraded states: **No sessions at all** (Rescan affordance), **No matches after filter/search** (Clear filters affordance — calls `resetAll`), **Nothing to import in the current filter** (Show importable only affordance — flips the `importableOnly` boolean), and **Partial fetch failure** (per-section banner + Retry, preserved from M2). The click-time intersection rule that landed in Phase 3 F2 + Phase 4 M2 (importability) is extended in M3 so the import POST body is derived at click time from the intersection of the user's raw `selected` set with the current filter window's importable rows. A row a user selected and then hid via a filter mutation cannot leak into the POST; the action bar surfaces the gap as a `+K hidden by filters` caption alongside `Clear hidden` and `Clear selection` affordances.

## Frontend Files To Modify

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/features/sessions/` (unified session list — `SessionsView`, `SessionsTable`, `SessionFilters`, `mergeSessions`, `filterSessions`, `relativeTime`, `useSessionFilters`, `types`, plus per-feature tests)
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
- `apps/frontend/src/features/sessions/` test files: `*.test.tsx` for the table + filter UI components, `*.test.ts` for the pure helpers (`mergeSessions`, `filterSessions`, `relativeTime`, `useSessionFilters`)
- `apps/frontend/src/components/*.test.tsx` (shared-primitive tests)
- `apps/frontend/e2e/` (Playwright)
