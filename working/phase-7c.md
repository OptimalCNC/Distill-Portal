# Phase 7c: Transcript Rendering Overhaul

## Status

Frozen at the first commit landing this spec on `main`. Subsequent milestones reference that commit's SHA. Phase 6 closed at the four-commit sequence ending at `e78c2b1` on 2026-05-15 and is the baseline this phase mutates.

**Depends on Phase 7b closure.** Phase 7b extended `ParseWarning` with `severity` + `category` + `messageIndex`, drove every `⚠ unknown` matrix row to `✅ supported` / `🔇 silenced` / `🚧 known-limitation`, and locked the zero-warning real-session invariant. Phase 7c consumes the structured warning shape (for the new inline warning surface) and the matrix's `🎨 deferred to 7c` worklist (for the render-treatment fixes).

## Why this phase exists

The Phase 5 `TranscriptView` rendered messages as a flat chronological list, with each `Message` getting its own card regardless of context. This was correct for a first cut but wrong at the skimming level: a session with 20 sequential `tool_use` + `tool_result` pairs becomes 40 cards the reader scrolls through, with no visual cue that they belong together. The mental model the user has — "I made 12 tool calls" — has no surface in the rendered transcript.

Phase 7c overhauls the transcript render in two motions. First, **tool lifecycle pairing**: each `tool_use` is visually paired with its matching `tool_result` into a single "lifecycle" card showing the call, the arguments, the result, and the success/failure state at a glance. Second, **same-tool grouping**: consecutive lifecycles invoking the same tool collapse into a single grouped card with a count badge ("12 tool calls"), expandable to inspect each individual call. The reader skims at the grouped level by default and zooms in only when the work-history demands it.

Phase 7c also closes the warning-visibility loop opened in Phase 7b. The session-level banner stays loud (every warning is still discoverable at the top of the transcript), but each warning that carries a `messageIndex` now also surfaces inline at the affected message — a small chip with the warning's reason, expandable to show full context. Loud + inline together: nothing hides, but every warning anchors to its source.

Finally, Phase 7c lifts every `@unskip Phase 7c` marker authored in Phase 7a and drives every matrix row in `🎨 deferred to 7c` status to `✅ supported`. The grep-detectable contract from 7a remains: after 7c closes, `grep -c "@unskip Phase 7c"` returns 0.

## Goal & Scope

### In scope (must close in Phase 7c)

- Tool lifecycle pairing: each `tool_use` Message is visually paired with its matching `tool_result` Message into a single rendered "lifecycle" card. Pairing keys are tool-specific (Claude Code: `tool_use_id` linkage; Codex: positional/correlation linkage between `exec_command` and `exec_command_output`). Orphan `tool_use` (no result) and orphan `tool_result` (no use) render with explicit "in-flight" or "stray" affordances.
- Same-tool grouping: consecutive lifecycles invoking the same tool collapse into a grouped card. The collapsed card shows tool name + count + aggregate status (e.g. "✓ 12 / 12" or "⚠ 11 ran, 1 failed"). Expanding the group reveals each lifecycle individually.
- Render-hint layer: a pure function `renderHints(messages: Message[]): RenderHint[]` invoked by `TranscriptView` once per render. `RenderHint` is the per-message rendering metadata (pairing, grouping, inline-warning attachments). `MessageKind` stays stable — no new kinds for grouping or pairing.
- 4-bucket warning render classification: each `ParseWarning` resolves to one of `render normally` (per-message inline chip) / `collapse-by-default` (chip is collapsed but visible) / `hide-with-inspect` (chip is hidden behind an "inspect" affordance) / `warning-only` (no per-message surface; only the session banner shows it). The classification function consumes `severity` + `category` from 7b's structured warning shape.
- Inline per-message warning surface: warnings whose `messageIndex` is set render as a small chip on the affected message card. Chip expands to show the full `reason`. Banner still shows the full warning list at the session level.
- Drive every `🎨 deferred to 7c` matrix row to `✅ supported`. Each lift requires (a) the variant's render treatment is now correctly specific (not generic), (b) the corresponding `@unskip Phase 7c` render test passes, (c) the matrix row's render-link points at the now-specific case branch + the row's status updates to `✅ supported`.
- Lift every `@unskip Phase 7c` marker in `apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx`. Each lift converts `test.skip(...)` → `test(...)` and the body passes against the new render. `grep -c "@unskip Phase 7c"` returns 0.
- UI/UX design gate: a full design loop produces `working/phase-7c/designs/` artifacts (design.md, prototype.html, wireframes, WCAG measurements) before any implementation milestone starts.
- Documentation sweep: `docs/features/session-view.md` (new "Tool lifecycle + grouping" subsection + the inline warning surface), `docs/features/parser-event-support.md` (all 🎨 rows now ✅), `docs/playbooks/modify-frontend-page.md` (the render-hint extension pattern), `docs/README.md`.
- Progress log `progress/phase-7c.progress.md` records every chunk + the three-reviewer trail per chunk + the design loop's outcome + the @unskip-marker lift count.

