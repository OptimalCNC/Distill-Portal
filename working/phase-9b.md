# Phase 9b: Job Center UX + Generalization

## Status

Frozen at the first commit landing this spec on `main`. Subsequent milestones reference that commit's SHA.

**Depends on Phase 9a closure.** Phase 9a delivered the operations ledger substrate: SQLite `operations` table, per-kind tokio workers, idempotent submission, cooperative cancellation, crash recovery, and `GET /api/v1/operations[/:id]` + `DELETE /api/v1/operations/:id` HTTP routes. The frontend gained a minimal status surface (action-bar badge + last-completed pill) backed by a polling loop. Phase 9b builds on that substrate.

## Why this phase exists

Phase 9a's minimal status surface is intentionally understated — a single-line badge + pill in the action bar. It signals that work is happening, but it doesn't let the user inspect *which* operation is running, doesn't show progress at the operation level, doesn't expose cancel from the UI (the API exists; no button calls it), doesn't surface failure detail (only "✗ Rescan failed" — no error message), and doesn't show history beyond the most recent. The polling loop in `useOperationPoll.ts` is wasteful when multiple operations are running concurrently across browser tabs.

Phase 9b closes those gaps in two motions. First, the **Job Center UX**: a right-anchored slide-out tray that shows every active and recent operation with per-op cards (kind, status, submission time, duration, result/error summary, cancel button). The action-bar badge becomes a button that opens the tray. The user can finally see what's running, click cancel, inspect a failure's details, and skim recent history without leaving the inspection page.

Second, the **operations dispatcher generalization**: 9a's `OperationKind` enum has two concrete variants. Phase 9b refactors the worker model into a trait-based dispatcher so future kinds (Phase 10+ summarization being the next obvious one) plug in cleanly — each kind owns its own worker module and registers with the dispatcher at startup. The HTTP submission flow becomes uniform across kinds.

Third, **SSE replaces the polling loop** as the primary live-update mechanism. `GET /operations/:id` stays for tests, CLI, and SSE-reconnect fallback. The frontend opens one SSE connection and routes per-op events to the right cards. Polling fallback activates automatically if SSE drops.

## Goal & Scope

### In scope (must close in Phase 9b)

