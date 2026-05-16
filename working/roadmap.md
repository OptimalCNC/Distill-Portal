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

## Frozen (spec landed, implementation pending)

Order: `7a → 7b → 7c → 9a → 9b → 8`. Phase 7 split into 7a (event support matrix), 7b (parser correctness + warning taxonomy), and 7c (transcript rendering overhaul) on 2026-05-15. 9b lands right after 9a (decided 2026-05-15).

### 📐 Phase 7a — Event Support Matrix
- **Goal**: Author `docs/features/parser-event-support.md` enumerating every event variant observed in real Claude Code + Codex sessions, with its current parser route, render path, status, and fixture pointer. Wire bidirectional links between matrix rows and parser/renderer source. **Author a fixture + parser test + (where treatment is specified) render test for every matrix row.**
- **Status taxonomy** (5 values): `✅ supported` / `🔇 silenced` / `⚠ unknown` / `🚧 known-limitation` / `🎨 deferred to 7c`. Rows in `⚠ unknown` become 7b's worklist; rows in `🎨 deferred to 7c` become 7c's worklist.
- **Scope**: doc + inline `/** Matrix: ... */` JSDoc links + enumeration script + fixture/test scaffolding. Pure observational on parser/renderer logic.
- **Test scaffolding**: tests for `⚠ unknown` variants are `test.skip(...)` with `@unskip Phase 7b` markers; tests for `🎨 deferred to 7c` variants are `test.skip(...)` with `@unskip Phase 7c` markers. **`bun run test` MUST exit 0** — skipped tests are work-tracking, not failures. All pre-existing tests still pass.
- **Bidirectional links**: every matrix row links to parser + render file:line; every parser switch arm + TranscriptView case branch carries an inline `Matrix:` anchor. Drift detectable via grep.
- **Bans**: parser logic changes, renderer logic changes, `ParseWarning` shape changes, backend touch, new tools.

### 📐 Phase 7b — Parser Correctness + Warning Taxonomy
- **Depends on**: 7a closure (the matrix is the authoritative work list).
- **Goal**: Drive every `⚠ unknown` matrix row to one of `✅ supported`, `🔇 silenced`, or `🚧 known-limitation`. Extend `ParseWarning` with severity + category + message-pointer. Drive warning emission to **zero** on current sessions. **Lift every `@unskip Phase 7b` marker** authored in 7a — each marker corresponds to a parser variant that needs fixing.
- **Hard gate**: no current real session produces a parser warning before the phase closes. Noise-only warnings (e.g. "Skipping Claude-meta type 'X'") are removed; legitimate edge cases get parser fixes; truly anomalous data emits a structured warning whose shape 7c can render inline.
- **Scope** (purely the data layer, no UI changes):
  - Audit `apps/frontend/src/features/sessions/parsers/{claude_code,codex}.ts` warning emit sites (~14 + ~12 today). Each gets a KEEP / SILENCE / FIX decision recorded both in the progress log AND in the matrix row.
  - Extend `ParseWarning` from `{ lineOrdinal, reason }` to `{ lineOrdinal, severity, category, reason, messageIndex? }`. Backwards-compatible at the consumer boundary; the existing banner keeps rendering.
  - Reproducer fixture per surviving warning kind under `tests/fixtures/parser-warnings/`.
  - Real-session sweep: a Bun script that walks the user's local Claude Code + Codex session directories, runs the parsers, and reports per-kind warning counts. The phase closes when the counts are zero.
- **Bans**: any UI change, any rendering work, any `TranscriptView` edit, any Skim change, any backend touch. Pure parser + types + tests.

### 📐 Phase 7c — Transcript Rendering Overhaul (UX)
- **Depends on**: 7b closure (structured warning shape + zero-warning state).
- **Goal**: Drive every `🎨 deferred to 7c` matrix row to `✅ supported`. Fix parse-warning visibility (loud session banner + new inline per-message surface) and group consecutive same-kind message blocks for easier skimming. **Lift every `@unskip Phase 7c` marker** authored in 7a — each marker corresponds to a render variant that needs proper treatment.
- **Grouping shape** (locked 2026-05-15):
  - Pair each `tool_use` with its matching `tool_result` into a "tool call lifecycle" card.
  - Group consecutive lifecycles of the same tool into a single grouped card with count badge ("12 tool calls"); expand to inspect each call + its result individually.
- **Warning UI** (locked 2026-05-15): keep the loud session-level banner (warnings stay visible until the platform stabilises), AND surface per-message inline warnings via the `render_hint` layer.
- **Key directions** (from codex roadmap review):
  - Introduce a `render_hint` layer between parsers and `TranscriptView` rather than baking grouping rules into raw message kinds.
  - Apply a 4-bucket classification matrix: `render normally / collapse-by-default / hide-with-inspect / warning-only`.
- **UI/UX design gate**: yes — design loop produces `working/phase-7c/designs/` artifacts (design.md / prototype.html / wireframes / WCAG) before implementation.
- **Bans**: Skim changes, parser rewrites for new tools, transcript-AST churn, search-within-transcript, inline diffing, message pinning, virtualisation (escape-hatch dep already reserved in Phase 5 but only fires per its documented Chromium reproducer).

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

### 📐 Phase 8 — Raw View Polish
- **Depends on**: 9b closure (the bespoke NDJSON inspector replaces both RawTab's plain-text lines AND Job Center's expanded-card pretty-JSON `<pre>` — sequencing 8 after 9a/9b keeps the inspector landing as one coherent piece).
- **Goal**: Make the Raw tab render JSONL nicely; reuse the same inspector inside the Job Center for result_json / error_json display.
- **Key directions** (locked 2026-05-16):
  - Bespoke `JsonInspector` component at `apps/frontend/src/components/JsonInspector/`. Recursive render; native `<details>` collapse; subtle syntax color via up to 4 new tokens (amended under Phase 5 amendment pattern, WCAG-AA documented).
  - Each `kind: "json"` line in RawTab → one inspector instance; `kind: "fallback"` rows keep their existing plain-text treatment.
  - Long lines default-collapsed above a byte threshold; locked at M1 design.
  - Copy button copies the ORIGINAL raw string (not the re-serialised pretty form).
- **UI/UX design gate**: yes — design loop produces `working/phase-8/designs/` artifacts.
- **Bans**: cross-line aggregation, schema-aware formatting, inline search, diff view, virtualized mega-viewer, protocol changes to support richer rendering, per-node copy buttons, any transcript-side reuse.

## Post-roadmap (no commitment, no order)

- AI title generation (writes `title_source = generated`).
- Skim summarization (writes per-block summaries; surfaces in `agent_only` + `user_turn` expansion).
- Annotations: notes, tags, bookmarks, highlights, quality marks (PRD lines 234–235, 309–311).
- Distill / lens / skill-draft curation (PRD §4 + §5).
- Archive / Purge / tombstones / `do_not_send_to_llm` flag UI (PRD lines 405–415).
- Browse modes per PRD lines 193–198: Recent activity, Timeline, Project, Tool, Search results.

These wait until the foundations through Phase 8 settle.