### Out of scope (deferred)

- Skim view changes. The four `SkimBlock` kinds and the SkimView rendering stay verbatim. Any improvement to Skim is post-Phase-7.
- Parser logic changes. All parser work landed in 7b.
- Backend touch. Parsers are frontend-side; the render layer is frontend-side; the backend metadata adapters are unrelated.
- New tool support (e.g. `aider`, `cursor` parsers). Out of scope for the entire Phase 7 arc.
- Search-within-transcript. Deferred until annotations land (PRD intent).
- Inline diffing for `tool_result` bodies. Deferred.
- Message pinning, highlighting, bookmarking. Annotations phase.
- Virtualization (`@tanstack/react-virtual`). Escape-hatch dep reserved in Phase 5 only fires if Phase 5's 5k-message frame-time measurement is reproduced on the new render. If 7c's grouped + lifecycle rendering increases per-frame work, the planner re-measures and decides; otherwise the escape hatch stays parked.
- Standalone Operations / Jobs route (that's Phase 9b).
- Changing the streaming behavior, the 5 MB cap, or `streamRawText` semantics.

## Dependency Policy

Inherits all Phase 5 + Phase 6 + Phase 7a + Phase 7b invariants.

- Hex literal count stays at 24 in `apps/frontend/src/`. Any addition (e.g. for a status indicator) requires WCAG justification + an explicit token added to `tokens.css` + documentation, per the Phase 5 budget-amendment pattern.
- Token count stays at 83 in `tokens.css`. Same amendment rule.
- Bun-first invariant: no `jest.fn()`, no `child_process`, no `node:fs` in `apps/frontend/src/` runtime app code. Test scaffolding under `tests/` can use Bun's stdlib equivalents.
- No new runtime dependencies. Virtualization escape-hatch fires only per its documented Chromium reproducer.
- focus-trap-react remains orphan-installed.

## Target Repository Shape

```text
apps/frontend/
├── src/
│   ├── features/sessions/
│   │   ├── TranscriptView.tsx       # tool lifecycle pairing + grouping + inline warnings + render-hint dispatch
│   │   ├── TranscriptView.css       # new card styles for lifecycle + grouped + inline warning chip
│   │   ├── TranscriptView.test.tsx  # pairing + grouping + inline warning tests
│   │   ├── TranscriptView.event-coverage.test.tsx  # 7a-authored render tests — every @unskip Phase 7c marker lifted
│   │   ├── renderHints.ts           # NEW — pure function Message[] → RenderHint[]
│   │   ├── renderHints.test.ts      # NEW — render-hint computation tests
│   │   └── parsers/                 # UNCHANGED (closed at 7b)
│   ├── components/
│   │   └── (no new component crates; new render primitives live inside features/sessions/)
│   └── styles/
│       └── tokens.css               # any WCAG-driven additions documented per amendment pattern

working/
└── phase-7c/
    └── designs/                     # NEW — design loop outputs
        ├── design.md
        ├── prototype.html
        ├── wireframes/
        └── wcag.py                  # contrast measurements + outputs

docs/
├── features/
│   ├── session-view.md              # "Tool lifecycle + grouping" + "Inline warnings" subsections
│   └── parser-event-support.md      # all 🎨 rows → ✅
├── playbooks/
│   └── modify-frontend-page.md      # render-hint extension pattern
└── README.md                        # entry table cross-references

progress/
└── phase-7c.progress.md             # NEW — chunk-by-chunk delivery log
```

No files deleted. No new component crates. No backend touch.

## Data Model

### `RenderHint`

```ts
export type RenderHint =
  | { kind: "standalone"; messageIndex: number; warnings?: InlineWarning[] }
  | { kind: "lifecycle"; messageIndex: number; pairWithIndex: number | null; warnings?: InlineWarning[] }
  | { kind: "group-head"; messageIndices: number[]; toolName: string; aggregateStatus: GroupStatus; warnings?: InlineWarning[] }
  | { kind: "group-member"; messageIndex: number; pairWithIndex: number | null; groupHeadIndex: number; warnings?: InlineWarning[] }
  | { kind: "boundary"; messageIndex: number }
  | { kind: "warning-only"; messageIndex: number; warnings: InlineWarning[] };

export type InlineWarning = {
  reason: string;
  severity: ParseWarningSeverity;
  category: ParseWarningCategory;
  classification: "render-normally" | "collapse-by-default" | "hide-with-inspect" | "warning-only";
};

export type GroupStatus =
  | { kind: "all-success"; total: number }
  | { kind: "mixed"; total: number; failed: number }
  | { kind: "in-flight"; total: number; pending: number }
  | { kind: "all-failed"; total: number };
```

`RenderHint` is computed in `renderHints.ts` and consumed by `TranscriptView`. `MessageKind` is unchanged. The render layer reads `Message` + `RenderHint[]` together.

### Pairing rules

- **Claude Code**: each `assistant.content[].tool_use` Message carries a `tool_use_id`. Its paired `user.content[].tool_result` Message has a `tool_use_id` field referencing the same id. The parser already preserves these ids; `renderHints.ts` pairs them by id.
- **Codex**: an `event_msg.exec_command` Message is followed by an `event_msg.exec_command_output` Message; correlation is positional (next exec_command_output OR end-of-stream). The parser already routes them to `tool_use` + `tool_result` respectively.
- **Adjacency**: pairs are usually adjacent. When they are not (e.g. interleaved assistant text), `renderHints.ts` keeps each Message at its original position and the visual pair spans the intermediate cards via a lightweight connector line. Implementation may also choose strict-adjacency-only pairing; planner decides during design loop.
- **Orphan `tool_use`** (no matching `tool_result` found within the message stream): `RenderHint.kind === "lifecycle"` with `pairWithIndex: null`. Renders with an "in-flight" or "no result" badge.
- **Orphan `tool_result`** (no preceding `tool_use`): `RenderHint.kind === "standalone"` (treated as a regular `tool_result` card) with an inline warning chip noting the orphan state.

### Grouping rules

- Consecutive lifecycles invoking the same tool name (Claude Code: `tool_use.name`; Codex: `exec_command.command[0]` or similar identifier — final selection during M1 design) form a group.
- Threshold: ≤2 lifecycles render individually (no group head); ≥3 lifecycles collapse into a group by default. Threshold value is a `const` in `renderHints.ts`; M1 planner may choose 3, 4, or 5 based on the design loop's prototype testing.
- Groups respect boundaries: a `boundary` Message resets grouping. The next lifecycle starts a fresh group regardless of tool name.
- Expanding a group shows each lifecycle individually with its own card. Lifecycles inside an expanded group retain their pairing visuals.
- Aggregate status:
  - All lifecycles have a `tool_result` with no error indicator → `all-success`.
  - Some succeeded, some failed (tool_result body contains an error field or non-zero exit code) → `mixed`.
  - Some have no `tool_result` yet → `in-flight`.
  - All failed → `all-failed`.
  - The exact failure-detection heuristic per tool is locked during M1 design.

### Warning classification

The 4-bucket function `classifyWarning(warning: ParseWarning): "render-normally" | "collapse-by-default" | "hide-with-inspect" | "warning-only"` consumes 7b's structured warning shape. Recommended initial mapping (locked at M1 design):

| Severity | Category | Classification |
|---|---|---|
| `error` | any | `render-normally` (chip visible by default) |
| `warning` | `schema` / `payload` | `render-normally` |
| `warning` | `lexer` / `timestamp` | `collapse-by-default` |
| `warning` | `meta` | `warning-only` (no inline chip; banner only) |
| `info` | any | `hide-with-inspect` |

The mapping is a `const` table in `renderHints.ts`. M1 design may adjust based on prototype testing; any change requires a documented decision in `progress/phase-7c.progress.md`.

## Milestones

Three milestones. Two-commit pattern per chunk (impl + log). Three-reviewer rule applies (backend-protection Claude + normal Claude + Codex external). Codex reasoning effort `medium` per Phase 6 closure guidance.

### Milestone 1: UI/UX Design Gate

- Design loop produces `working/phase-7c/designs/`:
  - `design.md` — aesthetic decisions: lifecycle card layout, grouped card visual model, inline-warning chip treatment, expand/collapse affordances, status indicator semantics, motion budget for expand/collapse.
  - `prototype.html` — single static HTML page demonstrating each visual variant against synthetic fixtures. Reviewable in a browser without launching the app.
  - `wireframes/` — per-variant ASCII or SVG wireframes for each rendering bucket (standalone, lifecycle, group-head collapsed, group-head expanded, inline warning chip × 4 buckets).
  - `wcag.py` — Python contrast-measurement script + outputs (same byte-equivalent pattern as Phase 5 M4/M5).
- Design loop also locks the operational decisions left open in §Data Model: grouping threshold value, pairing strict-adjacency vs span-through, failure-detection heuristic per tool, exact 4-bucket mapping.
- Design loop has its own external-reviewer round (codex `medium`).

Definition of done:
- Four design artifacts exist under `working/phase-7c/designs/`.
- `wcag.py` runs cleanly and the output table shows AA on every new visible foreground/background pair (light + dark).
- The four operational decisions (threshold, pairing mode, failure detection, 4-bucket mapping) have concrete values pinned in `design.md`.
- External reviewer signs off on the design.

### Milestone 2: Render-hint layer + inline warnings

- `renderHints.ts` + `renderHints.test.ts`: pure function `Message[] → RenderHint[]` implementing pairing, grouping, and warning classification per the M1 decisions. 100% branch coverage on the algorithm (adjacent pair, span-through pair, orphan use, orphan result, group below threshold, group above threshold, group reset by boundary, mixed status, all-failed status, in-flight status, each of the 4 warning classifications).
- `TranscriptView.tsx` rewires to consume `Message[]` + `RenderHint[]` together:
  - The render switch becomes a switch on `RenderHint.kind` first, then on `Message.kind` for the inner content.
  - `standalone` renders as the existing per-kind treatment (no behavioral change).
  - `lifecycle` renders the new paired card (tool_use header + tool_result body collapsed by default, expand to show full args + result).
  - `warning-only` renders nothing for the message itself; the warning surfaces in the session banner only.
  - `boundary` renders the existing chapter-break treatment.
- Inline warning chip: each `RenderHint` carrying `warnings[]` renders the chips inside its card (or below, per M1 design). Chip visual matches M1 spec; chip click toggles expanded body showing full `reason`.
- Session banner: unchanged from current behavior. Banner still lists every warning regardless of inline classification.
- Lift every `@unskip Phase 7c` render test corresponding to inline-warning behavior. Each lifted test passes.

Definition of done:
- `bun run test` green; new `renderHints.test.ts` covers all branches.
- `TranscriptView.test.tsx` extended with pairing + warning-classification cases.
- All pre-existing render tests still pass.
- `bunx tsc --noEmit` clean.
- `bun run build` green; bundle size envelope documented (small growth expected).
- Hex + token invariants preserved (or documented amendment per Phase 5 pattern).
- `@unskip Phase 7c` markers tied to inline warnings: zero remaining.

### Milestone 3: Same-tool grouping + matrix closure + doc sweep

- `renderHints.ts` adds the group-detection algorithm (M1-locked threshold + same-tool-name predicate + boundary reset). `group-head` and `group-member` hints emitted.
- `TranscriptView.tsx` renders grouped cards:
  - Collapsed group head: tool name + count badge + aggregate status + expand affordance.
  - Expanded group: each member as a regular lifecycle card.
  - Expand state is preserved via native `<details>` (browser-managed open state, per Phase 5 M5 / M6 precedent).
- Lift every remaining `@unskip Phase 7c` render test (grouping tests). Each lifted test passes.
- Drive every `🎨 deferred to 7c` matrix row to `✅ supported`. Each row's render-link points at the now-specific case branch in `TranscriptView.tsx`. Status column updated.
- Documentation sweep:
  - `docs/features/session-view.md` — new "Tool lifecycle + grouping" subsection + "Inline warnings" subsection.
  - `docs/features/parser-event-support.md` — verify all rows are `✅ supported`, `🔇 silenced`, or `🚧 known-limitation`.
  - `docs/playbooks/modify-frontend-page.md` — render-hint extension pattern (how to add a new render hint without changing `MessageKind`).
  - `docs/README.md` — entry table cross-references.
- Final progress log entry recording the close of Phase 7c + Phase 7 arc.

Definition of done:
- All gates green (`cargo check --workspace`, `cargo test --workspace`, `bun test src`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`).
- Zero `@unskip Phase 7c` markers remain.
- Zero `🎨 deferred to 7c` matrix rows remain.
- Hex + token invariants preserved (or documented amendment).
- Three-reviewer trail per milestone recorded in `progress/phase-7c.progress.md`.
- Docs sweep complete (4 files).

## Acceptance Criteria

Phase 7c close is achieved when ALL of the following hold:

1. `renderHints.ts` exports `RenderHint`, `InlineWarning`, `GroupStatus` types and a pure `renderHints(messages: Message[]): RenderHint[]` function.
2. `TranscriptView.tsx` consumes `Message[]` + `RenderHint[]` together. Render switch is on `RenderHint.kind` first, then on `Message.kind`.
3. Tool lifecycle pairing renders correctly for both Claude Code (`tool_use_id` linkage) and Codex (positional linkage between `exec_command` + `exec_command_output`). Orphan use renders with in-flight affordance; orphan result renders with stray-result inline warning.
4. Same-tool grouping renders a group head with count badge + aggregate status when ≥3 consecutive lifecycles share a tool name. Expand reveals each member individually. `boundary` resets grouping.
5. Inline per-message warning chips render for warnings with `messageIndex` set, classified per the 4-bucket table. Session banner still renders the full warning list.
6. Every matrix row in `docs/features/parser-event-support.md` is `✅ supported`, `🔇 silenced`, or `🚧 known-limitation`. Zero `🎨 deferred to 7c` rows remain.
7. `grep -c "@unskip Phase 7c" apps/frontend/src/` returns 0. Every previously-skipped 7a-authored render test now runs as `test(...)` and passes.
8. Four design artifacts exist under `working/phase-7c/designs/`: `design.md`, `prototype.html`, `wireframes/`, `wcag.py`.
9. WCAG AA holds for every new visible foreground/background pair (light + dark). Recorded in the progress log table.
10. Eight-doc sweep complete: `docs/features/session-view.md`, `docs/features/parser-event-support.md`, `docs/playbooks/modify-frontend-page.md`, `docs/README.md` (4 with substantive edits) + 4 cross-references where applicable.
11. Hex literal count stays at 24 (or documented amendment with WCAG justification). Token count stays at 83 (or documented amendment).
12. Bun-first invariant holds; no `jest.fn()`, `child_process`, or `node:fs` imports in `apps/frontend/src/` runtime app code.
13. No new runtime dependencies (virtualization escape-hatch only if its documented Chromium reproducer fires).
14. All gates green; no contract drift; no backend touch; Phase 5/6/7a/7b invariants preserved.
15. Three-reviewer trail per milestone recorded.

## Testing

- **Frontend unit — render hints**: `renderHints.test.ts` with branch coverage on pairing, grouping, boundary reset, status aggregation, warning classification. Test fixtures use synthetic `Message[]` arrays — no JSONL parsing in this layer.
- **Frontend unit — TranscriptView**: per-`RenderHint.kind` rendering cases. Snapshot + DOM-assertion mix per Phase 5 precedent.
- **7a-authored event-coverage tests**: every `@unskip Phase 7c` marker lifted; each previously-skipped test now passes.
- **Existing Phase 5 + 7b tests**: unchanged, still green.
- **Browser e2e**: extend `apps/frontend/e2e/inspection.spec.ts` with one assertion that a grouped tool-call card renders + expands correctly against the fixture session.
- **WCAG measurement**: `working/phase-7c/designs/wcag.py` runs cleanly and emits the contrast table recorded in the progress log.

## Risks

| Risk | Mitigation |
|---|---|
| Lifecycle pairing logic for Codex (positional) is wrong when sessions have interleaved or out-of-order events. | M1 design loop locks the pairing mode (strict-adjacency vs span-through) based on real-session fixtures from 7a. The span-through implementation respects `boundary` Messages as a hard reset. |
| Grouping threshold is wrong (too aggressive → too many groups; too lax → no skimming benefit). | M1 prototype tests the threshold value (3 vs 4 vs 5) on the coordinator's real-session corpus before locking. |
| Inline warning chip clutters the transcript when many warnings concentrate on one message. | The 4-bucket classification routes most lower-signal warnings to `collapse-by-default` or `hide-with-inspect`. Banner remains the comprehensive list. M1 prototypes a worst-case warning-dense fixture. |
| Render-hint computation adds per-frame work that triggers Phase 5's virtualization escape-hatch. | M1 + M2 measure on a 5k-message synthetic fixture. If the 16 ms/frame threshold from Phase 5 fires, virtualization lands per its documented Chromium reproducer (`@tanstack/react-virtual` slot 2). |
| 7a-authored render tests encode wrong assumptions about the intended treatment. | Same escape-hatch as 7b: Phase 7c MAY rewrite or delete a 7a-authored test if the audit reveals the assertion was wrong, with a progress-log entry + matrix row update + replacement test that passes. |
| New visible color pair fails WCAG AA. | `wcag.py` runs at M1 close before any implementation lands. AA failures block M1 sign-off. |
| Grouping breaks the existing `<details>` open-state preservation pattern. | Group head uses native `<details>` (Phase 5 M6 precedent); open state survives tab switches via browser-managed semantics. Test covers this explicitly. |

## Resolved Decisions

These are pre-decided. Planner does not re-litigate.

1. **Three milestones**: design gate → render-hints + inline warnings → grouping + matrix closure + doc sweep.
2. **`MessageKind` is stable.** No new kinds for grouping or pairing. All new rendering metadata lives in `RenderHint`.
3. **Render-hint computation in a sibling helper, not in parsers.** `renderHints.ts` is invoked by `TranscriptView` once per render; parsers stay pure data emitters.
4. **Pairing keys are tool-specific.** Claude Code uses `tool_use_id` id linkage; Codex uses positional linkage. M1 design locks the strict-adjacency-vs-span-through choice.
5. **Grouping threshold is a `const` in `renderHints.ts`.** M1 design locks the value (3 / 4 / 5). Changing later requires a documented decision in the progress log.
6. **Banner stays loud.** No removal, no demotion. Inline chips are additive.
7. **4-bucket warning classification.** Initial mapping in §Data Model; M1 design may adjust.
8. **`boundary` Messages reset grouping** (and only grouping; the existing boundary chapter-break treatment is preserved verbatim).
9. **Group expand-state preserved via native `<details>`.** Phase 5 M5/M6 precedent. No controlled `open` attribute.
10. **UI/UX design gate is mandatory.** Phase 7c does not skip the design loop. Codex external reviewer signs off on design before implementation milestones start.
11. **7a-test escape hatch** (same as 7b's clause 12): MAY rewrite or delete a 7a-authored test if its assertion was wrong, with progress-log entry + matrix update + replacement passing test.
12. **Codex reasoning effort `medium`.** Carried from Phase 6 close.
13. **Pure frontend phase.** No backend touch. No contract change. No new component crate.
14. **Virtualization escape-hatch policy unchanged.** Fires only on documented Chromium reproducer; Phase 5 slot 2 reserved.

## Open Considerations

Flagged for M1 planner. Not pre-resolved.

- **Pairing mode**: strict-adjacency (only adjacent `tool_use` + `tool_result` pair) vs span-through (pair across intermediate messages with a connector line). M1 design picks one based on real-session fixtures.
- **Grouping threshold value**: 3, 4, or 5. M1 prototype testing decides.
- **Failure detection heuristic**: how `renderHints.ts` decides whether a `tool_result` represents success or failure for the aggregate-status calculation. Tool-specific. M1 locks per-tool heuristics.
- **Inline warning chip placement**: above the message body, below it, or as a corner badge. M1 design locks.
- **Whether group-head shows aggregate timing (e.g. "12 tool calls, 4.2 s total")** or just count + status. Aggregate timing requires parsing timestamps from `tool_use` + `tool_result` Messages; planner decides cost/value during M1 design.
- **Bundle-size envelope**: M1 measures, M2 + M3 stay within. Documented in progress log.
- **Whether the inline warning chip on a `tool_result` inside a collapsed group is visible from the group head, or only after expansion.** UX trade-off: surfacing inside a collapsed group fights the skimming benefit; hiding it loses information. M1 design picks.