- Job Center UI: a right-anchored slide-out tray + a button in the action bar (replacing 9a's badge). Tray content:
  - Active operations section: one card per non-terminal op showing kind icon + status + submission time + cancel button (where applicable).
  - Recent operations section: most recent 50 terminal ops in reverse chronological order; clicking a card expands to show result_json / error_json.
  - Empty state when no operations.
- SSE channel `GET /api/v1/operations/events` streaming operation state transitions:
  - One persistent connection serves all operation kinds + all client-visible state.
  - On connect: server replays a snapshot of non-terminal operations as initial events.
  - Subsequent transitions stream as deltas. Event shape: `{ "type": "transition", "operation": <Operation row> }`.
  - Reconnect protocol: client uses `Last-Event-ID` (SSE standard). Server replays anything missed.
- `useOperationsFeed.ts` (or similar) — frontend SSE client + fallback to polling on disconnect. Replaces the polling-loop responsibilities of 9a's `useOperationPoll.ts` (which simplifies into a thin helper consumed by `useOperationsFeed`).
- Operations dispatcher generalization (Rust):
  - `OperationKind` becomes a trait-bound type rather than a concrete enum. The trait `OperationHandler` carries the kind's work-loop logic, idempotency-key computation, and result/error schemas.
  - `OperationsStore` stays kind-agnostic. The dispatcher routes claimed rows to the registered handler for that kind.
  - Existing handlers for `import_sessions` and `rescan_sources` migrate to the trait-based shape without behavior changes. The on-disk schema stays unchanged; only the in-process worker plumbing refactors.
- Cancel UI: cancel button on each active-op card. Click invokes `DELETE /api/v1/operations/:id`; SSE event flow surfaces the resulting `cancel_requested` → `cancelled` transitions.
- Documentation sweep across 6 surfaces (see §Documentation).
- UI/UX design gate: yes — design loop produces `working/phase-9b/designs/` artifacts (design.md, prototype.html, wireframes, wcag.py) before implementation milestones start.

### Out of scope (deferred)

- DAGs, priorities, retries-as-feature, pause-resume, distributed execution, tenancy. Same Phase 9a bans.
- Full-history Operations route at its own URL (e.g. `/operations`). The tray surfaces recent history; a dedicated route is a later phase if the need arises.
- Batch cancel ("cancel all running"). Each op is cancelled individually in 9b.
- Per-unit progress reporting (e.g. "import: 12 of 50 sessions persisted"). The `Operation` row's status is the only progress signal in 9b. A `progress_json` column may be added later via forward migration.
- Auto-retry of failed / interrupted operations. The user clicks resubmit.
- Persisting tray open/closed state across reloads. Tray opens on user click only; default-closed at page mount.
- Concrete next-kind landing (e.g. `summarize_session`). Phase 9b proves the dispatcher generalization works for the two existing kinds; Phase 10+ adds new kinds.
- Filters and search within tray history (status filter, kind filter, full-text search over result/error). Future phase.

## Dependency Policy

Inherits all prior phase invariants.

- **Backend released paths** (additions on top of 9a's released set):
  - `apps/backend/src/http_api.rs` — adds SSE handler.
  - `components/operations/src/lib.rs` + `worker.rs` + new `dispatcher.rs` — the trait-based refactor.
  - `components/operations/src/sse.rs` — NEW, SSE event-emitter side.
  - `components/ui-api-contracts/src/lib.rs` — SSE event payload type.
- **No new external Rust dependencies.** SSE is implementable via the existing HTTP framework's streaming response support (axum / actix / tower — whichever is in workspace). If a framework-specific helper crate is needed, it's escape-hatched with a documented Chromium-equivalent reproducer (analogous to Phase 5's `focus-trap-react` slot).
- **Frontend dep budget unchanged**: 24 hex literals, 83 tokens. The Job Center may need WCAG-driven token additions (e.g. a "failed-op" tint distinct from existing danger pills); any addition follows the Phase 5 amendment pattern with documented contrast measurements. M1 design measures + documents.
- **Native EventSource API** for SSE on the frontend — no library.
- **Bun-first invariant** holds throughout.

## Target Repository Shape

```text
components/
├── operations/
│   ├── src/
│   │   ├── lib.rs                 # public API; trait re-exports
│   │   ├── dispatcher.rs          # NEW — trait-based dispatcher
│   │   ├── sse.rs                 # NEW — event broadcaster
│   │   ├── worker.rs              # refactored: per-kind worker → trait-bound
│   │   ├── store.rs               # unchanged
│   │   ├── migrations.rs          # unchanged
│   │   ├── cancel.rs              # unchanged
│   │   ├── idempotency.rs         # unchanged
│   │   └── types.rs               # unchanged (Operation, OperationStatus); OperationKind becomes trait-bound
│   └── kinds/                     # NEW — per-kind handler modules (extracted from 9a's worker.rs)
│       ├── import_sessions.rs
│       └── rescan_sources.rs
├── ui-api-contracts/
│   └── src/lib.rs                 # add OperationTransitionEvent type
└── ...

apps/
├── backend/
│   └── src/
│       ├── app.rs                 # wire SSE broadcaster + dispatcher registration
│       └── http_api.rs            # add GET /api/v1/operations/events SSE route
└── frontend/
    └── src/
        ├── App.tsx                # wire useOperationsFeed + Job Center button
        ├── features/operations/   # NEW feature directory
        │   ├── JobCenter.tsx
        │   ├── JobCenter.css
        │   ├── JobCenter.test.tsx
        │   ├── OperationCard.tsx
        │   ├── OperationCard.css
        │   ├── useOperationsFeed.ts   # SSE client + polling fallback
        │   └── useOperationsFeed.test.ts
        ├── features/sessions/
        │   └── useOperationPoll.ts    # simplified — now a fallback helper
        └── components/
            └── ActionBar.tsx      # 9a badge becomes a button opening the Job Center

working/
└── phase-9b/
    └── designs/                   # NEW — design loop outputs
        ├── design.md
        ├── prototype.html
        ├── wireframes/
        └── wcag.py

docs/
├── README.md
├── features/
│   ├── inspection-surface.md      # Job Center surface added
│   └── operations.md              # NEW — feature doc for the operations system
├── playbooks/
│   ├── modify-backend-api.md      # how to add a new operation kind (via the trait)
│   └── modify-frontend-page.md    # Job Center extension pattern
└── dev-commands.md                # mention SSE endpoint for debugging

progress/
└── phase-9b.progress.md           # NEW — chunk-by-chunk delivery log
```

No files deleted. No backend protected paths newly released beyond what 9a opened.

## Data Model

### SSE event payload

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "OperationTransitionEvent.ts"))]
pub struct OperationTransitionEvent {
    pub operation: Operation,
    /// Monotonic per-broadcaster sequence number; used as SSE event id for
    /// Last-Event-ID reconnect support.
    pub seq: u64,
}
```

The SSE channel sends one event type, `transition`, carrying the full updated `Operation` row. The client receives the row, updates its in-memory map keyed by `operation.id`, and re-renders affected cards.

On initial connect, the server iterates all non-terminal operations + recent terminal operations (last 50) and replays them as a sequence of `transition` events before resuming live transitions. This is the snapshot phase.

### Operation handler trait (Rust)

```rust
pub trait OperationHandler: Send + Sync + 'static {
    /// Identifier for this kind. Serializes to a snake_case string in the
    /// operations.kind column. Must be stable across versions.
    fn kind(&self) -> &'static str;

    /// Schema-validate and canonicalize the submitted params. Returns the
    /// canonical_params_hash + input_version for idempotency.
    fn idempotency_key(&self, raw_params: &serde_json::Value) -> Result<IdempotencyKey, HandlerError>;

    /// Execute the operation, calling the supplied CheckpointGuard between
    /// units of work. On terminal success, return result_json. On terminal
    /// failure, return Err.
    async fn run(
        &self,
        params: serde_json::Value,
        checkpoint: CheckpointGuard,
    ) -> Result<serde_json::Value, HandlerError>;
}
```

Existing 9a worker logic moves into `components/operations/kinds/import_sessions.rs` and `rescan_sources.rs`, each implementing this trait. The dispatcher in `dispatcher.rs` owns a `HashMap<&'static str, Arc<dyn OperationHandler>>` and routes claimed rows to the matching handler.

