# Phase 5 Progress

## Source-of-Truth Reference

- Implementation spec: `working/phase-5.md` (refined and re-frozen at `05467ad` on `main`, 2026-04-28; supersedes the original Chunk A spec at `bce56c0`)
- Coordinator operating prompt: `coordinator-prompt.md`
- Architecture vocabulary: `ARCHITECTURE.md`, `PRD.md`, `docs/dependency-rules.md`, `docs/features/inspection-surface.md`, `docs/features/session-view.md` (created in M5)
- Prior phase logs for context: `progress/phase-4.progress.md` (Phase 4 complete — six milestones shipped; final Codex catch density: every M1–M6 chunk needed at least one Codex-driven fix-up round; M6 needed three rounds; final unit tests 231/891; dependency budget 1 of 2 escape-hatch slots consumed via `focus-trap-react@^11`); `progress/phase-3.progress.md` (Phase 3 standalone Bun+Vite+React+TS frontend; pattern-establishing six Codex catches across the phase)
- Pre-Phase-5 HEAD: `f97181d` on `main` (2026-04-27, "Log Chunk G delivery and close Milestone 6 (Phase 4 complete)")
- Phase 5 source-of-truth commit: **`05467ad`** on `main` (2026-04-28, "Refine Phase 5 spec with Archive-room aesthetic + 5-round codex arch review"). Supersedes the original bootstrap commit `bce56c0` (2026-04-27). All M1+ chunks reference `05467ad`. The original `bce56c0` is preserved in history but no longer the freeze SHA — the refinement landed before any implementation chunk dispatched, so the freeze contract was renewed cleanly.

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
- `ui_ux_skill`: `frontend-design:frontend-design` (added to coordinator-prompt at `da64feb` — post-Chunk A; the values land in this resolved invocation block now even though the original Chunk A bootstrap predates them)
- `ui_ux_artifact_root`: `working/phase-5/designs/`

## Current Snapshot

- Date: 2026-04-28
- Status: **Phase 5 spec refinement complete (Chunk A revised).** Spec re-bootstrapped at `05467ad` after a /frontend-design pass added the Archive-room aesthetic + 5 rounds of `codex exec` architecture review. Codex final verdict: APPROVED-WITH-NITS, all nits resolved. Awaiting M1 planner dispatch.
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

- Chunk: **M1a — split-pane shell + `useSelectedSession` + structural CSS literals.**
- Owner: developer (work complete; awaiting human review and commit).
- **M1b — CLOSED 2026-04-28** at impl SHA `e8d80c5`. Active chunk: TBD (awaiting M2 planner dispatch). Approved per Chunk Approval Rule. UI/UX design loop converged in 1 round. Implementation completed in 1 round + 1 fix-up round. Three-reviewer rule converged in 2 rounds (codex caught 2 blocking findings in round 1: drawer body lookup using `filteredRows` instead of `mergedRows` would render an empty drawer when the selected row is filtered out; visible "Filters" summary text had `aria-hidden="true"` causing the `<details>` widget to have no accessible name below 1100 px. Both blockers + 1 nit resolved in fix-up; round 2 unanimous approval — both normal Claude and codex returned `approved` clean). All required_verification gates green: cargo workspace clean; ts-binding freshness 1 passed / 1 ignored; `bun run test` 278 pass / 0 fail / 1086 expects across 20 files (M1a baseline 257/994 → +21 tests / +92 expects); `bun run build` 16.85 kB CSS / 267.03 kB JS / 559ms; `bun run test:e2e` 1 passed in 3.2s. Hex isolation 24, token count 44, no new runtime deps, no protected-path edits.

