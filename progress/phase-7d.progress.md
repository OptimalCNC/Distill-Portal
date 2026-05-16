# Phase 7d Progress Log

## Source-Of-Truth Reference

- Driver: user product decision after Phase 7c shipped — *"In the current status of the project, I don't feel like having an event hidden entirely. Please design a way to render those currently silenced messages in the minimal disrupting way."*
- Design artifact: `working/phase-7d/designs/` (UI/UX approved with nits 2026-05-16).
- Architecture references: `README.md`, `ARCHITECTURE.md`, `PRD.md`, `docs/README.md`, `docs/dependency-rules.md`, `docs/dev-commands.md`, `working/phase-7c.md`, `working/phase-7c/designs/`.
- Phase 7c baseline: all 3 milestones + 2 polish rounds approved; tests pass at 745.

## Task Invocation Block (inferred)

- `task_name`: `phase-7d`
- `task_spec_path`: `working/phase-7d/designs/design.md` (the design serves as spec since this is a focused single-deliverable phase)
- `progress_log_path`: `progress/phase-7d.progress.md`
- Protected paths (lifted-with-rationale): `apps/backend/**`, `components/**`, `tests/e2e/**`, `Cargo.toml`, `Cargo.lock`, `apps/frontend/bun.lock`, `apps/frontend/package.json` runtime deps. **Phase 7d EXPLICITLY OPENS** the parser logic files (`apps/frontend/src/features/sessions/parsers/claude_code.ts`, `codex.ts`, `index.ts`) for the routing-decision changes required by Path A — only at the 12 currently-silenced sites. Parser logic for the 36 supported + non-Path-A routes stays untouched.
- Protected exceptions: parser routing for the 12 silenced events (`claude_code.ts:413-455`, `codex.ts:197-200/331-339/671-679`) — emit `kind:"metadata"` Message instead of silent-skip. No other parser logic changes.
- Forbidden scope: backend changes, new runtime dependencies, MessageKind variants beyond `"metadata"`, new tokens unless WCAG forces, motion budget violations.
- `external_reviewer_command`: `codex exec`.
- `ui_ux_skill`: `frontend-design:frontend-design`.

## Current Snapshot