This refactor is **schema-compatible**: the on-disk `operations` table is unchanged. Only the in-process worker plumbing changes.

## SSE Channel Design

### Server side (`components/operations/src/sse.rs`)

A central `OperationsBroadcaster`:
- Lives as a single instance in `apps/backend/src/app.rs`, shared via `Arc`.
- Workers call `broadcaster.publish(operation)` after every state transition (queued → running, running → succeeded, cancel_requested → cancelled, etc.).
- HTTP handlers for status changes call the same `publish`.
- Internally, the broadcaster owns a `tokio::sync::broadcast::Sender<OperationTransitionEvent>` channel.
- Each connected SSE client gets a `Receiver` cloned from the channel. Capacity is sized to handle reasonable client lag without dropping.

### HTTP handler (`apps/backend/src/http_api.rs`)

```
GET /api/v1/operations/events
Accept: text/event-stream
[Last-Event-ID: <seq>]

response:
HTTP/1.1 200 OK
Content-Type: text/event-stream

id: 1
event: transition
data: {"operation": {...}, "seq": 1}

id: 2
event: transition
data: {"operation": {...}, "seq": 2}

...
```

On connect:
1. If `Last-Event-ID` is present, replay all events with `seq > Last-Event-ID` from a small ring buffer kept by the broadcaster (size: 200 events; if client lagged further, send a `resync` event instructing the client to re-fetch via `GET /api/v1/operations`).
2. Replay current non-terminal operations + recent 50 terminal operations as initial snapshot.
3. Tail subsequent transitions.