- (Previous chunk M1a — closed; see below.) **(Historical M1b active-state — replaced above with the post-approval status. Original entry follows for audit trail.)** New active chunk: M1b — compact list (4 essentials + Select) + sticky list-panel footer + filter `<details>` wrap + vestigial "Open detail" button. Planner returned 2026-04-28 with single-chunk recommendation (no further split — column compression + footer relocation + filter wrap + vestigial button share the same regression-test surface; splitting produces no isolation benefit). Selection ownership stays in `App.tsx` (Resolved Decision #20 carried). Open question Q4 from planner: spec line 930 says `@media (max-width: 1100px)` for filter-strip wrap breakpoint; planner recommends `1099.98px` to match M1a's `899.98px` convention at the 900 px boundary. **Coordinator decision**: developer uses spec-verbatim `1100px` and notes the convention divergence in handoff; if codex flags it, the conversation can resolve there. UI/UX gate: **needs UI/UX work** (compact-row visual treatment, sticky footer rhythm, `<details>` chevron + active-filter-count chip, vestigial button quiet styling). Designer dispatching against `frontend-design:frontend-design` skill into `working/phase-5/designs/m1b-shell/`.

(Historical M1a status — closed 2026-04-28 at impl SHA `a59b3f6`.) UI/UX design loop converged in 2 rounds (designer + reviewer). Implementation completed in 1 round + 1 fix-up round. Three-reviewer rule converged in 2 rounds (codex caught 4 blocking findings in round 1; all four resolved in fix-up; round 2 unanimous approval). All required_verification gates green: `cargo check --workspace` ok, `cargo test --workspace` all crates green, `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` 1 passed / 1 ignored, `bun run test` 257 pass / 0 fail / 994 expects across 19 files (Phase 4 baseline 245/940 → +12 tests / +54 expects), `bun run build` 14.20 kB CSS / 265.82 kB JS / 544 ms, `bun run test:e2e` 1 passed in 3.0s. Hex isolation invariant: 24 (Phase 4 baseline preserved). Token count: 44 (Phase 4 baseline preserved). No new runtime dependencies. No protected-path edits. Next: M1b planner dispatch.

## UI/UX Design Log

- **M1b (compact list + sticky list-panel footer + filter `<details>` wrap + vestigial Open detail button)** — UI/UX gate: **needs UI/UX work.** Rationale: 4-essential row anatomy + sticky footer + filter `<details>` wrap + vestigial button (parallel to M1a's `.back-to-list` precedent). Designer invoked `frontend-design:frontend-design` skill; artifact at `working/phase-5/designs/m1b-shell/` (8 files: design.md 931 lines, prototype.html 1612 lines, motion.md 71, colors.md 87 with WCAG-AA contrast table, wireframes/{wide,narrow-with-filters-closed,narrow-with-filters-open,ready-placeholder}.txt). External design review (codex): NOT invoked (M1b extends M1a aesthetic — no new component family or token system; single Claude UI/UX reviewer sufficed). **Iteration loop**: round 1 (2026-04-28): UI/UX reviewer returned `approved` (cleaner than M1a's "approved with nits" — designer's 5 open questions all resolved by reviewer with "accept designer's choice"; no new findings). Designer questions resolved: Q1 `(refresh)` marker color = `--color-warn` (designer's choice; WCAG AA verified light 5.3:1 / 5.0:1, dark 9.2:1 / 8.7:1); Q2 marker placement = on row (spec line 526); Q3 sticky footer scrolling ancestor = page viewport (spec line 553 silent; defer pane-local scoping until M5 if needed); Q4 `display: flex !important` on ≥ 1100 px override = accept (one-line, contained); Q5 tool badge `flex-shrink: 0` = accept (title ellipsizes first; tool identity preserved). Reviewer flagged residual notes as developer hints: two stacked hairlines in footer is intentional; matchMedia listener must preserve user's intra-breakpoint manual toggle; Phase 4 click-time intersection regression tests at App.test.tsx lines 1224 / 1837 / 2028 / 2101 / 2152 are the concentrated risk surface for the implementation reviewer trio. Coordinator-level note: planner Q4 (spec `1100px` vs convention `1099.98px`) deferred to developer with spec-verbatim wording; codex may revisit. **Final verdict: `approved` (round 1)**. Iteration count: 1 round.

- **M1a (split-pane shell + URL hook + structural literals)** — UI/UX gate: **needs UI/UX work.** Rationale: introduces new split-pane `<main>` Grid layout, new right-pane `<article>` placeholder with empty/coming-soon/`session_not_found` states, signature-detail #4 (hairline gutter), signature-detail #3 (deep-link pulse animation on URL-driven mount), narrow-viewport `narrowMode` toggle + "← Back to list" affordance, global `Esc` handler with editable-control scope rule, reduced-motion zero-out rule. Spec direction is load-bearing (Archive-room aesthetic + motion budget + hairline-over-shadow).
  - **Design artifact**: `working/phase-5/designs/m1a-shell/` (8 files: `design.md` 692 → 692 lines, `prototype.html` 890 → 879 lines after revision, `colors.md` 112, `motion.md` 106, `wireframes/{wide,narrow-list,narrow-session,states}.txt`). Designer invoked the `frontend-design:frontend-design` skill via the Skill tool.
  - **External design review (codex)**: NOT invoked — M1a is a structural shell, not a new component family or token system; per coordinator-prompt §UI/UX Design Workflow, optional external design review reserved for high architectural-design risk. Single Claude UI/UX reviewer sufficed.
  - **Iteration loop**:
    - Round 1 (2026-04-28): UI/UX reviewer returned `needs changes`. One blocking finding: `var(--text-2xl)` referenced 3× in `design.md` narrative (§4.1 state matrix / §7.1 empty-pane decision / §8 acceptance checklist item 9) — `--text-2xl` is an M2 typography token (spec §Design Tokens line 894–899) that does not exist in the Phase 4 baseline `apps/frontend/src/styles/tokens.css`; following the narrative would force the developer to either introduce the M2 token early (token-discipline failure) or break acceptance checklist item 30 (token count must remain at Phase 4 baseline). The artifact's own `prototype.html` already used `--text-xl` and was internally inconsistent with the narrative. Plus two non-blocking nits: §3.2 mis-described Phase 4 `<main>` baseline ("exactly like Phase 4" was incorrect — Phase 4's `<main>` carries `padding: 0 var(--space-4)` / `margin: var(--space-6) auto var(--space-8)` / `gap: var(--space-6)`, which M1a intentionally replaces per spec line 497); and `aria-live="polite"` on the right-pane `<article>` may carry forward awkwardly into M2 once tabs land (M2 designer's concern, M1a-acceptable).
    - Designer revision: surgical changes only — replaced `var(--text-2xl)` → `var(--text-xl)` at the three design.md sites; deleted unused `--text-2xl` declaration from prototype.html `:root` and replaced with a single explanatory comment; rewrote §3.2 narrative to distinguish body gutter (preserved verbatim from Phase 4) from `<main>` recipe (replaced entirely per spec line 497). No other content touched.
    - Round 2 (2026-04-28): UI/UX reviewer returned `approved with nits`. All three round-1 required changes verified applied via grep. No new findings. Carry-over nits A and B (aria-live + aside aria-label) remain explicitly out-of-scope. No missing evidence. No required changes. Developer may proceed.
  - **Final verdict**: `approved with nits` (round 2). Iteration count: 2 rounds, well within the 3-round escalation threshold.

## Remaining Milestones

- **Milestone 1: Layout shell + URL sync + compact list** — IN PROGRESS, split into two chunks per planner 2026-04-28:
  - **M1a (in design loop)**: split-pane `<main>` CSS Grid (≥ 900 px split / < 900 px stacked + `narrowMode` toggle); `useSelectedSession.ts` hook + `?session=<rowKey>` via `replaceState` + `popstate` + `Esc` (with editable-control scope); deep-link pulse mechanism (`pendingDeepLinkPulseRowKey` + `data-deep-link` attr + 600 ms keyframe + `onAnimationEnd` cleanup + 2 s safety net); `SessionView.tsx` placeholder right-pane with empty / coming-soon / `session_not_found` states; "← Back to list" on stacked-narrow; structural literals only (NO Design Language tokens — those are M2). Phase 4 column structure + drawer flow UNCHANGED in M1a.
  - **M1b (pending after M1a)**: `SessionsTable.tsx` compressed to 4 columns + Select + `aria-current="true"` + row-click → `onSelectRow`; `<ActionBar>` + `<Pagination>` relocated to sticky list-panel footer; `<SessionFilters>` wraps in `<details>` below 1100 px; vestigial "Open detail" button in `SessionView` (removed in M2). Phase 4 click-time intersection regression tests (App.test.tsx M3 filter + M5 cross-page bulk-select + M5 pagination-cross-page) MUST pass byte-equivalent.
  - Phase 4 invariants preserved across both chunks (click-time intersection, importability rule, per-fetch error isolation, four empty states).
- **Milestone 2: Tabs primitive + SessionView shell + Metadata tab** — pending. Accessible `Tabs.tsx` (ARIA tablist/tab/tabpanel + Left/Right/Home/End nav); `SessionMetadata.tsx` extracted from `SessionDetail.tsx`'s 18-field `<dl>`; `RawTab.tsx` extracted from `RawPreviewBlock`; vestigial drawer link removed; Skim/Transcript tabs render "Coming soon".
- **Milestone 3: Per-tool parsers + buildSkim + truth tables** — pending. `parsers/types.ts`, `parsers/{claude_code,codex,buildSkim}.ts` pure/total/synchronous; `streamRawText.ts` 5 MB cap; `useParsedSession.ts` lazy fetch + per-`(rowKey,tool)` cache. Truth-table coverage: empty / one user msg / multi-turn / boundary / agent-only / oversized / malformed / tool_use+tool_result / Codex `session_meta` / embedded parent meta.
- **Milestone 4: TranscriptView** — pending. Chronological message list with per-kind rendering (user/assistant/tool_use/tool_result/system/unknown); user-vs-assistant tints via `color-mix`; collapsible long tool_result (>2 KB); truncation banner. Long-corpus measurement on 5k-message synthetic fixture decides escape-hatch slot 2 (`@tanstack/react-virtual`) fate.
- **Milestone 5: SkimView with four block kinds** — pending. `user_turn` inline + collapsible disabled-placeholder + "Expand to raw messages" affordance reusing TranscriptView scoped to ordinal range; `boundary` divider; `agent_only` / `oversized_user_message` collapsed by default; never silently summarized.
- **Milestone 6: Cleanup, retire drawer, doc sweep, WCAG, log** — pending. Delete `SessionDetail.tsx` + `Drawer.tsx` + sibling CSS/tests; 8-doc sweep; WCAG AA contrast measured for every new pair (light + dark); final progress log entry; verify all gates green + hex isolation 24.

## Completed Work Log

- 2026-04-27: bootstrapped `progress/phase-5.progress.md`; resolved the Phase 5 invocation block from `working/phase-5.md`; verified tooling (`codex exec` `0.125.0`, `claude` `2.1.119`, `bun` `1.3.13`); inventoried current frontend state (17 unit-test files / 231 tests / 891 expects post-Phase-4 close; 1 Playwright spec); registered milestone task tracking. No code change yet — Chunk A is purely the spec + log scaffold.
- 2026-04-27: Chunk A complete — committed `working/phase-5.md` + `progress/phase-5.progress.md` as `bce56c0` on `main` ("Add Phase 5 planning doc and bootstrap progress log"). This fixes the source-of-truth SHA all Phase 5 reviewers cite. Spec content is the ~700-line implementation plan covering six milestones (M1 layout shell + URL sync + compact list, M2 Tabs primitive + SessionView shell + Metadata tab, M3 per-tool parsers + buildSkim + truth tables, M4 TranscriptView, M5 SkimView with four block kinds, M6 cleanup + 8-doc sweep + WCAG). No code change. Note: `components/collector-runtime/src/adapters/codex.rs` + `tests/parsers.rs` had unrelated user/tool-driven modifications in the working tree at Chunk A time (handling forked Codex sessions); coordinator deliberately left them unstaged (protected paths + outside Phase 5 scope) and surfaced them to the human for separate disposition. Those changes were subsequently committed by the user as `422f164` ("Fix Codex forked session parsing") on 2026-04-27; not tracked further by Phase 5 bookkeeping.

- 2026-04-28: **M1a delivered** — split-pane shell + `useSelectedSession` URL hook + structural CSS literals. 7 modified frontend files + 5 new frontend files (+1473-line diff including the fix-up round). Files: `apps/frontend/src/App.tsx` (+state slices for selectedRowKey + narrowMode + pendingDeepLinkPulseRowKey + 2 s safety timer effect + Esc handler with editable-control negative scope AND positive scope (article.session-pane | tr[aria-current="true"]) + matchMedia narrow-viewport listener; Phase 4 selection ownership pattern preserved per Resolved Decision #20); `apps/frontend/src/App.test.tsx` (12 new M1a tests covering split-pane mounts / URL-on-mount / popstate / Esc scope four ways including `[contenteditable]` empty-value form / deep-link pulse click-vs-URL distinction / pulse cleanup / session_not_found timing); `apps/frontend/src/styles/global.css` (split-pane CSS Grid `minmax(300px, 380px) 1fr` ≥ 900 px, single-column < 900 px with `data-narrow-mode` visibility rules including the `back-to-list` re-enable inside the narrow-mode block per codex fix-up #1, hairline gutter `border-right: 1px solid var(--color-border)` on `.list-pane`, reduced-motion zero-out rule per spec lines 102–110); `apps/frontend/src/features/sessions/SessionsTable.{tsx,css}` (`aria-current="true"` + `data-deep-link` attributes, `onSelectRow` callback in addition to preserved `onOpenDetail`, four row variants — default / hover / selected / selected+hover — via `color-mix(in srgb, var(--color-accent) 8/4/12%, transparent)` per spec §Row visual treatment lines 533–545, `@keyframes deep-link-pulse` animating `background-color` only at 22% peak); `apps/frontend/src/features/sessions/SessionsView.tsx` (now presentational, accepts `selectedRowKey` + `onSelectRow` + `pendingDeepLinkPulseRowKey` props per Resolved Decision #20); `apps/frontend/src/features/sessions/SessionView.{tsx,css,test.tsx}` (NEW; `<article class="session-pane">` placeholder with four-state machine `data-state="empty | loading | ready-placeholder | session_not_found"` + `aria-live="polite"` + "← Back to list" button visible only on narrow-with-session-mode); `apps/frontend/src/features/sessions/useSelectedSession.{ts,test.ts}` (NEW; spec-verbatim interface lines 826–833 — `{ selectedRowKey, selectRow }`; mount-time URL read; `replaceState` on `selectRow`; `popstate` listener with no feedback loop; `buildUrl` preserves all other query params); `apps/frontend/e2e/inspection.spec.ts` step 12 (deep-link arrival via `page.goto('/?session=' + key)` asserts transient `data-deep-link="true"` within 1.5 s window plus post-pulse removal within 3 s window per codex fix-up #4 + reload preserves URL state). Phase 4 row-click → drawer flow PRESERVED (M1a row click STILL opens the existing Phase 4 `<Drawer>` AND calls new `onSelectRow`; vestigial "Open detail" button defers to M1b). Phase 4 click-time intersection regression tests (App.test.tsx M3 filter / M5 cross-page bulk-select / M5 pagination-cross-page) and the e2e step 9 focus-trap walk all pass byte-equivalent. Final gates: `cargo check --workspace` clean, `cargo test --workspace` green, `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` 1 passed / 1 ignored, `bun run test` 257/0/994 across 19 files, `bun run build` 14.20 kB CSS / 265.82 kB JS / 544 ms, `bun run test:e2e` 1 passed in 3.0s; hex count 24, token count 44, no new runtime deps, no protected-path edits. Impl committed as `a59b3f6` ("Implement Phase 5 M1a: split-pane shell + URL hook + structural literals") on `main` 2026-04-28; this log update is the follow-up second commit.

- 2026-04-28: Chunk A revised — committed `working/phase-5.md` as `05467ad` on `main` ("Refine Phase 5 spec with Archive-room aesthetic + 5-round codex arch review"). Triggered by `/frontend-design` invocation against the Chunk A spec to (a) add an intentional UI/UX direction the original spec lacked, and (b) loop `codex exec` architecture review until codex agreed. Spec delta: 664 → 1178 lines (+669 / -155), 21 → 24 top-level sections (added §Design Language, §Motion & Micro-interactions, §State handling for parsed-content tabs). Resolved Decisions count: 9 → 20. Major UI/UX additions: Archive-room aesthetic with Fraunces (self-hosted variable serif, ~80 KB) + system sans + JetBrains Mono; oklch color tokens with hex `@supports` fallback; six enumerated signature details; motion budget table with reduced-motion zero-out. Major architecture additions: `MessageKind = "boundary"`; `lineOrdinal` vs `messageIndex` split; ParserOutput / StreamMeta separation; PARSERS registry; useParsedSession in-flight coalescing + LRU(5) + cacheEpoch invalidation; lazy `visitedTabs` mounting; corrected Codex field paths (top-level `"type"`, anchor principle for response_item↔event_msg dedup); URL state coordination spelled out; default-tab progression M2=Metadata → M4=Transcript. Codex review converged across 5 rounds (round 1: 7B+8SF+3N → round 2: 5B+6SF+3N → round 3: 2B+6SF+1N → round 4: 2B+3SF+2N → round 5: APPROVED-WITH-NITS, 3 nits resolved). Codex review artifacts at `/tmp/codex-phase-5-arch-review-v{1,2,3}.md`. No code change. Original `bce56c0` is preserved in history but no longer the freeze SHA. The refinement landed BEFORE any implementation chunk dispatched, so the freeze contract was renewed cleanly without invalidating prior reviewer work.

## Review Log

### M1b — three-reviewer rule (converged 2026-04-28 in 2 rounds)

**Round 1 (initial implementation):**
- **Backend-protection (Claude subagent)**: `backend untouched`. File-by-file verification of all 14 modified frontend files + 1 new file (`SessionsView.test.tsx`) against the protected-path globs. Required Action: `proceed to normal review`.
- **Normal Claude reviewer**: `approved with nits`. 3 minor nits — design checklist item #17 literal "via `hidden` attribute" deviation (visible behavior identical), `(max-width: 1100px)` framing inversion (CSS-equivalent), `useImperativeHandle` empty-deps formulation could inline. None blocking.
- **Codex external reviewer**: `needs changes` — **2 BLOCKING findings** (verbatim stdout at `working/phase-5/codex-reviews/m1b-round-1.txt`, 13800 lines):
  1. blocking — `apps/frontend/src/features/sessions/SessionsView.tsx:224` — drawer detail lookup used `filteredRows.find(...)`. When user filters out the selected row but the right pane stays in `ready-placeholder` (because `mergedRows` still contains the row per `App.tsx:798`), clicking "Open detail" opens the drawer with no `<SessionDetail>` body — the lookup returns undefined. Real bug: violates the M1b vestigial button contract.
  2. blocking — `apps/frontend/src/features/sessions/SessionFilters.tsx:225` — visible "Filters" summary text had `aria-hidden="true"`. Below 1100 px, the `<details>` disclosure widget had no accessible name (or only "N active" when the count was nonzero). Accessibility violation.
  
  Plus 1 nit on e2e step 9(a) URL assertion weaker than its comment claimed.

**Round 2 (post fix-up):**
- **Backend-protection** (by subset analysis — fix-up file list strict subset of round-1 frontend files; no new files; no protected-path edits possible). Coordinator independently verified via `git status --short`.
- **Normal Claude reviewer**: `approved` — no findings, no missing evidence, no required changes. Both round-1 codex blockers verified resolved with file:line citations.
- **Codex external reviewer**: `approved` (verbatim stdout at `working/phase-5/codex-reviews/m1b-round-2.txt`, 4298 lines). All round-1 findings verified resolved at:
  1. Fix #1: `SessionsView.tsx:236` now `mergedRows.find((r) => r.rowKey === detailRowKey) ?? null`; new prop `mergedRows` threaded from App.tsx; new regression test at `SessionsView.test.tsx:146-237` exercises the filtered-OUT case explicitly.
  2. Fix #2: `SessionFilters.tsx:224` is now plain `<span>Filters</span>` with no `aria-hidden`; count chip `aria-hidden`-free as well so the summary's accessible name resolves to "Filters" (count 0) or "Filters N active" (count>0). Two new tests at `SessionFilters.test.tsx:451+` and `:475+` cover both paths.
  3. Fix #3: e2e step 9(a) comment now accurately describes what's asserted (URL re-assertion deferred with rationale).
  
  Codex spent 13800 + 4298 = 18098 lines of stdout on M1b. **No optional nits remain unaddressed** in round 2 — cleaner than M1a's "approved with nits".

**Convergence summary**: 2 rounds total. Codex catch density: **2 blocking findings in round 1**, **0 blocking findings in round 2**. Pattern matches Phase 4 + M1a precedent (codex catches Claude blind spots; ≥ 2 codex rounds per chunk). M1b meets the Approval Rule per `coordinator-prompt.md` §Approval Rule For A Chunk.

### M1a — three-reviewer rule (converged 2026-04-28 in 2 rounds)

**Round 1 (initial implementation):**
- **Backend-protection (Claude subagent)**: `backend untouched`. File-by-file verification of all 12 changed files (7 modified + 5 new) against the protected-path globs. No edits under `apps/backend/`, `components/`, `tests/e2e/` (the Rust e2e), or root `Cargo.{toml,lock}`. ts-binding freshness gate `ts_bindings_match_checked_in_files` passing confirms no Rust contract or regenerated TS binding drift. Required Action: `proceed to normal review`.
- **Normal Claude reviewer**: `approved with nits`. Walked the design.md §8 implementation acceptance checklist (33/33 items), confirmed Phase 4 click-time intersection regressions preserved, verified hex/token counts. Non-blocking nits: `void buildUrl;` dead-scaffold in App.tsx; legacy `addListener` matchMedia fallback (defensive); design.md §3.5 `.session-pane__header` is M2 material so positioning is functionally compliant; `docs/features/inspection-surface.md` not yet updated (intentional per spec lines 950–966 — 8-doc sweep deferred to M6).
- **Codex external reviewer (`codex exec`)**: `needs changes` — **4 BLOCKING findings** (verbatim stdout at `working/phase-5/codex-reviews/m1a-round-1.txt`, 6728 lines of trace). Findings:
  1. blocking — `apps/frontend/src/features/sessions/SessionView.css:136` — `.back-to-list` always `display: none` with no `@media` override; narrow "← Back to list" button rendered but invisible.
  2. blocking — `apps/frontend/src/App.tsx:701` — Esc handler missing positive-scope rule per spec line 567 (Esc fires only when focus is in session pane OR on a selected row).
  3. blocking — `apps/frontend/src/App.tsx:685` — `[contenteditable="true"]` selector too narrow; should be `[contenteditable]` per spec line 567 to cover boolean / empty-string / "plaintext-only" forms.
  4. blocking — `apps/frontend/e2e/inspection.spec.ts:469` — e2e step 12 asserts only stable `aria-current` post-pulse; transient `data-deep-link="true"` attribute (the actual pulse evidence) was not asserted in the e2e.
  
  Codex caught all four findings the two Claude reviewers missed — Phase 4 precedent confirmed (every Phase 4 chunk had ≥ 1 codex catch). My own dispatch brief was incomplete relative to spec line 567 on the Esc positive-scope rule; codex caught the omission.

**Round 2 (post fix-up):**
- **Backend-protection (Claude subagent)**: `backend untouched`. Independent re-verification of post-fixup file list against protected-paths; no new files in fixup, all modifications still under `apps/frontend/`. Required Action: `proceed to normal review`.
- **Normal Claude reviewer**: `approved` — no findings, no missing evidence, no required changes. All 4 round-1 codex blockers verified resolved with file:line evidence.
- **Codex external reviewer (`codex exec`)**: `approved with nits` (verbatim stdout at `working/phase-5/codex-reviews/m1a-round-2.txt`, 1459 lines of trace). All 4 round-1 blockers verified resolved with file:line citations:
  1. Fix #1 confirmed at `apps/frontend/src/styles/global.css:131-133` (the `@media (max-width: 899.98px)` block now contains `main.split-pane[data-narrow-mode="session"] .back-to-list { display: inline-block; }`); CSS smoke test at `SessionView.test.tsx:196-220` validates the override exists.
  2. Fix #2 confirmed at `App.tsx:716-729` (`isInScope` helper) + `:731-742` (handler sequences negative scope → positive scope → clear); 3 new tests at `App.test.tsx:2951+`, `:2998+`, `:3035+`.
  3. Fix #3 confirmed at `App.tsx:700-703` (selector now `[contenteditable]`); regression test at `App.test.tsx:3089-3146` injects `<div contenteditable>` (empty-string/boolean form) inside `article.session-pane` to prove the selector now catches it.
  4. Fix #4 confirmed at `apps/frontend/e2e/inspection.spec.ts:497-499` (transient `data-deep-link="true"` with 1.5 s timeout) + `:503-505` (post-pulse removal with 3 s timeout); coordinator's Chromium e2e re-run passed.
  
  Optional nits remaining (explicitly non-blocking; the developer skipped them per dispatch-brief discretion): `void buildUrl;` dead scaffold at `App.tsx:764-767`; matchMedia legacy `addListener` fallback at `App.tsx:810-824`; `docs/features/inspection-surface.md` interim stub. None required for approval.

**Convergence summary**: 2 rounds total. Codex catch density: **4 blocking findings in round 1**, **0 blocking findings in round 2**. Codex spent 7726 + 1459 = 8187 lines of total trace on M1a; the Phase 5 codex-review artifacts directory is at `working/phase-5/codex-reviews/`. M1a meets the Approval Rule per `coordinator-prompt.md` §Approval Rule For A Chunk: UI/UX reviewer `approved with nits` (round 2) on the design artifact; backend-protection `backend untouched` (round 2); normal Claude `approved` (round 2); external `approved with nits` (round 2); no unresolved blocking findings; implementation matches spec + design artifact; required_verification all green; docs deferred to M6 per spec; this log entry written.

## External Reviewer Availability Log

- 2026-04-27: `codex exec` confirmed available at `codex-cli 0.125.0`. No invocations yet at session start.
- 2026-04-28: `codex exec` invoked 2 times during M1b three-reviewer rule (round 1 + round 2). Round 1 caught 2 blocking findings the normal Claude reviewer missed (drawer lookup using `filteredRows` instead of `mergedRows`; `aria-hidden="true"` on visible Filters summary breaking `<details>` accessible-name). Round 2 returned `approved` with all fixes verified via file:line citations. Verbatim stdout stored at `working/phase-5/codex-reviews/m1b-round-{1,2}.txt`. Maintains Phase 4 + M1a precedent of codex catching ≥ 1 legitimate blocking finding per chunk.

- 2026-04-28: `codex exec` invoked 2 times during M1a three-reviewer rule (round 1 + round 2). Round 1 caught 4 blocking findings the two Claude reviewers missed (back-to-list invisible / Esc positive-scope missing / contenteditable selector too narrow / e2e missing pulse assertion). Round 2 returned `approved with nits` with all 4 fix-up resolutions verified via file:line citations. Verbatim stdout stored at `working/phase-5/codex-reviews/m1a-round-{1,2}.txt`. Maintains Phase 4 + Chunk A precedent of codex catching ≥ 1 legitimate blocking finding per chunk.

- 2026-04-28: `codex exec` invoked 5 times during Chunk A revision (`/frontend-design` flow). Round 1 (7B+8SF+3N) → Round 2 (5B+6SF+3N) → Round 3 (2B+6SF+1N) → Round 4 (2B+3SF+2N) → Round 5 (APPROVED-WITH-NITS, all nits resolved). All five reviews scoped to architecture only (aesthetics excluded by prompt). Codex caught: `useParsedSession` keying by rowKey instead of storedSessionUid (would break for source-only rows); tab panels mounting all-at-once (would prematurely trigger 5 MB fetch); Codex field paths typo (`record_type` should be `type`); `response_item.message` ↔ `event_msg.user_message` duplicate; in-flight fetch coalescing missing; `boundary` MessageKind in TranscriptView missing; `streamRawText` totalBytes missing; buildSkim accumulator state confusion; many cross-section consistency drift items. Round 4 + Round 5 hit network-related hangs requiring re-dispatch. The convergence pattern (each round caught fewer issues + smaller categories) is itself evidence that the spec is in good shape.

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

- **Two-commit landing for M1b**: per Phase 4 precedent, M1b lands as two commits: (a) the implementation (14 modified frontend files + 1 new SessionsView.test.tsx + the design artifact at `working/phase-5/designs/m1b-shell/` + the codex review artifacts at `working/phase-5/codex-reviews/m1b-round-{1,2}.txt`), then (b) the progress-log update. Awaiting human go-ahead.
- **M2 dispatch after M1b commits land**: M2 introduces the Tabs primitive + SessionView shell + Metadata tab + Raw tab extraction, plus the M2 Design Language tokens (Fraunces @font-face + oklch redefinition + motion tokens + surface treatment). M2 is the "Design Language tokens land" milestone — significantly more visible-surface change than M1b. Plan dispatching the M2 planner with the same brief structure (planner → UI/UX gate → design loop → developer → three-reviewer rule).
- **Open follow-ups deferred from M1b** (non-blocking; pick up in M6 polish or earlier if convenient):
  - count-chip `hidden` attribute literal alignment (design checklist #17 deviation; visible behavior identical)
  - `(max-width: 1100px)` framing inversion (CSS-equivalent; cosmetic)
  - `useImperativeHandle` empty-deps inlining (acceptable but tighter formulation possible)
  - design.md §3.4 HTML snippet still shows `aria-hidden="true"` on the Filters span — out of scope for M1b commit (M6 docs sweep) but worth catching.

(Historical M1a section follows below.)

- **Two-commit landing for M1a**: per Phase 4 precedent, M1a lands as two commits: (a) the implementation (12 frontend files + the design artifact + the codex-review artifacts), then (b) the progress-log update. The coordinator awaits human go-ahead before committing.
- **M1b dispatch**: after M1a commits land, dispatch the M1b planner. The planner brief was fully enumerated in the M1 planner output (file list: `SessionsTable.{tsx,test.tsx,css}` column compression + row-click → onSelectRow only + `aria-current` + `data-deep-link`; `SessionsView.{tsx,css}` sticky list-panel footer hosting the relocated `<ActionBar>` + `<Pagination>`; `SessionFilters.{tsx,test.tsx,css}` `<details>` wrap below 1100 px; `SessionView.{tsx,test.tsx}` vestigial "Open detail" button when row selected; `App.{tsx,test.tsx}` row click stops opening drawer + click-time intersection regressions still pass byte-equivalent; `e2e/inspection.spec.ts` reroutes step 9 through the vestigial button). The M1b planner just confirms the file plan against the post-M1a working tree; no new architectural decisions expected.
- **Open follow-ups deferred from M1a** (non-blocking; pick up in M6 polish or earlier if convenient):
  - `void buildUrl;` dead-scaffold removal at `App.tsx:764-767` (codex M1a round-2 nit).
  - matchMedia legacy `addListener` fallback removal at `App.tsx:810-824` (codex M1a round-2 nit; defensive but dead on Chromium target).
  - Optional interim stub in `docs/features/inspection-surface.md` (the 8-doc sweep is M6 per spec, but a one-paragraph "Phase 5 in progress" stub could land in M1b/M2 if reviewers feel the gap is too long — currently the doc still describes the Phase 4 drawer-only layout).
- **Bun-first reminder**: rule from feedback memory still applies. No `child_process`, no `jest.fn()`, no `npm`/`node`.
- **Three-reviewer rule cadence**: M1a took 2 codex rounds. Phase 4 precedent + this confirms ≥ 2 rounds is the working budget per chunk. Plan time accordingly for M1b–M6.
- **Open questions for M1 planner** (most are now resolved in spec; only one remains genuinely planner-discretion):
  - Selection ownership: RESOLVED — `App.tsx` per Resolved Decision #20.
  - Is M1 a single-shot chunk, or does the layout restructure split into M1a (CSS Grid + url sync hook + Design-Language tokens land) + M1b (column compression + row-click + vestigial drawer link)? — **planner-discretion**; the spec doesn't dictate.
  - Does M1 add the `<details>` filter wrapper for narrow viewports, or defer to a later milestone? — Spec includes `<details>` wrapping at < 1100 px in the M1 scope (§Filter bar placement); planner confirms.
  - Does M1 land the Design-Language tokens (typography, motion, surface) into `tokens.css`, or does that wait for M2? — Spec says M2 ships tokens (§Design Language → "M2 ships the @font-face rule + the fallback wiring"), so M1 only adds the structural literals listed in the M1 row of §Design Tokens. Planner confirms.
- **Bun-first reminder**: rule from feedback memory still applies. No `child_process`, no `jest.fn()`, no `npm`/`node`.
- **Three-reviewer rule**: M1 dispatch follows the standard backend-protection Claude + normal Claude + Codex external pattern per `coordinator-prompt.md`. Per-chunk Codex catches average ≥ 2 rounds (Phase 4 precedent + the Chunk A refinement's 5 rounds confirms).
