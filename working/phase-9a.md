# Phase 9a: Async Operations Ledger

## Status

Frozen at the first commit landing this spec on `main`. Subsequent milestones reference that commit's SHA.

**Depends on Phase 7c closure.** Phase 7c closes the Phase 7 arc (transcript rendering overhaul). Phase 9a is the next phase in the agreed roadmap order (`7a → 7b → 7c → 9a → 9b → 8`). Phase 9a touches the Rust backend substantially; the Phase 5 / Phase 7 frontend-only protected-path discipline is explicitly released here for the files this spec names. All other Phase 5 / 6 / 7 invariants hold.

## Why this phase exists

`POST /api/v1/import` and `POST /api/v1/rescan` are synchronous today: the client sends a request, the backend ingests / scans inline, the response carries the full ImportReport / RescanReport, and the client renders a toast. This works on a small corpus where both finish in milliseconds. It breaks the moment either operation grows. The frontend's "Import selected" button is disabled while the request is in flight — until it returns, the user has no signal beyond a spinner. There is no way to cancel. There is no record that the work happened beyond the resulting persisted sessions. There is no idempotency: clicking "Import" twice in rapid succession runs the work twice (the second instance is a no-op because the data is already persisted, but it still spends a round-trip).

These shortcomings get worse the moment we add summarization (Phase 10+), which is genuinely long-running. Building per-operation persistence + cancellation + idempotency twice (once for import/rescan, once for summarization) is the wrong shape. Build the substrate once.

Phase 9a introduces an **operations ledger**: a persisted record of every long-running backend operation, with idempotency, cancellation, status tracking, and crash recovery. The substrate is deliberately narrow — not a generic job queue. Two operation kinds land in 9a (`import_sessions`, `rescan_sources`); future kinds plug into the same dispatcher in Phase 9b. The corresponding HTTP endpoints change shape: `POST /api/v1/import` and `POST /api/v1/rescan` now return `202 Accepted` + `operation_id` instead of the full report. The client polls `GET /api/v1/operations/:id` until terminal state, then reads the result from the operation row.

The frontend's minimal status surface (action-bar badge + last-completed pill) lands in 9a. The full Job Center UX (slide-out tray, SSE-driven live updates, generalization for future kinds) is Phase 9b.

## Goal & Scope

### In scope (must close in Phase 9a)

- New Rust crate `components/operations/` exposing:
  - `Operation` row type, `OperationStatus` + `OperationKind` enums.
  - SQLite migration adding the `operations` table with DB-enforced uniqueness on `(kind, canonical_params_hash, input_version)`.
  - `OperationsStore` for INSERT / SELECT / status transitions.
  - Per-kind worker model: a tokio task per kind, cooperative cancellation via checkpoints, terminal-state writes are transactional.
  - Crash recovery: on backend boot, any row with status `running` transitions to `interrupted` (one-shot reconciliation; no heartbeats in 9a).
- `components/ui-api-contracts` adds: `Operation`, `OperationStatus`, `OperationKind`, `SubmitOperationResponse`, `OperationsListResponse`, `OperationsListQuery`. ts-rs bindings regenerate.
- `apps/backend` HTTP routes:
  - `POST /api/v1/import` returns `202 Accepted` + `{ operation_id, status }`. Body shape unchanged.
  - `POST /api/v1/rescan` same pattern.
  - `GET /api/v1/operations/:id` returns full `Operation` row including result_json (when terminal) or error_json (when failed).
  - `GET /api/v1/operations?status=...&kind=...&limit=...` returns filtered list. Defaults: 50 most recent.
  - `DELETE /api/v1/operations/:id` submits a cancellation request. Transitions `queued` / `running` → `cancel_requested`. Returns the updated row.