- Phase 7d design loop closed at UI/UX `approved with nits`. Three user decisions captured:
  1. All 12 silenced events surface (including 2 echo rows).
  2. Cluster threshold = 2 (matches Phase 7c polish-r2 precedent).
  3. Path A: extend `MessageKind` with `"metadata"` (amends Resolved Decision #2 of Phase 7c).
- Implementation pending.

## Active Plan

- Current chunk: implementation. Developer subagent will:
  1. Extend `MessageKind` with `"metadata"` + add `metaCategory?` + `echoOf?` optional fields to `Message`.
  2. Re-route 12 silenced parser sites to emit `kind:"metadata"` Messages.
  3. Add 3 new `RenderHint` variants (`metadata`, `metadata-cluster-head`, `metadata-cluster-member`) + a new cluster-detection pass to `renderHints.ts`.
  4. Add new render components (`<MetadataRow>`, `<MetadataCluster>`) + walker integration in `TranscriptView.tsx`.
  5. CSS recipes per design.md §6.
  6. Update exhaustiveness checks across `TranscriptView.tsx`, `SkimView.tsx`, `buildSkim.ts`, `parsers/types.ts`.
  7. Update tests: parser, renderHints, TranscriptView, matrix coverage.
  8. Update matrix doc: 12 rows move from `🔇 silenced` to `✅ supported` with `metadata-hairline` / `metadata-echo` render treatments. Status counts update.
  9. Docs sweep: `docs/features/session-view.md`, `docs/features/parser-event-support.md`, `docs/playbooks/modify-frontend-page.md`.

## Remaining Chunks

- Implementation (single milestone).
- Four-reviewer rule (backend-protection + normal + QA + external codex).

## UI/UX Design Log

- Design loop:
  - Round 1: designer produced design.md / prototype.html / 10 wireframes / wcag.py. 3 open questions flagged.
  - Coordinator escalated to user → user decisions captured (above).
  - Round 2: designer revised with all 3 decisions baked in. UI/UX reviewer round-1 returned `approved with nits` (6 minor nits, none blocking).
- Final artifact: `working/phase-7d/designs/` — design.md, prototype.html, wcag.py, wcag-output.txt, 11 wireframes.
- WCAG: zero new pairs. P42 (`ink-muted/surface`) reused from Phase 7c at 7.04:1 / 7.36:1 (AA pass). Rejected `border/surface` alternative recorded for audit (P43-R).

## Completed Work Log

- 2026-05-16: Phase 7d kickoff after user product decision. Design loop run (2 rounds). User decided on duplicate-anchor surfacing, cluster threshold = 2, and Path A. UI/UX reviewer approved the revised design with nits.

## Review Log

- UI/UX design review: `approved with nits` (6 minor nits, all stylistic / implementer-pitfall clarifications; non-blocking).
- Implementation four-reviewer rule round 1:
  - Backend-protection (Claude subagent): `scope respected`. Parser edits confined to the 4 approved exception sites in `claude_code.ts` (L413-455) and `codex.ts` (3 sites). All other parser logic + protected paths empty diff.
  - Normal reviewer (Claude subagent): `approved with nits`. 5 minor nits: hairline DOM single-span vs design's 3-span (consistent throughout, not a regression); `data-meta-category` vs design's `data-category` (consistent internally); **hairline `<p>` lacks `title` tooltip per acceptance item 23 (closed in r2)**; MessageKind declaration order cosmetic; stale unknown JSDoc comment in MessageRow.
  - QA test-coverage reviewer (Claude subagent): `approved`. 4 cosmetic gaps remain (78-char truncation untested at boundary, boundary-as-cluster-reset untested specifically, echoOf-in-cluster-body untested, walker-skip transitive only). Critical: none. The polish-r1 lesson — synthetic tests passing while real-session bugs persist — is comprehensively addressed by 4 complementary integration surfaces (parser matrix, DOM matrix, end-to-end real fixture, parser→renderHints integration test).
  - External codex reviewer (`codex exec --model gpt-5.2 --reasoning-effort medium`): `needs changes`. Real bug all 3 Claude reviewers missed: **Echo back-pointer is wrong by construction** — `codex.ts` emits `echoOf.lineOrdinal = duplicate's own line`, but the UI tooltip claims it's a duplicate of the canonical `event_msg.{user,agent}_message` "at line N". Recommended a post-parse resolution pass to point at the canonical's actual line.
- Implementation four-reviewer rule round 2:
  - Coordinator fix applied: added `resolveEchoBackPointers(messages)` post-parse pass in `codex.ts`. Forward search for nearest matching canonical (`kind === canonicalKind`), with backward fallback. Also closed normal-reviewer Nit 3: added `raw: string` field to `MetadataHint` + `title={hint.raw}` on hairline rows.
  - External codex round 2: `needs changes`. New finding: **Backward fallback can mis-associate across an "echo boundary"** — in `[canonicalA, echo1, echo2, canonicalB]`, echo1's forward search stops at echo2's boundary, then backward-falls-back to canonicalA (wrong). Recommended: suppress the backward fallback when the forward search bailed at an echo boundary.
- Implementation four-reviewer rule round 3:
  - Coordinator fix applied: added `stoppedAtEchoBoundary` flag in `resolveEchoBackPointers`. Backward fallback now only runs when forward terminated by running off the end (not by hitting an echo boundary). Added regression test `"Phase 7d codex-external catch r2: echo-boundary suppresses the backward fallback (multi-echo case)"`.
  - External codex round 3: **`approved`** (no findings, no nits). Round-2 finding closed with evidence.
- Phase 7d implementation closed at all four reviewers green. Codex caught 2 real bugs both Claude reviewers missed: (1) echo back-pointer pointing at duplicate's own line, (2) backward-fallback mis-association in multi-echo case. Both fixed with regression tests.

## Closing Verification

- `bun run test`: **770 pass / 0 fail / 2577 expect()** (was 745 at Phase 7c polish-r2 close; +25 net new tests for Phase 7d).
- `bunx tsc --noEmit`: clean.
- `bun run build`: green (CSS 44.28 kB, JS ~288.75 kB).
- `cargo check --workspace` + `cargo test --workspace`: green (no backend touch).
- Marker count `@unskip Phase`: 0.
- Hex literal count: 24 (invariant preserved).
- Token count: 83 (invariant preserved).
- `🔇` row count in matrix doc: 0 (was 12 at Phase 7c close — Phase 7d's deliverable).
- `🎨` row count in matrix doc: 0 (preserved).
- MessageKind union: extended to 8 variants (`...metadata`) — Resolved Decision #2 amended per user approval.
- All 12 previously-silenced events now surface in the transcript: 10 as marginalia hairlines (with hover tooltip showing raw NDJSON), 2 as `↺` echo glyphs with tooltip + aria-label pointing at the canonical row's line.

## External Reviewer Availability Log

- `codex exec --model gpt-5.2 --reasoning-effort medium` available per Phase 7c history.

## Protected-Path Exception Log

- **Approved**: parser logic edits at the 12 currently-silenced sites in `claude_code.ts` (1 block at L413-455) and `codex.ts` (3 sites at L197-200, L331-339, L671-679). Rationale: Path A requires routing currently-skipped events to emit `kind:"metadata"` Messages. Scope is limited to changing return paths from "silent skip" to "emit metadata Message"; no logic changes to the supported routes or to the warning-emission paths. The Phase 7b parser audit decisions for the silenced rows are RE-OPENED only for this rerouting — the SILENCE decision is replaced with FIX (route to metadata).

## Open Risks / Open Questions

- Amends Resolved Decision #2 ("MessageKind is stable") of Phase 7c. User explicitly approved.
- Re-opens Phase 7b parser audit for the 12 silenced rows. The audit decisions move from "SILENCE" to "FIX (route to metadata)". Documented in matrix doc updates as part of this phase.
- Cluster threshold = 2 may surface a polish round later (lessons learned from Phase 7c polish-r2: real-session feedback may want even more aggressive collapse).

## Next Recommended Task

- Dispatch developer subagent for Phase 7d implementation (single milestone).
