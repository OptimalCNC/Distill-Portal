# Phase 5 Progress

## Source-of-Truth Reference

- Implementation spec: `working/phase-5.md` (frozen at the Chunk A commit on `main`, 2026-04-27)
- Coordinator operating prompt: `coordinator-prompt.md`
- Architecture vocabulary: `ARCHITECTURE.md`, `PRD.md`, `docs/dependency-rules.md`, `docs/features/inspection-surface.md`, `docs/features/session-view.md` (created in M5)
- Prior phase logs for context: `progress/phase-4.progress.md` (Phase 4 complete — six milestones shipped; final Codex catch density: every M1–M6 chunk needed at least one Codex-driven fix-up round; M6 needed three rounds; final unit tests 231/891; dependency budget 1 of 2 escape-hatch slots consumed via `focus-trap-react@^11`); `progress/phase-3.progress.md` (Phase 3 standalone Bun+Vite+React+TS frontend; pattern-establishing six Codex catches across the phase)
- Pre-Phase-5 HEAD: `f97181d` on `main` (2026-04-27, "Log Chunk G delivery and close Milestone 6 (Phase 4 complete)")
- Phase 5 source-of-truth commit: TBD (Chunk A — this commit)

## Task Invocation Block (resolved)

- `task_name`: `phase-5`
- `task_spec_path`: `working/phase-5.md`
- `progress_log_path`: `progress/phase-5.progress.md`
- `protected_paths`:
  - `apps/backend/**`
  - `apps/backend/tests/**`
  - `components/collector-runtime/**`
  - `components/configuration/**`
  - `components/ingest-service/**`
  - `components/observability/**`
  - `components/raw-session-store/**`
  - `components/ui-api-contracts/**`
  - `tests/e2e/**`
  - root `Cargo.toml`
  - root `Cargo.lock`
- `protected_exception_paths`:
  - `none` — Phase 5 is frontend-only; no Rust changes; no contracts README rewrite (Phase 4 M6 already resolved the source_key paragraph).
- `forbidden_scope`:
  - new backend HTTP routes, contract types, or component crates
  - any change to the Rust contract source or to the regenerated TS bindings
  - LLM summary generation, first-run consent, provider configuration, per-tool/per-project/per-session summary opt-out
  - annotations: notes (session-level + block-level), tags, bookmarks, highlights, quality marks
  - orphaned-annotations surface
  - distill / lens / skill-draft curation
  - archive / Purge / tombstones / `do_not_send_to_llm` flag UI
  - browse-mode views per PRD lines 193–198 (Recent activity / Timeline / Project / Tool / Search results) — Phase 5 keeps the unified inspection list as the single browse mode
  - search-within-transcript inside the session view
  - multi-page routing or a router dependency (`react-router-dom` etc.)
  - Tailwind / CSS-in-JS / state managers / data libs / icon libraries
  - Bun→Node shims; `npm`, `node`, `child_process`, `jest.fn()` (Bun-first per `feedback_bun_not_node.md`)
  - speculative adoption of `@tanstack/react-virtual` — only fires if M4 measurement on a 5k-message synthetic fixture shows > 16 ms per frame on Chromium (escape-hatch slot 2 per Phase 4 §Dependency Policy carried over)
- `architecture_refs`:
  - `ARCHITECTURE.md`
  - `PRD.md`
  - `docs/dependency-rules.md`
  - `docs/features/inspection-surface.md`
  - `docs/features/session-view.md` (created in Phase 5; reference once it lands)
- `required_verification`:
  - `cargo check --workspace`
  - `cargo test --workspace`
  - `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`
  - `bun run test` (from `apps/frontend/`; resolves to `bun test src`)
  - `bun run build` (from `apps/frontend/`)
  - `bun run test:e2e` (from `apps/frontend/`; Playwright Chromium browser e2e)
- `external_reviewer_command`: `codex exec`

## Current Snapshot

