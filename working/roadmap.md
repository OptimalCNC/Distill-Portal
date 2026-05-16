# Distill Portal Roadmap

The single ordered list of phases shipped, frozen, and upcoming. Authoritative for sequencing; details live in the per-phase specs under `working/phase-N.md`.

Legend: ✅ delivered · 📐 frozen spec (not yet implemented) · 🗓 planned (no spec yet).

## Delivered

### ✅ Phase 1 — Local Raw Session Store
- **Closed**: 2026-04-22 at `404661d`
- **Scope**: First runnable vertical slice. Discovers Claude Code + Codex sessions locally; previews and selectively persists raw bytes; SQLite metadata + content-addressed blob store.
- **Notable**: Established backend-owned local data directory, idempotent upsert, replace-on-sync.

### ✅ Phase 2 — Workspace Split + Developer-First Architecture
- **Closed**: 2026-04-22 at `b38310a`
- **Scope**: Pure architecture refactor. Cargo workspace with `apps/backend` + `apps/frontend` plus six component crates: `collector-runtime`, `ingest-service`, `raw-session-store`, `configuration`, `ui-api-contracts`, `observability`.
- **Notable**: No product feature change; preserved Phase 1 behavior while enabling long-term maintainability.

### ✅ Phase 3 — TS + React + Bun Frontend
- **Closed**: 2026-04-24 at `cc09eb5`
- **Scope**: Rewrote frontend in Bun + Vite + React + TypeScript. ts-rs generates contract bindings; Rust backend remains sole storage owner.
- **Notable**: Eliminated handwritten contract duplication; added Playwright browser e2e; Bun-first invariant established here.

### ✅ Phase 4 — Inspection Surface UX Refresh
- **Closed**: 2026-04-27 at `f97181d`
- **Scope**: Unified filterable session list (replacing three stacked tables); modal detail drawer with streaming raw-payload preview; design-token CSS layer; dark mode; persistent filter/sort/pagination.
- **Notable**: 24-hex + 83-token budget invariant established; click-time intersection rule (prevents rescan-driven stale-key leaks into import payloads); 256 KB / 20-line raw-preview cap.

### ✅ Phase 5 — Session Views & Master-Detail Inspection Layout
- **Closed**: 2026-05-11 at `a08ee79` (impl) + `076b119` (log)
- **Scope**: Split-pane master-detail. Compact 4-column list on the left; right-pane four-tab `SessionView` (Transcript / Skim / Raw / Metadata). Per-tool client-side parsers (Claude Code + Codex) emit a typed `Message` stream and four `SkimBlock` kinds. URL-synced selection via History API. Archive-room aesthetic.
- **Notable**: Retired modal drawer; per-tool parsers live frontend-side; `oversized_user_message` block never summarized; native `<details>` for browser-managed open state. Tests: 531 pass / 0 fail / 1752 expects.

### ✅ Phase 6 — Title Resolution Provenance
- **Closed**: 2026-05-15 at `9d1d09d` (M1 impl) + `3e9d82e` (M1 log) + `dbd31c5` (M2 impl) + `e78c2b1` (M2 log)
- **Scope**: `TitleSource` enum (`custom` / `first_user_message` / `slug` / `generated`; last reserved, never emitted) + `Option<TitleSource>` on `SourceSessionView` and `StoredSessionRecord`. Existing `title` resolution priority unchanged; provenance is purely additive. v2 SQLite migration adds nullable `title_source TEXT` to `sessions`; legacy rows surface as `None` until rescan + re-ingest. Parsers emit `(title, title_source)` from the same code path; ingest enforces `title.is_some() == title_source.is_some()` via `debug_assert_eq!`. Frontend: list-panel title cell CSS-truncates with full-text on the native HTML `title=` attribute; Metadata tab gains a terse caption row (Origin / Opening message / Path slug / Generated / Unknown).
- **Notable**: First phase to fire a documented spec-vs-code-typo exception (4 instances, all in M1); single shared `TitleSource.ts` ts-rs export serves both parser-direct and SQL-round-trip views; no new runtime deps, no new design tokens, no new hex literals — hex 24 / tokens 83 invariant preserved. Eight-doc sweep complete (3 M1 + 5 M2). Codex external reviewer hung at default `xhigh` reasoning effort during M1; switched to `medium` for the remainder of the phase — guidance carried forward for Phase 7+. Tests: 538 pass / 0 fail / 1786 expects (frontend); cargo workspace fully green.

