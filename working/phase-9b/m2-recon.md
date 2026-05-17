# Phase 9b M2 — 9a M3 Baseline Reconnaissance

Read-only recon captured by the Phase 9b coordinator at 2026-05-18 (after `1c426f0 phase9a async operation test cutover`). Snapshot of the 9a M3 operations substrate at the moment M2 was scoped. **The codebase moves; re-verify any claim below before M2 dispatch.**

This file is reference-only. It feeds the M2 planner subagent. It is not part of the spec, the design, or the implementation.

## Module map

| File | M2-relevant responsibility |
|------|---|
| `components/operations/src/lib.rs` | Public surface — re-exports `CancellationToken`, `CheckpointGuard`, `OperationCheckpoint`, `Operation`, `OperationKind`, `OperationStatus`, `OperationsStore`, `OperationWorker`, `OperationOutcome`, `NewOperation`, idempotency + cancellation types. |
| `components/operations/src/types.rs` | Thin re-export from `distill_portal_ui_api_contracts` (`Operation`, `OperationKind`, `OperationStatus`); no local defs. M2's `OperationTransitionEvent` lives in `ui-api-contracts`, not here. |
| `components/operations/src/worker.rs` | Per-kind worker loop: `OperationWorker::spawn()` accepts an async handler `Fn(Operation, CheckpointGuard) → Future<OperationOutcome>` (line 55). Claim-execute-complete cycle at lines 64–103. **Trait boundary target**: `OperationHandler` trait owns the handler closure, idempotency-key computation, and result/error schema wrapping. Handler interface stays the same shape; the trait abstracts the dispatch. |
| `components/operations/src/store.rs` | Kind-agnostic SQL store. `claim_next_queued()` uses `kind` for filtering only (line 157). Public: `insert()`, `get_by_id()`, `find_by_idempotency_key()`, `claim_next_queued()`, `request_cancel()`, `complete_success/failure/cancelled()`, `reconcile_interrupted()`, `list()`. Conditional terminal-write guards at lines 467–502. **M2 must preserve.** |
| `components/operations/src/cancel.rs` | `CancellationToken` (line 8): `Arc<Notify>`, no persistence. `CheckpointGuard` (line 13): `op_id` + `store` + `notify`. Implements `OperationCheckpoint::check_blocking()` via `is_cancel_requested()` (line 86). M2 trait must accept/return these or wrap transparently. |
| `components/operations/src/idempotency.rs` | `canonical_params_hash()` (line 11): SHA256 of canonical JSON. `import_sessions_input_version()` (line 18), `rescan_sources_input_version()` (line 35). Called at submit-time in `app.rs:307-308`, not in handler. M2 decides whether to move into the trait. |
| `components/operations/src/migrations.rs` | Single migration (v1, line 3). 13-col `operations` table; partial unique index on `(kind, canonical_params_hash, input_version)` WHERE status IN active (line 28–30). **M2 must NOT modify schema.** |
| `apps/backend/src/app.rs` | `AppState::spawn_operation_workers()` (line 382–408) spawns two hardcoded workers via `OperationWorker::spawn()`. `OperationCancellationSignals` (line 100–103) holds two `CancellationToken`s. `submit_operation()` (line 297-332) computes idempotency at submit-time. **Broadcaster plug-in site:** `AppInner` struct (line 70-80) + init (line 130-141) + worker spawn (382-408). |
| `apps/backend/src/http_api.rs` | Axum 0.8 router (line 21-37): `GET /api/v1/operations/{id}`, `POST /api/v1/import`, `POST /api/v1/rescan`, `DELETE /api/v1/operations/{id}`. No SSE route yet. `ApiError` enum (line 137-143). **M2 adds:** `GET /api/v1/operations/events`. |
| `apps/backend/Cargo.toml` | `axum = "0.8"` (line 7). Native `axum::response::sse::Sse` available — no new external dep needed for M2. |
| `apps/frontend/src/features/sessions/useOperationPoll.ts` | Polls `getOperation()` at backoff (500 → 2000 → 5000 ms, lines 5–7). Per-op `AbortController` map. M3 simplifies into fallback helper consumed by `useOperationsFeed`. |
| `apps/frontend/src/components/ActionBar.tsx` | Props (lines 48–76): `pending`, `runningOperationCount`, `lastOperationSummary {text, tone}`. Renders Rescan/Import + badge (153-162) + pill (163-172). M3 rewrites the badge → trigger button, removes the pill (info migrates to tray's Recent section per M1 design). Button/selection logic stays. |

## Trait boundary candidate (concrete proposal)

```rust
// components/operations/src/dispatcher.rs (new)
pub trait OperationHandler: Send + Sync + 'static {
    fn kind(&self) -> &'static str;                          // serializes to operations.kind
    fn idempotency_key(&self, raw_params: &Value)            // schema-validates + canonicalizes
        -> Result<IdempotencyKey, HandlerError>;
    async fn run(&self, params: Value, ckpt: CheckpointGuard)
        -> Result<Value, HandlerError>;
}
```

The dispatcher owns `HashMap<&'static str, Arc<dyn OperationHandler>>`. `OperationWorker::spawn()` takes one handler; the dispatcher constructs N workers (one per registered kind) at startup. The existing `app.rs:382-408` becomes a loop over the dispatcher's registry.

The two existing handler bodies (`execute_import_operation`, `execute_rescan_operation` in app.rs lines 410-439) move into `components/operations/kinds/import_sessions.rs` and `rescan_sources.rs`, each as an `OperationHandler` impl. The store, cancel, and idempotency modules stay untouched.

## Schema invariants (M2 must NOT touch)

- 13-col `operations` table.
- Partial unique index on `(kind, canonical_params_hash, input_version)` WHERE status IN active.
- Terminal-write predicates (`status IN ('running','cancel_requested')`) in `complete_terminal_conditional` (store.rs:467-502).
- `OperationOutcome` enum shape (worker.rs:183-189) and the `Value`-wrapped `result_json` / `error_json` payloads.

## HTTP framework + SSE notes

- **Axum 0.8** ships `axum::response::sse::Sse` natively. M2's SSE handler returns `Sse<impl Stream<Item = Result<Event, Infallible>>>`.
- Channel: `tokio::sync::broadcast::Sender<OperationTransitionEvent>` (already in tokio; no new dep). Receiver per SSE client.
- Ring buffer for `Last-Event-ID` replay: a `VecDeque<OperationTransitionEvent>` behind a `Mutex`, sized at 200 per spec.
- SSE event id = `seq` (monotonic u64 per broadcaster instance).
- `resync` event when `Last-Event-ID` is older than the oldest buffered seq.

## Frontend touch points

- `useOperationPoll.ts` — minor signature simplification. Becomes consumed by `useOperationsFeed` in fallback mode (M3).
- `ActionBar.tsx` — M3 only. M2 leaves it alone.
- `App.tsx` — M3 only. M2 leaves it alone.
- `useOperationsFeed.ts` (new) — M3 only.
- `JobCenter.tsx` / `OperationCard.tsx` + their CSS / tests (new) — M3 only.

## Surprises the M2 planner should know

1. **No broadcaster instance exists yet.** M2 must add `Arc<OperationsBroadcaster>` to `AppInner` (line 70-80) and thread it into worker spawn so workers can `broadcaster.publish(operation)` after every terminal write.
2. **Terminal-write side-effect window.** The right hook for broadcast is INSIDE `worker.rs`'s `complete_operation()` (lines 141-179), AFTER the store call commits. Alternatives (poll the store) add latency; the in-worker hook is zero-latency.
3. **Idempotency is computed at submit-time** in `app.rs:307-308`, not in the handler. M2 must decide whether the new trait owns it. Cleanest: leave submit-time logic in `app.rs` for now; have `OperationHandler::idempotency_key()` be the canonical implementation that `app.rs` calls during submit. This keeps the trait the single source of truth without breaking the submit path.
4. **Checkpoint contract is flexible.** `OperationCheckpoint` trait (cancel.rs:22) has a single method `check_blocking()`. `NoopCheckpoint` exists (cancel.rs:19-20, used by rescan startup at app.rs:200-202). M2 trait implementations can accept any checkpoint impl, not just `CheckpointGuard`.
5. **No transaction semantics in handler.** Handlers are pure async futures. All state changes flow through `store.*()` calls in the worker, not in the handler. M2 trait must not introduce direct DB access from handlers.
6. **OperationKind is an enum with two cases**, re-exported from `ui-api-contracts`. The dispatcher generalizes per-kind worker wiring but does NOT introduce runtime-pluggable kinds; adding a third kind still requires code changes + a new `OperationKind` enum variant. The trait approach makes the new-kind diff smaller (one new file + one registration call).

## Likely M2 chunk decomposition (proposal — planner subagent will refine)

1. **Chunk A — `OperationHandler` trait + kinds extraction.** New `dispatcher.rs`; move `execute_import_operation` / `execute_rescan_operation` into `kinds/import_sessions.rs` / `kinds/rescan_sources.rs`. Worker spawn loops over a registry. Pure refactor — no behavior change. Tests: every existing operations test must still pass byte-equivalent.
2. **Chunk B — `OperationsBroadcaster` + ring buffer.** New `sse.rs`. `tokio::sync::broadcast::Sender` + `Mutex<VecDeque<…>>` ring buffer of 200. Workers call `broadcaster.publish()` after every terminal write (and after queued → running, cancel_requested transitions). Wire into `AppInner`. Tests: replay correctness with synthetic events; resync emission when `Last-Event-ID` is too old.
3. **Chunk C — SSE HTTP route + ts-rs binding.** `GET /api/v1/operations/events` handler in `http_api.rs`; honor `Last-Event-ID`; replay snapshot (non-terminal ops + last 50 terminal) before tailing live; emit `resync` on overflow. Add `OperationTransitionEvent` to `ui-api-contracts/src/lib.rs` + regenerate ts-rs binding. Tests: integration tests (`apps/backend/tests/http_api.rs`) for connect-with-no-Last-Event-ID, submit-an-op-assert-event-arrives, disconnect-reconnect-with-stale-Last-Event-ID, resync-out-of-buffer.

Each chunk is its own developer dispatch with the three-reviewer rule. Order matters: A before B (broadcaster hooks into worker structure); B before C (route is broadcaster-consumer).

## M2 protected-path exception list (additive on top of 9a M3 released)

The following paths must be released for M2 work — the coordinator either has these from the inferred invocation block or escalates to the human:

- `components/operations/src/lib.rs` (new module re-exports)
- `components/operations/src/dispatcher.rs` (NEW)
- `components/operations/src/sse.rs` (NEW)
- `components/operations/src/worker.rs` (trait refactor only; behavior preserved)
- `components/operations/kinds/import_sessions.rs` (NEW; extracts app.rs execute_import_operation)
- `components/operations/kinds/rescan_sources.rs` (NEW; extracts app.rs execute_rescan_operation)
- `components/operations/Cargo.toml` (module wiring; no new external deps)
- `components/operations/README.md` (architecture update for trait + SSE)
- `components/ui-api-contracts/src/lib.rs` (add `OperationTransitionEvent`)
- `components/ui-api-contracts/bindings/OperationTransitionEvent.ts` (NEW; ts-rs output)
- `apps/backend/src/http_api.rs` (add SSE route)
- `apps/backend/src/app.rs` (wire broadcaster + dispatcher; relocate execute functions; no behavior change)
- `apps/backend/tests/http_api.rs` (M2 SSE + dispatcher integration tests; existing async-route tests must continue to pass byte-equivalent)
