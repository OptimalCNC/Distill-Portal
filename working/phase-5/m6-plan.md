# Phase 5 M6 Implementation Plan

> Source-of-truth: `working/phase-5.md` frozen at `05467ad`. M5 closed at impl SHA `d59e5e5` + log SHA `a195736`. M6 is the FINAL Phase 5 chunk.

## 1. Brief context

M6 ships: (a) deletion of DEAD-BUT-TESTED `SessionDetail.{tsx,test.tsx,css}` + `Drawer.{tsx,test.tsx,css}`; (b) `focus-trap-react` orphan documentation; (c) 8-doc sweep per spec §Documentation; (d) cumulative WCAG-AA table recorded in progress log; (e) folded-in deferred follow-ups from M3a/M3b/M4/M5; (f) Phase 5 closure progress log entry.

ZERO new visible surface; ZERO new tokens; ZERO new hex literals; ZERO new fonts; ZERO new motion vocab; ZERO new tests added (test count REDUCES by the deleted suites).

## 2. Pre-flight verification (developer runs first)

```bash
cd /home/huwei/ai_codings/distill-portal

# Confirm SessionDetail / Drawer are NOT imported by live code (only JSDoc references)
rg -nE 'from\s+["\x27].*(SessionDetail|Drawer)' apps/frontend/src/ --type ts --type tsx
# Expected: zero hits

# Confirm docs/features/session-view.md does NOT yet exist
ls docs/features/session-view.md 2>&1 | grep -q "No such file" && echo "OK: not yet present"

# Baseline gates
cd apps/frontend && bun run test 2>&1 | tail -3
cd apps/frontend && bunx tsc --noEmit 2>&1 | tail -3
cd apps/frontend && bun run build 2>&1 | tail -5
cd ../..
cargo check --workspace 2>&1 | tail -3
cargo test -p distill-portal-ui-api-contracts --features ts-bindings 2>&1 | tail -3

# Hex / token invariants
rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l   # MUST equal 24
rg -c '^\s*--' apps/frontend/src/styles/tokens.css     # MUST equal 83
```

JSDoc references in `SessionsView.tsx:29-32`, `SessionsView.test.tsx:12,16,126`, `App.test.tsx:270` describe historical/M6-retiring relationships — these references must be UPDATED (not deleted) when SessionDetail.tsx + Drawer.tsx are deleted, to reflect the post-M6 reality.

## 3. File deletion list

| File | Lines | Role |
|------|------:|------|
| `apps/frontend/src/features/sessions/SessionDetail.tsx` | ~260 | Phase-4 drawer-body 18-field metadata + raw preview (extracted to SessionMetadata + RawTab at M2b) |
| `apps/frontend/src/features/sessions/SessionDetail.test.tsx` | ~370 | Tests for above; DEAD-BUT-TESTED |
| `apps/frontend/src/features/sessions/SessionDetail.css` | ~120 | Drawer-body styling; superseded by SessionMetadata.css + RawTab.css |
| `apps/frontend/src/components/Drawer.tsx` | ~180 | Phase-4 native `<dialog>` + focus-trap modal (replaced by M2b right-pane) |
| `apps/frontend/src/components/Drawer.test.tsx` | ~290 | Tests for above; DEAD-BUT-TESTED |
| `apps/frontend/src/components/Drawer.css` | ~80 | Drawer chrome |

Approximate net delete: ~1300 lines source + tests. Build size delta: CSS −3-5 kB; JS −10-20 kB.

Test count delta: SessionDetail.test.tsx (~30-50 tests) + Drawer.test.tsx (~10-20 tests) ≈ **−45 to −70 tests**. Expected post-M6: 487-512 pass / 0 fail / similarly reduced expects. Developer reports exact deltas.

## 4. JSDoc cross-reference updates (alongside deletions)

These reference SessionDetail/Drawer as DEAD-BUT-TESTED; M6 must update them to reflect post-deletion reality.