### ✅ Phase 7a — Event Support Matrix
- **Closed**: 2026-05-16 at `4e3318b` (matrix + fixture sweep)
- **Scope**: Authored `docs/features/parser-event-support.md` — 48 observed event-variant rows across Claude Code (15) + Codex (33). Each row carries parser route, render path, status (`✅`/`🔇`/`⚠`/`🚧`/`🎨`), and a fixture link. 48 fixtures landed under `tests/fixtures/parser-events/`. Two coverage tests pin the row count + fixture count + per-row treatment assertions; 29 rows skip-marked `@unskip Phase 7b`, 2 rows skip-marked `@unskip Phase 7c`. Bidirectional `Matrix:` JSDoc anchors wired in `claude_code.ts`, `codex.ts`, and `TranscriptView.tsx`.
- **Notable**: Pure observational phase — zero parser/renderer logic changes. Codex external reviewer surfaced the live Codex corpus's `event_msg.agent_reasoning` variant that didn't exist when the script first ran (live-corpus drift); matrix rebased to 48 rows. `@unskip Phase 7b` + `@unskip Phase 7c` markers became 7b's and 7c's authoritative worklists.

### ✅ Phase 7b — Parser Correctness + Warning Taxonomy
- **Closed**: 2026-05-16 at `1376ca5` (parser audit + structured warnings + sweep)
- **Scope**: Drove every `⚠ unknown` row to `✅ supported` / `🔇 silenced` / `🚧 known-limitation`. Extended `ParseWarning` from `{ lineOrdinal, reason }` to `{ lineOrdinal, severity, category, reason, messageIndex? }`. Audited 14 Claude Code + 12 Codex warning emit sites and recorded KEEP / SILENCE / FIX decisions per site. Authored 32 byte-small reproducer fixtures under `tests/fixtures/parser-warnings/` plus a Bun real-session sweep script (`apps/frontend/scripts/parser-warning-sweep.ts`). All 29 `@unskip Phase 7b` markers lifted.
- **Notable**: Sweep ran on 408 Claude Code + 737 Codex real session files with **zero warnings** — the closing gate. External codex review was blocked by repository-evidence data-export policy; closeout proceeded on the two-Claude-reviewer evidence plus the zero-warning sweep. Tests: 636 pass / 0 fail / +97 expects over Phase 6 close.

### ✅ Phase 7c — Transcript Rendering Overhaul (UX)
- **Closed**: 2026-05-16 — M1 design + M2 render-hint layer + M3 grouping + 2 polish rounds, all reviewed at the four-reviewer rule (the new QA test-coverage role was introduced mid-phase per user request).
- **Scope**: Built the `renderHints` layer between parsers and `TranscriptView`. Added 6 RenderHint variants (`standalone`, `lifecycle`, `boundary`, `warning-only`, `group-head`, `group-member`) for pairing + grouping + warning bucketing. Lifted both `@unskip Phase 7c` markers. Drove both 🎨-deferred matrix rows (`task_started`, `task_complete`) to ✅ via a specialized `.msg-task-lifecycle` chapter-marker render. Inline warning chips render in 4 buckets (render-normally / collapse-by-default / hide-with-inspect / warning-only) routed from Phase 7b's structured warning shape. **Polish-r1** added mixed-tool grouping + empty-body suppression after user reported visible bugs in a real Codex session. **Polish-r2** added tool-batch passthrough grouping (assistant text between tool calls now joins the group) + a `group-text-member` variant + a parser-driven integration test using a 6-line synthetic real-session fixture under `tests/fixtures/render-hints/`; lowered `GROUP_THRESHOLD` from 3 to 2; constrained passthrough to `assistant` only so Codex `event_msg.error` rows stay top-level.
- **Notable**: Codex external review caught 5 real defects across the M2 + M3 + polish rounds that Claude reviewers had downgraded to nits or missed: (1) task-lifecycle vs warning-only precedence; (2) M2 vs M3 grouping ambiguity; (3) renderTopLevelHints unbounded member consumption; (4) CSS direct-child selector mismatch; (5) `system`-passthrough hiding Codex errors. User's polish-r1 pushback established the principle that synthetic-fixture tests can pass while real-session bugs persist — fixture-driven integration tests bridge that gap. Tests: 745 pass / 0 fail at close. WCAG: zero new pairs (P38-P41 reuse Phase 5 P39/P40/P41 token combos); script-execution verification carried over due to harness classifier limitations. UI/UX design gate completed (working/phase-7c/designs/: design.md, prototype.html, 12 wireframes, wcag.py).

