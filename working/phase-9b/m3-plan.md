# Phase 9b M3 — Implementation Plan

**Status:** planner output materialized to disk; 4 open questions resolved by coordinator (see §8).
**Baseline commit:** M2 closed at `828a554`.
**Source-of-truth references:** `working/phase-9b.md`, `working/phase-9b/designs/m1-job-center/design.md` (54-item implementation acceptance checklist in §10), M2 wire contract at `components/ui-api-contracts/src/lib.rs::OperationTransitionEvent` + `apps/backend/src/http_api.rs::operations_events` + `components/operations/src/sse.rs`, 9a M3 frontend baseline at `apps/frontend/src/features/sessions/useOperationPoll.ts` + `apps/frontend/src/components/ActionBar.tsx` + `apps/frontend/src/App.tsx`.

---

## 1. Three-chunk decomposition

| Chunk | One-line scope | New files | Touched files |
|---|---|---|---|
| **M3-A** | Data layer: SSE+fallback hook, polling helper simplification, contracts re-export, SSE URL helper. No visible UI changes. | `features/operations/useOperationsFeed.ts`, `features/operations/useOperationsFeed.test.ts` | `lib/api.ts`, `lib/contracts.ts`, `features/sessions/useOperationPoll.ts`, `features/sessions/useOperationPoll.test.tsx` |
| **M3-B** | Presentation layer: `JobCenter` (dialog + sections), `OperationCard` (details + pill + cancel), CSS. Consumes M3-A. Owns checklist item 49 (`python3 wcag.py exit 0`). | `features/operations/JobCenter.tsx`, `features/operations/JobCenter.css`, `features/operations/JobCenter.test.tsx`, `features/operations/OperationCard.tsx`, `features/operations/OperationCard.css`, `features/operations/OperationCard.test.tsx` | none (purely additive) |
| **M3-C** | Integration + close: ActionBar cutover, App wiring, e2e extension, 6-surface doc sweep, invariant re-verification. | (none) | `components/ActionBar.tsx`, `components/ActionBar.css`, `App.tsx`, `App.test.tsx`, `e2e/inspection.spec.ts`, `docs/README.md`, `docs/features/inspection-surface.md`, `docs/features/operations.md` (**NEW**), `docs/playbooks/modify-backend-api.md`, `docs/playbooks/modify-frontend-page.md`, `docs/dev-commands.md` |

**Released-set check:** every touched file is in the Phase-9b-released paths set per `progress/phase-9b.progress.md` §"Protected exceptions / Phase-9b-released paths". No path falls outside the released set.

**Why three chunks (not two):** combining M3-A+M3-B puts the EventSource lifecycle and the 54-item-checklist conformance into one reviewer pass with two semantic concerns; splitting at the hook/UI seam matches each reviewer's domain.

**Why three chunks (not four with docs separated):** the 6-surface doc sweep is read alongside the integration that motivates it; splitting would gate a fourth reviewer round on documentation review that already happens during M3-C reviewer passes.

---

## 2. M3-A — Data layer

### New files

#### `apps/frontend/src/features/operations/useOperationsFeed.ts`

Returns `{ operations: Record<string, Operation>, status: "connecting" | "streaming" | "polling" | "reconnecting", lastEventSeq: number | null, cancelOperation(id) }`.