- `apps/frontend/src/features/sessions/SessionsView.tsx:29-35` — rewrite the JSDoc paragraph from "Drawer.tsx + SessionDetail.tsx remain on disk through M5 per Resolved Decision #6 — DEAD-BUT-TESTED" to "Phase-4 drawer was retired at M2b; the `<Drawer>` + `<SessionDetail>` files were deleted at M6."
- `apps/frontend/src/features/sessions/SessionsView.test.tsx:12-20, 126` — same rewrite pattern.
- `apps/frontend/src/App.test.tsx:270` — verify the comment still parses post-deletion; rewrite if needed.
- `apps/frontend/src/components/Drawer.tsx` + `apps/frontend/src/features/sessions/SessionDetail.tsx` — DELETE (no JSDoc rewrite; the files themselves are removed).

## 5. 8-doc sweep — per-doc specs

Developer reads each doc first, then applies the deltas below.

### 5.1 `docs/README.md`
Find the frontend bullet (likely 1-2 sentences). Rewrite to:
- "Split-pane master-detail layout: list panel (left, ~300-380 px) + session pane (right, persistent, four-tab shell — Transcript / Skim / Raw / Metadata)."
- "Per-tool parsers (`apps/frontend/src/features/sessions/parsers/`) consume NDJSON and emit `ParsedSession` for the Transcript + Skim tabs."

### 5.2 `docs/dependency-rules.md`
- Reaffirm: 2-package escape-hatch budget — 1 of 2 consumed (`focus-trap-react@^11`); slot 2 (`@tanstack/react-virtual`) reserved + UNUSED at Phase 5 close.
- Document `focus-trap-react` ORPHAN-INSTALLED status post-M2b drawer retirement + post-M6 SessionDetail/Drawer deletion: kept installed per planner recommendation; cost negligible (~35 KB JS + 2 transitive deps); future modal needs may revive.
- Document Fraunces self-hosted woff2 (Roman + Italic ~143 KB total) as a STATIC ASSET at `apps/frontend/public/fonts/` — NOT a runtime dep; loaded via `@font-face` in `tokens.css`; size budget exempted.

### 5.3 `docs/dev-commands.md`
Extend test-surface paragraph (find the "bun test" mention) to enumerate the new test files added across Phase 5:
- `useSelectedSession.test.ts` (M1a)
- `Tabs.test.tsx`, `SessionView.test.tsx`, `SessionMetadata.test.tsx`, `RawTab.test.tsx` (M2b)
- `parsers/{types,claude_code,codex,buildSkim,index}.test.ts` (M3a)
- `streamRawText.test.ts`, `useParsedSession.test.ts` (M3b)
- `TranscriptView.test.tsx` (M4)
- `SkimView.test.tsx`, `BoundaryRow.test.tsx` (M5)

Phase 4 → Phase 5 close: 17 test files → 30 → ~28 post-M6 (deleting SessionDetail.test.tsx + Drawer.test.tsx).

### 5.4 `docs/features/inspection-surface.md` — REWRITE
Complete rewrite covering Phase 5's master-detail layout:
- Layout: split-pane CSS Grid (≥ 900 px split / < 900 px stacked + `narrowMode` toggle).
- List panel: 4-essential columns + Select; filters (`<details>` wrapped below 1100 px); action bar + pagination in sticky footer.
- Session pane: persistent right pane; four-tab shell (Transcript / Skim / Raw / Metadata).
- URL state: `?session=<rowKey>` via `replaceState`; popstate listener; Esc clears with editable-control scope.
- Deep-link pulse: data-deep-link attr + 600 ms keyframe.
- "Back to list" affordance: narrow-mode only.