### ✅ Phase 7d — Surface All Silenced Events (Marginalia + Echo Register)
- **Closed**: 2026-05-17 — single milestone + 3 review rounds (codex external caught 2 real bugs both Claude reviewers missed)
- **Scope**: Drove every `🔇 silenced` row to `✅ supported`. Extended `MessageKind` with a new `"metadata"` variant (Path A — amends Resolved Decision #2 of Phase 7c per explicit user approval). Re-routed 12 currently-silenced parser sites — 8 Claude Code (`agent-name`, `ai-title`, `attachment`, `custom-title`, `file-history-snapshot`, `last-prompt`, `permission-mode`, `queue-operation`) + 4 Codex (`response_item.message role=user/assistant`, `turn_context`, `event_msg.token_count`) — to emit `kind: "metadata"` Messages with a new `metaCategory` discriminator (8 values: `control / telemetry / title / attachment / agent / prompt / context / echo`). Render layer adds 3 RenderHint variants (`metadata`, `metadata-cluster-head`, `metadata-cluster-member`) + new Pass 3 `clusterMetadata` collapsing N ≥ 2 adjacent metadata hints into a native `<details>` cluster. Two new render components: `<MetadataRow>` (marginalia hairline OR `↺` echo glyph) + `<MetadataCluster>` (collapsed disclosure with summary "N metadata events"). Metadata is a delimiter in Phase 7c's tool-batch grouping pass. Matrix doc status counts: 36 supported + 12 silenced → 48 supported + 0 silenced.
- **Notable**: After Phase 7d **no rows remain silenced** — every observed event variant produces a visible transcript artifact. Codex external review caught (1) echo back-pointer pointing at the duplicate's own line instead of the canonical `event_msg.{user,agent}_message` line — fixed with `resolveEchoBackPointers` post-parse pass; (2) backward-fallback mis-association in multi-echo case (`[canonicalA, echo1, echo2, canonicalB]`) — fixed with `stoppedAtEchoBoundary` guard. Both bugs got regression tests. The new QA test-coverage reviewer role (introduced in Phase 7c polish-r2 at user request) systematically graded 33 behaviors across 4 layers (unit, parser, integration, DOM); no critical gaps. Tests: 770 pass / 0 fail / 2577 expects (+25 over Phase 7c polish-r2). Hex 24 / token 83 invariants preserved; zero new tokens (the marginalia treatment reuses `ink-muted/surface` at 7.04:1 — byte-equivalent to Phase 7c P39/P40/P41).

## Frozen (spec landed, implementation pending)

Order: `9a → 9b → 8`. 9b lands right after 9a (decided 2026-05-15). Phase 7 is fully delivered as of 2026-05-17 (7a → 7b → 7c → 7d).

### 📐 Phase 9a — Async Operations Ledger
- **Goal**: Replace synchronous Import / Rescan endpoints with persisted async operations. Eliminates the "frozen button" UX without committing to a generalized jobs queue.
- **Architecture** (locked 2026-05-16):
  - Hard cutover: `POST /import` + `POST /rescan` return `202 Accepted` + operation_id; old synchronous handlers removed.
  - New `components/operations/` Rust crate. SQLite `operations` table with DB-enforced uniqueness via `(kind, canonical_params_hash, input_version)`.
  - Polling-only in 9a (`GET /operations/:id` + `GET /operations`); SSE lands in 9b.
  - Cooperative cancellation substrate in 9a: `DELETE /operations/:id` + `cancel_requested` status + worker checkpoints. Cancel UI is 9b.
  - Persist across restarts; one-shot crash reconciliation transitions `running` → `interrupted` on boot.
  - Status taxonomy: `queued / running / cancel_requested / succeeded / failed / cancelled / interrupted`.
  - Idempotent re-submit: `succeeded` rows return existing id; `failed` / `cancelled` / `interrupted` rows allow re-submit.
- **Treat import and rescan differently**: rescan is a workspace-singleton; import is a user-triggered batch.
- **Minimal UX surface**: action-bar badge + last-completed pill backed by polling. Full Job Center is 9b.
- **Bans**: SSE, Job Center UI, DAGs, priorities, retries-as-feature, worker pools, pause/resume, distributed execution, tenancy, global event buses, standalone Jobs route, heartbeats / leases.

### 📐 Phase 9b — Job Center UX + Generalization
- **Trigger**: lands right after 9a (per user decision 2026-05-15), not deferred to Phase 10.
- **Goal**: Surface the operations ledger to users; generalize the substrate so future kinds (e.g. summarization in Phase 10+) plug in cleanly.
- **Scope**:
  - Right-anchored slide-out tray with Active + Recent sections; per-op cards with cancel button + expand-to-inspect-result.
  - SSE channel `GET /operations/events` with `Last-Event-ID` reconnect + polling fallback (via existing `GET /operations`).
  - Trait-based dispatcher: `OperationHandler` trait; existing kinds (`import_sessions`, `rescan_sources`) refactor onto it; on-disk schema unchanged.
  - ActionBar 9a-badge becomes the Job Center trigger button; 9a last-completed pill removed (info lives in tray's Recent section).
- **UI/UX design gate**: yes — design loop produces `working/phase-9b/designs/` artifacts.
- **Defer beyond 9b**: full-history Operations route, advanced filters, batch cancel, auto-retry, per-unit progress, persisted tray open-state.

### 📐 Phase 8a — Raw View Polish (Phase 8 split into 8a + 8b on 2026-05-17)
- **Depends on**: 9b closure (the bespoke NDJSON inspector replaces both RawTab's plain-text lines AND Job Center's expanded-card pretty-JSON `<pre>` — sequencing 8a after 9a/9b keeps the inspector landing as one coherent piece).
- **Goal**: Make the Raw tab render JSONL nicely; reuse the same inspector inside the Job Center for result_json / error_json display.
- **Key directions** (locked 2026-05-16):
  - Bespoke `JsonInspector` component at `apps/frontend/src/components/JsonInspector/`. Recursive render; native `<details>` collapse; subtle syntax color via up to 4 new tokens (amended under Phase 5 amendment pattern, WCAG-AA documented).
  - Each `kind: "json"` line in RawTab → one inspector instance; `kind: "fallback"` rows keep their existing plain-text treatment.
  - Long lines default-collapsed above a byte threshold; locked at M1 design.
  - Copy button copies the ORIGINAL raw string (not the re-serialised pretty form).
- **UI/UX design gate**: yes — design loop produces `working/phase-8a/designs/` artifacts.
- **Bans**: cross-line aggregation, schema-aware formatting, inline search, diff view, virtualized mega-viewer, protocol changes to support richer rendering, per-node copy buttons, any transcript-side reuse.

### 📐 Phase 8b — Cross-tab Transcript ↔ Raw Navigation
- **Depends on**: 8a closure (raw lines are now JsonInspector cards that can be scrolled to + expanded). Also depends on Phase 7c + 7d (already delivered) — every JSONL line has a transcript surface, so the Transcript ↔ Raw round-trip is now well-defined.
- **Goal**: Wire jump affordances between the Transcript and Raw tabs. Reader can jump from any transcript message to its source raw line (and vice versa) without losing reading focus on the origin tab.
- **Key directions** (locked 2026-05-17):
  - URL-state driven: `?tab=...&focus=line:N|msg:N` is the source of truth. Reload + browser back work naturally.
  - `history.pushState` per jump — browser back returns to origin tab + scroll position.
  - Multi-message lines: Raw → Transcript jumps to the first message; highlight covers all messages from the same line.
  - No-message lines (silenced, lexer-failed, known-limitation): the Raw-side affordance does NOT switch tabs; it surfaces an in-place hint.
  - Transient highlight on arrival, respecting `prefers-reduced-motion`.
  - Up to 1 new token (highlight color) under the Phase 5 amendment pattern.
- **UI/UX design gate**: yes — design loop produces `working/phase-8b/designs/` artifacts. The spec defines REQUIREMENTS (discoverability, non-disruption, return mechanism, intuitive affordance); design loop decides visual treatment, motion, copy, keyboard shortcuts.
- **Bans**: cross-session jumps, within-tab jumps, Skim or Metadata participation, side-by-side tab mode, persistent breadcrumb history, auto-scroll-sync, annotation, backend changes, protocol changes.

## Post-roadmap (no commitment, no order)

- AI title generation (writes `title_source = generated`).
- Skim summarization (writes per-block summaries; surfaces in `agent_only` + `user_turn` expansion).
- Annotations: notes, tags, bookmarks, highlights, quality marks (PRD lines 234–235, 309–311).
- Distill / lens / skill-draft curation (PRD §4 + §5).
- Archive / Purge / tombstones / `do_not_send_to_llm` flag UI (PRD lines 405–415).
- Browse modes per PRD lines 193–198: Recent activity, Timeline, Project, Tool, Search results.

These wait until the foundations through Phase 8 settle.
