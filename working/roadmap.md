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

_(none — Phase 7 spec not yet drafted)_

## Upcoming (spec not yet drafted; agreed ordering)

Order: `7 → 9a → 9b → 8`. Locked 2026-05-15.

### 🗓 Phase 7 — Transcript Rendering Overhaul
- **Goal**: Fix parse-warning visibility (collapse-with-inspect; never silently hide) and group consecutive same-type message blocks (especially tool calls).
- **Key directions** (from codex roadmap review):
  - Introduce a `render_hint` layer between parsers and `TranscriptView` rather than baking grouping rules into raw message kinds.
  - Extend `ParseWarning { lineOrdinal, reason }` with severity / category / payload-pointer.
  - Define a 4-bucket classification matrix: `render normally / collapse-by-default / hide-with-inspect / warning-only`.
- **Bans**: Skim changes, parser rewrites for new tools, transcript-AST churn, search-within-transcript, inline diffing, message pinning.
- **Open design call**: grouped card with count badge ("12 tool calls") vs. visually-unified-but-individually-addressable rows. Decide at the UI/UX gate.

### 🗓 Phase 9a — Async Operations Ledger
- **Goal**: Replace synchronous Import / Rescan endpoints with persisted async operations. Eliminates the "frozen button" UX without committing to a generalized jobs queue.
- **Architecture** (from codex review):
  - Keep dedicated `POST /import` + `POST /rescan`; both return `202 Accepted` + operation id.
  - New `operations` table with DB-enforced uniqueness via `(kind, canonical_params, input_version)`.
  - One SSE channel for operation updates + polling fallback via `GET /operations/:id`.
  - Cooperative cancellation with checkpoints between units; `cancel_requested` status.
  - Persist across restarts; on boot, transition any `running` op to `interrupted` via heartbeat/lease.
  - Status taxonomy: `queued / running / succeeded / failed / cancel_requested / cancelled / interrupted`.
- **Treat import and rescan differently**: rescan is a workspace-singleton; import is a user-triggered batch.
- **Bans**: DAGs, priorities, retries-as-feature, worker pools, pause/resume, distributed execution, tenancy, global event buses, standalone Jobs route.

### 🗓 Phase 9b — Job Center UX + Generalization
- **Trigger**: lands right after 9a (per user decision 2026-05-15), not deferred to Phase 10.
- **Goal**: Surface the operations ledger to users; generalize the substrate so future kinds (e.g. summarization in Phase 10+) plug in cleanly.
- **Scope**:
  - Right-anchored lightweight panel: top-right badge + slide-out tray showing active + recent operations.
  - SSE-driven live progress + state transitions.
  - Generalize the `operations` ledger into a typed dispatcher accepting arbitrary kinds.
  - Shared substrate for idempotency + dedupe key handling.
- **Defer beyond 9b**: full-history Operations route, advanced filters, batch cancel.

### 🗓 Phase 8 — Raw View Polish
- **Goal**: Make the Raw tab render JSONL nicely (currently plain text per line).
- **Key directions** (from codex review):
  - Define unit of rendering as "one NDJSON line = one collapsible JSON object card; malformed lines remain plain-text rows."
  - Build a bespoke NDJSON inspector — DO NOT import a library. Per-line parse + collapse + syntax color + copy fits the repo's bundle + token + hex discipline better than a generic JSON viewer.
- **Bans**: cross-line aggregation, schema-aware formatting, inline search, diff view, virtualized mega-viewer, protocol changes.
- **Why last**: most deferrable phase. Polish on an existing escape-hatch surface; least coupled to other phases.

## Post-roadmap (no commitment, no order)

- AI title generation (writes `title_source = generated`).
- Skim summarization (writes per-block summaries; surfaces in `agent_only` + `user_turn` expansion).
- Annotations: notes, tags, bookmarks, highlights, quality marks (PRD lines 234–235, 309–311).
- Distill / lens / skill-draft curation (PRD §4 + §5).
- Archive / Purge / tombstones / `do_not_send_to_llm` flag UI (PRD lines 405–415).
- Browse modes per PRD lines 193–198: Recent activity, Timeline, Project, Tool, Search results.

These wait until the foundations through Phase 8 settle.