- Idempotency: every `POST /api/v1/import` and `POST /api/v1/rescan` computes a server-side `canonical_params_hash` (sha256 over serde-canonicalized request body) AND an `input_version` (kind-specific snapshot fingerprint — see §Idempotency Model). If a row with matching `(kind, canonical_params_hash, input_version)` already exists in a non-terminal status OR a terminal-success status, the server returns that row's `operation_id` instead of creating a new one. Cancelled / failed rows do NOT block resubmission.
- Frontend hard cutover:
  - The synchronous import + rescan call sites in `App.tsx` are replaced with submit-then-poll loops.
  - `useImportFlow.ts` (or equivalent — name decided at M3 planner) encapsulates the polling pattern.
  - Minimal status surface in the action bar: a small badge showing the count of running operations + a last-completed pill summarising the most recent terminal operation (success or failure). Both deliberately understated; the full Job Center is 9b.
  - No SSE on the client side. Polling at a fixed cadence (500 ms while in non-terminal state; back off to 2 s after 10 s elapsed; stop on terminal). Cadence values locked at M3.
- `tests/e2e/tests/inspection_surface.rs` typed-client e2e updates to drive the new async flow.
- `apps/frontend/e2e/inspection.spec.ts` Playwright e2e updates: assert the operation_id in the 202 response, then assert eventual terminal state via polling.
- Documentation sweep across 6 surfaces (see §Documentation).
- Progress log `progress/phase-9a.progress.md` records every chunk + three-reviewer trail.

### Out of scope (deferred to 9b or later)

- SSE channel for live operation updates. `GET /operations/:id` polling is the only live-update mechanism in 9a.
- Job Center UI (slide-out tray, top-right badge with per-op cards, expand/collapse history). The minimal status surface above is the entirety of 9a's UX surface.
- Generalisation of `OperationKind` into an open-ended dispatcher trait. 9a defines exactly two kinds (`import_sessions`, `rescan_sources`) as concrete enum variants; 9b refactors to a trait-based dispatcher when summarization (Phase 10+) needs to plug in.
- Heartbeats / lease-based stale-worker detection. 9a uses one-shot crash reconciliation on boot only.
- Retries-as-feature (auto-retry on transient failure). A failed op stays failed; the user re-submits if they want.
- Worker pools / concurrent workers per kind. 9a serializes per-kind: one running op per kind at a time.
- DAGs / job dependencies / priorities / pause-resume.
- Persistent allow-listing of "ignore this kind of failure". Failures stay loud.
- Per-operation progress reporting beyond status transitions (e.g. percentage complete, per-unit progress). 9a only reports status; 9b's UX may add aggregate progress if natural to compute.
- Distributed execution / multi-instance backend. We are a single-binary backend; concurrency boundaries don't change.

## Dependency Policy

Inherits Phase 5–7 invariants. Phase 9a's release of backend protected paths is narrow and explicit:

- **Released paths** (Phase 9a is authorised to edit):
  - `apps/backend/src/http_api.rs`
  - `apps/backend/src/app.rs` (worker wiring)
  - `apps/backend/Cargo.toml` (add the new crate to deps)
  - `components/ui-api-contracts/src/lib.rs` (new types)
  - `components/operations/` (new crate, entire surface)
  - `components/ingest-service/src/service.rs` (refactor to be callable from a worker rather than directly from the HTTP handler — minimal change)
  - `components/collector-runtime/src/lib.rs` (same — exposed for worker invocation)