### Client side (`useOperationsFeed.ts`)

State machine:
- `idle` — no SSE connection, no polling.
- `connecting` — SSE handshake.
- `streaming` — SSE active, receiving events.
- `polling` — SSE failed, fallback polling via `GET /api/v1/operations`.
- `reconnecting` — SSE attempt after polling-fallback period.

Backoff on SSE failures: 1 s, 2 s, 5 s, 10 s, then 30 s indefinitely. Polling fallback uses `GET /api/v1/operations` at 5 s intervals during the fallback window.

When `resync` event arrives or `Last-Event-ID` is too old, client re-fetches via `GET /api/v1/operations` (full list) and resets its in-memory map.

The hook exposes:
```ts
type OperationsFeedState = {
  operations: Record<string, Operation>;  // keyed by id
  status: "idle" | "connecting" | "streaming" | "polling" | "reconnecting";
  lastEventSeq: number | null;
};
```

Consumers (Job Center, ActionBar) read the map and re-render.

## Job Center UX

### Layout (locked at M1 design gate)

- Tray slides from the right edge. Width: ~360 px (final value pinned at M1).
- Anchored beneath the existing app header; spans from below header to the bottom of the viewport.
- Backdrop: subtle, click-to-close. Tray itself is opaque, hairline-bordered (consistent with Phase 5 Archive-room aesthetic).
- Header: "Job Center" title + close button.
- Body: two sections, "Active" and "Recent", separated by a hairline.
- Empty state: a single line "No operations." Centered, muted.

### Per-op card

- Top row: kind icon (small monogram, no emoji — text initial like "I" for Import, "R" for Rescan, monospaced) + kind label + status pill.
- Middle row: relative time ("3 s ago", "2 m ago"); when expanded, absolute time as a `title=` tooltip.
- Bottom row: cancel button (active ops only) OR result summary (success: "3 sessions imported"; failed: error reason truncated to 80 chars; cancelled: "Cancelled by user"; interrupted: "Backend restarted").
- Click anywhere on the card (except the cancel button) to expand. Expanded view shows full result_json or error_json formatted as pretty JSON (reusing the bespoke NDJSON inspector pattern that will land in Phase 8 — wait: Phase 8 lands AFTER 9b. For 9b, use a simple pre-block with newline-formatted JSON; Phase 8 may upgrade it later).
- Native `<details>` for the expand/collapse, matching Phase 5 M5/M6 precedent.

### Action-bar integration

- The 9a-installed badge becomes a button labelled "Job Center" with the running-count inside a small badge (e.g. "Job Center (2)").
- Click opens the tray.
- The 9a last-completed pill is REMOVED from the action bar — its information lives in the tray's Recent section now.
- The 9a badge-only behavior is preserved when the tray is closed: a small numeric badge indicates running count.

## Documentation

Sweep 6 surfaces:

- `docs/README.md` — task table gains "Add a new operation kind" + "Modify Job Center UI".
- `docs/features/inspection-surface.md` — Job Center surface added; describe trigger button, tray layout, per-op card behavior.
- `docs/features/operations.md` — NEW feature doc. Documents the operations ledger end-to-end: lifecycle, idempotency, cancellation, status taxonomy, SSE channel, polling fallback, dispatcher trait.
- `docs/playbooks/modify-backend-api.md` — concrete recipe for adding a new operation kind: implement `OperationHandler`, register in `app.rs`, add ts-rs binding for params + result types.
- `docs/playbooks/modify-frontend-page.md` — Job Center extension pattern (e.g. how to add a per-kind cancel-confirmation or kind-specific result rendering).
- `docs/dev-commands.md` — note `GET /api/v1/operations/events` (curl + `Accept: text/event-stream`) for debugging SSE.

