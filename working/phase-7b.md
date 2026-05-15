# Phase 7b: Parser Correctness + Warning Taxonomy

## Status

Frozen at the first commit landing this spec on `main`. Subsequent milestones reference that commit's SHA. Phase 6 closed at the four-commit sequence ending at `e78c2b1` on 2026-05-15 and is the baseline this phase mutates.

**Depends on Phase 7a closure.** Phase 7a (Event Support Matrix) authors `docs/features/parser-event-support.md` enumerating every event variant observed in real Claude Code + Codex sessions with its current parser route, render path, and status. Phase 7b consumes that matrix as its authoritative work list: every row marked `⚠ unknown` or `🔇 silenced (drift candidate)` gets a KEEP / SILENCE / FIX decision applied here.

## Why this phase exists

The per-tool parsers landed in Phase 5 (`apps/frontend/src/features/sessions/parsers/claude_code.ts` and `codex.ts`) consume real Claude Code and Codex JSONL streams and emit a typed message timeline plus a per-line `warnings[]` array. Today that array is rendered as a single session-level `<details>` banner reading "N parse warnings — click to view"; warnings carry only `{ lineOrdinal, reason }`. In practice the banner fires on most non-trivial real sessions, primarily for *expected* cases (Claude Code "session-level metadata" types we deliberately skip from the timeline, Codex `event_msg` payloads we don't yet route) rather than for real anomalies. The user can no longer distinguish "the parser found a bug in your data" from "the parser saw something it doesn't fully model yet but handled fine" because both surface as the same loud banner.

Phase 7c will overhaul transcript rendering — grouping consecutive tool-call lifecycles, surfacing inline per-message warnings, refining the loud-banner UX. To get there, the data shape needs to be honest first: each warning needs a severity (so noise can be silenced and real anomalies stay loud), a category (so 7c can route inline-vs-banner rendering), and an optional pointer to which message it concerns (so 7c can anchor inline surfaces). Equally important, the parsers themselves need to stop emitting warnings for cases that are actually *expected* — those warnings exist because the parser was written defensively against unknown variants, but their persistence inflates the warning count and trains users to dismiss the banner.

Phase 7b does the data-layer work in isolation. No UI changes. The hard gate: when the phase closes, running the parsers against every real local Claude Code + Codex session produces ZERO warnings. Any remaining warning at that point indicates a genuine anomaly the user wants to see when 7c lands the inline surface.

## Goal & Scope

### In scope (must close in Phase 7b)

- Drive every row in `docs/features/parser-event-support.md` (authored in 7a) to one of: `✅ supported`, `🔇 silenced` (with explicit parser route), or `🚧 known-limitation` (allow-listed). No row may remain `⚠ unknown` at phase close.
- **Lift every `@unskip Phase 7b` marker** in `apps/frontend/src/features/sessions/parsers/event-support-coverage.test.ts`. Each lift converts a `test.skip(...)` to `test(...)` and the body must pass against the now-fixed parser. The remaining-marker count is the canonical 7b work-list size.
- Audit every `warnings.push(...)` site in `claude_code.ts` (currently 14 emit sites) and `codex.ts` (currently 12 emit sites). For each, decide: (a) keep with structured severity + category, (b) downgrade to silent handling because the case is actually expected, or (c) fix the parser to handle the case correctly so the warning never fires. Record each decision back into the matrix row.
- Extend `ParseWarning` from `{ lineOrdinal, reason }` to `{ lineOrdinal, severity, category, reason, messageIndex? }`. The new fields are required-or-`undefined` per the table in §Data Model.
- Maintain backward compatibility at the existing `TranscriptView` warnings banner: the banner continues to render using `reason` only. Severity / category / messageIndex flow through unused until 7c consumes them.
- Per surviving warning kind (i.e. kept after the audit, not silenced or fixed), one reproducer fixture lands under `tests/fixtures/parser-warnings/<tool>/<kind>.jsonl`. Each fixture is byte-minimal — one or two lines that reliably trigger the warning.
- Real-session sweep harness: a Bun script `apps/frontend/scripts/parser-warning-sweep.ts` that walks the user's local Claude Code (`~/.config/claude-code/projects/`) and Codex (`~/.codex/sessions/`) directories, runs the parsers, and prints per-`(tool, severity, category)` warning counts. The script must run under Bun, not Node.
- Update bidirectional links in the matrix: every row's "Parser route" link points at the current `file:line` after the audit edits land; every audited parser arm carries the inline JSDoc anchor back to the matrix row (Phase 7a established the link convention).
- A short summary in `progress/phase-7b.progress.md` documenting the audit results: for each of the ~26 current emit sites, the decision (kept / silenced / fixed) and the reason.
- Documentation sweep: update `docs/features/session-view.md` (warning taxonomy section), `docs/features/parser-event-support.md` (status column updates), and `docs/playbooks/modify-frontend-page.md` (the parser-warning subsection).

### Out of scope (deferred to 7c or later)

- Any UI change to how warnings render. `TranscriptView` keeps the loud session banner exactly as it is today.
- Inline per-message warning surfaces. That's the core of 7c.
- The `render_hint` layer between parsers and the renderer. That's also 7c.
- Grouping consecutive tool calls. 7c.
- Render-treatment column in the matrix. 7c owns that.
- Backend changes. Parsers live frontend-side per Phase 5 architecture.
- New tool support (e.g. parsers for other coding assistants). Out of scope for the whole Phase 7 arc.
- Streaming-time parsing changes. The 5 MB cap, AbortController behavior, and `streamRawText` semantics stay verbatim.
- Performance work on the parsers. They are pure and synchronous today; that doesn't change.

## Dependency Policy

Inherits all Phase 5 + Phase 6 invariants.

- 24 hex literals in `apps/frontend/src/`; 83 tokens in `tokens.css`. Both unchanged (no visual surface change).
- Bun-first invariant: the sweep script + any test helpers run under Bun. No `jest.fn()`, no `child_process`, no `node:fs` in `apps/frontend/src/` (tests under `tests/` can use Bun's stdlib equivalents).
- No new runtime dependencies. The sweep script reads files via Bun's `Bun.file()` + `readdir` (`node:fs/promises` is allowed *inside* `apps/frontend/scripts/` since that's a tooling boundary, not runtime app code — confirm during M1 planner pass).
- focus-trap-react remains orphan-installed.

## Target Repository Shape

```text
apps/frontend/
├── src/
│   └── features/sessions/parsers/
│       ├── types.ts            # ParseWarning extended (severity, category, messageIndex)
│       ├── claude_code.ts      # audited; each surviving warnings.push includes severity + category
│       └── codex.ts            # audited; same
├── scripts/
│   └── parser-warning-sweep.ts # NEW — walks real session dirs, reports counts
└── (TranscriptView.tsx unchanged — banner consumes reason only, ignores new fields)

tests/
└── fixtures/
    └── parser-warnings/        # NEW — one fixture per surviving warning kind
        ├── claude_code/
        │   ├── malformed-json.jsonl
        │   ├── unknown-top-level-type.jsonl
        │   └── ... (one per kept warning kind)
        └── codex/
            ├── unknown-response-item-type.jsonl
            └── ... (one per kept warning kind)

docs/
└── features/
    └── parser-event-support.md  # AUTHORED in 7a; status column updated by 7b

progress/
└── phase-7b.progress.md         # NEW — audit decisions + sweep results
```

No files deleted. No new component crates. No backend touch.

## Data Model

### Extended `ParseWarning`

```ts
export type ParseWarningSeverity = "error" | "warning" | "info";

export type ParseWarningCategory =
  | "lexer"          // empty line / malformed JSON / non-object top-level
  | "schema"         // missing required field / role mismatch / unknown type
  | "payload"        // content array item issues / exec_command missing fields
  | "timestamp"      // unparseable RFC3339
  | "meta";          // session-level metadata not converted to timeline (RARE post-7b)

export type ParseWarning = {
  lineOrdinal: number;
  /** Required. Drives 7c's banner-vs-inline routing. */
  severity: ParseWarningSeverity;
  /** Required. Drives 7c's inline grouping. */
  category: ParseWarningCategory;
  /** Existing field — human-readable, surfaced verbatim in banner + inline. */
  reason: string;
  /**
   * Optional. Index into the `messages[]` array the warning concerns,
   * when applicable (e.g. a per-message anomaly that still produced a
   * Message). Absent when the warning concerns a line that did not
   * resolve into a Message (lexer errors, missing-type lines).
   */
  messageIndex?: number;
};
```

`ParserOutput` and `ParsedSession` continue to carry `warnings: ParseWarning[]`. No shape change there.

### Severity taxonomy (binding for the audit)

- `error` — line could not be parsed at all. Lexer failures and schema-missing-everything cases. The line yields a `Message{kind: "unknown"}` placeholder OR is dropped entirely (parser's existing choice; no change).
- `warning` — line was parsed, but its content is anomalous and the user should know. Type/role mismatches, unknown content item types, unknown top-level types, unknown payload variants.
- `info` — line was handled correctly by the parser per spec, but is *unusual enough that the user might want to know it existed*. Reserved for rare cases after the audit. Most current "info-looking" warnings (Claude-meta type skips, expected `event_msg` noise) should be silenced entirely during 7b, not downgraded.

### Category taxonomy (binding for the audit)

- `lexer` — anything that fails before JSON object inspection: empty lines, malformed JSON, top-level non-object.
- `schema` — top-level shape problems: missing `type`, unknown `type`, role/`type` mismatch.
- `payload` — message-body or sub-field problems: content array item issues, exec_command missing required fields, payload missing required keys.
- `timestamp` — RFC3339 parse failures.
- `meta` — anomalies in session-level metadata that the parser deliberately skips. Reserved; most existing meta warnings should be silenced entirely in 7b.

## Audit Methodology

The audit is the core of M1, driven by the 7a-authored matrix. For each row in `docs/features/parser-event-support.md` whose status is not `✅ supported`, AND for each of the ~26 current `warnings.push(...)` emit sites (some overlap with matrix rows), the planner + impl agent:

1. **Reads the code path** that triggers the warning OR routes the variant. Confirms the trigger condition exactly. Cross-references the matrix row.
2. **Decides the outcome**, one of:
   - **KEEP**: this is a real anomaly users should see. Assign `severity` + `category`. Add a fixture under `tests/fixtures/parser-warnings/`. Matrix row status → `✅ supported` with notes citing the structured warning.
   - **SILENCE**: this is an expected case the parser was being defensive about. Remove the warning emit. Adjust the surrounding code path to handle the case explicitly (e.g. a deliberate `kind: "system"` route, or a no-op skip). Add an inline JSDoc comment citing the audit decision AND the matrix row anchor. Matrix row status → `🔇 silenced`.
   - **FIX**: this is anomalous data we *should* be handling. Update the parser to model the case correctly. Add a fixture under the regular parser-truth-table directory (NOT `parser-warnings/`). Matrix row status → `✅ supported`.
3. **Records the decision** in `progress/phase-7b.progress.md` with the line citation and one-sentence rationale, AND updates the matrix row.

The planner is encouraged to err toward SILENCE for the meta-type cases (Claude Code's "Skipping Claude-meta type 'X'" pattern is a strong silence candidate) and toward KEEP+structured for unknown-type / unknown-variant cases (those are genuine signal that data drifted from our model).

### Real-session sweep

The sweep script is the gate for the phase. It runs after the audit lands and confirms the zero-warning property holds on the user's actual session corpus.

```text
apps/frontend/scripts/parser-warning-sweep.ts
```

Behavior:
- Walks `~/.config/claude-code/projects/` and `~/.codex/sessions/` recursively (paths configurable via CLI flag).
- For each `*.jsonl` file, reads it, dispatches to the corresponding parser, collects warnings.
- Prints a per-`(tool, severity, category)` aggregate count.
- Exits non-zero if ANY warning fires for any session. CI-friendly.

The phase does NOT close until the sweep exits zero on the user's real corpus. Fixture warnings (intentional triggers under `tests/fixtures/parser-warnings/`) are excluded from the sweep — the sweep walks only real session paths.

## Milestones

Two milestones. Two-commit pattern per chunk (impl + log). Three-reviewer rule applies (backend-protection Claude + normal Claude + Codex external). Codex reasoning effort `medium` per Phase 6 closure guidance.

### Milestone 1: Audit + ParseWarning shape + parser fixes

- Read every emit site in `claude_code.ts` + `codex.ts`. Cross-reference against the 7a-authored matrix. Author the per-site decision table in `progress/phase-7b.progress.md` (KEEP / SILENCE / FIX with rationale).
- Extend `parsers/types.ts` with the new `ParseWarning` shape + the two enum types.
- Apply each decision:
  - KEEP sites: add `severity` + `category` arguments to the existing `warnings.push(...)` call; add a reproducer fixture under `tests/fixtures/parser-warnings/<tool>/<kind>.jsonl` and a corresponding parser truth-table test asserting the structured warning. Update matrix row.
  - SILENCE sites: remove the `warnings.push(...)` call, adjust the surrounding switch arm to handle the case explicitly (most often `kind: "system"` route + inline JSDoc explaining the audit decision + matrix anchor). Update matrix row.
  - FIX sites: update the parser to model the case correctly. Add a normal parser-truth-table fixture (NOT under `parser-warnings/`) asserting the new MessageKind routing. The warning emit goes away as a side effect. Update matrix row.
- Update existing parser tests to assert `severity` + `category` for the warnings they already exercise.

Definition of done:
- `bun run test` green (existing 538 frontend tests still pass; new fixture tests land).
- `bunx tsc --noEmit` clean.
- `bun run build` green; bundle size envelope unchanged.
- Existing `TranscriptView` banner still renders correctly (it consumes `reason` only, ignores the new fields).
- Audit table in `progress/phase-7b.progress.md` enumerates all current emit sites with decisions.
- Matrix doc rows touched by M1 reflect updated statuses + parser-route file:line links.
- No new runtime deps; no UI change.

### Milestone 2: Real-session sweep + docs + zero-warning gate

- Author `apps/frontend/scripts/parser-warning-sweep.ts` per §Audit Methodology → Real-session sweep.
- Run the sweep on the coordinator's local Claude Code + Codex session corpus. Iterate: for each warning kind that fires on real data, decide KEEP / SILENCE / FIX and apply (looping back to M1's decision matrix as needed; record additional decisions in the progress log AND in the matrix).
- Repeat until the sweep exits zero on the user's real corpus.
- Documentation sweep:
  - `docs/features/session-view.md` — new "Warning taxonomy" subsection documenting severity + category buckets and the zero-warning real-session invariant.
  - `docs/features/parser-event-support.md` — verify all rows touched by M1 + M2 have final statuses; no `⚠ unknown` rows remain.
  - `docs/playbooks/modify-frontend-page.md` — parser-warning audit pattern (how to handle future unknown variants: prefer SILENCE+explicit-route over KEEP+warning unless the case is truly anomalous; cite the matrix doc as authority).
  - `docs/dev-commands.md` — add a row for the sweep script.
- Final progress log entry recording the close of Phase 7b + sweep result table.

Definition of done:
- Sweep exits zero on the user's real Claude Code + Codex session corpus.
- All gates green (`cargo check --workspace`, `cargo test --workspace`, `bun test src`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`).
- Docs sweep complete (4 files).
- No `⚠ unknown` rows remain in the matrix.
- Phase 7b progress log records every audit decision + sweep outcome.

## Acceptance Criteria

Phase 7b close is achieved when ALL of the following hold:

1. `ParseWarning` carries `severity` + `category` (required) + `messageIndex` (optional) in addition to the existing `lineOrdinal` + `reason`.
2. `ParseWarningSeverity` and `ParseWarningCategory` are exported enum types with the values listed in §Data Model.
3. Every surviving `warnings.push(...)` call in `claude_code.ts` and `codex.ts` supplies `severity` + `category` arguments; no untyped emits remain.
4. Reproducer fixtures exist for every surviving warning kind under `tests/fixtures/parser-warnings/<tool>/<kind>.jsonl`.
5. The audit decision table in `progress/phase-7b.progress.md` enumerates the disposition (KEEP / SILENCE / FIX) of every current emit site, with file:line citations and one-sentence rationales.
6. The sweep script exists at `apps/frontend/scripts/parser-warning-sweep.ts`, runs under Bun, walks the user's local session directories, and exits zero on the current corpus.
7. The matrix at `docs/features/parser-event-support.md` has no `⚠ unknown` rows; every row is one of `✅ supported`, `🔇 silenced`, or `🚧 known-limitation`.
7a. **Zero `@unskip Phase 7b` markers remain** in `apps/frontend/src/features/sessions/parsers/event-support-coverage.test.ts`. Every previously-skipped test now runs as `test(...)` and passes. `grep -c "@unskip Phase 7b" apps/frontend/src/` returns 0.
8. The existing `TranscriptView` warnings banner continues to render unchanged.
9. No UI surface change. No new runtime deps. Hex literal count and token count are unchanged.
10. Bun-first invariant holds; no `jest.fn()`, `child_process`, or `node:fs` imports in `apps/frontend/src/` runtime app code.
11. Three-reviewer trail per milestone recorded in `progress/phase-7b.progress.md`.

## Testing

- **Frontend unit**: per-warning-kind parser truth tables under the existing parser test files. Each surviving KEEP warning gets one positive fixture + one negative-control fixture (a similar line that should NOT trigger).
- **SILENCE coverage**: every SILENCEd case gets a regression test asserting NO warning fires for the previously-warning input (the input now resolves to a normal Message routing).
- **FIX coverage**: every FIXed case gets a positive test asserting the new MessageKind routing.
- **Sweep script self-test**: a small fixture session under `tests/fixtures/parser-warnings/` is fed through the sweep to assert it prints a non-zero count when warnings exist + exits non-zero. Then a clean-fixture variant asserts it exits zero.
- **Existing TranscriptView tests**: continue to pass unchanged (banner consumes `reason` only).

## Risks

| Risk | Mitigation |
|---|---|
| The audit silences a warning that turns out to be a real anomaly on a session the coordinator doesn't have locally. | The sweep script is the gate. The phase doesn't close until the coordinator runs it on a representative corpus. Phase 7c's inline surface will catch any anomaly that slips through 7b. |
| Adding required fields to `ParseWarning` is a breaking API change for any consumer. | The only current consumer is `TranscriptView`'s banner, which reads `reason` only. The TS type extension is non-breaking by construction. |
| Real sessions reveal cases the parser fundamentally can't model (truly unknown variants). | Those go on the matrix's `🚧 known-limitation` allow-list with a progress-log entry; the sweep respects the allow-list. The phase still closes. |
| Matrix and progress log drift: a decision lands in the progress log but the matrix row isn't updated. | M1 + M2 DoD both require matrix updates per decision. The bidirectional link convention (matrix → file:line; file:line → matrix anchor) makes drift detectable via grep. |
| Sweep behavior on missing user directories. | The script must fail gracefully when `~/.config/claude-code/projects/` or `~/.codex/sessions/` doesn't exist; it skips and reports rather than erroring. |

## Resolved Decisions

These are pre-decided. Planner does not re-litigate.

1. **Two milestones.** M1 audits + extends the shape + applies decisions; M2 runs the sweep + docs. M2 may loop back to M1's decision matrix as the sweep surfaces new cases.
2. **`severity` and `category` are REQUIRED on `ParseWarning`.** No optional defaults. Every emit site must declare both.
3. **`messageIndex` is OPTIONAL.** Only present when the warning concerns a specific message that did resolve. Lexer / schema errors that produce no Message leave it absent.
4. **No UI change in this phase.** `TranscriptView` banner stays verbatim. 7c owns the inline surface.
5. **Bias toward SILENCE for meta-type cases.** The Claude Code "Skipping Claude-meta type 'X'" pattern is a strong silence candidate — those are deliberate parser routes, not anomalies. Silencing means adding an explicit `kind: "system"` (or no-emit) arm with an inline JSDoc audit comment AND a matrix-anchor citation.
6. **Bias toward KEEP+structured for unknown-type / unknown-variant cases.** Those are genuine signal that real data drifted from our model. Categorize them as `schema` or `payload` per the table.
7. **Sweep walks user's local session directories.** No automation against synthetic sessions; the audit is grounded in real data. Defaults: `~/.config/claude-code/projects/` and `~/.codex/sessions/`. CLI flags override.
8. **Allow-list escape hatch via matrix.** If a real-session variant truly can't be modeled, it lands as `🚧 known-limitation` in the matrix with a progress-log entry citing the variant. The sweep respects the matrix-driven allow-list. The phase closes when the sweep exits zero (allow-list applied).
9. **Codex reasoning effort `medium`.** Carried from Phase 6 close.
10. **Pure-frontend phase.** No backend touch. No contract change. No new component crate.
11. **Matrix is the authoritative work list.** Every parser audit decision updates the corresponding matrix row's status + bidirectional link. Drift between progress log and matrix is treated as a DoD violation.
12. **7a-test escape hatch.** Phase 7b MAY rewrite or delete a 7a-authored test if the audit reveals the test's assertion was wrong about the variant's intended behavior. Each such rewrite/delete requires (a) a progress-log entry citing the matrix anchor + the reason, (b) the matrix row updated to reflect the corrected intended behavior, (c) the replacement test (if any) passes. Phase 7b MAY NOT delete a test simply because making it pass is hard — that case becomes a `🚧 known-limitation` matrix row + allow-list entry with its own progress-log justification.

## Open Considerations

Flagged for M1 planner. Not pre-resolved.

- **Scope of the sweep's "real session" definition.** Coordinator's `~/.config/claude-code/projects/` includes projects with hundreds of sessions; sweep on a 10 GB corpus could be slow. M1 decides whether to sample, walk fully, or accept slow runtime with a progress indicator.
- **Whether `messageIndex` should be present on `error` severity at all.** `error` warnings often correspond to lines that yield no Message; in those cases `messageIndex` is naturally absent. M1 confirms there's no semantic conflict (e.g. an `error` warning that DOES correspond to a Message is fine; absence of `messageIndex` carries no implicit meaning).
- **Exact fixture file naming convention.** The spec proposes `tests/fixtures/parser-warnings/<tool>/<kind>.jsonl`. M1 confirms `<kind>` is human-readable (e.g. `unknown-top-level-type.jsonl`) rather than encoded (e.g. `001.jsonl`), and matches one-to-one with the audit decision table for traceability.
- **Whether the `info` severity bucket has any 7b-time citizens at all.** If every audit decision lands as `error` / `warning` / SILENCE / FIX, `info` is reserved-but-unused. That's fine, but M2's docs should note it explicitly so future maintainers don't think they must use it.