### 5.5 `docs/features/session-view.md` — NEW
Create from scratch:
```markdown
# Session View

The session view is the persistent right pane of the inspection surface...

## Tabs

Four tabs ordered: Transcript, Skim, Raw, Metadata. Default on first selection: **Transcript** (post-M4 shift; pre-M4 it was Metadata).

### Transcript tab
- Renders parsed.messages in chronological order
- Per-kind shells (user, assistant, tool_use, tool_result, system, boundary, unknown)
- Code-fenced segments swap to mono font
- Long tool_result body (>2 KB) collapsible via `<details>`
- Truncation banner when parsed.truncated (5 MB cap fired during streamRawText)
- Parse-warnings dismissible banner

### Skim tab
- Renders parsed.skim (SkimBlock[] from buildSkim)
- Four block kinds:
  - user_turn: inline body + nested Agent reaction <details> with disabled placeholder + Expand-to-raw scoped TranscriptView
  - boundary: chapter break via shared BoundaryRow (byte-equivalent to TranscriptView)
  - agent_only: collapsed by default; expanding mounts scoped TranscriptView
  - oversized_user_message: collapsed by default; verbatim <pre> body in mono

### Raw tab
- Byte-equivalent to Phase 4 drawer raw preview (256 KB / 20-line cap via `consumeRawPreview`)

### Metadata tab
- 18 SessionRow fields verbatim from Phase 4's drawer body
- Copy path button + subagent sidecar badge + status conflict badge

## Parsers

Per-tool architecture: `apps/frontend/src/features/sessions/parsers/{types,claude_code,codex,buildSkim,index}.ts`. Pure, total, synchronous. Registry-based dispatch (`PARSERS: Record<Tool, ParserFn>`). Adding a third tool is one entry, not a control-flow edit.

## Stream caps

- Skim/Transcript full-payload: 5 MB cap via `streamRawText.ts`. Multi-byte UTF-8 may yield U+FFFD at boundary.
- Raw tab preview: 256 KB / 20 lines via `consumeRawPreview` (Phase 4 unchanged).
- Two separate consumers; no shared state.

## Oversize threshold

User messages > 64 KB (`USER_MSG_OVERSIZE_THRESHOLD`) become `oversized_user_message` blocks in buildSkim. NEVER summarized (PRD line 257).

## Expansion semantics

- Skim's user_turn "Expand to raw messages": mounts a scoped TranscriptView with `messageRange={{ start: block.start + 1, end: block.end }}`.
- Skim's agent_only expand: scoped TranscriptView with `messageRange={{ start: block.start, end: block.end }}`.
- Empty-stream sentinel (`{kind: "agent_only", start: 0, end: -1, meta: {empty: 1}}`): renders as collapsed agent_only with "Agent-only session (0 messages)" summary; expanding shows TranscriptView's empty-state copy.

## Known limitation: source-only rows

Spec line 626 documents an alternate "Open raw" anchor copy for `storedSessionUid === null` rows; M4 implemented the anchor as hidden when null (no alternate copy rendered). Revisit if user feedback surfaces the need.

## JSON.stringify(undefined) pitfall

Per-tool parsers always guard `JSON.stringify(payload.X ?? null)` to avoid `undefined` text values. Future parser additions must preserve this guard.
```

### 5.6 `docs/features/session-store.md`
- Search for "drawer" references; replace with "right pane" or "session pane".
- Replace any "click row → open drawer" prose with "click row → URL update → session pane shows the selected session".

### 5.7 `docs/playbooks/modify-frontend-page.md`
- Update file paths to current state (Phase 5 layout).
- Add a new "How per-tool parsers fit" section: where to add a new parser (`parsers/<tool>.ts` + `parsers/index.ts` registry entry + co-located test file), the totality contract, the warnings discipline.

### 5.8 `apps/frontend/README.md`
- Entry Points section: add SessionView, SkimView, TranscriptView, BoundaryRow, the `parsers/` subdirectory, the `Tabs` primitive.
- Remove Drawer + SessionDetail references.
- Reflect master-detail layout.

## 6. Cumulative WCAG-AA table

Recorded in `progress/phase-5.progress.md` as a new section under §Completed Work Log (post-Phase-5-close summary) or as an appendix.

Table format (markdown):
```
| Pair ID | Surface | FG | BG | Light ratio | Dark ratio | Threshold | Status |
|---------|---------|----|----|-------------|------------|-----------|--------|
| T01/S01 | Transcript/Skim user body | --color-ink | --color-surface | 16.00:1 | 14.87:1 | AA 4.5:1 | PASS AAA |
| ... | ... | ... | ... | ... | ... | ... | ... |
```

Sources (developer reads):
- `working/phase-5/designs/m4-transcript/colors.md` — 30 pairs (T01-T28 + extensions).
- `working/phase-5/designs/m5-skim/colors.md` — 29 pairs (S01-S29 with cross-references to M4 T-codes).

