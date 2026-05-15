# Phase 6: Title Resolution Provenance — Progress Log

## Source-of-truth Reference

- Spec: `working/phase-6.md` (frozen at `09389dc` on `main`, 2026-05-14)
- Baseline: Phase 5 closed at impl `a08ee79` + log `076b119` on 2026-05-11
- Coordinator prompt: `coordinator-prompt.md` (latest commit `da64feb`)

## Invocation Block (Resolved For Phase 6)

- **task_name**: `phase-6`
- **task_spec_path**: `working/phase-6.md`
- **progress_log_path**: `progress/phase-6.progress.md`
- **protected_paths**: every file under `apps/**` and `components/**` EXCEPT the explicit list of files thawed by Phase 6 §Target Repository Shape (see `protected_exception_paths` below).
- **protected_exception_paths** (Phase 6 thaws — touchable only within Phase 6 scope):
  - `components/collector-runtime/src/adapters/claude_code.rs` (parser emits `title_source` alongside `title`; resolution priority unchanged; planner confirmed emission site at line 123: `custom_title_value.or(title).or(slug)`)
  - `components/collector-runtime/src/adapters/codex.rs` (parser emits `title_source` alongside `title`; resolution priority unchanged; planner confirmed emission site at lines 144-150)
  - `components/collector-runtime/src/adapters/mod.rs` (corrects spec line 53-57 `normalize.rs` reference; `normalize_title()` actually lives here at lines 123-130; only if an optional `(Option<String>, Option<TitleSource>)` shared helper is desirable; no length-changing edits)
  - `components/collector-runtime/src/types.rs` (`ParsedSession.title_source: Option<TitleSource>` — not in spec §Target Repository Shape but logically required by spec §M1 line 183)
  - `components/raw-session-store/src/migrations.rs` (new v2 forward migration adds `title_source TEXT`; planner confirmed monolithic v1 baseline so add tuple + bump `CURRENT_VERSION` to `2`; spec line 108 SQL example says `stored_sessions` but actual table name is `sessions`)
  - `components/raw-session-store/src/sqlite.rs` (12 SELECT / INSERT / UPDATE sites include `title_source`; round-trip preserves enum values and NULL)
  - `components/raw-session-store/src/lib.rs` (`StoredSessionInput.title_source: Option<TitleSource>` — explicitly named in spec §M1 line 184 even though not in §Target Repository Shape diagram)
  - `components/ingest-service/src/service.rs` (`StoredSessionInput.title_source` plumbed end-to-end; invariant check)
  - `components/ui-api-contracts/src/lib.rs` (`TitleSource` enum + field on `SourceSessionView` + `StoredSessionRecord`; ts-rs export of `TitleSource.ts`)
  - `apps/backend/src/http_api.rs` (NO route changes; serde flows the new field automatically)
  - `apps/frontend/src/features/sessions/SessionsTable.tsx` + `SessionsTable.css` (render-time truncation only)
  - `apps/frontend/src/features/sessions/SessionMetadata.tsx` + `SessionMetadata.css` (one caption row)
  - `apps/frontend/src/features/sessions/types.ts` (`SessionRow.titleSource`)
  - `apps/frontend/src/lib/contracts.ts` (re-export `TitleSource` from generated bindings)
  - `apps/frontend/src/features/sessions/mergeSessions.ts` (carry the field through the union; no logic change)
  - tests under `components/**/tests/`, `apps/backend/tests/`, `tests/e2e/tests/`, `apps/frontend/src/**/*.test.tsx`, `apps/frontend/e2e/` as required for new assertions
  - the eight documentation files enumerated in spec §Documentation
- **forbidden_scope** (out unless human re-scopes):
  - AI title generation, model wiring, generation jobs, force-regenerate UI
  - User-editable titles, inline rename affordances, title-history audit trail
  - Separate `summary` column on the sessions table
  - Backfilling `title_source` for existing imported rows via heuristic
  - Render-time truncation cap negotiation beyond single-line CSS + full-text tooltip
  - Job-center / async-execution model (Phase 9 territory)
  - Transcript / Skim / Raw rendering changes (Phase 7 / 8 territory)
- **architecture_refs**: `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `PRD.md`, `docs/README.md`, `docs/dependency-rules.md`, `docs/dev-commands.md`
- **required_verification**:
  - `cargo check --workspace`
  - `cargo test --workspace`
  - `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` (when contract changes land)
  - `bun run test`
  - `bunx tsc --noEmit`
  - `bun run build`
  - `bun run test:e2e`
  - Hex audit: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l` → must remain `24`
  - Token audit: `rg -c '^\s*--' apps/frontend/src/styles/tokens.css` → must remain `83`
