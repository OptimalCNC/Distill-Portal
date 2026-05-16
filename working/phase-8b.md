# Phase 8b: Cross-tab Transcript ↔ Raw Navigation

## Status

Frozen at the first commit landing this spec on `main`. Subsequent milestones reference that commit's SHA.

**Depends on Phase 8a closure.** Phase 8a lands the bespoke `JsonInspector` component and wraps every `kind: "json"` line in `RawTab` with a collapsible card. Phase 8b uses that card-per-line structure as the jump target on the Raw side. Without 8a, "jump to raw line N" would scroll to a plain-text `<pre>` row with no expansion semantics — much weaker UX.

**Also depends on Phase 7c closure (already delivered at `2026-05-16`).** Phase 7c's `renderHints` layer means every parser-produced `Message` has a `lineOrdinal` pointing back at its source line in the raw stream. Phase 8b uses that field as the jump key in the Transcript → Raw direction.

## Why this phase exists

Phase 7 made every JSONL line accessible — silenced events become inline warning chips or system notes; supported events get full transcript treatment; even `🚧 known-limitation` events surface via the structured warning shape. The two surfaces — Transcript (a humane render of the conversation) and Raw (the byte-level source of truth) — are now both navigable independently. They are not yet *connected*.

A reader in the Transcript who sees something surprising — an inline warning on a tool result, an unexpected `system` note, a `🎨 group-text-member` slot that doesn't match their memory of the session — has no efficient way to inspect the underlying raw line. They have to switch tabs manually, manually count down to the right line ordinal, manually expand it. Conversely, a reader in the Raw tab inspecting a curious line has no way to ask "what does this look like in the actual transcript render?" without scrolling through the parsed messages.

Phase 8b closes this loop with **cross-tab jump affordances**: from any transcript message, jump to its source raw line (Raw tab opens, target card expanded, scrolled into view, transiently highlighted). From any raw line, jump to the transcript message(s) it produced (Transcript tab opens, target message scrolled into view, transiently highlighted).

The UX needs to be *intuitive* but *not disruptive*. A reader focused on Transcript should not be hijacked away from their current scroll position the moment they click an affordance — and they should be able to come back. The exact visual treatment, affordance placement, motion, keyboard shortcuts, and "go back" mechanism are deliberately left to the design loop in Milestone 1. This spec defines the requirements and constraints; the design loop produces the resolved UX.

## Goal & Scope

### In scope (must close in Phase 8b)