Cumulative unique pairs: ~30-35 (de-duplicated where M4 T-codes overlap M5 S-codes — codes are referenced rather than re-measured).

Cusp pairs flagged: S10/S26 (M5) and T10/T17b (M4) at `--color-border-strong` over `--color-surface` dark 3.00:1 — passes SC 1.4.11 at the floor; accepted risk per M2a-documented rounding.

## 7. Deferred follow-up decisions

### INCLUDE (in M6 scope)

1. **M3a JSON.stringify(undefined) doc note** — fold into `docs/features/session-view.md` §"JSON.stringify(undefined) pitfall" (already drafted above).

2. **M3b bumpCacheEpoch JSDoc expansion in App.tsx** — expand the current one-line import comment to a 3-line block citing spec line 466 ("Hard reset: clear-all `cache` AND `inFlight` AND increment `cacheEpoch` on Rescan and on Import success"). One-file edit.

3. **M4 useParsedSession AbortError-coalescing retroactive note** — add a 2-3 line JSDoc note at `useParsedSession.ts:340-355` (or wherever the M4 patch sits in the `.catch` branch) explaining the StrictMode double-mount race the patch resolves. Cross-reference the M4 closure entry in progress log.

4. **M4 `grep -q -- "${tok}:"` cross-check** — add a note in `docs/playbooks/modify-frontend-page.md` (per-tool parsers section, OR a new "verification commands" subsection) about using `--` in grep when token names contain leading dashes. One-paragraph addition.

5. **M5 single Skim↔Transcript↔Skim e2e test** — add one new test to `SessionView.test.tsx` asserting native `<details>` open state preservation across full tab cycle. ~15-line test. NET test count: -45 to -70 from deletions + 1 from this addition ≈ -44 to -69 net.

### DEFER (to separate post-M6 docs PR — `phase-5-docs-PR-1` and `-PR-2`)

1. **M3a spec line 779 asymmetry one-line comment** — spec amendment; spec frozen at `05467ad`. Lands as post-M6 docs PR.

2. **M4 spec line 1032 perf criterion clarifying comment** — same reasoning; spec amendment; post-M6 docs PR.

### DOCUMENTED LIMITATION (in new `docs/features/session-view.md` only)

3. **M4 "Open raw" anchor for source-only rows** — documented as known limitation in §"Known limitation: source-only rows" (already drafted above). No code change in M6.

### SKIP (non-actionable or no payoff)

- M3a-3 function_call real-fixture verification (covered by unit tests)
- M3b-1 retry updater-function pattern (idempotent under React batching; non-blocking)
- M3b-3 useParsedSession dev-mode memory ceiling hook (no observability infra; ~10-line addition with low payoff)
- M4-4 test count discrepancy (cosmetic; already aligned in progress log)
- M5-2 BoundaryRow internal stagger cap hardening (current call-site enforcement works; defensive-only)
- M5-3 m5-plan line-number drift (one-time planner brief artifact; future planners can anchor differently)

## 8. Hex / token / dep invariants

Pre-M6:
- Hex: 24
- Tokens: 83
- Escape-hatch slots: 1 of 2 consumed (`focus-trap-react`)

Post-M6 expected:
- Hex: 24 (UNCHANGED)
- Tokens: 83 (UNCHANGED)
- Escape-hatch slots: 1 of 2 consumed (UNCHANGED — `focus-trap-react` stays installed as orphan)

If any delta, document explicitly in the closure log entry.

## 9. Test count expectation

Pre-M6: 557 pass / 0 fail / 1860 expects / 32 files.

Developer reads SessionDetail.test.tsx + Drawer.test.tsx FIRST to confirm test counts. Estimate:
- SessionDetail.test.tsx: ~30-50 tests
- Drawer.test.tsx: ~10-20 tests
- Combined deleted: ~45-70 tests; ~180-280 expects; -2 files

Plus 1 new test from INCLUDE #5: ~+1 test / +3-5 expects.

Post-M6 expected: ~487-513 pass / 0 fail / ~1583-1683 expects / 30 files.

Build size:
- CSS: 34.81 → ~30-32 kB (delete SessionDetail.css + Drawer.css; ~3-5 kB drop)
- JS: 265.88 → ~248-256 kB (delete SessionDetail.tsx + Drawer.tsx; ~10-18 kB drop)

