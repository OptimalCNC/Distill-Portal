# Phase 9a Progress Log

## Source-Of-Truth Reference

- Task spec: `working/phase-9a.md`
- Baseline commit: `e5938be`
- Baseline review time: `2026-05-17T01:32:04+08:00`
- Architecture references: `README.md`, `ARCHITECTURE.md`, `PRD.md`, `docs/README.md`, `docs/dependency-rules.md`, `docs/dev-commands.md`.

## Task Invocation Block (inferred)

- `task_name`: `phase-9a`
- `task_spec_path`: `working/phase-9a.md`
- `progress_log_path`: `progress/phase-9a.progress.md`
- Protected paths: all backend and component paths except the Phase 9a released paths listed below; frontend package dependency lockfiles remain protected from runtime dependency additions.
- Protected exceptions / released paths:
  - `apps/backend/src/http_api.rs` (Phase 9a HTTP operations cutover only)
  - `apps/backend/src/app.rs` (operations store / worker wiring only)
  - `apps/backend/Cargo.toml` (add `components/operations` dependency only)
  - `components/ui-api-contracts/src/lib.rs` and generated bindings (operation contract types only)
  - `components/operations/**` (new crate)
  - `components/ingest-service/src/service.rs` (minimal worker-callable refactor only)
  - `components/collector-runtime/src/lib.rs` (minimal worker-callable refactor and `SCANNER_CONFIG_VERSION` only)