- Date: 2026-04-27
- Status: **Phase 5 bootstrap (Chunk A) in progress.** Spec written + frozen at this commit's SHA; progress log seeded with task invocation block. Awaiting M1 planner dispatch.
- Repo state going into Phase 5:
  - Frontend at `apps/frontend/` is Bun + Vite + React + TS only. Phase 4 closed at `f97181d` with: unified inspection list (`SessionsTable.tsx` 8 columns), filters / sort / search / pagination + sticky action bar + toast queue, modal `<Drawer>` (native `<dialog>` + `focus-trap-react` from M4 E1) hosting `SessionDetail.tsx` (18-field metadata `<dl>` + raw-NDJSON preview block via `streamSessionRaw` + `consumeRawPreview`), 8 feature-local sibling CSS files (per-component pattern from M6 retirement of `app.css`).
  - Cascade order in `main.tsx`: `reset.css → tokens.css → global.css → feature-local sibling sheets`.
  - Hex isolation: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l` = 24 (all in `tokens.css`).
  - Bun unit suite: 231 tests / 891 expects across 17 test files (Phase 4 M6 close).
  - Playwright e2e: 1 spec (`apps/frontend/e2e/inspection.spec.ts`) — passes against real Chromium (1.9–2.6 s).
  - Backend untouched: `apps/backend/`, `components/{collector-runtime, configuration, ingest-service, observability, raw-session-store, ui-api-contracts}/` all unchanged from Phase 4 close. `cargo check --workspace` clean. Drift gate green.
  - Dependency budget for Phase 4 + Phase 5 combined: 1 of 2 escape-hatch slots consumed (`focus-trap-react@^11`); slot 2 (`@tanstack/react-virtual`) reserved + unused. Phase 5 retires the only modal — `focus-trap-react` becomes orphan-installed (kept per planner recommendation).
  - `apps/frontend/.codex` zero-byte sentinel ignored via `apps/frontend/.gitignore` since Phase 4 M6.
- Tooling availability on this host (re-verified after Phase 4 close):
  - `codex exec` available: `codex-cli 0.125.0` at `/home/huwei/.bun/bin/codex` (bumped from 0.124.0 between Phase 4 Chunks F and G)
  - `claude -p` available: `Claude Code 2.1.119` at `/home/huwei/.local/bin/claude`
  - `bun` available: `1.3.13` at `/home/huwei/.bun/bin/bun`
  - WSL Playwright system-libs (`libnspr4`, `libnss3`, etc.) installed; `bun run test:e2e` runs against real Chromium

## Active Plan

- Chunk: Chunk A (this commit) — bootstrap `working/phase-5.md` (the frozen spec) + `progress/phase-5.progress.md` (this file). Two-commit pattern: spec + log SHA update.
- Owner: coordinator.
- Status: spec + log written; commit pending; SHA-update follow-up commit pending.

## Remaining Milestones

- **Milestone 1: Layout shell + URL sync + compact list** — pending. Split-pane CSS Grid at `<main>`; `useSelectedSession` hook (`?session=<rowKey>` via History API); `SessionsTable.tsx` compressed to 4 columns + Select; row-click sets selection; `aria-current` styling; vestigial drawer link in empty session pane (removed in M2). Phase 4 invariants preserved (click-time intersection, importability rule, per-fetch error isolation).
- **Milestone 2: Tabs primitive + SessionView shell + Metadata tab** — pending. Accessible `Tabs.tsx` (ARIA tablist/tab/tabpanel + Left/Right/Home/End nav); `SessionMetadata.tsx` extracted from `SessionDetail.tsx`'s 18-field `<dl>`; `RawTab.tsx` extracted from `RawPreviewBlock`; vestigial drawer link removed; Skim/Transcript tabs render "Coming soon".
- **Milestone 3: Per-tool parsers + buildSkim + truth tables** — pending. `parsers/types.ts`, `parsers/{claude_code,codex,buildSkim}.ts` pure/total/synchronous; `streamRawText.ts` 5 MB cap; `useParsedSession.ts` lazy fetch + per-`(rowKey,tool)` cache. Truth-table coverage: empty / one user msg / multi-turn / boundary / agent-only / oversized / malformed / tool_use+tool_result / Codex `session_meta` / embedded parent meta.
- **Milestone 4: TranscriptView** — pending. Chronological message list with per-kind rendering (user/assistant/tool_use/tool_result/system/unknown); user-vs-assistant tints via `color-mix`; collapsible long tool_result (>2 KB); truncation banner. Long-corpus measurement on 5k-message synthetic fixture decides escape-hatch slot 2 (`@tanstack/react-virtual`) fate.
- **Milestone 5: SkimView with four block kinds** — pending. `user_turn` inline + collapsible disabled-placeholder + "Expand to raw messages" affordance reusing TranscriptView scoped to ordinal range; `boundary` divider; `agent_only` / `oversized_user_message` collapsed by default; never silently summarized.
- **Milestone 6: Cleanup, retire drawer, doc sweep, WCAG, log** — pending. Delete `SessionDetail.tsx` + `Drawer.tsx` + sibling CSS/tests; 8-doc sweep; WCAG AA contrast measured for every new pair (light + dark); final progress log entry; verify all gates green + hex isolation 24.

## Completed Work Log

- 2026-04-27: bootstrapped `progress/phase-5.progress.md`; resolved the Phase 5 invocation block from `working/phase-5.md`; verified tooling (`codex exec` `0.125.0`, `claude` `2.1.119`, `bun` `1.3.13`); inventoried current frontend state (17 unit-test files / 231 tests / 891 expects post-Phase-4 close; 1 Playwright spec); registered milestone task tracking. No code change yet — Chunk A is purely the spec + log scaffold.
- 2026-04-27: Chunk A complete — committed `working/phase-5.md` + `progress/phase-5.progress.md` as `<chunk-a-sha>` on `main` ("Add Phase 5 planning doc and bootstrap progress log"). This fixes the source-of-truth SHA all Phase 5 reviewers cite. Spec content is the ~700-line implementation plan covering six milestones (M1 layout shell + URL sync + compact list, M2 Tabs primitive + SessionView shell + Metadata tab, M3 per-tool parsers + buildSkim + truth tables, M4 TranscriptView, M5 SkimView with four block kinds, M6 cleanup + 8-doc sweep + WCAG). No code change.

## Review Log

(empty — populated as chunks complete the three-reviewer rule)

## External Reviewer Availability Log

- 2026-04-27: `codex exec` confirmed available at `codex-cli 0.125.0`. No invocations yet at session start.

## Protected-Path Exception Log

`none` — Phase 5 is frontend-only with no contracts-README scope (Phase 4 M6 already resolved the `source_key` paragraph rewrite). Any unanticipated protected-path need requires a fresh human exception per the coordinator-prompt rules.

## Open Risks / Open Questions

- **Codex catches Claude blind spots (precedent confirmed across every Phase 4 chunk)** — Phase 4 saw 8+ legitimate blocking findings from Codex that both Claude reviewers missed across M1–M6 (B: badge AA + header overclaim; C: sandbox-bound e2e missing-evidence; D: empty-state branch + scan-errors Retry + 3 missing tests; E1: Playwright DoD bullet 3 gap + dist hex bleed from compiled rgba; E2: network-failure test gap; F: import-error Retry stale closure + toast-queue render claim wrong + stale comment; G: toast border < 3:1 + cascade order inverted + missing 4-variant assertion + cascade docs + WCAG token + test counts). The three-reviewer rule remains non-skippable for Phase 5; expect ≥ 2 Codex rounds per chunk.
- **Long-transcript render performance (M4 risk)** — `@tanstack/react-virtual` (escape-hatch slot 2) may need to fire on a documented Chromium reproducer if M4's 5k-message synthetic-fixture measurement exceeds 16 ms per frame. If slot 2 fires, the dep budget reaches 2/2 — Phase 6+ has no further escape-hatch slots without spec amendment.
- **Per-tool message format drift** — Tool authors change shape between versions. Mitigation: `MessageKind = "unknown"` fallback + `warnings[]` stream + Raw tab as verifiability hatch. Same risk + mitigation pattern as the Rust adapters in `components/collector-runtime/src/adapters/`.
- **5 MB full-document cap may be too low** — PRD doesn't specify a corpus ceiling. Truncation banner + Raw tab cover larger sessions in v1; lift in a future configuration phase if real corpora exceed 5 MB.
- **Click-time intersection regression** — Phase 4's `App.test.tsx` regression tests (M5 cross-page bulk-select; pagination-cross-page click-time intersection) MUST still pass after the M1 layout move. Selection-ownership location (App.tsx vs SessionsView.tsx) decided by M1 planner.
- **`replaceState` vs `pushState` UX regret risk** — `replaceState` doesn't enable browser-Back navigation between sessions. Mitigation: revisit if user feedback asks; one-line History API change.
- **Drawer retirement breaks user muscle memory** — M1 ships layout AND vestigial "Open detail" drawer link; M2 removes both. Users discover the new shape via the persistent right-pane.
- **`focus-trap-react` orphan-install after M6** — keep installed per planner recommendation; cost is negligible (35 KB JS + 2 transitive deps); future modal needs may revive. Documented in `docs/dependency-rules.md` at M6.
- **Open Phase 5 questions surfaced in spec §Open Considerations**: selection ownership location (M1 planner picks); default active tab on first selection (default Skim; M5 may shift); long-corpus measurement methodology (M4 picks); whether to eventually uninstall `focus-trap-react` (revisit later).

## Next Recommended Task

- **Chunk A close + Milestone 1 planner dispatch**: after Chunk A's two commits land (impl + log SHA update), dispatch the M1 planner subagent (Plan agent) to propose 1–3 tractable chunks for Milestone 1 (layout shell + URL sync + compact list compression). The planner brief should reference this progress log's "Active Plan" + "Remaining Milestones" sections + the spec's §Milestone 1 DoD bullets, and resolve open questions like:
  - Where does `selectedRowKey` live (`App.tsx` vs `SessionsView.tsx`)?
  - Is M1 a single-shot chunk, or does the layout restructure split into M1a (CSS Grid + url sync hook) + M1b (column compression + row-click + vestigial drawer link)?
  - Does M1 add the `<details>` filter wrapper for narrow viewports, or defer to a later milestone?
- **Bun-first reminder**: rule from feedback memory still applies. No `child_process`, no `jest.fn()`, no `npm`/`node`.