## Milestones

Three milestones. Two-commit pattern per chunk (impl + log). Three-reviewer rule applies. Codex reasoning effort `medium`.

### Milestone 1: UI/UX Design Gate

- Design loop produces `working/phase-9b/designs/`:
  - `design.md` — Job Center tray layout, per-op card visual model, cancel-confirmation pattern, expand/collapse semantics, motion budget, empty state, ActionBar integration.
  - `prototype.html` — static HTML demonstrating each card state (queued, running, cancel-requested, succeeded, failed, cancelled, interrupted) and the tray open/closed states.
  - `wireframes/` — per-state wireframes.
  - `wcag.py` — contrast measurements across all new visible foreground/background pairs (light + dark).
- Design loop locks the operational decisions: tray width, card expansion mechanism (native `<details>` vs. controlled state), cancel-confirmation flow (one-click vs. confirm-modal), empty-state copy, status pill visual variants.
- Design has its own external-reviewer round.

Definition of done:
- Four design artifacts exist under `working/phase-9b/designs/`.
- WCAG AA holds on every new visible pair.
- The locked operational decisions are recorded in `design.md`.
- External reviewer signs off on design.

### Milestone 2: SSE channel + dispatcher generalization

- `components/operations/src/sse.rs`: `OperationsBroadcaster` with `tokio::sync::broadcast::Sender` + ring buffer for `Last-Event-ID` replay.
- `apps/backend/src/http_api.rs`: `GET /api/v1/operations/events` handler. Honors `Last-Event-ID`. Replays snapshot + tails live events.
- `components/operations/src/dispatcher.rs`: `OperationHandler` trait + dispatcher with handler registry.
- `components/operations/src/kinds/import_sessions.rs` + `rescan_sources.rs`: existing 9a worker logic refactored to implement the trait. Behavior unchanged; on-disk schema unchanged.
- Workers and HTTP state-transition handlers call `broadcaster.publish(operation)` after every transition.
- `components/ui-api-contracts/src/lib.rs`: add `OperationTransitionEvent`. ts-rs binding lands.
- Tests: SSE replay correctness; dispatcher routing correctness; trait-based handlers produce byte-equivalent output to 9a's hardcoded paths.

Definition of done:
- `cargo check --workspace` + `cargo test --workspace` green.
- SSE handler unit + integration tests pass.
- Dispatcher unit tests pass (mock handlers + state transitions).
- 9a-era HTTP behavior unchanged (POST /import, /rescan, GET /operations[/:id], DELETE /operations/:id all behave identically).
- No frontend changes yet.

### Milestone 3: Job Center UI + frontend SSE client + doc sweep

- `apps/frontend/src/features/operations/`:
  - `useOperationsFeed.ts` + tests: SSE client + polling fallback + state machine.
  - `JobCenter.tsx` + `.css` + `.test.tsx`: tray with Active + Recent sections.
  - `OperationCard.tsx` + `.css` + `.test.tsx`: per-op card with native `<details>` expand.
- `apps/frontend/src/features/sessions/useOperationPoll.ts`: simplified — becomes a thin polling helper consumed by `useOperationsFeed` in fallback mode. Import + Rescan call sites no longer use it directly.
- `apps/frontend/src/components/ActionBar.tsx`: 9a badge becomes a button opening the tray; 9a last-completed pill removed (its info is now in the tray).
- `apps/frontend/e2e/inspection.spec.ts`: extends with one assertion that the Job Center opens on click, shows the post-import op, and the op transitions to terminal status via SSE.
- Documentation sweep (6 surfaces per §Documentation).
- Final progress log entry recording the close of Phase 9b.

