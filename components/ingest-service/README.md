# Ingest Service

## Purpose

Owns replace-on-sync ingest decisions and coordinates blob persistence with stored-session metadata updates.

## Owned Files

- `src/service.rs`
- `src/types.rs`

## Public API / Entry Points

- `IngestService`
- `IngestDisposition`
- `IngestOutcome`

## Important Internal Files

- `src/service.rs`

## Dependencies It May Rely On

- `components/collector-runtime`
- `components/raw-session-store`

## Read Before Modifying

- `src/service.rs`
- `components/raw-session-store/src/sqlite.rs`
- `apps/backend/src/app.rs`

## Tests

- covered through `apps/backend/tests/http_api.rs`
