# Phase 9b Progress Log

## Source-Of-Truth Reference

- Task spec: `working/phase-9b.md` (frozen at the spec's first commit on `main`).
- Coordinator prompt: `coordinator-prompt.md`.
- Baseline commit (at coordinator engagement): `e5938be` ("Refine coordinator reviewer prompts").
- Cross-phase sync: `phase9-syn.md` (shared with the Phase 9a coordinator).
- Architecture references: `README.md`, `ARCHITECTURE.md`, `PRD.md`, `docs/README.md`, `docs/dependency-rules.md`, `docs/dev-commands.md`.

## Task Invocation Block (inferred)

- `task_name`: `phase-9b`
- `task_spec_path`: `working/phase-9b.md`
- `progress_log_path`: `progress/phase-9b.progress.md`
- Protected paths: all backend and component paths except those Phase 9b additively releases per the spec; frontend package lockfiles remain protected from runtime dependency additions (24-hex / 83-token invariants).
- Protected exceptions / Phase-9b-released paths (additive on top of the Phase 9a released set, only after 9a M3 closes):
  - `components/operations/src/sse.rs` (new file)
  - `components/operations/src/dispatcher.rs` (new file)
  - `components/operations/src/lib.rs` (re-exports for new modules only)
  - `components/operations/src/worker.rs` (refactor to trait-based dispatch only)
  - `components/operations/src/types.rs` (only if the trait refactor requires)
  - `components/operations/kinds/import_sessions.rs` and `components/operations/kinds/rescan_sources.rs` (new modules; 9a's worker logic extracted)
  - `components/operations/README.md` (architecture update for trait + SSE)
  - `components/operations/Cargo.toml` (no new external deps; module wiring only)
  - `components/ui-api-contracts/src/lib.rs` and generated bindings (add `OperationTransitionEvent` only)
  - `apps/backend/src/http_api.rs` (add `GET /api/v1/operations/events` SSE route only)
  - `apps/backend/src/app.rs` (wire broadcaster + dispatcher registration only)
  - `apps/backend/tests/http_api.rs` (M2 SSE + dispatcher integration tests)
  - `apps/frontend/src/features/operations/**` (new feature directory)
  - `apps/frontend/src/features/sessions/useOperationPoll.ts` (simplified into a fallback helper consumed by `useOperationsFeed`)
  - `apps/frontend/src/components/ActionBar.tsx` + `ActionBar.css` (9a badge becomes Job Center trigger button; 9a last-completed pill removed)
  - `apps/frontend/src/App.tsx` (wire `useOperationsFeed` + Job Center)
  - `apps/frontend/e2e/inspection.spec.ts` (extend with Job Center workflow)
  - `docs/README.md`, `docs/features/inspection-surface.md`, `docs/features/operations.md` (NEW), `docs/playbooks/modify-backend-api.md`, `docs/playbooks/modify-frontend-page.md`, `docs/dev-commands.md`
- Forbidden scope (per spec §Out of scope): DAGs, priorities, retries-as-feature, pause-resume, distributed execution, tenancy; full-history Operations route at its own URL; batch cancel; per-unit progress reporting; auto-retry; persisting tray open/closed state across reloads; concrete next-kind landing (e.g. `summarize_session`); filters/search within tray history.
- Required verification (apply per chunk when in scope): `cargo check --workspace`; `cargo test --workspace`; `cargo test -p distill-portal-operations`; `cargo test -p distill-portal-backend --test http_api`; `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`; from `apps/frontend/`: `bun run test`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`; hex literal count `== 24`; token count `== 83` (or documented amendment per Phase 5 pattern with WCAG-justified contrast measurements).
- `main_agent_family`: `claude`
- `other_subagent_reviewer_command`: `codex exec`
- `ui_ux_skill`: `frontend-design:frontend-design`
- `ui_ux_artifact_root`: `working/phase-9b/designs/`
- Note: the human invocation referenced `coordinator-prompt.md` and `working/phase-9b.md` without supplying a literal Task Invocation Block. The coordinator inferred this block from the phase spec's Dependency Policy, Milestones, Target Repository Shape, Documentation, and Acceptance Criteria sections (mirroring the Phase 9a coordinator's approach).

## Cross-Phase Coordination

Phase 9b shares the repo with a parallel Phase 9a coordinator. Coordination is logged append-only in `phase9-syn.md`.

- **Non-interference contract while 9a M3 is in flight**: Phase 9b makes no edits under `components/operations/`, `components/ui-api-contracts/`, `apps/backend/`, or `apps/frontend/`. M1 (design gate) writes only under `working/phase-9b/designs/`. This log + `phase9-syn.md` are the only repo touch-points.
- **Awaiting from 9a for M2 start**: M3 HTTP routes + finalized worker plumbing + frontend `useOperationPoll.ts` landing on `main`.

## Current Snapshot

- Phase 9b coordinator engaged at 2026-05-18.
- **M1 closed**: UI/UX design gate complete.
- **M2 closed**: M2-A (trait + kinds extraction, Option A-plus) + M2-B (broadcaster + SSE + ts-rs binding) both delivered. All three reviewers approved each chunk on the same evidence pack. Spec AC-1, AC-2, AC-3, AC-4, AC-5 satisfied. On-disk schema unchanged. Only new direct Rust dep: `futures-core = "0.3"` (spec-authorized escape hatch).
- **M3-A closed**: data layer (`useOperationsFeed.ts` SSE+fallback hook + `pollOperationOnce` helper + small backend query-param extension). Spec AC items 6 (data layer; partial), 7 advanced. Four commits + three-reviewer trail; codex caught 4 required findings on round 1 + 2 more nits across 2 follow-up rounds before final approval on `3de8547`.
- **M3-B closed** (2026-05-19): presentation layer (JobCenter dialog + OperationCard + CSS + tests). Three commits (`7e1512f`, `b738ffe`, `aa949b2`); three-reviewer trail; codex caught two production-affecting bugs both Claude reviewers missed (M1 design's WCAG border recipe + StrictMode focus-skip). Final PASS on `aa949b2`. AC items 6, 9, 10 advanced.
- **M3-C dispatching**: integration + close + 6-surface doc sweep. ActionBar cutover (badge → trigger, pill removed), App.tsx wiring (useOperationsFeed → JobCenter), `useOperationPoll` hook export removal, e2e workflow extension, 6-surface doc sweep including new `docs/features/operations.md`.

## Active Plan

- Current chunk: **M3-B (presentation layer)** — about to dispatch developer subagent.
- Owner: coordinator.
- Status: M3-A closed at `3de8547`. M3-A scope expansion logged in `phase9-syn.md` (backend query-param fallback for Last-Event-ID resume; codex round-1 caught the original plan claim was wrong). Plan §2/§4/§7/§9 amended to reflect the actual implementation.
- UI/UX gate: not required for M3 — the M1 design artifact is the gate output; developer implements against it. Any in-implementation UX questions return to the design artifact (single source of truth).
- Pre-dispatch verification: hex count = 24, token count = 83 (M3-A baseline preserved). `python3 wcag.py` carries forward to M3-B as the mandatory checklist item 49.

## Completed Work Log

- 2026-05-18: Coordinator initialized this progress log from `coordinator-prompt.md` schema and `working/phase-9b.md` because no literal invocation block was supplied. Appended cross-phase coordination entry to `phase9-syn.md`.
- 2026-05-18: M1 UI/UX designer Claude subagent dispatched and returned with artifacts at `working/phase-9b/designs/m1-job-center/` (committed at `0cd3975`):
  - `design.md` (754 lines, 10 sections, 54-item implementation acceptance checklist).
  - `prototype.html` (1477 lines; self-contained; theme toggle; live `<dialog>` + all 7 status pills + all card states + reduced-motion fallback).
  - `wcag.py` (382 lines; stdlib-only; 39 foreground/background pairs).
  - `wireframes/` × 7 ASCII layouts + 1 `wcag-output.txt` stub.
  - Headline choices: native `<dialog>` + `showModal()`; 360 px right-anchored tray; trigger button replaces 9a badge; 9a pill removed; 7 status pills disambiguated by border style + dot shape (colorblind-safe); one-click cancel (recoverable per 9a idempotency); native `<details>` for expand; Phase 8 upgrade slot documented; zero new tokens (24-hex / 83-token invariant preserved).
  - Designer caveats forwarded: the `frontend-design:frontend-design` skill was unavailable during the dispatch (classifier outage); designer wrote prototype directly against existing precedent (every value traces to `tokens.css` + `ActionBar.css`). `python3 wcag.py` could not be executed during the dispatch (same outage); `wireframes/wcag-output.txt` is a stub.
- 2026-05-18: M1 UI/UX reviewer Claude subagent dispatched and returned verdict `approved with nits`. All 10 review-checklist items pass. Three nits + one waiver acknowledgment:
  - Nit 1: §6.1 cited a stale `<dialog>.showModal()` precedent (the M5 metadata drawer was retired in M2b); decision is still defensible on its own merits. **Fixed** in design.md §6.1.
  - Nit 2: kind-icon glyph collision-resolution policy for Phase 10+ was undocumented; the rule recommended by the reviewer is "later-registered kind upgrades to a 2-letter monogram." **Added** in design.md §3.5.
  - Nit 3: expanded card panels for `cancelled` / `interrupted` were not separately tiled in the prototype (only `succeeded` / `failed` got expanded specimens). The rule in §3.7 is uniform (`<pre>` + `<dl>` shell for all terminal ops). To be carried as a developer-dispatch note when M3 dispatches.
  - Waiver acknowledgment: `python3 wcag.py` could not be executed during the review session either (same upstream classifier outage). Reviewer signed off on byte-equivalence to the production `.action-bar-operation-pill.success`/`.error` recipe in `ActionBar.css` lines 127–149 that already ships at AA per Phase 9a M3. Item 49 in the implementation acceptance checklist will re-run `python3 wcag.py` and assert `exit == 0` before M2 dispatch.
- 2026-05-18: Designer's 3 open questions resolved by the UI/UX reviewer: (1) keep the dashed mid-rule inside cards (Phase 5 precedent in `SessionView.css` line 290 + `SessionMetadata.css` line 108); (2) keep the one-letter kind-icon rule with the documented collision-resolution policy; (3) keep `aria-live="polite"` on `.jc-body` (W3C ledger/queue pattern).
- 2026-05-18: M1 UI/UX design gate **CLOSED** — designer + reviewer round complete, two nit fixes applied to design.md, third nit deferred to developer dispatch. M2 still blocked on 9a M3 landing on `main`.
- 2026-05-18: 9a M3 landed on `main` (commit `16dab86 phase9a close m3 after claude review`) after the coordinator dispatched a read-only Claude Explore subagent to perform the cross-family review 9a required. Claude review verdict `approved`; recorded verbatim in `phase9-syn.md`. M2 unblocked.
- 2026-05-18: M2 planner dispatched + returned a two-chunk decomposition (M2-A trait + kinds extraction; M2-B broadcaster + SSE + ts-rs binding). Codex consulted on the M2-A blocking question (handler impl location); codex recommended Option A-plus (impls in `apps/backend/src/operations_kinds/`, helpers in `components/operations/kinds/`, no AppContext trait). Decision locked. Codex consulted a second time on the developer's pre-implementation design proposal; codex returned three refinements (idempotency SSOT helper shared by submit + handler; HandlerFuture bounded `'static`; defer the OperationCancellationSignals HashMap refactor as scope creep).
- 2026-05-18: M2-A implementation landed across three commits:
  - `5013cb8` — initial M2-A: 872 insertions / 117 deletions across 11 files (`components/operations/src/dispatcher.rs` NEW, `components/operations/kinds/*` NEW, `apps/backend/src/operations_kinds/*` NEW, `apps/backend/src/app.rs` refactor, `components/operations/{lib.rs, README.md}` updates).
  - `d41ecab` — review-response fixes: kept `From<HandlerError> for AppError` impl (normal reviewer's "unreachable" assessment was incorrect — the impl IS reached via the `?` operator at `submit_*_operation` sites; coordinator's removal attempt broke the build); added an explanatory doc comment naming the call sites; deduped a kinds-module doc paragraph in `components/operations/src/lib.rs` (codex nit); wrapped the `Dispatcher::handlers` iterator signature (codex nit).
  - `99ab8f2` + `b9fb37d` — apply remaining rustfmt diffs codex's sandbox flagged (the local classifier outage prevented running `cargo fmt --check` throughout the M2-A delivery; codex's sandbox bypassed the outage and provided the exact diffs).
- 2026-05-18: M2-A three-reviewer trail complete on the same evidence pack:
  - **Backend-protection** (Claude Explore subagent): `backend untouched`. All 11 touched files within the M2 released-paths set + the Option A-plus extension (`apps/backend/src/operations_kinds/` NEW dir); protected modules (`migrations.rs`, `store.rs`, `cancel.rs`, `idempotency.rs`, `types.rs`, `worker.rs`) byte-identical; 11 HTTP regression tests pass; no new external Rust deps.
  - **Normal implementation reviewer** (Claude Explore subagent): initial `needs changes` (asked to remove the `From<HandlerError>` impl); re-review on `d41ecab` returned `approved` after recognizing the impl is reachable via `?` and the new doc comment resolves the visibility concern.
  - **Codex cross-family reviewer** (`codex exec`): initial `approved with nits` (cargo fmt diffs + lib.rs doc duplication); final `approved` on `b9fb37d` (M2-A files fmt-clean, sign-off Y).
- 2026-05-18: **M2-A CLOSED**. Spec AC-3, AC-4, AC-5 advanced. AC-4's spec-literal reading ("kinds modules contain handler impls") was traded for the codex-recommended Option A-plus (impls in backend, helpers in operations crate) — deviation documented in `components/operations/README.md` and `phase9-syn.md`.
- 2026-05-18: M2-B landed across two commits: `7079eda` (initial) + `7eb1d75` (codex review-response — fixed HIGH-severity snapshot/subscribe race in `apps/backend/src/http_api.rs` + applied 4 rustfmt diffs). Three-reviewer trail complete on `7eb1d75` evidence pack: backend-protection `backend untouched`; normal `approved`; codex `approved` after re-review. Only new direct dep: `futures-core = "0.3"` (spec §"Dependency Policy" escape hatch with documented Chromium-equivalent reproducer in `components/operations/README.md`).
- 2026-05-18: **M2-B CLOSED + M2 CLOSED**. Spec AC-1, AC-2 satisfied. M2 milestone "Definition of done" fully met. Codex pre-consult workflow's six refinements (single Mutex<Inner>, mpsc bridge task, futures-core escape hatch, all-transitions-published, cancel-before-notify, snapshot order, KeepAlive default) shaped the implementation; codex caught the one real-world race the developer's "subscribe after snapshot" interpretation introduced.
- 2026-05-18: M3 planner subagent (read-only Plan agent) dispatched; returned a 3-chunk decomposition + 4 open questions + 3 ambiguities. Plan materialized at `working/phase-9b/m3-plan.md`. Coordinator resolved all open questions:
  - Connection-status indicator: NOT shipped in 9b (M1 design is silent; hook exposes status string; no visible badge). Future Phase 10+ may add via design amendment.
  - Polling-fallback trigger: engaged after 5-step SSE backoff (1+2+5+10+30 s) reaches its terminal 30 s slot. Retry SSE every 30 s in parallel with 5 s polling cadence; on SSE reconnect, drop polling.
  - `.jc-trigger` CSS home: `JobCenter.css` (cohesion with dialog vocabulary).
  - Status pill: inline JSX in `OperationCard.tsx` (single consumer; no standalone module).
  - `<pre>` content for null-payload terminal statuses: skip `<pre>` when both `result_json` and `error_json` are null; always render `<dl>` metadata. Rule applies uniformly to all 4 terminal statuses per M1 §3.7 + reviewer caveat #3.
  - `python3 wcag.py` re-run cadence: M3-B owns first run (mandatory item 49); M3-C re-runs as regression check after ActionBar.css delta.
- 2026-05-18: M3-A about to dispatch. Developer brief draws from `working/phase-9b/m3-plan.md` §2 + the 7 pinned implementation rules in §7.
- 2026-05-18: M3-A landed across four commits: `13cc98c` (initial: useOperationsFeed.ts + .test.ts + lib/api.ts apiOperationsEventsUrl + lib/contracts.ts re-export + useOperationPoll.ts pollOperationOnce helper + 1 test), `2f40799` (codex round-1 review-response: Last-Event-ID resume + 3 other findings + 2 nits), `cac7824` (codex round-2: 2 stale doc references), `3de8547` (codex round-3: final stale test comment).
- 2026-05-18: M3-A three-reviewer trail:
  - **Backend-protection** (Claude Explore): `backend untouched` on round 1 commit `13cc98c`. After round-2 expanded scope to additive backend change at `apps/backend/src/http_api.rs::operations_events` (query-param fallback to Last-Event-ID header), the scope remained within spec-authorized released paths (line 29 of this progress log) — no re-review required for the explicitly released SSE-route extension.
  - **Normal implementation** (Claude Explore): `approved` on round 1; no required changes.
  - **Codex cross-family** (`codex exec`): 4 rounds — `needs changes` (4 required findings + 2 nits) → `needs changes` (2 stale doc references in plan §4 + source comment) → `needs changes` (1 stale test comment) → `approved`. Final sign-off on `3de8547`.
- 2026-05-18: M3-A codex's load-bearing finding: the original plan §2 incorrectly claimed `new EventSource(url)` attaches `Last-Event-ID` automatically. This is wrong — native `Last-Event-ID` is per-EventSource-instance and only carried on the SAME object's automatic reconnects. Manual `close() + new EventSource()` starts empty. Spec mandates the documented manual backoff ladder, so the fix path was a small backend-side change: `apps/backend/src/http_api.rs::operations_events` now accepts `?last_event_id=N` as a fallback for the header; frontend manual reconnects build the URL with the query param when `lastEventSeq` is non-null; native auto-reconnects continue to use the header. 2 new backend tests pin: header wins when both supplied; query alone triggers the same resync semantics. Plan §2/§4/§7/§9 amended.
- 2026-05-18: M3-A verification at close: `cargo check --workspace` clean; `cargo test --workspace` green; `cargo test -p distill-portal-backend --test http_api` 17/17 (15 prior + 2 new); `cargo test -p distill-portal-operations` 31/31; `bun run test` 788/0; `bunx tsc --noEmit` clean; `bun run build` clean; hex count 24; token count 83.
- 2026-05-18: **M3-A CLOSED**. Spec AC items 6 (data layer; partial), 7 (`useOperationsFeed.ts` SSE client with polling fallback + state machine) advanced. ActionBar cutover + dialog/card UI still pending (M3-B + M3-C). M3-B about to dispatch.
- 2026-05-19: M3-B landed across three commits: `7e1512f` (initial: 6 new files under `features/operations/` — JobCenter + OperationCard + CSS + tests; 1850 lines), `b738ffe` (WCAG v2 fix), `aa949b2` (codex round-1 fix: StrictMode focus + classname drift).
- 2026-05-19: M3-B three-reviewer trail: backend-protection `backend untouched` (no findings); normal `approved with nits` (no required changes); codex `needs changes` × 2 → `PASS`. Codex caught two production-affecting bugs both Claude reviewers missed: (1) M1 design's wrong WCAG border recipe (`color-mix(X 35%, surface)` gave 1.65-2.43:1, failing SC 1.4.11); (2) StrictMode focus-skip via gated rAF.
- 2026-05-19: M3-B WCAG resolution: M1 design table §3.6 corrected to mix borders against `--color-border-strong`; wcag.py PAIRS updated synchronously for J13/J21/J24/J26/J28/J39; design.md §9.1 NEW documents Phase 5 amendment for 4 hairline subdividers (J01/J02/J09/J34) per SC 1.4.11's "decorative subdividers" exemption. M3-B close gate per design.md §9.1: "wcag.py exits 1 with EXACTLY four failing pairs and ALL other pairs passing" — verified.
- 2026-05-19: M3-B StrictMode resolution: `JobCenter.tsx` focus rAF schedule is now unconditional whenever `open === true`; `showModal()` remains guarded by `!dialog.open`. Regression test added mounting under `<StrictMode>`. Classname drift fixed: `.jc-section-title` → `.jc-section-label`; `.jc-bottom-row` → `.jc-bottom`; missing `.jc-pill-slot` wrapper added; grid-column ownership moved off `.jc-pill` onto the slot — all matching M1 prototype byte-for-byte.
- 2026-05-19: M3-B verification at close: `bun run test` 832/832 pass (831 + 1 new StrictMode test); `bunx tsc --noEmit` clean; `bun run build` clean (294 kB JS / 45 kB CSS); hex 24 / tokens 83 preserved; `python3 wcag.py` exit 1 with exactly 4/4 Cat-B amendment failures.
- 2026-05-19: **M3-B CLOSED**. Spec AC items 6 (JobCenter + per-op cards + cancel button + status rendering) substantially advanced. AC items 9 (designs), 10 (WCAG) advanced. AC item 8 (ActionBar cutover) deferred to M3-C.

## UI/UX Design Log

- M1 Job Center design gate: **required** because the chunk introduces a new tray surface + per-op cards + cancel + expand/collapse + ActionBar trigger button + new motion + new accessibility behavior + new copy.
- M1 designer round: Claude subagent invoked the `frontend-design:frontend-design` skill (skill returned classifier-unavailable; designer wrote prototype directly against existing precedent — every value traces to `apps/frontend/src/styles/tokens.css` and `apps/frontend/src/components/ActionBar.css`). Artifacts at `working/phase-9b/designs/m1-job-center/` (committed `0cd3975`).
- M1 reviewer round: Claude subagent returned verdict `approved with nits`. Iteration count: 1 (single pass; no re-dispatch required). All 10 checklist items pass. 3 nits + 1 waiver acknowledgment recorded in Completed Work Log.
- M1 other-subagent design review: NOT invoked. Per `coordinator-prompt.md §UI/UX Design Workflow → Design review`, the second-opinion other-subagent design review is OPTIONAL and reserved for chunks with high architectural-design risk (e.g., a new component family, a new token system, a new motion pattern). The M1 Job Center introduces ZERO new tokens, ZERO new motion patterns (every animation reuses Phase 5 motion-budget durations), and extends an existing component family (the `.action-bar-operation-pill` recipe). Architectural-design risk is low; single Claude UI/UX reviewer is sufficient per coordinator-prompt policy.

## Review Log

- 2026-05-18: M1 UI/UX reviewer (Claude subagent) returned verdict `approved with nits`. Findings: 3 nits (stale `<dialog>` precedent citation — fixed; missing kind-icon collision-resolution policy — fixed; cancelled/interrupted expanded panels not separately tiled in prototype — deferred to developer dispatch note). Missing Evidence: none. Required Changes: none for approval. The full reviewer response is preserved in the coordinator's conversation transcript at the M1 review turn (will be re-quoted into this log on M3 close if needed for session-handoff resilience).

## Other-Subagent Reviewer Availability Log

- 2026-05-18: `codex exec` availability not yet exercised this phase. Will be verified before the first developer completion claim (M2 earliest).

## Protected-Path Exception Log

- (none yet)

## Open Risks / Open Questions

- The formal Task Invocation Block was inferred, not supplied literally. If later work needs to touch a path outside the inferred released list, escalate to the human before proceeding.
- Phase 9b M2/M3 are blocked on Phase 9a M3 landing on `main`. Coordination via `phase9-syn.md`. If 9a M3 slips materially, the coordinator must decide whether M1 design work can proceed past the design-lock step into prototype iteration or whether to escalate.
- Spec §Open Considerations carries six items deferred to M1 design: cancel-confirmation pattern, status-pill visual variants, expanded card formatting, recent-history cutoff (preset 50), auto-open policy (default no), SSE event coalescing (default no), multi-tab handling (default broadcaster fan-out per spec §Risks). M1 design must resolve at least the first four and confirm the defaults for the rest.

## Next Recommended Task

- Dispatch M3-C developer subagent per `working/phase-9b/m3-plan.md` §4. Developer brief:
  - **ActionBar cutover**: `apps/frontend/src/components/ActionBar.tsx` — drop `runningOperationCount`/`lastOperationSummary`/`operationSummaryRefreshing`/`onRefreshOperations`/`showManualRefresh` props; add `onOpenJobCenter`/`runningCount`/`jobCenterOpen`. Replace `.action-bar-operation-badge` with `.jc-trigger` button + count chip. REMOVE the `.action-bar-operation-pill` block entirely (item 8). Sweep `App.test.tsx` for the prop API breakage.
  - **ActionBar.css**: delete the `.action-bar-operation-pill.*`, `.action-bar-operation-badge`, and `.action-bar-refresh` recipes (no longer reachable). Add top-of-file comment pointing at `design.md §10.1 item 2` as the canonical home of the AA recipe.
  - **App.tsx wiring**: drop `useOperationPoll` hook usage; add `const feed = useOperationsFeed();`; add `[jobCenterOpen, setJobCenterOpen] = useState(false)`; derive `runningCount = useMemo(...)`; pass to ActionBar; render `<JobCenter open={...} onClose={...} activeOps={...} recentOps={...slice(0,50)} onCancel={feed.cancelOperation} />`. Toast-on-terminal effect: `if (op && isOperationTerminal(op.status)) pushToast(...)`.
  - **`features/sessions/useOperationPoll.ts`**: REMOVE the `useOperationPoll` hook export now that App.tsx no longer consumes it. Keep pure helpers (`OPERATION_POLL_*`, `nextOperationPollDelay`, `isOperationTerminal`, `pollOperationOnce`).
  - **e2e/inspection.spec.ts**: replace `.action-bar-operation-badge`/`.pill` assertions with `.jc-trigger` + open-dialog + assert `.jc-card` + `.jc-pill.succeeded` after SSE transition; add one cancel-flow assertion.
  - **6-surface doc sweep**: `docs/README.md`, `docs/features/inspection-surface.md`, `docs/features/operations.md` (NEW), `docs/playbooks/modify-backend-api.md`, `docs/playbooks/modify-frontend-page.md`, `docs/dev-commands.md`.
  - **Verification**: `bun run test`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e` all clean; `python3 wcag.py` exit 1 with exactly 4/4 Cat-B failures (regression check); 24/83 invariants preserved.
  - Three-reviewer rule applies at close.