- **Other backend paths remain protected** (Phase 9a does NOT edit).
- **No new external dependencies.** The substrate uses `tokio` (already in workspace), `serde`, `serde_json`, `sqlx` (or whatever sqlite driver Phase 1 chose), `sha2` for canonical hashing (likely already in workspace; if not, that's the only addition and it's a documented escape-hatch per the substrate's needs). `sha2` is widely-used, has stable API, and is in the standard Rust crypto crate set; if not yet in deps, M1 planner adds it with an escape-hatch comment in `Cargo.toml`.
- **Frontend dep budget unchanged**: 24 hex literals, 83 tokens. The minimal status surface adds NO new tokens; it composes from existing chrome.
- **Bun-first invariant** holds on the frontend side. Polling loop uses native `fetch` + `setTimeout`.

## Target Repository Shape

```text
components/
├── operations/                    # NEW crate
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                 # public API
│       ├── types.rs               # Operation, OperationStatus, OperationKind
│       ├── store.rs               # OperationsStore (SQLite)
│       ├── migrations.rs          # operations table schema
│       ├── worker.rs              # per-kind worker tokio task + dispatcher
│       ├── idempotency.rs         # canonical_params_hash + input_version computation
│       └── cancel.rs              # cancellation primitives (Notify + checkpoint helpers)
├── ui-api-contracts/
│   └── src/lib.rs                 # add Operation, OperationStatus, OperationKind, etc.
├── ingest-service/
│   └── src/service.rs             # refactor: callable from worker; no policy change
└── collector-runtime/
    └── src/lib.rs                 # refactor: callable from worker; no policy change

apps/
├── backend/
│   ├── Cargo.toml                 # depend on components/operations
│   └── src/
│       ├── app.rs                 # wire OperationsStore + per-kind workers
│       └── http_api.rs            # POST /import + /rescan return 202 + operation_id;
│                                  # GET /operations[/:id], DELETE /operations/:id
└── frontend/
    └── src/
        ├── App.tsx                # submit-and-poll for import + rescan
        ├── features/sessions/
        │   ├── useOperationPoll.ts    # NEW — submit + polling state machine
        │   ├── useImportFlow.ts       # refactored to use useOperationPoll
        │   └── useRescanFlow.ts       # refactored to use useOperationPoll
        ├── components/
        │   └── ActionBar.tsx      # minimal status surface (badge + last-completed pill)
        └── lib/
            └── contracts.ts       # re-export new generated types

tests/
└── e2e/
    └── tests/inspection_surface.rs # typed-client async-flow updates

apps/frontend/e2e/
└── inspection.spec.ts             # Playwright async-flow updates

progress/
└── phase-9a.progress.md           # NEW — chunk-by-chunk delivery log
```

No files deleted; no UI surface removed.

## Data Model

### Operations table schema

```sql
CREATE TABLE operations (
    id TEXT PRIMARY KEY,                       -- ULID or UUIDv7; sortable
    kind TEXT NOT NULL,                        -- 'import_sessions' | 'rescan_sources'
    canonical_params_hash TEXT NOT NULL,       -- sha256 hex, lowercase
    input_version TEXT NOT NULL,               -- kind-specific snapshot fingerprint (sha256 hex)
    status TEXT NOT NULL,                      -- 'queued' | 'running' | ... (see enum)
    params_json TEXT NOT NULL,                 -- raw submitted params (verbatim)
    result_json TEXT,                          -- terminal-state result; NULL until terminal
    error_json TEXT,                           -- terminal-state error; NULL unless failed
    submitted_at TEXT NOT NULL,                -- RFC3339
    started_at TEXT,                           -- RFC3339; NULL until status becomes 'running'
    finished_at TEXT,                          -- RFC3339; NULL until terminal
    cancel_requested_at TEXT,                  -- RFC3339; NULL unless cancel was requested
    UNIQUE (kind, canonical_params_hash, input_version)
);

CREATE INDEX operations_status_idx ON operations(status);
CREATE INDEX operations_submitted_at_idx ON operations(submitted_at DESC);
```

The UNIQUE constraint is the idempotency enforcer at the storage boundary. App-layer idempotency lookups still happen (read-then-write would race otherwise), but the constraint guarantees we never persist a duplicate.

### Rust types (in `components/operations/src/types.rs`)

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "OperationKind.ts"))]
pub enum OperationKind {
    ImportSessions,
    RescanSources,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "OperationStatus.ts"))]
pub enum OperationStatus {
    Queued,
    Running,
    CancelRequested,
    Succeeded,
    Failed,
    Cancelled,
    Interrupted,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "Operation.ts"))]
pub struct Operation {
    pub id: String,
    pub kind: OperationKind,
    pub status: OperationStatus,
    pub canonical_params_hash: String,
    pub input_version: String,
    pub params_json: serde_json::Value,
    pub result_json: Option<serde_json::Value>,
    pub error_json: Option<serde_json::Value>,
    pub submitted_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub cancel_requested_at: Option<String>,
}
```

### Status transitions (binding)

```
                      submit             pick up           checkpoint(success)
[no row]  ─────────►  queued   ─────►  running   ──────────────────────────►  succeeded
                        │                  │
                        │                  │  checkpoint(error)
                        │                  └─────────────────►  failed
                        │                  │
                        │                  │  cancel requested
                        │                  └─────►  cancel_requested  ────►  cancelled
                        │                                                       (worker reaches next checkpoint)
                        │  cancel requested while queued
                        └────────────────────────►  cancel_requested  ────►  cancelled
                                                                              (never picked up)
                       any time backend boots:
                       running ─────────►  interrupted
                       cancel_requested ─►  interrupted
