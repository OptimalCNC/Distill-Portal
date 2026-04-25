# Phase 4 Progress

## Source-of-Truth Reference

- Implementation spec: `working/phase-4.md` (untracked at session start, 2026-04-25; will be frozen via Chunk A as the first delivery once the human approves)
- Coordinator operating prompt: `coordinator-prompt.md`
- Architecture vocabulary: `ARCHITECTURE.md`, `PRD.md`, `docs/dependency-rules.md`, `docs/features/inspection-surface.md`
- Prior phase logs for context: `progress/phase-3.progress.md` (Phase 3 complete — Bun + Vite + React + TS frontend now standalone, three-panel inspection surface live, Playwright e2e + 17/87 unit tests + ts-bindings drift check all green; Codex caught six legitimate blocking findings across Phase 3 that both Claude reviewers missed, so the three-reviewer rule remains non-skippable)
- Pre-Phase-4 HEAD: `a26f8fb` on `main` (2026-04-24, "Add CI workflow and consolidate contributor docs in README")
- Phase 4 source-of-truth commit: pending (Chunk A)

## Task Invocation Block (resolved)

- `task_name`: `phase-4`
- `task_spec_path`: `working/phase-4.md`
- `progress_log_path`: `progress/phase-4.progress.md`
- `protected_paths`:
  - `apps/backend/**`
  - `apps/backend/tests/**`
  - `components/collector-runtime/**`
  - `components/configuration/**`
  - `components/ingest-service/**`
  - `components/observability/**`
  - `components/raw-session-store/**`
  - `components/ui-api-contracts/src/**`
  - `components/ui-api-contracts/Cargo.toml`
  - `components/ui-api-contracts/bindings/**`
  - `tests/e2e/**`
  - root `Cargo.toml`
  - root `Cargo.lock`
- `protected_exception_paths`:
  - `components/ui-api-contracts/README.md` — Milestone 6 docs sweep may revise the paragraph that currently describes how the frontend constructs `source_key` to reflect the new "import identity is always the backend-provided `SourceSessionView.session_key`; the UI must never construct or mutate that value" rule (per `working/phase-4.md` §Documentation). Edit must be documentation-only; no Rust or contract-shape change. Any other edit under this path requires a fresh human exception.
- `forbidden_scope`:
  - new backend HTTP routes, contract types, or component crates
  - any change to the Rust contract source or to the regenerated TS bindings
  - skim view, summaries, LLM calls, distill runs, analyzer output, skill-draft curation
  - search over raw session content (FTS backend work)
  - tags, notes, bookmarks, highlights, quality marks, archive, purge
  - timeline / histogram / aggregation views
  - multi-page routing
  - authentication, permissioning, credential storage
  - Tailwind / utility CSS framework, component libraries (MUI, AntD, Chakra, Radix, Mantine, shadcn), CSS-in-JS runtimes (emotion, styled-components, vanilla-extract), state managers (Zustand, Redux, Jotai), data-fetching libraries (TanStack Query, SWR), icon libraries (lucide, heroicons)
  - any `Bun → Node` shim; `npm`, `node`, `child_process`, `jest.fn()` tooling (Bun-first rule per `feedback_bun_not_node.md`)
  - speculative adoption of `@tanstack/react-virtual` or a focus-management package; both are documented escape-hatch packages per `working/phase-4.md` §Dependency Policy and may only land on documented evidence
  - WCAG full certification (only the AA contrast spot-check on token pairs is in scope per Milestone 6)
- `architecture_refs`:
  - `ARCHITECTURE.md`
  - `PRD.md`
  - `docs/dependency-rules.md`
  - `docs/features/inspection-surface.md`
- `required_verification`:
  - `cargo check --workspace`
  - `cargo test --workspace`
  - `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`
  - `bun run test` (from `apps/frontend/`; resolves to `bun test src`)
  - `bun run build` (from `apps/frontend/`)
  - `bun run test:e2e` (from `apps/frontend/`; Playwright Chromium browser e2e)
- `external_reviewer_command`: `codex exec`