`status` semantics: `connecting` means "no data received yet"; the first frame (snapshot OR transition) flips status to `streaming`. The `idle` member was removed during the M3-A codex review pass (nit #2) — it was never returned and no consumer read it.

Behavior:
- Native `EventSource` against `apiOperationsEventsUrl()`. No library.
- Per-event-type handlers: `addEventListener("snapshot", ...)`, `addEventListener("transition", ...)`, `addEventListener("resync", ...)`. The native `EventSource.onmessage` handles only unnamed events; M2 emits three named types.
- `lastEventSeq` advances ONLY on `event: transition`. Snapshot rows have no `id:` so the native API will not advance its internal `Last-Event-ID` on snapshot frames.
- `snapshot` handler: always flips status to `streaming` when an event arrives (codex review fix #2). The previous "preserve `connecting` until first transition" rule left the hook stuck on quiet systems that only emit snapshot rows.
- On `resync`: drop the in-memory map, call `listOperations({ limit: 50 })`, re-prime the map, flip state to `streaming`.
- On `EventSource` `error` / close: exponential backoff per spec §"Client side": 1 s → 2 s → 5 s → 10 s → 30 s. Each retry constructs a fresh `EventSource` with the URL built as `apiOperationsEventsUrl()` + (`lastEventSeq` != null ? `?last_event_id=${lastEventSeq}` : ""). The backend prefers the `Last-Event-ID` header (used by native automatic reconnects) and falls back to the `last_event_id` query param (used by manual reconnects). This is codex review fix #1 — the original plan incorrectly claimed `new EventSource(url)` attaches `Last-Event-ID` automatically; it does not.
- Polling fallback (open question 2 resolved): activates when the backoff index reaches the end of the ladder — i.e., after the 30 s slot has FIRED and FAILED and the hook is scheduling the NEXT retry. Cumulative SSE outage at this point is ~48 s. On entry, flip state to `polling`; call `listOperations({ limit: 50 })` on a 5 s interval; in parallel continue retrying `EventSource` every 30 s. On SSE reconnect success, drop polling.
- Dedupe by `operation.id`: snapshot rows + live transitions can overlap; last-write-wins by `id` is sufficient because the broadcaster publishes only after the store commits (spec §"Risks" + the M2-B race fix at `apps/backend/src/http_api.rs:191`), so a later live transition always reflects a fresher state than an earlier snapshot row.
- `cancelOperation(id)`: thin wrapper around the existing `cancelOperation()` in `lib/api.ts`; on 409 (`ApiError.status === 409`), swallow the error — the SSE transition is the canonical state change per checklist item 38.
- Cleanup: on hook unmount, close the `EventSource` and any active polling timer / fetch `AbortController`.

#### `apps/frontend/src/features/operations/useOperationsFeed.test.ts`

bun:test + `@testing-library/react renderHook`. Mocked `EventSource` (test-local class shimmed onto `globalThis.EventSource`). Coverage:
- `snapshot` event populates the map; `transition` event updates a row in place by `id` and advances `lastEventSeq`; `resync` event triggers `listOperations` and resets `lastEventSeq` to null.
- Dedupe: snapshot + transition for the same `operation.id` resolves to ONE entry with the transition's status.
- Backoff state machine on `EventSource` error: status flips to `reconnecting`; a new `EventSource` is constructed after the documented delay (fake timers via `bun:test` time control).
- Polling fallback: after 5-step backoff reaches 30 s, status flips to `polling`; `listOperations` is called on 5 s cadence.
- Unmount cleanup: `EventSource.close()` is called; polling timer is cleared.
- Cancel 409: `cancelOperation('id')` swallows `ApiError(status=409)` without throwing.

### Touched files

- `lib/api.ts`: add `OPERATIONS_EVENTS_PATH` constant + `apiOperationsEventsUrl()` helper.
- `lib/contracts.ts`: re-export `OperationTransitionEvent` from `@contracts/OperationTransitionEvent`.
- `features/sessions/useOperationPoll.ts`: ADDITIVE only in M3-A — keep `useOperationPoll` hook export untouched (App.tsx still consumes it during M3-A/B); ADD pure `pollOperationOnce(operationId, signal)` helper for FUTURE M3-C consumers (specifically App.tsx terminal-toast detection on the user's submitted operation). It is NOT consumed by `useOperationsFeed`'s polling-fallback path — that path uses `listOperations({ limit: 50 })` per spec because the fallback is across the live tail of operations, not a single one. The previous version of this doc incorrectly stated `useOperationsFeed` consumed `pollOperationOnce`; corrected in the M3-A codex review pass (fix #4). Hook export is REMOVED in M3-C after App.tsx wiring change.
- `features/sessions/useOperationPoll.test.tsx`: add ONE test for `pollOperationOnce` (single-call semantics; AbortSignal honored). Existing tests stay green.

### Checklist coverage (M3-A)

Items **51, 52, 53** at the data layer (operations map + non-terminal-filtering selector + sort-by-submitted_at — exposed via hook return). Items **36–38** at the data slice (cancel-call helper + 409 swallow).

### Verification (from `apps/frontend/`)

- `bun run test` clean (new hook tests + existing tests green).
- `bunx tsc --noEmit` clean.
- `bun run build` clean.
- `bun run test:e2e` **SKIPPED** for M3-A (no visible surface change).
- Invariants: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l` = **24**; `grep -cE '^\s*--' apps/frontend/src/styles/tokens.css` = **83**.

### Reviewer scope hint (M3-A)

- **Backend-protection** (Claude Explore): `backend untouched` — quick. Verify `apps/backend/**` + `components/**` byte-identical; `OperationTransitionEvent.ts` generated binding not modified.
- **Normal** (Claude review): hook API surface; polling-fallback simplification preserves abort semantics; dedupe rule correctness against M2 commit-then-publish; test coverage of snapshot/transition/resync/backoff/fallback/unmount/cancel-409; ts-rs re-export consistent with siblings.
- **Codex cross-family**: EventSource lifecycle correctness — handler registration/removal, `.close()` on unmount, native `Last-Event-ID` resume with un-id'd snapshot frames, backoff timer correctness under React StrictMode double-effect, dedupe under concurrent snapshot+transition arrival. React hook discipline: stable identity of returned callbacks (`useCallback`); no stale-closure on `EventSource.onmessage` after re-render.

---

## 3. M3-B — Presentation layer

### New files

#### `apps/frontend/src/features/operations/JobCenter.tsx`

Native `<dialog>` (M1 §3.2; checklist items 9, 18, 46):
- `id="jc-dialog"`, `aria-labelledby="jc-dialog-title"`.
- Open prop pattern: `open: boolean` + `useEffect` toggling `showModal()`/`close()`. App owns open state per item 54 (no persistence).
- On open: `requestAnimationFrame(() => closeBtn.focus())` (item 20).
- Backdrop click: `onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}`. Escape is native (item 16).
- Header: `<h2 id="jc-dialog-title">Job Center</h2>` + close button.
- Body: `<div role="region" aria-live="polite" aria-labelledby="jc-dialog-title">` (item 47).
- Sections derive from props: `activeOps: Operation[]`, `recentOps: Operation[]` (items 21, 22, 23).
- Renders `<OperationCard>` for each op.
- Empty-state: whole-tray "No operations." or per-section "No active operations." / "No recent operations." (item 23).

#### `apps/frontend/src/features/operations/JobCenter.css`

- `.jc-dialog { width: 360px; height: 100dvh; inset: 0 0 0 auto; ... }` — items 10, 11.
- `dialog::backdrop { background: var(--color-backdrop); }` — item 12.
- Slide transition `transform 200ms var(--ease-standard)` — item 13.
- Section dividers, header hairline, empty-state styling — items 17, 22, 23.
- Focus rings — item 48.
- `.jc-trigger` + `.jc-trigger-count` recipes (open question 3 resolved here): the trigger lives in this file for cohesion with dialog vocabulary. `ActionBar.css` only references `.action-bar button` structural styles for outer layout.

#### `apps/frontend/src/features/operations/JobCenter.test.tsx`

bun:test + RTL coverage:
- Open/close via prop toggling.
- Focus lands on close button within one rAF tick.
- `aria-labelledby` resolves to "Job Center" h2.
- Section labels show "ACTIVE 2" / "RECENT 0" when given two active ops and no recent.
- Empty state copy (whole-tray + per-section).
- Backdrop click closes; Escape closes.
- Section divider only when both sections render (item 22).

#### `apps/frontend/src/features/operations/OperationCard.tsx`

Native `<details class="jc-card">` (item 24); summary in CSS Grid (item 25); icon, kind label, relative time (item 28), status pill (inline JSX per open question 4), bottom row.

- Kind icon `<span class="jc-icon" aria-hidden="true">{glyph}</span>` (item 27); glyph map: `import_sessions → "I"`, `rescan_sources → "R"`.
- Status pill: `<span class="jc-pill {status}" data-pulse={status === "running" ? "true" : undefined}><span class="jc-pill-dot" aria-hidden="true" />{label}</span>` (items 32, 34).
- Cancel button: rendered ONLY when status is non-terminal AND not yet `cancel_requested`; when `cancel_requested`, button is `[disabled]` with label "Cancelling…" (items 30, 36, 37).
- On click → `onCancel(op.id)`; 409 absorbed by the hook (item 38).
- Result summary `<span class="jc-summary-text" title={fullText}>{truncated}</span>` for terminal ops (items 30, 31).
- Expanded panel `<div class="jc-expand">`:
  - Always render `<dl class="jc-expand-meta">` (Submitted / Started / Finished as available) (item 44).
  - **Pinned rule (M1 reviewer caveat #3 + null-payload rule):** render `<pre>{prettyJson}</pre>` ONLY when the relevant JSON column (`result_json` for `succeeded`, `error_json` for `failed`, either for `cancelled` / `interrupted`) is non-null. Skip the `<pre>` block entirely when both are null. This applies uniformly to all 4 terminal statuses per M1 §3.7 — `cancelled` and `interrupted` get the same `<dl>` + `<pre>?` shape as `succeeded` / `failed`.
  - For active ops (`queued`, `running`, `cancel_requested`), render the `<dl>` with Submitted timestamp only.

#### `apps/frontend/src/features/operations/OperationCard.css`

Pill recipe matrix (M1 §3.6, items 2, 32, 33, 34, 35): seven `.jc-pill.<status>` recipes using `color-mix()` against tokens (`--color-accent`, `--color-warn`, `--color-success`, `--color-error`, `--color-text-muted`, `--color-border-strong`, `--color-surface`, `--color-surface-raised`). Border styles vary (dotted/solid/dashed); dot shapes vary (hollow ring, filled, filled square, hollow square).

- Cancel button recipe — same 75% text / 35% border / 8% hover-fill `color-mix()` shape as the pill family (item 3).
- Pulsing-dot keyframes scoped to `.jc-pill[data-pulse="true"] .jc-pill-dot` with `animation: jc-pulse var(--motion-pulse) ease-in-out infinite`.
- Pill status transition: `transition: background-color var(--motion-base) var(--ease-out), border-color var(--motion-base) var(--ease-out), color var(--motion-base) var(--ease-out)` (item 35).
- Disclosure marker hidden: `list-style: none; ::-webkit-details-marker { display: none }` (item 26).
- Bottom row `border-block-start: 1px dashed var(--color-border)` (item 29).
- Expanded panel hairline against `--color-surface-raised` (item 43).

#### `apps/frontend/src/features/operations/OperationCard.test.tsx`

bun:test + RTL coverage:
- All 7 status variants render with expected `.jc-pill.<status>` class.
- `data-pulse="true"` only on `running` (item 34).
- Active ops render `<button class="jc-cancel">`; terminal ops render `<span class="jc-summary-text">` (item 30).
- Click on cancel calls `onCancel(op.id)` once (items 36, 39).
- `cancel_requested` → button `[disabled]` with text "Cancelling…" (item 37).
- Expanded panel: `<dl>` renders for all statuses; `<pre>` renders only when relevant JSON is non-null; for `cancelled` / `interrupted` with null payload, `<pre>` is ABSENT.
- Summary text truncates: full text in `title=` (item 31).
- Pretty JSON: 2-space indent for `result_json` (succeeded) and `error_json` (failed) (item 42).

### Touched files (M3-B)

None — purely additive.

### Checklist coverage (M3-B)

Bulk of items **9–35, 39–48** + item **49** (`python3 wcag.py exit 0`).

### Verification (M3-B)

- `bun run test` clean.
- `bunx tsc --noEmit` clean.
- `bun run build` clean.
- `bun run test:e2e` **SKIPPED** for M3-B (components not yet wired into App).
- `cd working/phase-9b/designs/m1-job-center && python3 wcag.py` → exit 0 (item **49**).
- Invariants 24 / 83.
- `grep -E "jc-pill\.(queued|running|cancel_requested|succeeded|failed|cancelled|interrupted)" apps/frontend/src/features/operations/OperationCard.css` → exactly 7 matches (item 33).

### Reviewer scope hint (M3-B)

- **Backend-protection**: quick — verify backend + components + `lib/contracts.ts` byte-identical from M3-A.
- **Normal**: 54-item checklist conformance line-by-line; pill recipe matrix matches §3.6; M1-reviewer caveat #3 (uniform expanded panel) applied with the null-payload skip rule; native `<details>` discipline (no JS-driven open/close, item 24); React focus management correct (item 46 — `showModal()` does the trap free).
- **Codex cross-family**: native `<dialog>` lifecycle (mount → showModal → close paths × 3); React StrictMode double-mount safety on `requestAnimationFrame` focus; `<details>` SSR/hydration with state-driven `[open]`; pill `data-pulse` toggling without re-mounting the dot element (CSS animation preservation); `color-mix()` browser support sanity.

---

## 4. M3-C — Integration + close

### Touched files

#### `apps/frontend/src/components/ActionBar.tsx`

- Remove props: `runningOperationCount`, `lastOperationSummary`, `operationSummaryRefreshing`, `onRefreshOperations`, `showManualRefresh`.
- Add props: `onOpenJobCenter`, `runningCount`, `jobCenterOpen`.
- Replace `<span className="action-bar-operation-badge">` block with:

  ```tsx
  <button
    type="button"
    className="jc-trigger"
    aria-haspopup="dialog"
    aria-controls="jc-dialog"
    aria-expanded={jobCenterOpen}
    onClick={onOpenJobCenter}
  >
    Job Center
    <span
      className="jc-trigger-count"
      data-count={runningCount}
      aria-label={`${runningCount} running`}
    >
      {runningCount > 9 ? "9+" : String(runningCount)}
    </span>
  </button>
  ```
  (items 4, 5, 6, 7)

- Remove the `lastOperationSummary !== null ? <span className="action-bar-operation-pill"...>` block entirely (item 8).
- Remove the `showManualRefresh` refresh button (no fixed cadence — M1 design §2).

#### `apps/frontend/src/components/ActionBar.css`

- Delete the `.action-bar-operation-pill.success` / `.error` / `.neutral` recipes and the bare `.action-bar-operation-pill` shape. They're no longer reachable from the rendered tree after item 8 enforces removal. Deletion preserves 24/83 invariants (no tokens/hex in those recipes).
- Delete `.action-bar-operation-badge` (no longer that selector).
- Delete `.action-bar-refresh` recipe.
- Add a top-of-file comment referencing the M1 design `working/phase-9b/designs/m1-job-center/design.md §10.1 item 2` as the canonical home of the AA-compliant `color-mix()` recipe that the new `.jc-pill` family inherits.

#### `apps/frontend/src/App.tsx`

- Remove `useOperationPoll`, `OperationSummarySnapshot`, `operationSummary`, `operationSummaryRefreshing`, `refreshOperationsSummary`, `handleRefreshOperations` block:
  - Drop import line 87 reference to `useOperationPoll`, `LastOperationSummary`.
  - Drop `[operationSummary, setOperationSummary]` state + the `refreshOperationsSummary` effect.
  - Drop the `pollOperation(submittedOperationId)` calls in `handleRescan` / `handleImport`.
- Add `const feed = useOperationsFeed();` at App-level.
- Add `const [jobCenterOpen, setJobCenterOpen] = useState(false);` per item 54 (default closed; no persistence).
- Derive `runningCount = useMemo(() => Object.values(feed.operations).filter(o => !isOperationTerminal(o.status)).length, [feed.operations])` (item 52).
- Pass `runningCount`, `jobCenterOpen`, `onOpenJobCenter: () => setJobCenterOpen(true)` to ActionBar.
- Render `<JobCenter open={jobCenterOpen} onClose={() => setJobCenterOpen(false)} activeOps={...} recentOps={...slice(0, 50)} onCancel={feed.cancelOperation} />` as sibling to `<main>`.
- Active/Recent derivation (items 51, 53): sort `Object.values(feed.operations)` by `submitted_at DESC`; partition non-terminal (Active) + terminal (Recent.slice(0, 50)).
- Toast-on-terminal: `useEffect(() => { const op = feed.operations[submittedOperationId]; if (op && isOperationTerminal(op.status)) pushToast(...); }, [feed.operations, submittedOperationId])`.

#### `apps/frontend/src/features/sessions/useOperationPoll.ts`

- Remove the React `useOperationPoll` hook export (no longer consumed by App.tsx after wiring change).
- Keep pure helpers: `OPERATION_POLL_*` constants, `nextOperationPollDelay`, `isOperationTerminal`, `pollOperationOnce` (consumed by `useOperationsFeed` fallback and App.tsx terminal-toast).

#### `apps/frontend/src/features/sessions/useOperationPoll.test.tsx`

- Drop the two `useOperationPoll`-hook tests; keep `nextOperationPollDelay` + `isOperationTerminal` + `pollOperationOnce` unit tests.

#### `apps/frontend/src/App.test.tsx`

- Sweep test sites that mount `<ActionBar />` with the removed prop names. Update to mount with the new `onOpenJobCenter` / `runningCount` / `jobCenterOpen` props. Wire a mocked `useOperationsFeed` (or supply controlled `operations` via prop drilling).

#### `apps/frontend/e2e/inspection.spec.ts`

Replace `.action-bar-operation-badge` / `.action-bar-operation-pill` assertions (lines 119–122, 208–211) with:
- After Import click: `await expect(page.locator(".jc-trigger")).toBeVisible()`; count chip text reflects "1" then disappears as the op terminates via SSE.
- Click the trigger; `await expect(page.locator("dialog#jc-dialog")).toBeVisible()`.
- Assert ≥1 `<details class="jc-card">` is present; card carries `.jc-pill.succeeded` after operation terminates (SSE-driven UI transition).
- Close dialog with Escape.
- Add ONE cancel-flow assertion: fresh rescan → open Job Center → click `.jc-cancel` on running card → assert pill transitions to `.jc-pill.cancel_requested` then `.jc-pill.cancelled` (items 36, 37, 39). If 409 race, assert `.jc-pill.succeeded` without exception (item 38).

### 6-surface doc sweep

- `docs/README.md`: task table gains "Add a new operation kind" + "Modify Job Center UI" rows.
- `docs/features/inspection-surface.md`: add Job Center surface description (trigger + tray + per-op card). Reference M1 design artifact for visual rules.
- `docs/features/operations.md` (**NEW**): full feature doc — lifecycle, status taxonomy, idempotency, cancellation, SSE channel (snapshot/transition/resync + `Last-Event-ID`), polling fallback, dispatcher trait, kinds registry. Cite `components/ui-api-contracts/src/lib.rs::OperationTransitionEvent`, `apps/backend/src/http_api.rs::operations_events`, `components/operations/src/sse.rs::OperationsBroadcaster`.
- `docs/playbooks/modify-backend-api.md`: append "Add a new operation kind" recipe — implement `OperationHandler` in `components/operations/src/kinds/<new_kind>.rs`, register in `apps/backend/src/app.rs`, ts-rs bindings for params + result, optional HTTP submission route in `apps/backend/src/http_api.rs`.
- `docs/playbooks/modify-frontend-page.md`: append Job Center extension pattern — per-kind cancel-confirmation, kind-specific result rendering (the §7.3 Phase 8 upgrade slot for `<pre>` → bespoke JSON inspector lives HERE).
- `docs/dev-commands.md`: SSE-debugging note: `curl -N -H 'Accept: text/event-stream' http://127.0.0.1:4000/api/v1/operations/events` (+ `-H 'Last-Event-ID: <seq>'` for replay).

### Checklist coverage (M3-C)

Items **4–8** (trigger button + pill removal), **50** (keyboard reachability via e2e tab-order), **54** (default-closed, no persistence). Items **1–3** re-verified by invariant counts. Item **49** re-run as regression check.

### Verification (M3-C)

- `bun run test` clean — including swept App.test.tsx + reduced useOperationPoll.test.tsx.
- `bunx tsc --noEmit` clean.
- `bun run build` clean.
- `bun run test:e2e` — extended `inspection.spec.ts` passes; Job Center open/close + post-import SSE transition + cancel-flow.
- `cd working/phase-9b/designs/m1-job-center && python3 wcag.py` → exit 0 again (regression check after ActionBar.css delta).
- Invariants 24 / 83.
- Doc sanity: `docs/features/operations.md` exists; `docs/README.md` references it; `docs/dev-commands.md` mentions `GET /api/v1/operations/events`.

### Reviewer scope hint (M3-C)

- **Backend-protection**: quick — verify `apps/backend/**` + `components/**` byte-identical. Confirm `docs/features/operations.md` accurately describes the M2 wire shape (cross-check against `apps/backend/src/http_api.rs::operations_events` + `components/operations/src/sse.rs`).
- **Normal**: items 4–8 verification on ActionBar; `.action-bar-operation-pill` absent from any rendered tree (grep ActionBar.tsx for the literal); React idioms in App.tsx (memo stability, toast effect non-looping); e2e extension asserts new shape only (no 9a-era classes); 6-surface doc sweep covers every surface in spec §Documentation; new `docs/features/operations.md` non-empty + accurate.
- **Codex cross-family**: SSE-driven toast `useEffect` does not double-fire under StrictMode; cancel-button race (worker completes mid-click → 409) handled correctly; e2e assertions use Playwright `toHaveClass` / `toBeVisible` with explicit timeouts (no `sleep`); `EventSource` cleanup on tab navigation.

---

## 5. Three-reviewer rule expectation per chunk

| Chunk | Reviewers | Combine with doc sweep? |
|---|---|---|
| M3-A | Backend-protection (quick) + Normal + Codex — one pass | n/a (no docs) |
| M3-B | Backend-protection (quick) + Normal (checklist) + Codex (dialog/details lifecycle) — one pass | n/a (no docs) |
| M3-C | Backend-protection (quick) + Normal (checklist + docs) + Codex (race conditions + e2e robustness + docs accuracy) — **one combined pass** | **Yes, combined** |

---

## 6. Critical files for implementation

By chunk:

- `apps/frontend/src/features/operations/useOperationsFeed.ts` (NEW; M3-A) — data-layer keystone.
- `apps/frontend/src/features/operations/JobCenter.tsx` (NEW; M3-B) — dialog + sections.
- `apps/frontend/src/features/operations/OperationCard.tsx` (NEW; M3-B) — per-op card, ~30 checklist items.
- `apps/frontend/src/components/ActionBar.tsx` (M3-C) — badge→trigger cutover, pill removal.
- `apps/frontend/src/App.tsx` (M3-C) — integration site; subscribes to feed; renders JobCenter.

Bonus load-bearing references:
- `working/phase-9b/designs/m1-job-center/design.md` — literal acceptance contract for every checklist line.
- `working/phase-9b/designs/m1-job-center/wcag.py` — AA gate for M3-B/C.

---

## 7. Pinned implementation rules (developer must follow)

1. **Uniform expanded-panel rule** (M1 reviewer caveat #3 + null-payload):
   - `<dl class="jc-expand-meta">` renders for ALL statuses (Submitted / Started / Finished as available).
   - `<pre>{prettyJson}</pre>` renders ONLY when the relevant JSON column is non-null. For `cancelled` / `interrupted` with null payload, `<pre>` is ABSENT.
   - Rule applies uniformly to all 4 terminal statuses per M1 §3.7.

2. **Polling-fallback trigger threshold**: trigger after the 5-step SSE backoff (1+2+5+10+30 s) has reached its terminal 30 s slot. Retry SSE every 30 s in parallel with 5 s polling cadence; on SSE reconnect, drop polling.

3. **No visible connection-status indicator in 9b**. Hook returns the status string; UI does not surface it. Future Phase 10+ may add one with a design amendment.

4. **CSS home for `.jc-trigger` + `.jc-trigger-count`**: `JobCenter.css`.

5. **Status pill as inline JSX** in `OperationCard.tsx`. Not a standalone module.

6. **ActionBar prop API breakage** in M3-C: removes `runningOperationCount`, `lastOperationSummary`, `operationSummaryRefreshing`, `onRefreshOperations`, `showManualRefresh`; adds `onOpenJobCenter`, `runningCount`, `jobCenterOpen`. Sweep `App.test.tsx` (and any other ActionBar test sites) in the same chunk.

7. **`useOperationPoll.ts` lifecycle**:
   - M3-A: keep hook export intact; ADD `pollOperationOnce` pure helper FOR FUTURE M3-C CONSUMERS (App.tsx terminal-toast detection for the single user-submitted operation). It is NOT consumed by `useOperationsFeed`'s fallback path; that path uses `listOperations({ limit: 50 })` per spec — polling there scans the live tail, not a single op. The plan's earlier wording that conflated the two was corrected in the M3-A codex review pass (fix #4).
   - M3-C: REMOVE hook export after App.tsx wiring change; App.tsx and any other consumer use `pollOperationOnce` directly.

8. **24 / 83 invariants** must be preserved across all three chunks. ZERO new hex literals. ZERO new tokens. Any deviation requires a documented amendment per Phase 5 pattern with WCAG-justified contrast measurements.

9. **Bun-first tooling**. No Node/npm. No new frontend runtime deps. EventSource is native.

---

## 8. Open questions — resolved by coordinator

1. **`useOperationsFeed.ts` location** → `apps/frontend/src/features/operations/` (released-paths set).
2. **`JobCenter` as separate file** → YES, in `features/operations/JobCenter.tsx`.
3. **Status pill** → inline JSX in `OperationCard.tsx`. No standalone module in 9b.
4. **Connection-status indicator** → NOT shipped in 9b. Hook exposes status; no visible badge.
5. **Polling-fallback trigger** → after 5-step SSE backoff reaches terminal 30 s slot; retry SSE every 30 s in parallel with 5 s polling cadence.
6. **`.jc-trigger` CSS home** → `JobCenter.css`.
7. **`python3 wcag.py` re-run cadence** → M3-B (first CSS chunk; mandatory). M3-C (regression after ActionBar.css delta; mandatory).

## 9. Ambiguities flagged + resolved

- **Brief references to M1 §3.8 connection-status / §6.5 polling-fallback** were incorrect. M1 §3.8 is "Backdrop, empty state"; M1 has no §6.5. The spec §"Client side" carries the canonical policy. Resolved: no visible connection-status in 9b; polling-fallback trigger per resolution #5 above.
- **`<pre>` content for null-payload terminal statuses**: skip `<pre>` when both `result_json` and `error_json` are null. Always render `<dl>`. (Pinned rule #1 above.)
- **`useOperationPoll.test.tsx` comment** at line 18 ("follows the M3 cadence") originates in 9a M3 (polling cadence). Optionally update to "polling-fallback cadence" in M3-C for clarity; assertion content unchanged.
- **Codex caught (M3-A round 1)**: the original plan §2 incorrectly stated 'native API attaches Last-Event-ID automatically' on manual reconnect. Replaced with the query-param fallback design (Option A). Backend now accepts `?last_event_id=N` as fallback for the header; header still wins when both are present. Frontend builds the URL with the query param on every manual reconnect that has a non-null `lastEventSeq`. This is a small additive backend change to `apps/backend/src/http_api.rs::operations_events`, authorized by the released-paths set for Phase 9b.

---

## 10. Dispatch order

1. **M3-A** dispatches first. Three reviewers; close on three approvals. Codex cross-family is mandatory.
2. **M3-B** dispatches after M3-A close. Three reviewers; close on three approvals. Owner of `python3 wcag.py` first run.
3. **M3-C** dispatches after M3-B close. Three reviewers; close on three approvals. 6-surface doc sweep + invariant re-verification + e2e extension.

Coordinator will consult Codex (`codex exec`) frequently — per the user's standing instruction — for any non-trivial design question that surfaces during developer dispatch. Particularly: EventSource lifecycle correctness in M3-A; native `<dialog>` SSR/StrictMode in M3-B; the App.tsx wiring shape + e2e robustness in M3-C.
