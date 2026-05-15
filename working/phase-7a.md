# Phase 7a: Event Support Matrix

## Status

Frozen at the first commit landing this spec on `main`. Subsequent milestones reference that commit's SHA. Phase 6 closed at the four-commit sequence ending at `e78c2b1` on 2026-05-15 and is the baseline this phase mutates.

## Why this phase exists

The frontend transcript parsers (`apps/frontend/src/features/sessions/parsers/claude_code.ts` and `codex.ts`) consume real Claude Code and Codex JSONL streams and emit a typed `Message` timeline plus a `warnings[]` array. The Phase 5 implementation chose a defensive style: any unknown top-level `type`, any unknown content-array `item.type`, any unknown Codex `event_msg` payload variant emits a `ParseWarning` and routes the line to `kind: "unknown"`. This worked well enough to ship — but it left two problems unsolved.

First, **we have no enumeration of what's actually in the data.** We know the parsers handle the variants they were written against, and we know they emit warnings for things they don't recognise. We do not have a tracked list of every variant that real sessions actually contain, so we cannot answer "is everything users see today supported?" without reading every parser switch arm by hand.

Second, **the parser code and the renderer code drift independently.** Adding a new `MessageKind` triggers a build error in `TranscriptView.tsx` (the exhaustiveness check), but adding a new top-level type that quietly routes to an existing `MessageKind` does not. A new Codex variant routed to `kind: "system"` looks supported but may render as an opaque blob. Without a central catalogue, the renderer can lag the parser silently.

Phase 7a closes both problems by authoring a single document — `docs/features/parser-event-support.md` — that lists every variant observed in real session corpora, with its current parser route, current render path, status, and fixture pointer. Bidirectional links between the matrix and the code (matrix row → parser/renderer `file:line`; parser/renderer inline JSDoc → matrix anchor) make drift detectable via grep.

This phase produces **the document and the bidirectional links only**. It does NOT change parser logic, fix warnings, or change rendering. Those follow-ups are Phase 7b (parser correctness) and Phase 7c (rendering overhaul). The matrix is their authoritative work list.

## Goal & Scope

### In scope (must close in Phase 7a)

- Walk the user's local Claude Code (`~/.config/claude-code/projects/`) and Codex (`~/.codex/sessions/`) session directories. Enumerate every distinct `(tool, top_level_type, payload_or_variant)` tuple observed in the JSONL streams.
- For each tuple, read the current parser to determine its route (`MessageKind` it resolves to, or whether it is silently skipped, or whether it triggers a `ParseWarning`).
- For each tuple's resulting `MessageKind`, identify the current render arm in `TranscriptView.tsx` (one of the seven `case` branches).
- Author `docs/features/parser-event-support.md` with one row per tuple. Columns: tool, top-level type, payload/variant, parser route, render treatment, status, fixture pointer, parser-route link (file:line), render-treatment link (file:line).
- Status taxonomy: `✅ supported`, `🔇 silenced`, `⚠ unknown` (Phase 7b work item), `🚧 known-limitation`, or `🎨 deferred to 7c` (parses cleanly, renders generically — Phase 7c work item).
- Install bidirectional link conventions:
  - Every matrix row links to its parser-route and render-treatment file:line.
  - Every audited parser switch arm and renderer case branch carries an inline JSDoc comment citing the matrix anchor (`/** Matrix: docs/features/parser-event-support.md#<anchor> */`).
- **Author a fixture file** under `tests/fixtures/parser-events/<tool>/<anchor>.jsonl` for every matrix row — one or two representative JSONL lines that reliably exhibit the variant.
- **Author parser tests** in `apps/frontend/src/features/sessions/parsers/event-support-coverage.test.ts` asserting the expected parser route for every matrix row. Variants currently in `⚠ unknown` status (parser warns + falls through to `kind: "unknown"`) get `test.skip(...)` with an inline `@unskip Phase 7b` marker; the test body asserts the *future* expected route so Phase 7b just needs to lift the skip.
- **Author render tests** in `apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx` for variants whose intended treatment is concretely specified (text cards, paired tool lifecycle cards, boundary dividers, system notes). Variants currently in `🎨 deferred to 7c` status get `test.skip(...)` with `@unskip Phase 7c` markers. Variants whose render treatment is not yet specified at 7a close get a minimal "renders without crashing" smoke test (not skipped, mandatory pass).
- An enumeration script under `apps/frontend/scripts/event-support-enumerate.ts` (Bun) that walks the corpus and prints the distinct tuple set; reproducible for future runs as new variants surface.
- A short summary in `progress/phase-7a.progress.md`: the enumeration result (per-tool tuple counts), the per-tuple status breakdown, the bidirectional-link audit result (any missing links), the test-skip count per `@unskip` phase (this is the work-list size for 7b and 7c), and the worklist that Phase 7b + 7c will inherit.
- Documentation links: `docs/README.md` Feature Guides list gains a row for the new matrix doc.