## 10. Final Phase 5 closure log entry

Structure to add to `progress/phase-5.progress.md` §Completed Work Log:

```
- 2026-05-1X: **M6 delivered + PHASE 5 CLOSED** — Final chunk: drawer + SessionDetail deletion + 8-doc sweep + cumulative WCAG table + Phase 5 closure log. Diff: ... files deleted, ... lines source/test removed, build size dropped CSS ... kB / JS ... kB. UI/UX gate: not required. Three-reviewer rule converged in N codex round(s) + 1 normal Claude round + 1 backend-protection round. ... [details].

  **Phase 5 cumulative summary** — 6 milestones (M1a, M1b, M2a, M2b, M3a, M3b, M4, M5, M6) over X weeks (2026-04-27 to 2026-05-1X). Test count delta Phase 4 → Phase 5: 231 → ~500 (+~270). Build size delta: CSS 14.20 → 32 kB; JS 265.82 → 256 kB. Cumulative codex catch density: 30 GENUINE blocking findings (M1a 4 / M1b 2 / M2a 4 / M2b design 8 + impl 2 / M3a impl 5 + 1FP / M3b 0 / M4 design 4 + impl 0 + 5FP / M5 design 0 + 1FP + impl 1 + 1 nit / M6 ...). Cumulative WCAG-AA pairs: ~30 unique (table below). Tokens 83, hex 24, dep budget 1/2 consumed, slot 2 reserved + unused.

  **Phase 5 acceptance criteria** (spec §Acceptance Criteria lines 1080+): all met. Split-pane layout, compact list, persistent session pane with four-tab shell, parsers + buildSkim + LRU cache, signature details #1-#6 all implemented...

  **Phase 6 hand-off notes** (if any): ...

Phase 5 closed at impl SHA `<SHA1>` + log SHA `<SHA2>`.
```

## 11. UI/UX gate decision

**`not required`.** M6 ships zero new visible UI surface; no new tokens, hex, fonts, motion vocab, copy strings, or a11y structure. Deletions of dead code + doc sweep + cumulative WCAG reporting are all reference-class work. Matches M3a/M3b precedent (logic-only / cleanup-only → not required). No `frontend-design:frontend-design` skill invocation; no `working/phase-5/designs/m6-cleanup/` artifact.

## 12. Single-chunk vs split

**SINGLE CHUNK.** Deletions + 8-doc sweep + cumulative WCAG table + closure log form one coherent unit; splitting yields zero isolation benefit. Phase 4 M6 precedent confirms.

## 13. Codex catch precedents to defend against

1. **Stale doc references to deleted files** — `rg -n 'SessionDetail|Drawer' docs/ apps/frontend/` post-deletion expected: zero in apps/frontend/src/ (except possibly historical references in test JSDoc); zero in docs/ (M6 sweep removes all live references; only progress log historical entries remain).

2. **Hex isolation drift** — docs PR introducing new hex codes by accident in code samples. `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l` must equal 24.

3. **Test count regression — unexplained delta** — deleting tests is expected; reviewer needs to verify the delta matches the deleted files. Report exact count of tests removed per deleted file.

4. **Cargo / ts-binding regressions** — M6 must NOT touch protected paths. `git diff --stat HEAD -- apps/backend/ components/ tests/e2e/ Cargo.toml Cargo.lock apps/frontend/package.json apps/frontend/bun.lock` must be EMPTY.

5. **WCAG table accuracy** — cumulative table values must reconcile with M4's `wcag_m4.py` + M5's `wcag_m5.py` outputs. Re-run both scripts and verify against table.

