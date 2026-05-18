# Operations

## Purpose

Owns the persisted ledger for long-running backend operations.

Phase 9a supports exactly two operation kinds:

- `import_sessions`
- `rescan_sources`

The crate is intentionally a narrow substrate, not a generic job queue. It
stores submitted operations, exposes idempotency helpers, provides the SQLite
access layer, and runs one worker loop per concrete operation kind.

## Owned Files

- `src/lib.rs`
- `src/types.rs`
- `src/migrations.rs`
- `src/store.rs`
- `src/idempotency.rs`
- `src/cancel.rs`
- `src/worker.rs`
- `src/dispatcher.rs` *(Phase 9b M2-A — trait-based handler registry)*
- `src/sse.rs` *(Phase 9b M2-B — operations SSE broadcaster + ring buffer)*
- `kinds/import_sessions.rs` *(Phase 9b M2-A — per-kind idempotency helper)*
- `kinds/rescan_sources.rs` *(Phase 9b M2-A — per-kind idempotency helper)*

## Public API / Entry Points

- `Operation`
- `OperationKind`
- `OperationStatus`
- `OperationsStore`
- `NewOperation`
- `CancelRequestOutcome`
- `CheckpointGuard`
- `NoopCheckpoint`
- `OperationWorker`
- `OperationOutcome`
- `Dispatcher`, `OperationHandler`, `HandlerFuture`, `HandlerError`, `IdempotencyKey` *(Phase 9b M2-A)*
- `kinds::import_sessions::{KIND_NAME, decode_params, idempotency_key_for}` *(Phase 9b M2-A)*
- `kinds::rescan_sources::{KIND_NAME, idempotency_key_for}` *(Phase 9b M2-A)*
- `OperationsBroadcaster`, `Subscription`, `OperationTransitionEvent` *(Phase 9b M2-B — SSE channel)*
- `idempotency::canonical_params_hash`
- `idempotency::import_sessions_input_version`
- `idempotency::rescan_sources_input_version`

Wire-facing operation types live in `components/ui-api-contracts` and are
re-exported here. This preserves the repository rule that HTTP payload shapes
come from the contracts crate while letting operation workers consume the same
types.

## Schema (`operations` table)

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUIDv7 generated at insert time; sortable enough for operation IDs. |
| `kind` | `TEXT NOT NULL` | `import_sessions` or `rescan_sources`. |
| `canonical_params_hash` | `TEXT NOT NULL` | Lowercase SHA-256 hex over server-canonicalized params. |
| `input_version` | `TEXT NOT NULL` | Kind-specific snapshot fingerprint. |
| `status` | `TEXT NOT NULL` | `queued`, `running`, `cancel_requested`, `succeeded`, `failed`, `cancelled`, or `interrupted`. |
| `params_json` | `TEXT NOT NULL` | Raw submitted params as JSON text. |
| `result_json` | `TEXT` | Terminal result JSON, nullable until terminal success/cancel result. |
| `error_json` | `TEXT` | Failure JSON, nullable unless failed. |
| `submitted_at` | `TEXT NOT NULL` | RFC3339. |
| `started_at` | `TEXT` | RFC3339, nullable until running. |
| `finished_at` | `TEXT` | RFC3339, nullable until terminal. |
| `cancel_requested_at` | `TEXT` | RFC3339, nullable until cancellation is requested. |

The idempotency invariant is enforced by a partial unique index:

```sql
CREATE UNIQUE INDEX operations_active_idempotency_idx
  ON operations(kind, canonical_params_hash, input_version)
  WHERE status IN ('queued', 'running', 'cancel_requested', 'succeeded');
```

This intentionally allows retries after `failed`, `cancelled`, and
`interrupted` rows while still deduplicating active work and successful rows.

## Migrations

Operations migrations use a namespaced table, `operations_migrations`, so the
crate can share the backend `distill.db` file with `raw-session-store` without
colliding with that crate's `migrations` table.

The backend intentionally opens both `raw-session-store` and `operations`
against the same `distill.db` file. Operations enables WAL mode on its SQLite
connection; the two crates keep separate migration tables and table namespaces.

## Architecture (Phase 9b M2-A update)

The crate now exposes a trait-based dispatcher so future operation kinds plug
in without touching the worker loop:

- `OperationHandler` is the per-kind extension contract: a stable
  `kind() -> &'static str`, schema-validated `idempotency_key(raw_params)`, and
  a `'static` async `run(params, checkpoint)` future. The `Pin<Box<dyn Future>>`
  return shape composes with `OperationWorker::spawn`'s `Send + 'static` bound;
  impls clone owned state INTO the async block.
- `Dispatcher` holds an in-process `HashMap<&'static str, Arc<dyn OperationHandler>>`.
  `register()` panics on duplicate kinds (programmer error). The backend
  builds it once at startup, then `spawn_operation_workers` iterates the
  dispatcher to spin up one worker per registered kind.
- `kinds/` siblings the `src/` directory and holds the *pure* per-kind helpers:
  `KIND_NAME` constants, `decode_params` mappers, and `idempotency_key_for`
  builders. These are the SINGLE SOURCE OF TRUTH for the kind's idempotency
  computation; both the backend's submit path AND the handler's
  `idempotency_key()` impl call the same helper so the two paths cannot drift.