- **Transcript → Raw jump**: a per-message affordance that, when activated, switches to the Raw tab + scrolls the target raw card into view + expands it (using 8a's `<details>` open-state mechanism) + transiently highlights it.
- **Raw → Transcript jump**: a per-card affordance that, when activated, switches to the Transcript tab + scrolls the target message into view + transiently highlights it.
- **Multi-message lines**: a single raw line may produce 0, 1, or N messages (e.g. Claude Code `user` records with multiple `content[]` items). The Raw → Transcript jump targets the FIRST message produced by that line; the highlight extends to cover all messages produced by the same line.
- **No-message lines**: silenced lines, lexer-failed lines, and `🚧 known-limitation` lines may produce zero messages. The Raw → Transcript affordance on those lines shows a non-disruptive in-place hint ("this line was deliberately skipped" or "this line did not parse") — does NOT switch tabs. Design-loop locks the exact hint shape; the requirement is that no-message lines must communicate clearly that there is no transcript counterpart.
- **Return mechanism**: a "go back" affordance preserved across the jump so the reader can return to their original tab + scroll position. The mechanism may be the browser back button (URL-state-driven), an explicit back affordance in the destination tab, or both.
- **URL state**: when a jump is initiated, the URL updates to reflect the target tab + a focused anchor (line ordinal or message index). Reloading the page lands on the jump destination with the highlight transiently shown. The existing `?session=<rowKey>` selection mechanism is preserved verbatim; the new state composes with it.
- **Tab + scroll preservation when returning**: jumping away from a tab and back must restore the previous scroll position in that tab. Native browser scroll restoration may suffice; if not, the implementation captures + restores explicitly.
- **Keyboard support**: jump affordances are activatable via keyboard. Specific shortcuts (e.g. dedicated keys, or just Tab + Enter through the rendered affordance) decided at M1 design.
- **Mandatory UI/UX design gate** producing `working/phase-8b/designs/` (design.md, prototype.html, wireframes, wcag.py) before any implementation milestone starts.
- **Documentation sweep** across 3 surfaces (see §Documentation).
- **Progress log** `progress/phase-8b.progress.md` records every chunk + three-reviewer trail.

### Out of scope (deferred)

- Per-character or per-field highlight INSIDE the target raw card. The whole card is highlighted; sub-card precision is a future polish.
- Persistent breadcrumb history of jumps (a "jump back through N hops" trail). Single-level back only.
- Tab-side-by-side mode (showing Transcript and Raw simultaneously without switching). Out of scope for the inspection-surface layout this phase touches.
- Cross-session jumps (jumping from Transcript on session A to Raw on session B). Within-session only.
- Jump from Skim tab. Skim's block kinds may overlap with Transcript messages, but Phase 8b only wires Transcript ↔ Raw. Skim jumps are a future polish.
- Jump from Metadata tab. The existing "View raw" link in Metadata is preserved verbatim; Phase 8b does not change it.
- Bidirectional jumps within the same tab (e.g. transcript message → another transcript message). Cross-tab only.
- Annotation, bookmarking, or comments on jumped cards. Out of scope.
- Backend changes. Pure frontend phase.
- Protocol changes. The raw stream's 5 MB cap, line cap, byte cap, and caption all stay verbatim. Phase 8b only navigates within the already-rendered surface.
- Auto-scroll-sync (two tabs scrolling in lockstep). Each jump is an explicit user action.

## Dependency Policy

Inherits all prior phase invariants.

- **No new runtime dependencies.** The jump mechanism uses native scroll + DOM querying + URL history API (all already in workspace).
- **Hex literal count** stays at the post-8a value (24 + any 8a amendments). The transient-highlight visual may need a token — M1 design decides; up to **1 new token** permitted under the Phase 5 amendment pattern with WCAG-AA documentation.
- **Bun-first invariant** holds.
- **focus-trap-react** remains orphan-installed.

## Target Repository Shape

```text
apps/frontend/
└── src/
    ├── features/
    │   └── sessions/
    │       ├── useTabNavigation.ts           # NEW — orchestrates tab switch + scroll + highlight + URL state
    │       ├── useTabNavigation.test.ts
    │       ├── SessionView.tsx               # consume useTabNavigation; pass jump callbacks down
    │       ├── TranscriptView.tsx            # jump-to-raw affordance per message
    │       ├── TranscriptView.css            # affordance styling
    │       ├── RawTab.tsx                    # jump-to-transcript affordance per card
    │       └── RawTab.css                    # affordance styling
    └── styles/
        └── tokens.css                        # up to 1 new token for transient highlight (M1 locks)

working/
└── phase-8b/
    └── designs/                              # design loop outputs
        ├── design.md
        ├── prototype.html
        ├── wireframes/
        └── wcag.py

docs/
├── features/
│   └── session-view.md                       # "Cross-tab jump" subsection
├── playbooks/
│   └── modify-frontend-page.md               # tab-navigation extension pattern
└── README.md                                 # task table cross-reference

progress/
└── phase-8b.progress.md                      # NEW — chunk-by-chunk delivery log
```

No files deleted. No new component crates. No backend touch.

## Data Model

The jump mechanism is keyed by two integers that already exist in the data model:

- **`lineOrdinal`** — 0-based index of the JSONL line in the raw stream. Already present on every `Message` (Phase 5).
- **`messageIndex`** — 0-based index of the Message in `ParsedSession.messages[]`. Already implicit (array position); Phase 8b makes it explicit on the jump anchor.

### URL state

The session-selection query parameter `?session=<rowKey>` is preserved verbatim (Phase 5). Phase 8b composes with it via two new query parameters:

- `?tab=<transcript|raw|skim|metadata>` — the active tab. Existing tab state was component-local; Phase 8b moves it to URL state so jumps are deep-linkable + reloadable.
- `?focus=<line:N|msg:N>` — the focused anchor on the active tab. `line:N` focuses raw card at line ordinal N; `msg:N` focuses transcript message at index N. Mutually exclusive.

Examples:
- `?session=claude_code:abc&tab=raw&focus=line:42` — Raw tab, card for line 42 expanded + highlighted.
- `?session=claude_code:abc&tab=transcript&focus=msg:17` — Transcript tab, message 17 highlighted.
- `?session=claude_code:abc&tab=metadata` — Metadata tab, no focus.

### `useTabNavigation.ts`

A hook that owns the URL-state ↔ React-state synchronisation:

```ts
type TabNavigation = {
  activeTab: "transcript" | "raw" | "skim" | "metadata";
  focus: { kind: "line"; lineOrdinal: number } | { kind: "msg"; messageIndex: number } | null;
  jumpToRawLine: (lineOrdinal: number) => void;
  jumpToTranscriptMessage: (messageIndex: number) => void;
  setActiveTab: (tab: TabNavigation["activeTab"]) => void;
};

function useTabNavigation(): TabNavigation;
```

`jumpToRawLine(lineOrdinal)`:
1. Updates URL to `?tab=raw&focus=line:N` via `history.pushState` (so browser back works).
2. RawTab observes the URL change and scrolls to the matching card + expands it via 8a's `<details>` mechanism + applies the transient-highlight class for ~1.5 s (exact duration locked at M1).

`jumpToTranscriptMessage(messageIndex)`:
1. Updates URL to `?tab=transcript&focus=msg:N` via `history.pushState`.
2. TranscriptView observes the URL change and scrolls to the matching message + applies the transient-highlight class for ~1.5 s.

The `pushState` choice is deliberate: browser back returns to the origin tab + scroll position (browser-managed). Reloading the URL with `?focus=...` re-runs the highlight on mount (treats the focus as if the user just navigated to it).

## UX Requirements (intent, not design)

The design loop in M1 produces the resolved design. This spec defines REQUIREMENTS only. The planner + designer respect these constraints; specific visual / motion / shortcut decisions are theirs.

### Affordances

1. **Discoverable but understated.** Every message in Transcript has a jump-to-raw affordance; every card in Raw has a jump-to-transcript affordance. They must be visually present without dominating the message/card body. Match the existing Phase 5 Archive-room restraint.
2. **Mouse + keyboard activatable.** Native HTML semantics (button or anchor); Tab navigation reaches them naturally. Keyboard shortcut (e.g. a dedicated key) optional, design-locked at M1.
3. **Adjacent to the message/card body**, not buried in a menu. Hovering should not be required to discover the affordance.

### Arrival behavior

4. **Scroll target into view.** Use `scrollIntoView({ block: "center" })` semantics. The target must be near vertical center of the viewport after the jump.
5. **Transient highlight.** A visual cue (animated ring, sustained background tint, or similar — design-locked at M1) plays for ~1.5 s after arrival. Suppressed under `prefers-reduced-motion: reduce` (use a static, non-animated highlight that persists for the same duration).
6. **Expand the target card** (Raw side) using 8a's `<details>` open-state mechanism. If the target was collapsed, it becomes open; if it was already open, no toggle.
7. **No layout shift after arrival.** The scroll lands once; no follow-up reflow nudges the target out of view.

### Return mechanism

8. **Browser back works.** `history.pushState` from the jump means browser back returns to the origin tab + scroll position.
9. **Origin scroll preserved.** When the user comes back to the origin tab (via browser back OR via explicit tab switch), their previous scroll position is restored.
10. **Optional explicit back affordance** on the destination tab — a small "← Back to transcript" / "← Back to raw" link or button — design-locked at M1. The browser back button is the primary mechanism; the explicit affordance is a discoverability hint.

### Non-disruption constraints

11. **No tab auto-switch without user activation.** The jump only fires on explicit user action (click, keypress).
12. **No reading-position drift on the origin tab.** Origin tab scroll position MUST be preserved across the round trip.
13. **No animation hijack.** The transient highlight is a CSS animation (or single-frame change under reduced motion); it does not scroll, expand, or otherwise move other content.
14. **No-message lines** (silenced, lexer-failed, `🚧 known-limitation`): the affordance on these raw cards does NOT switch tabs. It surfaces an in-place hint indicating "no transcript counterpart" (design-locked at M1).

### Intuitive constraints

15. **Affordance labelling.** Visible labels or icons make the function clear without hover-tooltip. (E.g. an arrow icon + "View raw" / "View transcript" text.) Design-locked at M1.
16. **Predictable highlight target.** The highlighted element is the message body / raw card body — not a parent container, not a child sub-element.
17. **Multi-message line** (a single raw line producing N transcript messages): the Raw → Transcript jump targets the FIRST message; the highlight covers all N messages so the reader sees the group at once.

## UI/UX Design Gate

Mandatory M1 design loop produces `working/phase-8b/designs/`:

- `design.md`:
  - Exact affordance visual + placement (icon, label, position adjacent to message/card).
  - Transient highlight visual (CSS animation, duration, reduced-motion fallback).
  - Token additions: any new tokens for the highlight, with WCAG-AA contrast measurements.
  - Keyboard shortcut decisions: whether dedicated keys exist, or only Tab + Enter activation.
  - "Go back" affordance: presence + placement.
  - Multi-message highlight visual: how the group is delimited.
  - No-message hint: copy + visual treatment.
  - Motion budget for the highlight + suppression under `prefers-reduced-motion`.
- `prototype.html`: static HTML demonstrating the affordance, the arrival animation, the multi-message highlight, the no-message hint, the back affordance.
- `wireframes/`: per-state wireframes.
- `wcag.py`: contrast measurement for any new highlight tokens + the existing affordance visual against the surface backgrounds (light + dark).

Design has its own external-reviewer round (codex `medium`).

## Documentation

Sweep 3 surfaces:

- `docs/features/session-view.md` — new "Cross-tab jump" subsection: from where, to where, what the affordances look like, how the highlight works, how to return.
- `docs/playbooks/modify-frontend-page.md` — tab-navigation extension pattern: how to add a new jump destination in the future (e.g. Skim → Raw if scope expands).
- `docs/README.md` — task table cross-reference.

## Milestones

Two milestones. Two-commit pattern per chunk (impl + log). Three-reviewer rule applies (backend-protection Claude + normal Claude + Codex external; QA test-coverage role per Phase 7c precedent). Codex reasoning effort `medium`.

### Milestone 1: UI/UX Design Gate

- Design loop produces `working/phase-8b/designs/` per §UI/UX Design Gate.
- The decisions left open in §UX Requirements get locked in `design.md`:
  - Affordance visual + placement on both sides.
  - Transient-highlight visual + duration + reduced-motion fallback.
  - Token additions (count + values).
  - Keyboard shortcut presence.
  - "Go back" affordance presence + placement.
  - Multi-message highlight visual.
  - No-message hint copy + visual.
- `wcag.py` runs and emits the contrast table. AA holds on all new visible pairs.
- External reviewer signs off on design.

Definition of done:
- Four design artifacts exist under `working/phase-8b/designs/`.
- The open design decisions are recorded in `design.md`.
- WCAG AA holds for every new visible foreground/background pair.

### Milestone 2: Implementation + tests + docs

- `apps/frontend/src/features/sessions/useTabNavigation.ts` + `.test.ts`: hook implementing URL-state ↔ React-state, jump methods, focus state.
- `apps/frontend/src/features/sessions/SessionView.tsx`: consumes `useTabNavigation`. Existing tab strip wired to URL state. Tab active state is now URL-driven; component-local fallback removed.
- `apps/frontend/src/features/sessions/TranscriptView.tsx`: each message renders the jump-to-raw affordance. On mount with `?focus=msg:N`, scroll to target message + apply transient-highlight class.
- `apps/frontend/src/features/sessions/RawTab.tsx`: each `kind: "json"` card renders the jump-to-transcript affordance. `kind: "fallback"` cards render the no-message variant. On mount with `?focus=line:N`, scroll to target card + expand via `<details>` open + apply transient-highlight class.
- Browser back works: the jump uses `history.pushState`; back returns to the origin tab + scroll position.
- Tests:
  - `useTabNavigation.test.ts`: state machine, URL sync, browser-back behavior, focus encoding/decoding.
  - `TranscriptView.test.tsx`: jump affordance renders per message; click triggers tab change + URL update; mount with focus param scrolls + highlights.
  - `RawTab.test.tsx`: jump affordance renders per card; click triggers tab change + URL update; mount with focus param scrolls + expands + highlights.
  - `apps/frontend/e2e/inspection.spec.ts`: full jump round-trip (Transcript → Raw → back → Transcript with scroll preserved).
- Documentation sweep (3 surfaces).
- Final progress log entry recording the close of Phase 8b.

Definition of done:
- All gates green (`cargo check --workspace`, `cargo test --workspace`, `bun test src`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`).
- Hex literal count post-8b stays at the post-8a value (24 + any 8a amendments + any 8b amendment, total documented).
- Token count post-8b stays at the post-8a value + at most 1 new token.
- Existing tests still pass.
- 3-surface doc sweep complete.
- Three-reviewer trail per milestone recorded.

## Acceptance Criteria

Phase 8b close is achieved when ALL of the following hold:

1. `useTabNavigation` hook exists at `apps/frontend/src/features/sessions/useTabNavigation.ts` and exposes `activeTab`, `focus`, `jumpToRawLine`, `jumpToTranscriptMessage`, `setActiveTab`.
2. URL state synchronises with the hook: `?tab=...&focus=...` reflects the current state; reloading lands on the encoded state.
3. Every transcript message renders the jump-to-raw affordance; clicking it switches to Raw tab + scrolls + expands + highlights.
4. Every raw `kind: "json"` card renders the jump-to-transcript affordance; clicking it switches to Transcript tab + scrolls + highlights.
5. Every raw `kind: "fallback"` card renders the no-message hint affordance; clicking it surfaces an in-place explanation; does NOT switch tabs.
6. Multi-message lines: Raw → Transcript jump targets the FIRST message; highlight covers all messages produced by the same line.
7. Browser back returns to the origin tab + scroll position.
8. `prefers-reduced-motion: reduce` suppresses the highlight animation in favour of a static visual.
9. Four design artifacts exist under `working/phase-8b/designs/`.
10. WCAG AA holds for any new highlight tokens.
11. Hex literal count + token count documented; total within the agreed amendment budget (24 hex + up to 1 new token over post-8a).
12. No new runtime dependencies.
13. Bun-first invariant holds.
14. 3-surface doc sweep complete.
15. Three-reviewer trail per milestone recorded.
16. All prior-phase invariants preserved.

## Testing

- **`useTabNavigation` unit**: URL parse/encode; state transitions on `jumpToRawLine` + `jumpToTranscriptMessage`; browser-back via `popstate`; defaults when no URL params.
- **TranscriptView render**: jump affordance per message; click handler; mount-with-focus scroll + highlight.
- **RawTab render**: jump affordance per card; click handler; mount-with-focus scroll + expand + highlight; no-message hint for fallback cards.
- **Round-trip e2e**: full Transcript → Raw → back → Transcript flow with scroll preservation asserted via Playwright's `scrollY` capture before + after.
- **Reduced-motion**: render under `prefers-reduced-motion: reduce` and assert highlight uses static styling.

## Risks

| Risk | Mitigation |
|---|---|
| Scroll restoration on browser back fails for the origin tab (component remount loses scroll). | The tabs are NOT unmounted on tab switch — they use `hidden` attribute (Phase 5 precedent). Scroll position persists in the DOM. M2 confirms via e2e. |
| `scrollIntoView` triggers smooth-scroll animations that fight with the transient highlight. | Use `scrollIntoView({ block: "center", behavior: "auto" })` (instant scroll). Highlight animates after scroll completes. |
| The jump affordance visual clashes with the existing message body's chrome (warning chips, tool-lifecycle cards, group heads). | M1 design walks the affordance against every render-hint variant (`standalone`, `lifecycle`, `boundary`, `warning-only`, `group-head`, `group-member`, `group-text-member`) to confirm no visual collision. |
| Multi-message lines: the "highlight all N messages" visual is hard to make work when those messages are part of a `group-head` collapsed group. | M1 design includes a multi-message group case in the prototype. The implementation may auto-expand the group on jump (if needed for visibility) or surface a "this line produced N messages in a collapsed group" hint. M1 picks. |
| Browser navigation history fills with jump-events, making "back" require many presses to escape the session. | Each jump is one `pushState` entry. The reader can navigate back through their actual jump history, which is the desired behavior. If pathological (>50 jumps), the user can close the tab. |
| Reload with `?focus=...` lands during initial fetch, before the message is available. | The focus mechanism observes `useParsedSession`'s state union (`loading` / `success` / etc.). It applies the highlight on transition to `success`. M2 explicitly tests this race. |
| Affordance discoverability vs. visual noise. | M1 design prototypes BOTH a persistent (always-visible) and hover-revealed variant and picks based on test users. The risk is mitigated by the design loop; the spec doesn't pre-decide. |

## Resolved Decisions

These are pre-decided. Planner does not re-litigate.

1. **Two milestones**: design gate → implementation + tests + docs.
2. **Cross-tab only.** Transcript ↔ Raw within the same session. No cross-session jumps; no within-tab jumps; no Skim or Metadata participation.
3. **URL-state driven.** `?tab=...&focus=...` is the source of truth; React state mirrors URL.
4. **`history.pushState` per jump.** Browser back returns through the user's jump history.
5. **No-message lines do NOT switch tabs.** They show in-place hints.
6. **Multi-message line: target the first message, highlight the group.**
7. **`scrollIntoView({ block: "center", behavior: "auto" })`** for instant scroll; highlight animates after.
8. **Transient highlight respects `prefers-reduced-motion: reduce`** via a static visual fallback.
9. **Up to 1 new token** for the highlight, under the Phase 5 amendment pattern with WCAG-AA documentation. M1 locks count + value.
10. **UI/UX design gate is mandatory.** Phase 8b does not skip the design loop.
11. **Codex reasoning effort `medium`.** Carried from Phase 6 close.
12. **Pure frontend phase.** No backend touch. No new component crate.
13. **No new runtime dependencies.**
14. **No spec-side design decisions.** The spec defines REQUIREMENTS; the design loop produces visuals, motion, copy, keyboard shortcuts. Reviewers verify the design satisfies the requirements but do not co-author it during spec review.

## Open Considerations

Flagged for M1 planner + designer. Not pre-resolved.

- **Affordance discoverability mode**: persistent (always visible) vs. hover-revealed vs. focus-revealed. M1 prototypes and picks.
- **Keyboard shortcut presence**: whether dedicated keys (e.g. `J` to jump) exist beyond Tab-and-Enter activation. M1 picks.
- **Highlight visual**: animated ring vs. sustained tint vs. underline-style vs. marker chevron. M1 picks; constrained by WCAG AA and the Archive-room aesthetic.
- **Multi-message group rendering on jump arrival**: auto-expand the group, or surface a "this line produced N grouped messages" hint without expanding? M1 picks.
- **"Go back" affordance**: present on the destination tab in addition to browser back, or browser-back-only? M1 picks.
- **Affordance copy**: "View raw", "Inspect raw", "Show source", or a chevron icon only? M1 picks.
- **Initial tab default** when arriving via deep link with no `?tab=...` parameter. Currently Phase 5 defaults to Transcript; Phase 8b preserves that default. M1 confirms.
- **Whether jump triggers a Skim-tab dim or other visual cue** that the reader has "left" Skim. Probably no — Skim is not a participant in 8b. M1 confirms.