```

Terminal states: `succeeded`, `failed`, `cancelled`, `interrupted`. Non-terminal: `queued`, `running`, `cancel_requested`.

`interrupted` is not retried automatically. The user resubmits (which creates a fresh op with the same params_hash + input_version — i.e. idempotent if conditions still match).

## API Surface

### `POST /api/v1/import`

Request body (unchanged in shape — same `ImportRequest` as today's synchronous endpoint).

Response: **202 Accepted**

```json
{
  "operation_id": "01HXM...",
  "status": "queued",
  "kind": "import_sessions"
}
```

Behavior:
1. Server computes `canonical_params_hash` = sha256(serde_json::to_string with sorted keys + normalized whitespace).
2. Server computes `input_version` = kind-specific fingerprint (see §Idempotency Model).
3. Server queries `operations` for matching `(kind, canonical_params_hash, input_version)`:
   - If found in `succeeded` / `running` / `queued` / `cancel_requested` — return that row's id (idempotent re-submit).
   - If found in `failed` / `cancelled` / `interrupted` — create a new row (failure does not block resubmission).
   - If not found — create a new row with `status: queued`.
4. Worker picks up `queued` rows in FIFO order per kind.

### `POST /api/v1/rescan`

Same pattern. Request body unchanged.

### `GET /api/v1/operations/:id`

Returns full `Operation`. 404 if not found.

### `GET /api/v1/operations`

Query parameters:
- `status` — optional, comma-separated list of statuses to include.
- `kind` — optional, comma-separated list of kinds.
- `limit` — optional, default 50, max 200.

Returns `{ "operations": [Operation, ...] }`, ordered by `submitted_at DESC`.

### `DELETE /api/v1/operations/:id`

Submits a cancellation request:
- If status is `queued` — transitions immediately to `cancel_requested` (worker will skip the row when picking up; it becomes `cancelled`).
- If status is `running` — transitions to `cancel_requested`; worker observes the flag at the next checkpoint and transitions to `cancelled`.
- If status is already terminal or `cancel_requested` — 409 Conflict with body indicating current state.

Returns the updated `Operation` row.

## Idempotency Model

### `canonical_params_hash`

`sha256(canonicalize(request_body))` where `canonicalize` is:
1. `serde_json` deserialise into a typed `ImportRequest` / `RescanRequest`.
2. Sort all object keys recursively.
3. Re-serialise with `serde_json` using the sorted-key writer.
4. Hash the resulting bytes.

Locked decision: canonicalisation happens server-side. Clients submit arbitrary JSON; the server normalises before hashing. This prevents whitespace / key-order differences from breaking idempotency.

### `input_version` (kind-specific)

**`import_sessions`**:
```
input_version = sha256(
    sorted(source_session_keys)
    || "|"
    || sorted([source_fingerprint(key) for key in source_session_keys])
)
```

The server queries the current `source_fingerprint` for each requested session key from `collector-runtime`. If a session's source file has changed since the last import request (different fingerprint), `input_version` changes, and the second import is a distinct (non-idempotent) operation.

**`rescan_sources`**:
```
input_version = sha256(
    SCANNER_CONFIG_VERSION
    || "|"
    || sorted(configured_project_roots)
)
```

`SCANNER_CONFIG_VERSION` is a `const &str` in `components/collector-runtime/src/lib.rs`. Manually bumped when scanner behavior changes meaningfully. Adding this constant + the bump-discipline note in the crate's README is part of M1.

### Idempotent re-submit behavior

If an existing op matches `(kind, canonical_params_hash, input_version)`:

| Existing status | Server response |
|---|---|
| `queued` | Return existing id with current status. Client polls. |
| `running` | Same. |
| `cancel_requested` | Same. |
| `succeeded` | Return existing id. Client polls once, sees `succeeded`, reads result_json. (No work re-done.) |
| `failed` | Create new op. (User likely wants to retry.) |
| `cancelled` | Create new op. (User cancelled; if they're submitting again, they want it to run.) |
| `interrupted` | Create new op. (Previous run didn't complete; user wants to try again.) |

This rule is the entirety of 9a's idempotency policy. No client-supplied idempotency keys; no time-windowed deduplication; no allow-list for "force re-run".

## Worker Model

One tokio task per `OperationKind`. Each task:
1. Polls the `operations` table for `status = 'queued' AND kind = self.kind` ordered by `submitted_at`.
2. Transactionally claims the row: updates to `status = 'running'`, sets `started_at = NOW()`, returns the row. The transaction prevents two workers from claiming the same row (irrelevant in 9a since we have one task per kind, but the invariant must hold so 9b's potential multi-worker design doesn't break it).
3. Executes the kind-specific work: import dispatches to `ingest-service`; rescan dispatches to `collector-runtime`.
4. At each natural checkpoint (between sessions in an import; between source paths in a rescan), the worker checks the cancellation flag via the `cancel.rs` `CheckpointGuard` helper. If cancel was requested, transition row to `cancelled` + exit cleanly.
5. On success, transition row to `succeeded` with `result_json` populated (ImportReport / RescanReport).
6. On error, transition row to `failed` with `error_json` populated.

Cancellation primitive (`components/operations/src/cancel.rs`):

```rust
pub struct CheckpointGuard {
    op_id: String,
    store: Arc<OperationsStore>,
}