Definition of done:
- All gates green (`cargo check --workspace`, `cargo test --workspace`, `bun test src`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`).
- 24 hex / 83 tokens (or documented amendment per Phase 5 pattern; WCAG-justified).
- Job Center renders correctly across all op states; cancel button works; expand/collapse preserved via native `<details>`.
- SSE drops trigger polling fallback within the documented backoff window; reconnect resyncs via `Last-Event-ID`.
- Three-reviewer trail per milestone recorded.

## Acceptance Criteria

Phase 9b close is achieved when ALL of the following hold:

1. `OperationsBroadcaster` exists in `components/operations/src/sse.rs` with `Last-Event-ID` replay support over a ring buffer.
2. `GET /api/v1/operations/events` SSE endpoint is implemented and tested.
3. `OperationHandler` trait + `dispatcher.rs` exist; `import_sessions` and `rescan_sources` implement the trait.
4. `components/operations/kinds/` directory contains one module per kind. The dispatcher's handler registry routes claimed rows to the matching handler.
5. On-disk schema unchanged from 9a; trait refactor is purely in-process plumbing.
6. `apps/frontend/src/features/operations/JobCenter.tsx` + supporting files exist. Tray opens / closes correctly. Per-op cards render every status. Cancel button calls `DELETE /api/v1/operations/:id` and reflects the resulting transition via SSE.
7. `useOperationsFeed.ts` SSE client with polling fallback. State machine transitions verified.
8. ActionBar 9a-badge becomes a Job Center trigger button; 9a last-completed pill removed.
9. Four design artifacts exist under `working/phase-9b/designs/`.
10. WCAG AA holds for every new visible foreground/background pair. Recorded in progress log.
11. 6-surface doc sweep complete.
12. Hex literal count stays at 24 (or documented amendment). Token count stays at 83 (or documented amendment).
13. No new frontend runtime deps. No new backend runtime deps beyond what 9a established.
14. Phase 5 / 6 / 7 / 9a invariants otherwise preserved.
15. Three-reviewer trail per milestone recorded.

## Testing

- **SSE handler**: integration tests via `apps/backend/tests/http_api.rs`. Connect with no `Last-Event-ID`, assert snapshot replay. Submit an op, assert transition event arrives. Disconnect + reconnect with stale `Last-Event-ID`, assert replay covers the gap or sends `resync` if out of buffer.
- **Dispatcher**: unit tests with synthetic handlers. Register two handlers; submit ops of each kind; assert routing.
- **Trait refactor regression**: backend integration tests (`apps/backend/tests/http_api.rs`) from 9a continue to pass byte-equivalent.
- **Frontend feed**: `useOperationsFeed.test.ts` with mocked EventSource + fetch. Verify state machine, backoff, fallback, reconnect.
- **JobCenter unit**: render each card state, click cancel, click expand, snapshot the tray.
- **Browser e2e**: extend `inspection.spec.ts` with one full Job-Center workflow.

## Risks

| Risk | Mitigation |
|---|---|
| SSE ring buffer too small; clients with bad networks miss events. | M2 sizes the ring at 200 entries (covers ~minutes of typical activity). Server emits `resync` if `Last-Event-ID` is older than the oldest buffered seq; client re-fetches via `GET /api/v1/operations`. |
| Trait refactor breaks existing 9a HTTP behavior. | M2 runs the full 9a backend integration test suite before any new code lands. Refactor is byte-equivalent on the on-disk schema and behavior. |
| Job Center visual conflicts with the existing split-pane layout (Phase 5). | M1 design walks through the layout against the Phase 5 design language. Tray width and slide motion are constrained to feel like an extension of the Archive-room aesthetic, not a foreign UI. |
| SSE event order doesn't match the actual database state under contention. | Broadcaster publishes AFTER the database transaction commits. Workers + HTTP state-change handlers funnel through a single broadcaster instance per backend process. Sequence numbers are monotonic. |
| Cancel button click loses to a worker that completed mid-click. | The `DELETE` call may return 409 if the op transitioned to a terminal state between render and click. Frontend gracefully handles 409 by closing the cancel button + showing the current terminal state. |
| Polling fallback consumes more bandwidth than SSE. | Fallback uses `GET /api/v1/operations` (single list response) every 5 s — cheap. Fallback exits as soon as SSE reconnects. |
| Page load with tray-open via deep link or saved state surfaces empty tray briefly. | 9b intentionally does NOT persist tray open/closed state. Default-closed on mount. Tray opens only on explicit user click. |

## Resolved Decisions

1. **Three milestones**: design gate → SSE + dispatcher → Job Center UI + doc sweep.
2. **SSE + GET both exist.** SSE is the primary live channel; GET stays for tests, CLI, page refresh, SSE-reconnect fallback.
3. **Single SSE channel for all operations.** Per-op SSE channels were considered and rejected (higher connection count; less natural for the tray's "show everything" UX).
4. **`Last-Event-ID` for SSE reconnect.** Standard SSE protocol. Ring buffer size 200 events on the server.
5. **Polling fallback** activates after SSE retry budget exhausted. Reconnects automatically.
6. **Trait-based dispatcher.** `OperationHandler` is the extension contract. New kinds (Phase 10+) implement the trait + register in `app.rs`.
7. **On-disk schema unchanged from 9a.** The trait refactor is in-process plumbing.
8. **Tray opens on user click only.** No persisted open-state across reloads. Default closed.
9. **Action-bar badge becomes the Job Center trigger.** 9a's last-completed pill removed; its info lives in the tray's Recent section.
10. **Cancel from UI in 9b.** 9a installed the API + worker checkpoint substrate; 9b surfaces it.
11. **No batch cancel in 9b.** Each op cancelled individually.
12. **Native `<details>` for card expand/collapse.** Phase 5 M5/M6 precedent.
13. **No new runtime deps.** Native EventSource on frontend; existing HTTP framework on backend.
14. **UI/UX design gate is mandatory.** Phase 9b does not skip the design loop.
15. **Codex reasoning effort `medium`.** Carried forward.

## Open Considerations

Flagged for M1 planner. Not pre-resolved.

- **Cancel confirmation pattern**: one-click cancel (cancel immediately on button press) vs. confirm modal vs. confirm-on-second-click. M1 design picks one based on prototype testing. Cancel is reversible (an in-flight cancel can be observed but a `cancelled` row is terminal); one-click may be appropriate.
- **Status pill visual variants**: do `running` and `cancel_requested` look visually similar (both "in motion") or distinct (one is a yellow caution)? M1 design locks the colour usage within the 83-token budget.
- **Expanded card formatting** for `result_json` / `error_json`. 9b uses a simple pretty-JSON `<pre>` block; Phase 8 (Raw View Polish) will land a bespoke NDJSON/JSON inspector that the tray cards can re-use. M3 documents the upgrade path.
- **Recent-history cutoff**: tray shows the most recent 50 terminal ops. Older ops are still in the DB; the tray doesn't surface them. Future "see all" link to a dedicated route may land in a later phase.
- **Whether the tray should ever auto-open** (e.g. when a long-running op fails). Default decision is NO; user-driven only. M1 confirms.
- **SSE event coalescing**: if an op transitions queued → running → succeeded in <50 ms (small fast import), should the broadcaster emit all three or coalesce to the terminal state? Default is emit all (no coalescing); M1 confirms.
- **Handling browser tabs with multiple Job Centers open** (same user, multiple tabs of the same backend). Each tab opens its own SSE connection. Server broadcaster fan-out handles N receivers natively. M2 confirms the broadcaster's channel capacity is sized for it.