- The handler `impl OperationHandler` blocks live in
  `apps/backend/src/operations_kinds/` (they need owned `AppState`), not in
  this crate. This crate exposes the contract; the backend owns the concrete
  wiring.

The on-disk schema is unchanged from Phase 9a — the refactor is purely
in-process plumbing.

## SSE channel (Phase 9b M2-B)

`OperationsBroadcaster` is the process-singleton fan-out for operation
state-transition events. Lifecycle:

- The backend constructs one `Arc<OperationsBroadcaster>` at bootstrap and
  passes it to every `OperationWorker` via `OperationWorker::with_broadcaster`.
- The worker calls `broadcaster.publish(operation)` AFTER every store
  transition: `queued -> running` (claim), `cancel_requested -> cancelled`
  (queued-cancel path), and every terminal write (succeeded / failed /
  cancelled). The HTTP layer in `apps/backend/src/app.rs` publishes the
  `queued` row produced by `submit_operation` and the `cancel_requested` row
  produced by `request_operation_cancel`. The ordering guarantee — publish
  AFTER the transaction commits — is the Phase 9b §"Risks" row 4 invariant.
- Each publish atomically assigns a monotonic `seq`, pushes the event into a
  200-entry ring buffer, and broadcasts it over a
  `tokio::sync::broadcast::Sender`. The buffer enables `Last-Event-ID`
  reconnect replay (size 200 per spec §"SSE Channel Design").
- `subscribe(last_event_id)` returns a `Subscription { backlog, receiver,
  resync_reason, last_backlog_seq }`. `backlog` is the replay slice from the
  ring buffer (events with `seq > last_event_id`); `resync_reason` is
  populated when the client's `Last-Event-ID` falls before the oldest
  buffered event (the SSE handler emits a single `event: resync` frame so
  the client re-fetches via `GET /api/v1/operations`).

The HTTP SSE handler lives in `apps/backend/src/http_api.rs`:
`GET /api/v1/operations/events`. The wire shape is:

- `event: snapshot` (no `id:`) — initial replay of non-terminal ops + the
  last 50 terminal ops on connect. Client populates its in-memory map but
  does NOT update `Last-Event-ID` from these.
- `event: transition` with `id: <seq>` — live state transitions and any
  backlog from the ring buffer. Client updates `Last-Event-ID` from these.
- `event: resync` (no `id:`) — emitted when the buffer cannot replay
  (`Last-Event-ID` too old) or when the live `broadcast::Receiver` lags
  beyond the channel capacity. Client must discard its map and re-fetch via
  `GET /api/v1/operations`.

## SSE escape hatch: futures-core

Phase 9b §"Dependency Policy" forbids new external Rust dependencies but
explicitly authorizes a "framework-specific helper crate" with documentation.
`futures-core = "0.3"` is that helper: `axum::response::sse::Sse::new` accepts
`impl Stream<Item = Result<Event, E>>`, where `Stream` is
`futures_core::Stream`. axum 0.8 does NOT publicly re-export this trait, so
backend cannot construct an SSE response without depending on `futures-core`
directly. The crate is already present in `Cargo.lock` transitively via axum
+ tokio; the new direct declaration is interface-only and adds no new
compiled code to the binary.

**Chromium-equivalent reproducer**: the SSE handler at
`GET /api/v1/operations/events` emits `event: transition` lines with
`id: <seq>` for `Last-Event-ID` reconnect support. A vanilla
`new EventSource("/api/v1/operations/events")` in Chromium 111+ receives
transitions; on reconnect, the browser sends `Last-Event-ID: <last-seq>` and
the server replays from the 200-entry ring buffer (or emits `event: resync`
if too old). Standard SSE behavior; no library code on either side.

## Worker And Cancellation Model

`OperationWorker` is intentionally small: the backend spawns one worker for
`import_sessions` and one worker for `rescan_sources`. Each worker:

1. completes queued cancellation requests that were never started;
2. transactionally claims the oldest queued row for its kind;
3. executes the backend-supplied handler with a `CheckpointGuard`;
4. writes exactly one terminal state through guarded store methods.

`CheckpointGuard` reads the operation row from `OperationsStore` at natural
unit boundaries. It reports cancellation when status is `cancel_requested`;
store errors are surfaced as checkpoint failures and recorded by the worker as
operation failures. Cancellation is cooperative: work already committed before a
checkpoint stays committed, and the operation row becomes `cancelled`.

Backend boot must call `OperationsStore::reconcile_interrupted()` before worker
spawn. That one-shot recovery changes any `running` or `cancel_requested` rows
to `interrupted`; no heartbeat or automatic retry is part of Phase 9a.

HTTP cutover lives in `apps/backend`: `POST /api/v1/import` and
`POST /api/v1/rescan` enqueue rows, `GET /api/v1/operations[/{id}]` reads the
ledger, and `DELETE /api/v1/operations/{id}` requests cooperative
cancellation.

## Read Before Modifying

- `working/phase-9a.md`
- `docs/dependency-rules.md`
- `components/ui-api-contracts/src/lib.rs`
- `apps/backend/src/app.rs`

## Tests

```bash
cargo test -p distill-portal-operations
cargo test -p distill-portal-backend --test http_api
cargo test -p distill-portal-ui-api-contracts --features ts-bindings
```