- Forbidden scope: SSE, Job Center tray UI, generic dispatcher trait, heartbeats / leases, retries-as-feature, worker pools, DAGs / priorities / pause-resume, persistent failure allow-listing, per-operation progress reporting, distributed execution, backend paths not listed above, frontend runtime dependencies.
- Architecture refs: `README.md`, `ARCHITECTURE.md`, `PRD.md`, `docs/README.md`, `docs/dependency-rules.md`, `docs/dev-commands.md`.
- Required verification (apply per chunk): `cargo check --workspace`; `cargo test --workspace`; `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`; `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings` when bindings change; `cargo test -p distill-portal-backend --test http_api`; `cargo test -p distill-portal-e2e --test inspection_surface`; from `apps/frontend/`: `bun run test`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`; frontend invariants `hex literal count == 24` and token count `== 83`.
- `main_agent_family`: `codex`
- `other_subagent_reviewer_command`: `claude -p`
- `ui_ux_skill`: `frontend-design:frontend-design`
- `ui_ux_artifact_root`: `working/phase-9a/designs/`
- Note: the human invocation named `coordinator-prompt.md` and `working/phase-9a.md` but did not provide a literal Task Invocation Block. The coordinator inferred this block from the phase spec's Dependency Policy, Milestones, and Documentation sections so work could start without losing delivery momentum.

## Current Snapshot

- M2 implementation is accepted under the human waiver of the updated `claude -p` rerun after the TOCTOU fix. M1 was accepted under a human waiver of the blocked `claude -p` review requirement.
- `components/operations/` now exists with operation types re-exported from `ui-api-contracts`, migration SQL, synchronous `OperationsStore`, idempotency helpers, tests, and README.
- `components/ui-api-contracts` now owns operation wire types and generated TS bindings for those types.
- `components/collector-runtime` exposes `SCANNER_CONFIG_VERSION = "scanner-v1"` with README bump discipline.
- Current import / rescan HTTP APIs are still synchronous at the start of M3; the operations worker substrate exists underneath them and M3 will hard-cut HTTP/frontend behavior to async operations.
- M1 schema uses the human-approved partial unique index over dedupe-blocking statuses (`queued`, `running`, `cancel_requested`, `succeeded`) so retries after `failed`, `cancelled`, and `interrupted` are possible.

## Active Plan

- Current chunk: **M3 HTTP cutover + frontend submit-then-poll + e2e + docs**
- Owner: coordinator, with planner/explorer subagents providing read-only evidence.
- Status: planning / UI/UX gate in progress.
- UI/UX gate: required because M3 changes visible frontend loading/status states, action-bar status surface, polling behavior, terminal toasts, copy, and browser e2e behavior.

## Remaining Chunks

- **M3 HTTP cutover + frontend submit-then-poll + e2e + docs** — async API routes, frontend hook/status surface, Rust and browser e2e, documentation sweep.

## Completed Work Log

- 2026-05-17: Coordinator initialized this progress log from `coordinator-prompt.md` schema and `working/phase-9a.md` because no literal invocation block was supplied.
- 2026-05-17: Planner/explorer read-only pass completed. Recommended M1 first, with two blockers requiring coordinator escalation: exact protected-path exceptions for root workspace / TS binding test files, and retry-compatible idempotency schema decision.
- 2026-05-17: Human approved both M1 blockers: protected plumbing-file edits and partial unique index policy.
- 2026-05-17: M1 implementation completed:
  - Added workspace crate `components/operations/` with `migrations.rs`, `store.rs`, `idempotency.rs`, `types.rs`, `lib.rs`, and `README.md`.
  - Added operation wire types to `components/ui-api-contracts/src/lib.rs`: `OperationKind`, `OperationStatus`, `Operation`, `SubmitOperationResponse`, `OperationsListResponse`, `OperationsListQuery`; regenerated checked-in TS bindings.
  - Added `SCANNER_CONFIG_VERSION` to `components/collector-runtime/src/lib.rs` and README bump discipline.
  - Updated dependency/docs surfaces for the new crate and frontend contract barrel exports.
  - Verification passed: `cargo test -p distill-portal-operations` (10 passed); `cargo check --workspace`; `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings`; `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`; `cargo test --workspace`; `bunx tsc --noEmit`; `bun run test` (770 pass / 0 fail / 2577 expects); `bun run build`; hex count 24; token count 83.
- 2026-05-17: Human waived the blocked `claude -p` review requirement for M1 and instructed the coordinator to proceed to M2.
- 2026-05-17: M2 implementation completed:
  - Added `components/operations/src/cancel.rs` with `CheckpointGuard`, `CancellationToken`, and `OperationCheckpoint`.
  - Added `components/operations/src/worker.rs` with one-kind worker loop, queued cancellation completion, claim/execute/checkpoint/terminal-write flow, and worker tests.
  - Extended `OperationsStore` with guarded transitions: `claim_next_queued`, `request_cancel`, `is_cancel_requested`, `complete_success`, `complete_failure`, `complete_cancelled`, and `reconcile_interrupted`.
  - Added checkpoint-aware scanner path in `components/collector-runtime/src/scanner.rs`.
  - Added generic `ingest_many_with_checkpoint` in `components/ingest-service/src/service.rs` so import workers can checkpoint between sessions without making ingest-service depend on operations.
  - Wired `apps/backend/src/app.rs` to open `OperationsStore` on the shared `distill.db`, reconcile in-flight operations before worker spawn, spawn one worker per `OperationKind`, and keep existing synchronous HTTP handlers unchanged.
  - Added backend tests for startup interruption reconciliation and queued import operation execution after boot; existing typed e2e remains synchronous for M2.
  - Verification passed: `cargo fmt -p distill-portal-operations -p distill-portal-collector-runtime -p distill-portal-ingest-service -p distill-portal-backend`; `cargo check --workspace`; `cargo test -p distill-portal-operations` (18 passed); `cargo test -p distill-portal-collector-runtime` (9 passed); `cargo test -p distill-portal-backend --test http_api` (8 passed); `cargo test --workspace`; `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`.
- 2026-05-17: QA coverage review identified two blocking M2 coverage gaps: queued rescan worker execution after backend boot and cancellation through the real backend rescan checkpoint adapter. Added tests for both:
  - `apps/backend/tests/http_api.rs`: queued `rescan_sources` operation succeeds after backend boot and returns a `RescanReport`.
  - `apps/backend/src/app.rs`: forced checkpoint cancellation through `execute_rescan_operation` returns `OperationOutcome::Cancelled`.
  - Re-verification passed: `cargo fmt -p distill-portal-operations -p distill-portal-backend`; `cargo test -p distill-portal-backend --test http_api` (9 passed); `cargo test -p distill-portal-backend`; `cargo test -p distill-portal-operations` (18 passed); `cargo check --workspace`; `cargo test --workspace`; `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`.
- 2026-05-17: Claude cross-family review found a non-blocking cancel-vs-success terminal write race. Fixed in M2 by allowing `complete_success` from `cancel_requested` after the worker final checkpoint and adding `success_terminal_write_closes_late_cancel_window`.
- 2026-05-17: Re-verification after the TOCTOU fix passed: `cargo test -p distill-portal-operations` (19 passed); `cargo check --workspace`; `cargo test --workspace`.
- 2026-05-18: Human waived the updated `claude -p` rerun after the TOCTOU fix and instructed the coordinator to proceed to M3.

## UI/UX Design Log

- M1 operations crate + contracts scaffold: **not required** because the chunk is limited to Rust component/contracts/storage scaffolding and does not change a visible or interaction surface.
- M2 worker substrate + cancellation + crash recovery: **not required** because the chunk is limited to backend/component worker, cancellation, crash recovery, and callable runtime seams with no visible or interaction surface changes.
- M3 HTTP cutover + frontend submit-then-poll + e2e + docs: **required** because the chunk changes visible operation states, action-bar status surface, frontend polling behavior, terminal toasts, copy, and browser e2e behavior.

## Review Log

- 2026-05-17: Backend-protection review on `.tmp/phase-9a-m1-compact-evidence.md` returned verdict `backend untouched`. Findings: none. Missing evidence: none. Rationale: all protected-path exceptions used by M1 had explicit human approval; unrelated `working/roadmap.md` and `working/phase-10.md` were excluded.
- 2026-05-17: Normal implementation review on `.tmp/phase-9a-m1-compact-evidence.md` returned verdict `approved`. Findings: none. Missing evidence: none. Rationale: M1 scope, retry-compatible partial unique policy, contract bindings, docs, and listed verification satisfy the milestone; worker/API/frontend cutover remain correctly deferred.
- 2026-05-17: Required other-family reviewer command `claude -p` has not completed. An escalated run with tools disabled was rejected by sandbox approval policy because the compact evidence pack contains local workspace diffs/paths and may transfer private project data to an external service. The human then explicitly approved that transfer after being informed of the risk, but the approval layer rejected the retry under tenant policy.
- 2026-05-17: Human explicitly waived the blocked `claude -p` M1 review requirement and authorized proceeding to M2 based on the two approved local reviews and completed verification.
- 2026-05-17: M2 backend-protection review on `.tmp/phase-9a-m2-evidence.md` returned verdict `backend untouched`. Findings: none. Missing evidence: none. Rationale: every backend/component path changed for M2 is either a Phase 9a released path or has explicit human approval; unrelated `working/roadmap.md` and `working/phase-10.md` remain excluded.
- 2026-05-17: M2 normal implementation review on `.tmp/phase-9a-m2-evidence.md` returned verdict `approved with nits`. Findings: none blocking. Nits: worker tests use real SQLite store plus synthetic handlers rather than mock store; `Notify` exists but cancellation is currently DB-status driven and not materially wired to a request-cancel source yet. Missing evidence accepted for M2: crash recovery is tested by seeding in-flight rows before bootstrap rather than killing a process; DELETE cancellation test is deferred to M3 because DELETE `/operations/:id` is M3 scope. Note: a later QA pass added queued rescan worker and real backend rescan checkpoint cancellation coverage, so the M2 evidence pack must be refreshed before final approval.
- 2026-05-17: M2 cross-family Claude review returned verdict `approved with nits`. Required changes: none for M2. Findings: cancel-vs-success terminal write could strand a row in `cancel_requested` if cancel lands after the worker final checkpoint but before `complete_success`; `Notify` is present but not wired to the cancel source yet; shared `distill.db` dual connections should be kept documented; `OperationsStore::insert` may return a row already claimed by a worker in M3; worker abort in `serve_with_shutdown` could be made more explicit. The cancel-vs-success finding was fixed immediately in M2 by allowing `complete_success` from `cancel_requested` and adding `success_terminal_write_closes_late_cancel_window`; re-verification passed with operations tests at 19 passed, workspace check, and workspace test.
- 2026-05-18: Updated M2 backend-protection review after the TOCTOU fix returned verdict `backend untouched`. Findings: none. Missing evidence: none.
- 2026-05-18: Updated M2 normal implementation review after the TOCTOU fix returned verdict `approved with nits`. Findings: none blocking. Remaining nits: `Notify` should be wired or documented when DELETE cancellation lands in M3; process-kill crash simulation would be stronger but current seeded-row reconciliation test is acceptable for M2; DELETE cancellation evidence is M3 scope.
- 2026-05-18: Human waived the updated M2 `claude -p` rerun after the TOCTOU fix and authorized proceeding to M3.

## Other-Subagent Reviewer Availability Log

- 2026-05-17: A prior full-evidence `claude -p` run timed out with no usable review.
- 2026-05-17: A compact-evidence `claude -p --output-format text --tools ""` run was attempted after user approval, but the sandbox approval reviewer rejected it for external private-data transfer risk. After the human explicitly approved the transfer with knowledge of that risk, the retry was still rejected by tenant policy. The human waived this blocked requirement for M1 and instructed the coordinator to proceed to M2.
- 2026-05-17: M2 has not been sent to `claude -p`; the same tenant policy that blocked M1 external transfer is expected to block `.tmp/phase-9a-m2-evidence.md` as well. M2 needs a human waiver or replacement review mechanism before it can be formally approved.
- 2026-05-18: Human provided Claude review output manually for M2 before the TOCTOU fix. After the fix and updated local reviews, human waived the updated `claude -p` rerun and authorized proceeding to M3.

## Protected-Path Exception Log

- 2026-05-17: Human approved M1 edits to root `Cargo.toml`, `Cargo.lock`, and `components/ui-api-contracts/tests/ts_bindings.rs`, limited to adding the operations crate workspace member/dependency lock updates and TS binding coverage.
- 2026-05-17: Human approved the M1 retry-compatible idempotency schema policy: use a partial unique index for `(kind, canonical_params_hash, input_version)` over dedupe-blocking statuses `queued`, `running`, `cancel_requested`, and `succeeded`, instead of a full table-level unique constraint, so failed/cancelled/interrupted rows can be retried.
- 2026-05-17: Human approved additional M1 protected-path exceptions after backend-protection review round 1: `components/collector-runtime/README.md` for `SCANNER_CONFIG_VERSION` bump-discipline docs, `components/ui-api-contracts/Cargo.toml` for adding `serde_json`, and `components/ui-api-contracts/README.md` for operation contract binding documentation.
- 2026-05-17: Human approved M2 protected-path exceptions for `components/collector-runtime/src/scanner.rs` checkpoint-aware scanning between source files, `apps/backend/tests/http_api.rs` M2 boot/worker tests, and `Cargo.lock` dependency metadata updates from backend depending on `components/operations` and operations using existing `tokio`/`tracing`.

## Open Risks / Open Questions

- The formal Task Invocation Block was inferred, not supplied literally. If later work needs to touch a path outside the Phase 9a released list, the coordinator must ask the human before proceeding.
- The other-subagent reviewer command is blocked by sandbox/tenant policy for external private-data transfer, even with explicit human approval. M1 has a human waiver; future milestones need either the same human process decision or a replacement review mechanism if the policy remains unchanged.
- M3 route decision remains open: the spec names `/api/v1/import` and `/api/v1/rescan`, while current code uses `/api/v1/source-sessions/import` and `/api/v1/admin/rescan`. M1 does not change routes.
- Unrelated worktree changes are present in `working/roadmap.md` and untracked `working/phase-10.md`. They are outside M1 and are excluded from M1 review evidence.

## Next Recommended Task

- Complete the M3 UI/UX design gate, then implement HTTP operations cutover, frontend submit-then-poll, e2e updates, docs sweep, and full verification.