### Out of scope (deferred)

- Any parser code change. The audit is observational; if a row is `⚠ unknown` (warning fires) or `🎨 deferred to 7c` (renders generically), it stays that way at Phase 7a close. The fix lands in 7b (parser) or 7c (renderer).
- Any renderer code change. Same logic.
- Extending `ParseWarning` shape. That is Phase 7b's first deliverable.
- Removing existing warnings. Phase 7b's KEEP / SILENCE / FIX decisions, not 7a's.
- Grouping consecutive tool calls or any other rendering work. Phase 7c.
- New tool support. Out of scope for the entire Phase 7 arc.
- Backend changes. The Rust-side metadata adapters (`components/collector-runtime/src/adapters/`) are not audited here; this phase is scoped to the **transcript** parser + renderer chain. Adapter coverage is a separate concern (the backend's parser extracts only title/path/fingerprint, not the timeline).

## Dependency Policy

Inherits all Phase 5 + Phase 6 invariants.

- 24 hex literals in `apps/frontend/src/`; 83 tokens in `tokens.css`. Both unchanged.
- Bun-first invariant: the enumeration script runs under Bun. No `jest.fn()`, no `child_process`, no `node:fs` imports in `apps/frontend/src/` runtime app code. Tooling under `apps/frontend/scripts/` may use `node:fs/promises` as a build/tooling-time concession (confirm during M1 planner pass; this is the same boundary the Phase 7b sweep script lives at).
- No new runtime dependencies. The enumeration script is pure Bun + stdlib.
- focus-trap-react remains orphan-installed.

## Target Repository Shape

```text
docs/
└── features/
    └── parser-event-support.md   # NEW — the matrix; primary deliverable

apps/frontend/
├── src/
│   └── features/sessions/parsers/
│       ├── claude_code.ts        # touched only to add inline matrix-anchor JSDoc comments
│       ├── codex.ts              # same
│   └── features/sessions/
│       └── TranscriptView.tsx    # touched only to add inline matrix-anchor JSDoc comments per case
└── scripts/
    └── event-support-enumerate.ts # NEW — walks the corpus, prints distinct tuples

progress/
└── phase-7a.progress.md          # NEW — enumeration result + worklist for 7b/7c
```

No files deleted. No new component crates. No new runtime deps. No logic changes.

## Matrix Schema

Each row in `docs/features/parser-event-support.md` is one observed variant. Anchor IDs are slugged from `<tool>-<top-level-type>[-<payload-or-variant>]` (e.g. `claude-code-user-tool-result`, `codex-event-msg-exec-command-output`).

| Column | Content | Authoritative source |
|---|---|---|
| Tool | `claude_code` \| `codex` | Tool enum in `ui-api-contracts` |
| Top-level type | The JSONL record's top-level `type` field | Observed in the corpus |
| Payload / variant | The next-level discriminator: `payload.type` for Codex, `content[].type` or — for Claude Code; `—` if the top-level type has no further variant | Observed in the corpus |
| Parser route | The `MessageKind` the parser resolves the line to, or `(skipped)` for silent drops, or `unknown + warning` for current warning emits | Parser switch arm |
| Render treatment | One of: `text card` (user/assistant text), `tool lifecycle` (paired tool_use+tool_result, post-7c), `boundary divider`, `system note`, `unknown placeholder`, `(not rendered — skipped)` | TranscriptView case arm; render-treatment column may say "deferred to 7c" for variants that currently render generically |
| Status | `✅ supported`, `🔇 silenced`, `⚠ unknown`, `🚧 known-limitation`, `🎨 deferred to 7c` | This phase + downstream phases update |
| Fixture | Path to a representative fixture line, or `—` if none exists yet | `tests/fixtures/` |
| Parser link | `file:line` link to the switch arm | Parser source |
| Render link | `file:line` link to the case branch | TranscriptView source |

### Status definitions

- **✅ supported** — parser routes the variant cleanly to a `MessageKind`, renderer has a specific case branch that displays it correctly. No warning fires.
- **🔇 silenced** — parser deliberately skips the variant (no Message emitted, no warning). Used for session-level metadata records that aren't part of the timeline. Has an inline JSDoc citing the matrix anchor.
- **⚠ unknown** — current parser emits a `ParseWarning` for this variant and routes it to `kind: "unknown"`. Phase 7b work item: KEEP / SILENCE / FIX.
- **🚧 known-limitation** — variant exists in the wild but is genuinely outside our model; allow-listed via the matrix + a progress-log entry. The sweep in 7b respects the allow-list.
- **🎨 deferred to 7c** — parser routes cleanly to a `MessageKind`, but the renderer treats it generically (e.g. a Codex variant routed to `kind: "system"` that renders as a system note when it should render as a tool call). Phase 7c work item.

## Methodology

The enumeration is the core of M1. Two passes.

### Pass 1 — corpus enumeration (script-driven)

`apps/frontend/scripts/event-support-enumerate.ts` walks both session directories, parses each JSONL line, and emits a per-`(tool, top_level_type, payload_or_variant)` aggregate count. The script does NOT classify against the parsers yet; it just enumerates the raw shape of the data.

Output format:

```text
=== claude_code ===
user                                             4521 lines
user / content[].text                            3104 lines
user / content[].tool_result                     1417 lines
assistant                                        4519 lines
assistant / content[].text                       2104 lines
assistant / content[].tool_use                   2415 lines
custom-title                                       17 lines
summary                                            42 lines
...

=== codex ===
event_msg / user_message                          314 lines
event_msg / agent_message                         298 lines
event_msg / exec_command                          412 lines
event_msg / exec_command_output                   411 lines
response_item / message                           601 lines
response_item / function_call                     127 lines
response_item / <unknown payload type>              3 lines
...
```

The output is committed under `progress/phase-7a.progress.md` as a verbatim block for future reproducibility.

### Pass 2 — matrix authoring (manual, planner-led)

For each distinct tuple from Pass 1:
1. Locate the parser switch arm handling it (or note its absence).
2. Trace the resulting `MessageKind`. Locate the render case branch.
3. Assess status against the taxonomy above.
4. Write the matrix row with all 9 columns filled.
5. Add the inline JSDoc anchor comment at the parser site and the render site.

If a variant has no parser handling (the parser falls through to the catch-all `unknown + warning` arm), it gets status `⚠ unknown` and is added to the 7b worklist.

If a variant parses cleanly but renders via a generic case (e.g. `system` for a Codex variant that conceptually represents a tool call), it gets status `🎨 deferred to 7c` and is added to the 7c worklist.

## Test Authoring Convention

Phase 7a authors a test corpus that mirrors the matrix one-to-one. Every matrix row gets a fixture file + a parser test + (where the rendering is specified) a render test. Tests for variants that *cannot yet pass* (because their parser route or render treatment is part of Phase 7b's or 7c's deliverables) are marked with `test.skip(...)` and an inline `@unskip Phase 7b` or `@unskip Phase 7c` comment. The skip markers form the explicit, grep-detectable work list for downstream phases.

### Suite layout

```text
tests/fixtures/parser-events/
├── claude_code/
│   ├── claude-code-user-tool-result.jsonl
│   ├── claude-code-assistant-tool-use.jsonl
│   ├── claude-code-custom-title.jsonl       # silenced row
│   └── ...
└── codex/
    ├── codex-event-msg-user-message.jsonl
    ├── codex-event-msg-exec-command.jsonl
    ├── codex-event-msg-exec-command-output.jsonl
    └── ...

apps/frontend/src/features/sessions/
├── parsers/
│   └── event-support-coverage.test.ts       # NEW — per-matrix-row parser tests
└── TranscriptView.event-coverage.test.tsx   # NEW — per-matrix-row render tests
```

### Test shape

One `describe` block per matrix anchor. Each describe block contains the parser test plus the optional render test:

```ts
describe("matrix: codex-event-msg-exec-command", () => {
  test("parser routes to MessageKind=tool_use", async () => {
    const fixture = await Bun.file("tests/fixtures/parser-events/codex/codex-event-msg-exec-command.jsonl").text();
    const { messages, warnings } = parseCodex(fixture, { lineOrdinalOffset: 0 });
    expect(warnings).toEqual([]);
    expect(messages[0].kind).toBe("tool_use");
  });

  test.skip("renderer shows tool lifecycle card paired with exec_command_output [@unskip Phase 7c]", async () => {
    // Body authored now; lifted to test(...) when 7c lands the tool-lifecycle render branch.
    const { container } = renderTranscriptWithFixture("codex-event-msg-exec-command.jsonl");
    expect(container.querySelector(".tool-lifecycle")).not.toBeNull();
  });
});
```

### Test exemption rule (the green-suite contract)

The set of tests EXEMPTED from the green-suite requirement at Phase 7a close is **exactly**: tests marked `test.skip(...)` AND carrying an inline `@unskip Phase 7b` or `@unskip Phase 7c` comment. Any other test must pass. The skip markers themselves do not count as failures — skipped tests do not run.

Concrete contract:
- `bun run test` at Phase 7a close exits 0.
- The skipped-test count grows by exactly the number of `⚠ unknown` rows + the number of `🎨 deferred to 7c` rows + the optional render-test skips for not-yet-specified treatments.
- A grep `@unskip Phase 7b` over the test suite returns one match per `⚠ unknown` matrix row. Same for `@unskip Phase 7c`.
- All 538+ pre-existing tests still pass. No regression in existing coverage.

### Lifecycle through the phase arc

| Phase | What it does to the 7a test corpus |
|---|---|
| 7a | Authors fixtures + tests. Marks unsupported variants with `test.skip` + `@unskip Phase 7b/7c`. |
| 7b | Lifts every `@unskip Phase 7b` marker as the corresponding parser variant is fixed. `test.skip` → `test`. New tests pass. |
| 7c | Lifts every `@unskip Phase 7c` marker as the corresponding render treatment lands. `test.skip` → `test`. New tests pass. |
| Future | New variants get a new matrix row + fixture + parser/render test pair. No `@unskip` marker unless the test needs work from a later phase. |

A reviewer can verify Phase 7b / 7c progress with a single grep — the count of remaining `@unskip Phase 7b` markers IS the remaining 7b work; same for 7c.

## Bidirectional Linking Convention

The matrix is markdown. Links go both ways:

**Matrix → code** (in `parser-event-support.md`):
```markdown
| `claude_code` | `user` | `content[].tool_result` | `tool_result` | text card | ✅ supported | [`user-tool-result.jsonl`](../../tests/fixtures/parser-events/claude_code/user-tool-result.jsonl) | [`claude_code.ts:152`](../../apps/frontend/src/features/sessions/parsers/claude_code.ts#L152) | [`TranscriptView.tsx:280`](../../apps/frontend/src/features/sessions/TranscriptView.tsx#L280) |
```

**Code → matrix** (inline JSDoc at the parser switch arm):
```ts
case "tool_result": {
  /** Matrix: docs/features/parser-event-support.md#claude-code-user-tool-result */
  ...
}
```

And at the render case branch:
```ts
case "tool_result":
  /** Matrix: docs/features/parser-event-support.md#claude-code-user-tool-result */
  return renderToolResult(message);
```

A grep `Matrix:` over `apps/frontend/src/` and a corresponding scan of the matrix file's anchor list lets reviewers detect drift in O(seconds).

## Milestones

Single milestone. This phase is small (audit + doc authoring) and reviewable as one chunk. Two-commit pattern (impl + log). Three-reviewer rule applies. Codex reasoning effort `medium`.

### Milestone 1: Enumerate, classify, link

- Author `apps/frontend/scripts/event-support-enumerate.ts`. Run it against the coordinator's local corpus. Verify output is deterministic across runs.
- Manual Pass 2: read each tuple's parser path; classify; locate render case; write matrix row.
- Author `docs/features/parser-event-support.md` with the full table.
- Add inline `Matrix:` JSDoc comments at every parser switch arm AND every TranscriptView case branch referenced by the matrix.
- Update `docs/README.md` Feature Guides list to surface the new matrix doc.
- Run a link audit: every matrix row's parser link + render link resolves; every `Matrix:` comment in source has a corresponding matrix anchor.
- Author `progress/phase-7a.progress.md` with the enumeration block, per-status counts, and the 7b/7c worklist.

Definition of done:
- `docs/features/parser-event-support.md` exists with one row per observed tuple.
- Every row's parser link + render link resolves to a real file:line.
- Every parser switch arm and TranscriptView case branch covered by the matrix carries the inline `Matrix:` JSDoc.
- The enumeration script runs under Bun and prints reproducible output.
- `progress/phase-7a.progress.md` records the result + per-status counts + worklist for 7b/7c.
- `bun run test`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e` all green (no logic changes; tests untouched).
- Hex literal count 24; token count 83.
- Three-reviewer trail recorded.

## Acceptance Criteria

Phase 7a close is achieved when ALL of the following hold:

1. `docs/features/parser-event-support.md` exists.
2. Every `(tool, top_level_type, payload_or_variant)` tuple emitted by the enumeration script against the coordinator's real local Claude Code + Codex corpus has a corresponding matrix row.
3. Each row has all 9 columns filled (tool, top-level type, payload/variant, parser route, render treatment, status, fixture, parser link, render link).
4. Bidirectional links are wired: matrix rows link to parser + render `file:line`; every parser switch arm and TranscriptView case branch referenced by the matrix carries `/** Matrix: docs/features/parser-event-support.md#<anchor> */`.
5. Status counts are recorded in `progress/phase-7a.progress.md`. Rows in status `⚠ unknown` form the 7b worklist; rows in status `🎨 deferred to 7c` form the 7c worklist.
6. The enumeration script at `apps/frontend/scripts/event-support-enumerate.ts` runs under Bun and prints reproducible output.
7. **Every matrix row has a corresponding fixture file** under `tests/fixtures/parser-events/<tool>/<anchor>.jsonl`.
8. **Every matrix row has a corresponding parser test** in `apps/frontend/src/features/sessions/parsers/event-support-coverage.test.ts`. Variants in `⚠ unknown` status are `test.skip` with `@unskip Phase 7b` markers; otherwise tests pass.
9. **Every matrix row whose intended render treatment is specified has a corresponding render test** in `apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx`. Variants in `🎨 deferred to 7c` status are `test.skip` with `@unskip Phase 7c` markers; otherwise tests pass. Variants whose treatment is not yet specified at 7a close get a minimal "renders without crashing" smoke test that MUST pass.
10. **`bun run test` exits 0.** All 538+ pre-existing tests still pass; new 7a-authored tests pass or are explicitly `test.skip` with an `@unskip` marker. No other test is allowed to fail.
11. **Grep contract**: `grep -c "@unskip Phase 7b"` and `grep -c "@unskip Phase 7c"` over the test suite match the count of `⚠ unknown` and `🎨 deferred to 7c` rows respectively (allowing for optional smoke-test skips noted in §Test Authoring Convention).
12. No parser logic change. No renderer logic change. No `ParseWarning` shape change.
13. All other gates green (`cargo check --workspace`, `cargo test --workspace`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`); no new runtime deps; hex + token invariants preserved.
14. Three-reviewer trail per milestone recorded.