## Current Snapshot

- Date: 2026-04-25
- Status: **Phase 4 bootstrapped, no chunk yet committed.** Spec authored at `working/phase-4.md` (49 KB, 1029 lines, untracked); coordinator-prompt + invocation block resolved into this log; planner subagent not yet invoked.
- Repo state inherited from Phase 3:
  - Frontend at `apps/frontend/` is Bun + Vite + React + TS only (no `.rs`, no `Cargo.toml`); inspection page renders three stacked tables (`SourceSessionsTable`, `StoredSessionsTable`, `ScanErrorsPanel`) plus `ActionBar` + `StatusBadge`; `App.tsx` orchestrates per-panel `Promise.allSettled` fetches with click-time intersection rule on the import POST.
  - Inspection-surface generated TS bindings (`components/ui-api-contracts/bindings/*.ts`) cover all 9 contract types Phase 4 needs: `SourceSessionView` (with `session_key`, `status`, `session_uid`, `stored_ingested_at`, etc.), `StoredSessionView`, `SessionSyncStatus` (`"not_stored" | "up_to_date" | "outdated" | "source_missing"`), `Tool` (`"claude_code" | "codex"`), `RescanReport`, `ImportReport`, `ImportSourceSessionsRequest`, `PersistedScanError`, `StoredSessionRecord`. No regeneration required for Phase 4 (forbidden scope).
  - Existing Bun unit suite: 17 tests / 87 expects across `App.test.tsx`, `components/StatusBadge.test.tsx`, `components/ActionBar.test.tsx` — Milestone 1 must keep these green during the token swap; Milestones 2-5 incrementally retire and replace per the spec's Testing section.
  - Existing Playwright e2e: `apps/frontend/e2e/inspection.spec.ts` drives the dual-table layout end-to-end. Per spec "Retire the parts of the existing e2e that exercise the old dual-table layout" — Milestone 2 onward must rework selectors as the unified list lands.
  - Backend, contract crate, and existing Rust e2e (`tests/e2e/tests/inspection_surface.rs`, typed-Rust-client smoke) are out of scope and protected.
  - `apps/frontend/.codex` zero-byte sentinel left over from Phase 3 Codex review invocations is still untracked (Phase 4 may add `.codex` to `apps/frontend/.gitignore` opportunistically as part of any chunk that already touches `.gitignore`).