impl CheckpointGuard {
    /// Call between units of work. Returns Ok(()) if work should continue;
    /// Err(CancelRequested) if the operation should terminate cleanly.
    pub async fn check(&self) -> Result<(), CancelRequested>;
}
```

The frequency of checkpoint calls is per-kind: import checks between every persisted session; rescan checks between every discovered source file. Frequency is high enough that cancel latency is ≤ 1 unit-of-work duration.

### Worker spawning + crash recovery

`apps/backend/src/app.rs` at boot:
1. Run any pending migrations including the new `operations` table.
2. Reconcile: `UPDATE operations SET status = 'interrupted', finished_at = NOW() WHERE status IN ('running', 'cancel_requested')`. This is a single SQL statement, idempotent, runs synchronously at boot. Any operation that was mid-flight when the backend stopped becomes `interrupted` and the user must resubmit if they want it to run again.
3. Spawn one tokio task per `OperationKind`. Each task loops on poll-claim-execute-checkpoint.

## Frontend Minimal Status Surface

`useOperationPoll.ts` is the polling state machine. Generic over `OperationKind`. Behavior:

1. Caller invokes `submitOperation(kind, params)`. Hook calls `POST /api/v1/<endpoint>` and stores the returned `operation_id`.
2. Hook starts polling `GET /api/v1/operations/:id`:
   - Initial interval: 500 ms.
   - After 10 s elapsed in non-terminal state: back off to 2 s.
   - After 60 s elapsed in non-terminal state: back off to 5 s.
   - Stop on terminal state.
3. Hook exposes `{ status, operation, error }`. Caller renders accordingly.
4. Hook respects `AbortController` on unmount / kind-change.

`ActionBar.tsx` gains:
- A small "X running" badge to the left of the existing action buttons. Hidden when 0 running.
- A "Last: ✓ Import (3 sessions)" or "Last: ✗ Rescan failed" pill to the right of the action buttons, sourcing from `GET /api/v1/operations?limit=1`. Auto-refreshes every 5 s when any op is running; manual refresh button when idle.
- Existing Import + Rescan buttons remain. Their click handlers now call `useOperationPoll.submitOperation(...)` instead of the old synchronous fetch.

Both surfaces are intentionally understated: a single line, no card chrome, no slide-out behavior. The Job Center (slide-out tray, per-op cards, cancel UI) is Phase 9b.

## Documentation

Sweep 6 surfaces:

- `docs/README.md` — task table gains a row for "Change async operation behavior".
- `docs/dependency-rules.md` — `components/operations/` added to the component-crate list.
- `docs/dev-commands.md` — note that long-running operations now go through the operations ledger; mention `GET /api/v1/operations` for debugging.
- `docs/features/inspection-surface.md` — describe the new submit-then-poll pattern + action-bar status surface.
- `docs/playbooks/modify-backend-api.md` — pattern for adding a new operation kind in the future.
- `components/operations/README.md` — NEW crate README documenting the substrate, types, worker model, idempotency rules.

## Milestones

Three milestones. Two-commit pattern per chunk (impl + log). Three-reviewer rule applies. Codex reasoning effort `medium` per Phase 6 closure guidance.

### Milestone 1: New `components/operations/` crate + types + contracts

- Scaffold `components/operations/` with `Cargo.toml`, `lib.rs`, `types.rs`, `migrations.rs`, `store.rs`, `idempotency.rs`. (Worker + cancel land in M2.)
- `Operation`, `OperationStatus`, `OperationKind` types in `components/operations/src/types.rs`; re-exported via `components/ui-api-contracts` with ts-rs derives.
- `OperationsStore` exposes `insert`, `update_status`, `get_by_id`, `list`, `find_by_idempotency_key`.
- SQLite migration adds the `operations` table per the schema in §Data Model. Round-trip tests for every status + kind.
- Idempotency hashing: `canonical_params_hash` + `input_version` computation per kind. Pure functions with unit tests.
- `SCANNER_CONFIG_VERSION` constant added to `components/collector-runtime/src/lib.rs` with a documented bump-discipline note.

Definition of done:
- `cargo check --workspace` green.
- `cargo test -p distill-portal-operations` green; round-trip + idempotency tests pass.
- `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` green; bindings regenerate cleanly.
- No backend HTTP changes yet; existing synchronous endpoints still work.
- No frontend changes yet.

### Milestone 2: Worker substrate + cancellation + crash recovery

- `components/operations/src/worker.rs`: per-kind tokio task. Poll-claim-execute-checkpoint loop. Transactional claim. Terminal writes.
- `components/operations/src/cancel.rs`: `CheckpointGuard` primitive + `Notify`-based cancel flag.
- `components/ingest-service/src/service.rs` + `components/collector-runtime/src/lib.rs` refactored to be callable from a worker (accept a `CheckpointGuard`; emit per-unit progress is OUT of scope, but checkpoint calls are IN scope).
- `apps/backend/src/app.rs`: at boot, run the crash-recovery reconciliation, spawn workers for each kind.
- Worker unit tests with synthetic kinds + injected `OperationsStore` mocks; assert claim semantics, checkpoint semantics, cancel semantics, transactional terminal writes.

Definition of done:
- `cargo check --workspace` + `cargo test --workspace` green.
- Backend boots cleanly with the operations subsystem running.
- Crash recovery test: kill backend mid-running-op, restart, assert row transitions to `interrupted`.
- Cancellation test: submit op, send DELETE, assert worker terminates at next checkpoint with `cancelled`.
- HTTP endpoints still unchanged (POST /import + /rescan are still synchronous); the substrate exists but isn't wired yet.

### Milestone 3: HTTP cutover + frontend submit-then-poll + e2e

- `apps/backend/src/http_api.rs`:
  - `POST /api/v1/import` and `POST /api/v1/rescan` now enqueue an operation and return 202 + operation_id (hard cutover; old synchronous handlers removed).
  - `GET /api/v1/operations/:id`, `GET /api/v1/operations`, `DELETE /api/v1/operations/:id` land.
- Frontend wholesale update:
  - `useOperationPoll.ts` lands.
  - `App.tsx` import + rescan call sites use `useOperationPoll.submitOperation(...)` and surface terminal state via the existing toast machinery.
  - `ActionBar.tsx` gains the badge + last-completed pill.
- `tests/e2e/tests/inspection_surface.rs` typed-client e2e updates: assert 202 + operation_id, then poll until terminal, then assert result.
- `apps/frontend/e2e/inspection.spec.ts`: similar update; the Playwright spec drives the new flow against the dev server.
- Documentation sweep (6 surfaces per §Documentation).
- Final progress log entry recording the close of Phase 9a.

Definition of done:
- All gates green (`cargo check --workspace`, `cargo test --workspace`, `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`, `bun test src`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`).
- 24 hex / 83 tokens invariant preserved (no new tokens added; status surface composes from existing chrome).
- Old synchronous endpoint signatures fully removed; no compat shims.
- Backend boots; idempotency holds under double-submit stress test (M3 adds a small load-test fixture exercising rapid-fire identical submits and asserting only one row).
- Three-reviewer trail per milestone recorded.