## Testing

Phase 7a authors a substantial test corpus that mirrors the matrix. Two layers of testing:

### 1. Phase 7a's own deliverables

- **Matrix-row coverage** (per §Test Authoring Convention): one fixture + one parser test + (optionally) one render test per matrix row. Some tests are `test.skip` with `@unskip` markers — they are scaffolding for 7b/7c, not failures.
- **Link audit**: a small Bun script (can be inline in the M1 progress log entry, no need to commit as a permanent harness) that verifies every `Matrix:` anchor in `apps/frontend/src/` corresponds to an anchor in `parser-event-support.md`, and every matrix row's parser/render link resolves to a non-empty line in the cited file. Run once at M1 close; record result in the progress log.
- **Enumeration script self-test**: a tiny fixture session under `tests/fixtures/parser-events/` is fed through the script to assert it prints the expected tuple counts.
- **Grep contract audit**: confirm `grep -c "@unskip Phase 7b"` and `grep -c "@unskip Phase 7c"` totals match the matrix row counts.

### 2. Existing suite (unchanged)

- All 538+ pre-existing tests still pass. No logic changed.

### What may fail at Phase 7a close

Nothing. Skipped tests are not failures. The green-suite contract is absolute: `bun run test` exits 0. The `@unskip Phase 7b` / `@unskip Phase 7c` markers form a work list, not a CI red state.

