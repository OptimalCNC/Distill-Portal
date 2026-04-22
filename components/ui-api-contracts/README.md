# UI / API Contracts

## Purpose

Owns the shared payload shapes and enums used at the frontend/backend HTTP boundary.

## Owned Files

- `src/lib.rs`

## Public API / Entry Points

- `Tool`
- `SessionSyncStatus`
- `SourceSessionView`
- `StoredSessionRecord`
- `StoredSessionView`
- `PersistedScanError`
- `ImportSourceSessionsRequest`
- `ImportReport`
- `RescanReport`

## Important Internal Files

- `src/lib.rs`

## Dependencies It May Rely On

- no internal workspace crates

## Read Before Modifying

- `src/lib.rs`
- `apps/backend/src/http_api.rs`
- `apps/frontend/src/backend_client.rs`
- `tests/e2e/tests/inspection_surface.rs`

## Tests

- covered indirectly by backend API and e2e tests