## Acceptance Criteria

Phase 9a close is achieved when ALL of the following hold:

1. `components/operations/` crate exists with `Operation`, `OperationStatus`, `OperationKind`, `OperationsStore`, `worker.rs`, `cancel.rs`, `idempotency.rs`.
2. SQLite `operations` table exists with the UNIQUE constraint on `(kind, canonical_params_hash, input_version)`.
3. ts-rs exports `Operation.ts`, `OperationStatus.ts`, `OperationKind.ts` cleanly; frontend imports them via `lib/contracts.ts`.
4. `POST /api/v1/import` and `POST /api/v1/rescan` return 202 + operation_id. Old synchronous handler bodies are removed.
5. `GET /api/v1/operations/:id`, `GET /api/v1/operations`, `DELETE /api/v1/operations/:id` are implemented and tested.
6. Idempotent re-submit of identical (canonical_params_hash, input_version) returns the existing operation_id without creating a duplicate row. Verified by stress test.
7. Workers serialise per kind: only one running operation per kind at a time.
8. Cancellation request transitions `queued`/`running` → `cancel_requested`; worker observes the flag at the next checkpoint and terminates cleanly with `cancelled`.
9. Crash recovery: backend boot transitions any `running` / `cancel_requested` rows to `interrupted` before spawning workers.
10. Frontend `useOperationPoll.ts` exists; import + rescan call sites use it; ActionBar gains the badge + last-completed pill.
11. Polling cadence: 500 ms initial, 2 s after 10 s elapsed, 5 s after 60 s elapsed, stop on terminal.
12. `tests/e2e/tests/inspection_surface.rs` exercises the new async flow end-to-end through the typed Rust client.
13. `apps/frontend/e2e/inspection.spec.ts` exercises the new async flow through the browser.
14. Hex literal count = 24; token count = 83. No new runtime deps on the frontend; `sha2` is the only potential new backend dep (escape-hatched if not already in workspace).
15. Documentation sweep complete (6 surfaces).
16. Phase 5 / 6 / 7 invariants otherwise preserved.
17. Three-reviewer trail per milestone recorded in `progress/phase-9a.progress.md`.