## Risks

| Risk | Mitigation |
|---|---|
| Real-corpus enumeration reveals so many variants the matrix becomes unwieldy. | Group strictly identical tuples. If a variant appears <5 times across the entire corpus and has no obvious distinguishing feature, group it under the catch-all `⚠ unknown` row with a count annotation. Phase 7b decides whether each grouped variant gets its own row when fixed. |
| The coordinator's local corpus doesn't cover every variant in the wild. | The matrix is a living document. Future tools (or rescans of additional projects) will add rows. The bidirectional link convention makes additions safe. Phase 7b's sweep gate forces the next round of additions. |
| Inline `Matrix:` comments inflate parser/renderer file size or hurt readability. | The convention is one comment per switch arm / case branch, not one per line. Total ~26 comments in parsers + ~7 in TranscriptView = ~33 single-line JSDoc additions. Negligible. |
| Drift: a parser switch arm changes file:line and the matrix row's link goes stale. | Reviewers run the link audit at M1 close + future commits touching parsers MUST re-run the audit (added to `docs/playbooks/modify-frontend-page.md`). The grep-based audit is cheap. |

## Resolved Decisions

These are pre-decided. Planner does not re-litigate.

1. **Single milestone.** Audit + doc authoring is one cohesive chunk.
2. **Bidirectional links.** Matrix → file:line, AND inline JSDoc → matrix anchor. Both directions required; one-way is treated as a DoD violation.
3. **No logic changes.** Phase 7a is observational. Parser routes, renderer cases, and `ParseWarning` shape stay exactly as they are. 7b owns logic changes.
4. **Status taxonomy is binding.** Five values: `✅ supported`, `🔇 silenced`, `⚠ unknown`, `🚧 known-limitation`, `🎨 deferred to 7c`. No ad-hoc statuses.
5. **Matrix lives at `docs/features/parser-event-support.md`.** Not under `working/` (frozen specs go there; the matrix is durable user-facing reference).
6. **Enumeration is corpus-driven.** The script walks the user's real session directories. No synthetic enumeration from tool documentation alone — we audit what's actually present, not what's theoretically possible.
7. **Backend metadata adapters are out of scope.** `components/collector-runtime/src/adapters/` extracts title/path/fingerprint, not the timeline. A separate adapter matrix may be authored later if needed; that's not a Phase 7a deliverable.
8. **Anchor naming**: `<tool>-<top-level-type>[-<payload-or-variant>]`, lowercase, hyphenated. Matches GitHub's auto-anchor generation for markdown headings + table cells (we use heading-level anchors per variant for stability).
9. **Status `🎨 deferred to 7c` is non-empty.** Even before the audit, we know some Codex variants route to `kind: "system"` and render generically (e.g. `exec_command_output` lands as a system note today). That's a 7c work item, not a 7a defect.
10. **Codex reasoning effort `medium`.** Carried from Phase 6 close.
11. **Pure observational + documentation phase.** No backend touch. No contract change. No new component crate. No runtime dep.
12. **Test scaffolding via `test.skip` + `@unskip Phase 7b/7c` markers.** Scaffolded tests do NOT count as failures; `bun run test` exits 0 at Phase 7a close. The skip markers ARE the work-list contract for downstream phases: 7b lifts every `@unskip Phase 7b` marker; 7c lifts every `@unskip Phase 7c` marker. Lifting a marker means converting `test.skip(...)` to `test(...)` and confirming it passes.
13. **Two test files, not many.** Parser-coverage tests live at `apps/frontend/src/features/sessions/parsers/event-support-coverage.test.ts`; render-coverage tests live at `apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx`. Other test files stay untouched. Reviewers grep the two files to verify the skip-marker count.

## Open Considerations

Flagged for M1 planner. Not pre-resolved.

- **Anchor format vs. markdown table rows.** GitHub auto-anchors `## Heading` lines but not table cells. M1 decides whether each variant gets its own `### claude-code-user-tool-result` heading (with the table row below it) or whether the matrix is one big table with explicit `<a name=...>` anchors per row. The former is more verbose but anchor-friendly; the latter is denser.
- **What to do about already-warning variants in the matrix.** They're status `⚠ unknown`. But the *current* parser code emits a warning AND routes to `kind: "unknown"`. Does the matrix's "Parser route" column read `unknown + warning` or `unknown` alone? M1 picks one and documents.
- **Grouping cardinality threshold.** §Risks proposes "if <5 occurrences and no distinguishing feature, group." M1 confirms the threshold and the grouping convention in the matrix.
- **Coordinator's corpus completeness.** If the coordinator's local Claude Code projects don't include a representative sample (e.g. no `custom-title` variants because they're rare), 7a closes with that gap documented in `progress/phase-7a.progress.md`. 7b's sweep gate will surface anything we missed.