6. **JSDoc reference cleanup** — `SessionsView.tsx:29-35`, `SessionsView.test.tsx:12-20,126`, `App.test.tsx:270` reference DEAD-BUT-TESTED state; M6 must rewrite to reflect post-deletion state. Codex grep for `DEAD-BUT-TESTED` post-M6 expected: zero hits (or only historical references in `working/phase-5/` artifacts which aren't live code).

7. **`focus-trap-react` still installed but never imported** — verify `apps/frontend/package.json` still lists it; verify no live import (`rg -n 'focus-trap' apps/frontend/src/` zero hits).

## 14. Verification commands (developer runs before declaring complete)

```bash
cd /home/huwei/ai_codings/distill-portal

# Test gates
cd apps/frontend && bun run test 2>&1 | tail -5
cd apps/frontend && bunx tsc --noEmit 2>&1 | tail -3
cd apps/frontend && bun run build 2>&1 | tail -5
cd ../..
cargo check --workspace 2>&1 | tail -3
cargo test --workspace 2>&1 | tail -3
cargo test -p distill-portal-ui-api-contracts --features ts-bindings 2>&1 | tail -3

# Deletion verification — files gone from disk
ls apps/frontend/src/features/sessions/SessionDetail.* 2>&1 | head -5  # Expected: No such file
ls apps/frontend/src/components/Drawer.* 2>&1 | head -5                # Expected: No such file

# Live references to deleted files — must be zero
rg -nE 'from\s+["\x27].*(SessionDetail|Drawer)' apps/frontend/src/ --type ts --type tsx
# Expected: zero hits

# DEAD-BUT-TESTED references should be zero post-M6 (or only in working/phase-5/ artifacts)
rg -n 'DEAD-BUT-TESTED' apps/frontend/src/
# Expected: zero hits

# Doc references to drawer / SessionDetail — should be zero live; historical references in working/phase-5/ artifacts acceptable
rg -nE 'SessionDetail|<Drawer|drawer' docs/

# Hex / token invariants
rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l    # MUST equal 24
rg -c '^\s*--' apps/frontend/src/styles/tokens.css      # MUST equal 83

# Protected paths untouched
git diff --stat HEAD -- apps/backend/ components/ tests/e2e/ Cargo.toml Cargo.lock apps/frontend/package.json apps/frontend/bun.lock
# Expected: empty output

# focus-trap-react still in package.json
grep -E 'focus-trap-react' apps/frontend/package.json
# Expected: one match
rg -n 'focus-trap' apps/frontend/src/
# Expected: zero hits (no live imports)

# WCAG script re-run to confirm authoritative ratios
python3 working/phase-5/designs/m4-transcript/wcag_m4.py | tail -40
python3 working/phase-5/designs/m5-skim/wcag_m5.py | tail -40

# E2E
cd apps/frontend && bun run test:e2e 2>&1 | tail -10
```

## 15. Bun-first invariant + protected paths

- Bun-first preserved (no `jest.fn()`, no `child_process`, no node-only imports in apps/frontend/src/).
- Protected paths: NO edits to `apps/backend/`, `components/`, `tests/e2e/` (Rust), root `Cargo.{toml,lock}`, `apps/frontend/package.json`, `apps/frontend/bun.lock`. `focus-trap-react` stays installed as orphan dependency.

## 16. Expected outcomes

- 6 files deleted (~1300 lines source + tests)
- 7 docs updated + 1 doc created (`docs/features/session-view.md`)
- 1 JSDoc expansion in App.tsx (M3b bumpCacheEpoch comment)
- 1 JSDoc addition in useParsedSession.ts (M4 AbortError-coalescing retroactive note)
- 1 new e2e/unit test (M5 Skim↔Transcript↔Skim cycle)
- Cumulative WCAG-AA table in progress log
- Final Phase 5 closure entry in progress log
- All gates green
- Phase 5 CLOSED

## 17. Open questions for coordinator

1. Should the planner's drafted `docs/features/session-view.md` outline (§5.5 above) be the developer's canonical starting point, or should the developer regenerate from scratch based on the spec? Recommendation: developer uses the outline as scaffold; refines based on actual implementation reality at file:line.
2. The "Open raw" anchor for source-only rows is documented as a known limitation rather than implemented in M6. If coordinator wants implementation, add to M6 scope (estimated +20 lines impl + 5 tests). Currently DEFERRED.
3. Spec amendments (M3a-2, M4-1) become post-M6 docs PRs; should those be drafted now (with the spec content ready to land after M6 close) or punted to after Phase 5 closure?

Default coordinator answer: 1=outline-as-scaffold; 2=document as limitation (don't implement); 3=draft after Phase 5 close (separate doc PRs to keep blast radius small).