## Testing

- **Operations crate unit**: types serialise round-trip; store CRUD; idempotency hashing determinism; canonical-params-hash invariance under whitespace/key-order; input_version computation per kind.
- **Worker unit**: claim semantics (transactional); checkpoint semantics; cancel observation; terminal-write atomicity. Mock store + synthetic work.
- **Backend integration**: end-to-end through `apps/backend/tests/http_api.rs`: submit → 202 → GET poll → terminal. Plus: idempotent double-submit returns same id. Plus: DELETE on running op transitions to `cancel_requested` then `cancelled`. Plus: backend restart mid-op transitions to `interrupted`.
- **Typed e2e**: `tests/e2e/tests/inspection_surface.rs` drives a full real-Rust-client flow.
- **Browser e2e**: `apps/frontend/e2e/inspection.spec.ts` asserts the 202 response shape + eventual terminal state + ActionBar badge appearance/disappearance + last-completed pill update.
- **Frontend unit**: `useOperationPoll.test.ts` asserts polling cadence, backoff, terminal-state stop, AbortController on unmount.

## Risks

| Risk | Mitigation |
|---|---|
| Hard cutover breaks the dev workflow if a frontend developer pulls main and forgets to also refresh backend bindings. | M3 lands backend + frontend + e2e together in one commit (or one PR with sequential commits). CI gates ensure cargo + bun + tsc + e2e are all green simultaneously. |
| Idempotency hash drifts between client and server when the request body changes shape in future. | Hash is computed server-side after deserialisation into the typed `ImportRequest` / `RescanRequest`. Client doesn't see the hash. Schema changes naturally bump it. |
| Crash recovery reconciles wrongly: a worker mid-write transactional sequence gets transitioned to `interrupted` even though the work completed. | Terminal-state writes are transactional; the row is `running` until the commit that flips it to `succeeded`. If the backend crashes mid-transaction, the commit doesn't land, and the row stays `running` — correctly reconciled to `interrupted` on boot. |
| Polling cadence too aggressive on a slow backend. | Backoff kicks in at 10 s and 60 s. M3 measures on a realistic-size corpus and adjusts if needed (the cadence values are `const` so changing them is one-line + a progress-log entry). |
| `input_version` for `import_sessions` requires reading source_fingerprint for every requested session at submit time, which could be slow for large batches. | The fingerprints are already cached by `collector-runtime` after the most recent scan. Reading them is a SQLite lookup, not a filesystem walk. M3 verifies with a 500-session import. |
| `interrupted` rows accumulate over time. | They're harmless persisted records. 9b's UI surfaces them; no automatic cleanup in 9a. Future phase may add a TTL or manual purge. |
| Action-bar status surface visually conflicts with existing chrome (sticky action bar, pagination, scan-errors callout). | Status surface is single-line, uses existing tokens, no new tokens. M3 walks through the action-bar layout against the Phase 5 design to confirm no conflict. |