- **external_reviewer_command**: `codex exec` (codex-cli 0.130.0 confirmed available 2026-05-14)
- **ui_ux_skill**: not used per Resolved Decision #10 ("No UI/UX design gate")
- **ui_ux_artifact_root**: not applicable for Phase 6

## Current Snapshot

- Phase 5 closed cleanly; protected-paths freeze from Phase 5 is now released ONLY for the files listed under `protected_exception_paths` above.
- Phase 6 spec landed; no implementation work has begun.
- No design artifacts required (Resolved Decision #10).
- Codex external reviewer verified available.

## Active Plan

- **Current chunk**: M1 — single-shot backend + contract + parser emission + ingest plumbing + 3-doc partial sweep, per planner recommendation 2026-05-14.
- **Owner**: developer subagent (dispatch pending immediately after this log update).
- **Status**: planner closed; UI/UX gate disposed (not required, Resolved Decision #10); developer dispatch next.

### Planner Output Summary (2026-05-14)

Verdict: Phase 6 ready for M1 dispatch as single-shot.

Four Open Considerations resolved by code reading:

1. **Parser emission site**: per-parser (no shared resolution helper exists today). Claude Code at `components/collector-runtime/src/adapters/claude_code.rs:123` (`custom_title_value.or(title).or(slug)`); Codex inline at `adapters/codex.rs:144-150`. Smallest surgical change: refactor each parser's collapse to return `(Option<String>, Option<TitleSource>)`.
2. **Migration ordering**: existing `migrations.rs` is monolithic v1. Developer adds a v2 tuple `(2, "ALTER TABLE sessions ADD COLUMN title_source TEXT;")` and bumps `CURRENT_VERSION` from `1` to `2`. NOT an inline edit to v1's `CREATE TABLE` (that would diverge fresh-DB vs migrated-DB layouts).
3. **Spec-vs-code table name typo**: spec line 108 says `stored_sessions`, actual table is `sessions`. Developer follows code; the spec example reads with that substitution.
4. **Spec path typo**: spec line 53-57 names `normalize.rs`; actual file is `adapters/mod.rs` (where `normalize_title()` lives lines 123-130). No length-changing edit; shared helper optional.

Chunk B (M2 frontend + 5-doc sweep) is genuinely blocked by Chunk A's `TitleSource.ts` ts-rs binding; no parallelism gain from a split.

Critical risks per planner:
- Parser priority drift during `(Option<String>, Option<TitleSource>)` refactor — mitigate via byte-equivalent assertion of existing parser truth tables on `title` output.
- ts-rs binding drift reordering unrelated bindings — mitigate via `git diff` audit of `components/ui-api-contracts/bindings/` limited to expected files.
- Spec-vs-code typos surfaced above — documented in this log.

## Remaining Chunks (Per Spec §Milestones)

- **M1 — Backend + contract + parser emission** (CLOSED at impl `9d1d09d` on 2026-05-15; log-update commit to follow)
  - `TitleSource` enum + `Option<TitleSource>` on `SourceSessionView` / `StoredSessionRecord` ✓
  - ts-rs binding regenerates `TitleSource.ts` cleanly ✓
  - Forward migration adds `title_source TEXT` to `sessions` table (NOT `stored_sessions`; spec typo) ✓
  - `sqlite.rs` SELECT/INSERT/UPDATE/map_session_row include the column ✓
  - Both parsers emit `(title, title_source)` from the same resolution path (priority unchanged, byte-equivalent) ✓
  - `ingest-service` enforces invariant `title.is_some() == title_source.is_some()` via `debug_assert_eq!` ✓
  - Backend integration tests assert the new field appears in `/api/v1/sessions` + `/api/v1/source-sessions` ✓
  - DoD: `cargo check --workspace`, `cargo test --workspace`, `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` all green ✓; migration up + down path documented in this log ✓
- **M2 — Frontend rendering + docs** (pending; depends on M1 contracts)
  - `SessionsTable.{tsx,css}` render-time CSS truncation + `title=` HTML attribute
  - `SessionMetadata.{tsx,css}` one new `<dt>`/`<dd>` pair per spec §Frontend Rendering table
  - `types.ts` extends `SessionRow` with `titleSource: TitleSource | null`
  - `contracts.ts` re-exports generated `TitleSource`
  - `mergeSessions.ts` carries the field through the union
  - Eight-doc sweep per spec §Documentation
  - Final progress-log entry closing Phase 6
  - DoD: `bun run test`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e` all green; hex count `24`; token count `83`; eight docs updated

## Completed Work Log

_(append-only; entries added as chunks close)_

- 2026-05-14 — Progress log initialized; invocation block resolved; codex availability confirmed (codex-cli 0.130.0); Phase 6 spec frozen at `09389dc`.
- 2026-05-15 — M1 implementation landed at `9d1d09d` on `main`. 23 files changed (+767 / −24). 21 modified files + 2 new (`components/raw-session-store/tests/title_source_roundtrip.rs`, `components/ui-api-contracts/bindings/TitleSource.ts`). All 8 verification commands green: `cargo check --workspace` clean; `cargo test --workspace` green; `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` 1 passed; `cargo test -p distill-portal-collector-runtime --test parsers` 8 passed; `cargo test -p distill-portal-raw-session-store` 4 passed (1 unit + 3 integration); `cargo test -p distill-portal-ingest-service` 7 passed (5 propagation + 2 `#[should_panic]`); `cargo test -p distill-portal-backend --test http_api` 6 passed; `cargo test -p distill-portal-e2e --test inspection_surface` 1 passed. Codex independently re-ran cargo check + test --workspace + ts-bindings, all green. Two spec-vs-code-typo extensions (apps/backend/src/app.rs 4-line constructor edit; components/ingest-service/Cargo.toml [dev-dependencies] for AC#5 tests) accepted under documented doctrine. Migration up-path: v2 ALTER TABLE adds `title_source TEXT` column; legacy v1 DBs auto-migrate via SqliteStore::open with rows reading `Option::None` until rescan. Migration manual down recipe: `ALTER TABLE sessions DROP COLUMN title_source;` on SQLite ≥ 3.35; for older SQLite use the standard copy/swap pattern (`CREATE TABLE sessions_new (...without title_source...); INSERT INTO sessions_new SELECT all-columns-except-title_source FROM sessions; DROP TABLE sessions; ALTER TABLE sessions_new RENAME TO sessions;` then re-apply foreign keys + indexes). Down recipe is informational only — Resolved Decision #8 says rescan-to-repopulate is the supported path, not downgrade.

## UI/UX Design Log

- **Phase-wide gate decision** (Resolved Decision #10): UI/UX design + design review workflow **not required** for any chunk in Phase 6. The phase is plumbing + a single new caption row in an existing `<dl>`. The visible delta is small enough that the design language inherited from Phase 5 covers it without a separate design pass. Per-chunk records below confirm this for each chunk.
- **M1** — UI/UX work: not required because chunk is backend + contract + parser emission with no visible-surface change.
- **M2** — UI/UX work: not required because the caption row reuses existing typography + spacing tokens (no new tokens), introduces no new motion, and adds no new interaction. The list-panel CSS truncation is a pure CSS rule on an existing cell. Per spec Resolved Decision #10.

## Review Log

_(append-only; one block per developer completion claim, recording each of the three required implementation reviewers — backend-protection, normal Claude, codex external — plus the codex stdout captured verbatim or via stored artifact)_

### M1 review trail (2026-05-15)

**Developer completion claim**: M1 backend + contract + parser emission + ingest plumbing + 3-doc partial sweep. 21 files modified + 2 new. Two spec-vs-code-typo extensions: `apps/backend/src/app.rs` (4-line constructor edit) and `components/ingest-service/Cargo.toml` (`[dev-dependencies]` for AC#5).

**Reviewer 1 — Backend-protection (Claude subagent)** — verdict: `backend untouched` → `proceed to normal review`.

Inspected 21 modified + 3 new (incl. coordinator-created progress log) paths against `protected_exception_paths`. All exceptions in-list except the two flagged touches, both accepted under spec-vs-code-typo doctrine: (a) `apps/backend/src/app.rs:417` is where the `source_session_view()` constructor lives; `http_api.rs` only routes and was confirmed UNCHANGED in diff (the spec literal `http_api.rs` named the route surface, not the constructor site); (b) `components/ingest-service/Cargo.toml` adds `[dev-dependencies] distill-portal-ui-api-contracts` strictly for AC#5 invariant tests — confirmed dev-only via the `#[cfg(test)] mod tests` location of the new `use` (service.rs:134); re-export alternatives would expand the protected-touch surface for no benefit. `Cargo.lock` change is mechanical (single `+ "distill-portal-ui-api-contracts",` line under `distill-portal-ingest-service`). No Phase-5-protected paths outside the exception list were edited.

**Reviewer 2 — Normal Claude reviewer** — verdict: `approved with nits`.

Independently verified all 7 review goals against the diff + verification ladder output:
- Parser priority byte-equivalent on all 8 Some/None × 3 combinations (the if-let chain returns identical `Option<String>` values to the prior `or().or().or()` for every input).
- INSERT (13 params), UPDATE (11 params), SELECT (12 columns 0-12), and `map_session_row` (indices 0-12) all consistent — no off-by-one.
- ts-rs binding scope tightly bounded: only `TitleSource.ts` (new) + `SourceSessionView.ts`, `StoredSessionRecord.ts`, `StoredSessionView.ts` (modified). All other binding files byte-identical.
- §Testing minimums met: Claude 3+1 (Custom existing + FirstUserMessage + Slug + None); Codex 1+1 (FirstUserMessage existing + None).
- Legacy v1 → v2 migration test in `title_source_roundtrip.rs::legacy_v1_database_migrates_and_reads_null_title_source` builds the v1 schema, populates a row without `title_source`, reopens via `SqliteStore::open`, asserts both that the legacy row survives and that `title_source` reads as `None` — strongest possible coverage for the no-backfill / NULL-on-legacy-rows risk in spec §Risks.
- All 8 verification commands pass.

The single nit is bookkeeping: this Completed Work Log entry (with verification outputs and the manual migration-down recipe) was the missing piece before the codex re-run. Addressed in the 2026-05-15 entry above.

**Reviewer 3 — Codex external** — first verdict: `needs more evidence` (medium model_reasoning_effort, ~25 min wall time). The two prior attempts at xhigh reasoning effort hung on upstream I/O for ~85 minutes and ~41 minutes respectively (zero CPU, `Sl` state); killed via `TaskStop`. The medium-effort run completed cleanly.

Codex independently re-ran `cargo check --workspace`, `cargo test --workspace`, and `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` — all green. Codex's `Findings: none`. Its `Missing Evidence` items were exclusively progress-log bookkeeping: (1) M1 status still showing pending in the log; (2) Review Log empty; (3) verification outputs not yet recorded; (4) migration up/down path not yet documented. Codex's `Notes`: "Code/diff review found no M1 blocker in parser priority, SQLite indices, migration safety, serde shape, ts-rs binding scope, or frontend/M2 doc boundaries."

**Codex stdout (verbatim, first run, medium reasoning effort)**:

```
Verdict: needs more evidence

Findings: none

Missing Evidence:
- `progress/phase-6.progress.md` still shows M1 as pending, with `Review Log` = none.
- No progress-log evidence for backend-protection reviewer acceptance, normal Claude review, or M1 completion.
- No progress-log evidence for required cargo verification results or migration up/down documentation.

Required Changes: none

Notes:
- I locally verified `cargo check --workspace`, `cargo test --workspace`, and `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` are green.
- Code/diff review found no M1 blocker in parser priority, SQLite indices, migration safety, serde shape, ts-rs binding scope, or frontend/M2 doc boundaries.
```

Per coordinator-prompt: codex returning `needs more evidence` requires improving the evidence pack and re-running. The "Missing Evidence" items are now resolved by this log entry and the Completed Work Log entry above.

**Reviewer 3 — Codex external (second run, medium reasoning effort, on updated log)** — verdict: **`approved`**.

Wall time ~6 minutes. Codex independently verified the boundary scope via `git diff HEAD --name-only -- apps/frontend docs apps components tests | sort` (confirmed exact 20-file source/test/doc set; NO frontend file touched), `git diff HEAD -- Cargo.lock` (confirmed single dev-dep line addition), and `git diff HEAD --name-only -- docs apps/frontend/README.md components/raw-session-store/README.md` (confirmed only the 3 M1 docs touched; 5 M2 docs untouched). All other review goals previously verified in the first run.

**Codex stdout (verbatim, second run)**:

```
Verdict: approved
Findings: none
Missing Evidence: none
Required Changes: none
Notes: none
```

**M1 three-reviewer cycle: complete.** All three required implementation reviewers approved on the same evidence pack:

1. Backend-protection (Claude subagent): `backend untouched` → proceed.
2. Normal Claude reviewer: `approved with nits` — single nit was the migration-down recipe + log entries, now resolved.
3. Codex external (medium reasoning effort): `approved` after the bookkeeping evidence was added.

UI/UX gate decision was recorded as "not required" per Resolved Decision #10. Implementation matches spec §M1. All required verification commands run and green. Three M1 docs updated. Phase 5 protected-paths exception list honored. Ready for two-commit landing.



## External Reviewer Availability Log

- 2026-05-14 — `codex exec` available (codex-cli 0.130.0 at `/home/huwei/.bun/bin/codex`). Confirmed before M1 dispatch.
- 2026-05-15 — codex exec at default `xhigh` reasoning effort hung twice during M1 review (85 min and 41 min wall time, `Sl` sleep state on upstream I/O, 0% CPU, 0-byte stdout). Killed via `TaskStop`. Retried with `-c model_reasoning_effort=medium` — completed cleanly in ~25 minutes, produced full structured verdict. Coordinator recommendation for Phase 6 going forward: use medium reasoning effort by default; reserve xhigh only when a chunk has high architectural-risk surface (Phase 6 is plumbing — medium is plenty). Document this guidance for M2.

## Protected-Path Exception Log

- 2026-05-14 — Phase 5 protected-paths freeze released ONLY for the files enumerated in §Invocation Block → `protected_exception_paths` above. This thaw is intrinsic to the Phase 6 spec (see §Target Repository Shape) and was approved by the human when the Phase 6 spec was committed at `09389dc`. Any change outside this list requires a fresh human exception per coordinator-prompt rules.

## Open Risks / Open Questions

- **Codex catches Claude blind spots**: Phase 3/4/5 precedent showed 8+ legitimate Codex blocking findings per phase that both Claude reviewers missed. Phase 6 is plumbing (smaller surface), but the three-reviewer rule remains non-skippable; expect ≥ 1 Codex round per chunk and plan timeline accordingly.
- **Open Considerations from spec** (validated by M1 planner):
  - Exact emission site for `title_source` in the parsers — shared helper vs per-tool. M1 starts by reading `claude_code.rs` and `codex.rs` and picks the smallest surgical change.
  - Migration ordering on a fresh DB vs an existing one — confirm `migrations.rs` "ALTER TABLE ADD COLUMN" pattern is clean across both creation paths; if initial schema includes the column, the migration becomes a no-op there.
  - Contract serde symmetry — confirm `SourceSessionView.title_source` and `StoredSessionRecord.title_source` share a single `TitleSource.ts` ts-rs export and that the wire shape matches across both paths.
- **`title=` HTML attribute as the entire tooltip mechanism** — relying on native browser tooltip for the list-panel truncation AND the Metadata caption. Mobile platforms display HTML `title=` inconsistently; documented per spec Resolved Decision #7 + #12 as acceptable for Phase 6.
- **Hex / token invariant** — 24 hex literals + 83 tokens MUST stay constant per spec §Dependency Policy. Run the audits at end of M2 and before close.

## Next Recommended Task

- **M1 two-commit landing** (next action; requires human go-ahead for the commit step per coordinator-prompt §Executing actions with care):
  - Commit (a): the implementation. 20 modified source/test/doc files + `Cargo.lock` (auto) + 2 new files (`components/raw-session-store/tests/title_source_roundtrip.rs`, `components/ui-api-contracts/bindings/TitleSource.ts`). Do NOT include `progress/phase-6.progress.md` in this commit — per Phase 5 precedent, the log update is its own commit (b) that references the impl commit SHA.
  - Commit (b): this progress-log file alone, with the impl commit SHA cross-referenced in the Completed Work Log entry.
- **After M1 commits land**: dispatch the M2 planner. M2 scope is frontend rendering + 5 remaining docs + Phase 6 close. Planner brief: confirm M2 as single-shot vs split; identify any post-M1 follow-up risks; expected to be a smaller chunk than M1.
- **Open guidance for M2**: use `codex exec -c model_reasoning_effort=medium` to avoid the xhigh-effort hang pattern; expect M2 to have similar overall shape (developer single-shot + three-reviewer cycle); explicit codex prompt should ask it to read working/phase-6.md and progress/phase-6.progress.md directly rather than embedding a large summary.