- Tooling availability on this host (verified at session start):
  - `codex exec` available: `codex-cli 0.124.0` at `/home/huwei/.bun/bin/codex` (bumped from Phase 3's 0.122.0 → 0.123.0; no behavior delta expected)
  - `claude -p` available: `Claude Code 2.1.119` at `/home/huwei/.local/bin/claude`
  - `bun` available: `1.3.13` at `/home/huwei/.bun/bin/bun`

## Active Plan

- Chunk: **Chunk A** — commit `working/phase-4.md` + `progress/phase-4.progress.md` to `main` to freeze the source-of-truth SHA for every later reviewer to cite. Pattern carried over from Phase 3 Chunk A (`bae99d0...`). This is a docs-only commit; the three-reviewer rule does not apply (no developer claim of behavior change). Awaiting human approval to commit.
- Owner: coordinator
- Status: **awaiting human commit approval** for Chunk A.

## Remaining Milestones

- **Milestone 1: Design tokens and visual reset** — pending. Introduce `styles/tokens.css` + minimal `styles/reset.css`; rewire existing components to consume tokens without restructuring markup; `prefers-color-scheme` dark handling. DoD: no hex literal outside `tokens.css`; light/dark both render; existing e2e still green.
- **Milestone 2: Unified session list** — pending. Add `mergeSessions.ts` (pure, fully-tabulated unit tests); `SessionsView` + `SessionsTable`; `ScanErrorsCallout`. Replace dual-table layout with the unified list and drop `SourceSessionsTable` + `StoredSessionsTable`. Importability rules ship with this milestone (only `presence ∈ {source_only, both}` AND status `not_stored | outdated` rows are selectable). DoD includes per-fetch error isolation regression test and `stored_only + source_missing` fallback rendering with `sourcePathIsStale` label.
- **Milestone 3: Filters, sort, search, persistence** — pending. `SessionFilters` + `useSessionFilters` with versioned `localStorage` key (`distill-portal:inspection-filters:v1`), `prefers-color-scheme` decoder, page-reset on filter change, sort null-handling + tiebreaker chain, relative-time rendering with pinnable `now`. **Click-time intersection rule must land here, not deferred to M5** — per spec §Risks, filters alone open the F2 race window. Includes click-time-intersection regression test for the filter-only variant.
- **Milestone 4: Session detail drawer** — pending. Native `<dialog>` + `showModal()`; metadata list with absolute+relative timestamps and `source-clock` annotations; `sourcePathIsStale` "last seen source path" label; `statusConflict` badge; raw-payload preview that consumes the response via `ReadableStream` + `getReader()` + `TextDecoder` and short-circuits at **20 NDJSON lines OR 256 KB byte cap, whichever first** (calls `reader.cancel()`); `AbortController` cancelable on close before AND after the cap. Drawer focus-trap + Esc-close + backdrop-close + focus-restoration covered in BOTH happy-dom component tests AND real-Chromium Playwright. Escape-hatch focus-management package only if Playwright fails the documented reproducer.
- **Milestone 5: Pagination and sticky action bar** — pending. `Pagination` (50 / 100 / 200, default 50); sticky action bar (only when natural layout would scroll out of view); `Toast` + queue replaces `renderReport`; "last rescan from this browser X ago" caption (scoped — does not claim backend-global freshness); error-toast Retry. Click-time intersection regression test extended to the pagination-cross-page variant.
- **Milestone 6: Cleanup and documentation** — pending. Delete retired files (`SourceSessionsTable.tsx`, `StoredSessionsTable.tsx`, `ScanErrorsPanel.tsx`, `StatusBadge.tsx`, `app.css`); full docs sweep (`docs/README.md`, `docs/dependency-rules.md`, `docs/dev-commands.md`, `docs/features/inspection-surface.md`, `docs/features/session-store.md`, `docs/playbooks/modify-frontend-page.md`, `apps/frontend/README.md`, `components/ui-api-contracts/README.md`); contract-drift check still green; WCAG AA contrast check recorded for every visible foreground/background token pair in light AND dark modes; `rg` checks proving no stale dual-table references remain.

## Completed Work Log

- 2026-04-25: bootstrapped `progress/phase-4.progress.md`; resolved the Phase 4 invocation block from `working/phase-4.md`; verified tooling (`codex exec` `0.124.0`, `claude` `2.1.119`, `bun` `1.3.13`); inventoried current frontend state for planner context (5 component files, 17/87 unit tests, 1 Playwright spec, 9 generated TS contract bindings); registered milestone task tracking. No code change yet.

## Review Log

- (none — Chunk A is a docs-only source-of-truth commit; no developer claim, so the three-reviewer rule does not engage. First reviewer rounds will fire at Chunk B / Milestone 1.)

## External Reviewer Availability Log

- 2026-04-25: `codex exec` confirmed available at `codex-cli 0.124.0`. No invocations yet.

## Protected-Path Exception Log

- 2026-04-25: pre-recorded standing exception for Milestone 6 docs sweep on `components/ui-api-contracts/README.md`.
  - Approved scope: revise the paragraph that currently describes how the frontend constructs `source_key` inline. New rule per `working/phase-4.md` §Documentation: import identity is always the backend-provided `SourceSessionView.session_key`; the UI must never construct or mutate that value. React-only row identity may add a `stored:${session_uid}` fallback for `stored_only` rows; the README paragraph must distinguish these two cases.
  - NOT approved: any change under `components/ui-api-contracts/src/**`, `components/ui-api-contracts/bindings/**`, or `components/ui-api-contracts/Cargo.toml`. No new contract types. No regeneration of TS bindings. No paragraph changes outside the `source_key` description without a fresh human exception.
  - Reason: the spec explicitly assigns this README update to Phase 4 because the inline-construction rule changes (Phase 3 ended with the frontend never inventing `source_key`; Phase 4 makes that contract explicit at the README level). No code or wire-shape change is required.
  - Reviewer obligation: backend-protection reviewer must confirm any edit under `components/ui-api-contracts/` falls within the documentation-only scope above; the bindings directory diff must remain 0 lines; the contract-drift test (`cargo test -p distill-portal-ui-api-contracts --features ts-bindings`) must remain green.

## Open Risks / Open Questions

- **Codex catches Claude blind spots (precedent)** — Phase 3 Codex caught six legitimate blocking findings both Claude reviewers missed (B docs claims, D2 missing render evidence, F2 selection-leak across two rounds, G1 wrong rationale, G2 stale dev-commands paragraph, H1 stale `vite.config.ts` + Markdown references). Phase 4 must keep the three-reviewer rule non-skippable; expect multi-round cycles especially around the click-time intersection rule (M3), the streaming raw-preview byte cap (M4), and the docs sweep (M6).
- **Filter-then-select race (M3 timing)** — the spec explicitly mandates the click-time intersection filter ships in Milestone 3, not Milestone 5. The Phase 3 F2 fix proved a passive `useEffect` alone is insufficient; the click-time intersection at the import handler is required. Regression test must exercise the actual race window (Phase 3 F2 used a microtask hook on the button text-node setter; Phase 4 should repeat that pattern for the filter-only variant in M3 and the pagination variant in M5).
- **Raw-preview streaming cost (M4)** — `/api/v1/sessions/:uid/raw` has no range support; a blocking `.text()` on a tens-of-MB session would freeze the drawer. Spec mandates `ReadableStream` + `getReader()` + `TextDecoder` with short-circuit at 20 lines OR 256 KB byte cap (whichever first) via `reader.cancel()`, plus `AbortController` for both pre-cap and post-cap drawer-close. Component test must feed a >256 KB mock stream to prove the byte cap genuinely cancels the reader (not just stops parsing).
- **Native `<dialog>` focus semantics (M4)** — Chromium-only target per spec. Playwright is the real-browser gate. If Playwright assertions fail, the documented escape-hatch focus-management package may land — but only with that evidence in hand. Do not pre-empt the dependency.
- **Pagination split-selection (M5)** — pagination splits raw selection across pages but the effective selection is filter-wide. Spec mandates "Select all importable in current filter" affordance + "+K hidden by filters" caption + click-time re-derivation on retry. M5 regression test must cover the pagination-cross-page variant of the click-time intersection rule (in addition to M3's filter-only variant).
- **Documentation sweep breadth (M6)** — eight docs files cited explicitly in `working/phase-4.md` §Documentation must update in lockstep with the code. Spec mandates "Docs updates land with the chunk that introduces the change, not in a trailing pass" — each milestone commits its docs delta. M6 cleanup verifies via `rg` that no stale dual-table references survive.
- **Dark-mode contrast (M6)** — every visible foreground/background token pair must meet WCAG AA in BOTH light and dark modes; the check is recorded in this progress log at M6 close. Pre-empt by validating each token pair as it lands in M1 (defense in depth).
- **`bun run test:e2e` host environment** — Phase 3 H1 and G2 documented WSL system-lib gaps that prevented Codex sandboxes from running Playwright; coordinator must run `bun run test:e2e` locally on developer claim and capture the output verbatim, since neither Codex sandbox nor `claude -p` sandbox can be relied on for the browser e2e gate.
- **`apps/frontend/.codex` sentinel** — left over from Phase 3 Codex review invocations; still untracked. Phase 4 may add `.codex` to `apps/frontend/.gitignore` opportunistically (any chunk that already touches `.gitignore`); not a blocker on its own.

## Next Recommended Task

- **Chunk A**: commit `working/phase-4.md` + `progress/phase-4.progress.md` to `main` as the Phase 4 source-of-truth commit. Pattern from Phase 3 Chunk A. Awaiting human approval. After commit, this log records the SHA and the planner subagent fires for Milestone 1.