## Resolved Decisions

These are pre-decided. Planner does not re-litigate.

1. **Three milestones**: crate scaffold + types + contracts → worker substrate + cancel + crash recovery → HTTP cutover + frontend + e2e.
2. **Hard cutover.** Old synchronous handlers removed in M3; no compat shims.
3. **Polling-only in 9a.** SSE is 9b.
4. **New `components/operations/` crate.** Not folded into `raw-session-store`.
5. **Cancellation substrate in 9a.** Cancel API + worker checkpoints land here; cancel UI is 9b.
6. **`OperationKind` is a concrete enum with two variants** (`ImportSessions`, `RescanSources`). 9b generalises to a dispatcher trait when summarization arrives.
7. **One worker tokio task per kind, serial execution per kind.** No worker pools.
8. **One-shot crash reconciliation on boot.** No heartbeats / leases in 9a.
9. **DB-enforced uniqueness on `(kind, canonical_params_hash, input_version)`.** App-layer lookup races are prevented by the constraint.
10. **`canonical_params_hash` computed server-side, after typed deserialisation.** Clients don't supply hashes.
11. **Failed / cancelled / interrupted rows do NOT block resubmission.** Re-submitting after a failure creates a new op. Successful rows DO block (idempotent return of existing op).
12. **Status taxonomy fixed at 7 values**: `queued / running / cancel_requested / succeeded / failed / cancelled / interrupted`. No `paused`, no `superseded`.
13. **Codex reasoning effort `medium`.** Carried from Phase 6 close.
14. **No new frontend runtime deps. `sha2` backend dep escape-hatched if not already in workspace.**
15. **Polling cadence: 500 ms → 2 s after 10 s → 5 s after 60 s. Stop on terminal.** Values are `const`, locked in M3 unless measured insufficient.
16. **ActionBar status surface is single-line, no new tokens.** Composes from existing chrome.
17. **GET endpoints stay even after SSE lands.** SSE in 9b is an overlay; GET remains for tests, CLI, page refresh, SSE-reconnect fallback.

## Open Considerations

Flagged for the M1 + M3 planners. Not pre-resolved.

- **ULID vs UUIDv7 for `Operation.id`.** Both work; sortable by submission time. M1 picks one based on existing workspace conventions (likely UUIDv7 if `uuid` is already a dep).
- **Whether `result_json` and `error_json` should be typed via per-kind enums** (e.g. `result_json` for `import_sessions` deserialises to `ImportReport`; for `rescan_sources` to `RescanReport`). M3 decides; the simpler path is `serde_json::Value` and let the client cast based on `kind`.
- **Exact action-bar pill copy and emoji/icon usage.** Phase 5 design language is restrained (one accent, hairline separators). M3 walks the visual against the design language before locking copy.
- **Whether to add a `progress_json` column for future per-unit progress reporting** (Phase 9b might want this for summarization). 9a explicitly defers; the column can be added later via a forward migration without changing 9a's schema commitments.
- **Worker startup ordering during boot.** Migration → crash reconciliation → worker spawn. M2 confirms this sequence is atomic enough that workers can't pick up an `interrupted` row that the reconciliation should have flipped.
