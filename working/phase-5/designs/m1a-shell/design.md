# M1a — Split-pane shell + `useSelectedSession` + structural CSS literals

Design artifact for **Phase 5 / Milestone 1 / Chunk a**.
Spec frozen at `working/phase-5.md` @ `05467ad` on `main`.
Designer: UI/UX subagent dispatched 2026-04-28.

This is a **reference artifact**. The developer subagent re-implements
against the production stack (Bun + Vite + React + TS + per-component
sibling CSS). Nothing in this folder is shipped to `apps/frontend/`.

---

## 1. Chunk scope summary

M1a stands up the new visible scaffolding for Phase 5: the split-pane
`<main>` Grid (≥ 900 px side-by-side; < 900 px stacked with a
`narrowMode` toggle), the right-pane `<article>` placeholder with its
four M1a states (empty / loading / coming-soon / `session_not_found`),
the 1 px hairline gutter (signature-detail #4), the 600 ms deep-link
pulse on URL-driven mount (signature-detail #3), and the
"← Back to list" quiet text link on stacked-narrow viewports.

Out of M1a (deferred per spec): the 8→4 column compression of
`SessionsTable` (M1b); the relocated `<ActionBar>` / `<Pagination>` /
`<SessionFilters>` chrome inside the list pane (M1b); the vestigial
"Open detail" drawer button (M1b); the M2 Design Language tokens —
Fraunces, oklch palette, motion tokens, surface-treatment tokens —
which all land in M2.

## 2. Design intent

### Why these visible surfaces exist now

The Phase 4 inspection page is a single full-width `<main>` that
overlays a modal `<Drawer>` for session detail. Phase 5 dissolves the
modal and runs the user along a **single document, two views**: the
list on the left, the session on the right. M1a builds the bones for
that — the grid, the URL hook, the right pane stub — without yet
moving any list chrome (M1b) or wiring real session content (M2 → M5).

### Archive-room anchoring at M1a

Per Resolved Decision #10, Phase 5 commits to the Archive-room
aesthetic: warm-paper light / deep-ink dark, sienna single accent,
hairlines over shadows, sharp panel corners, restrained motion.
M1a's surface-defining gesture is **the hairline gutter** — a single
1 px line at `var(--color-border)` that says "one document, two
views" without rails, shadows, or chrome. Pair that with the
**deep-link pulse** — a 600 ms warm-amber breath when the user
arrives via URL — and M1a already telegraphs the editorial tone the
typography/oklch token rollout in M2 will fully voice.

The placeholder right-pane is intentionally quiet. It is not a
spinner-driven "loading dashboard" surface; it is a brief
two-paragraph preface that reads like the inside-cover note of a
printed reference book. The shape of that copy is fixed by spec
lines 591–593.

### What M1a sets up for M2

- **Right-pane container** is wrapped in `<article>` and given the
  CSS hooks (`.session-pane`, `[data-state]`) that M2's Tabs
  primitive will mount inside.
- **Selected-row tint** uses the spec-mandated `color-mix` recipe
  against `var(--color-accent)`. M2 redefines `--color-accent` in
  oklch; the recipe is unchanged. The pulse keyframe also references
  `--color-accent` so M2 retints automatically.
- **`<aside>` and `<article>` landmarks** mean the M2 Tabs primitive
  does not need to introduce additional `role="region"` — both panes
  are already complementary / main-document landmarks.
- **Reduced-motion zero-out rule** is the global rule M2's Tabs slide
  + M4's transcript fade + M5's skim-block stagger all rely on. M1a
  drops it once into `global.css` so subsequent chunks reuse it.

## 3. Component anatomy

### 3.1 DOM tree (wide viewport, row selected, no deep-link arrival)

```
<body>
  <main class="split-pane" data-narrow-mode="list">         <!-- root grid, see §3.2 -->
    <aside class="list-pane" aria-label="Sessions list">    <!-- left landmark -->
      <!-- Phase 4 chrome stays exactly as today during M1a:
           SessionFilters, SessionsTable (8 columns), Pagination,
           ActionBar — all still rendered by SessionsView.tsx
           in their existing positions. M1b will relocate
           Pagination + ActionBar to a sticky list-pane footer
           and compress the table to 4 columns.

           The only M1a change to the list pane DOM is the
           wrapping <aside> landmark + the border-right gutter
           drawn by .list-pane CSS, plus the new
           aria-current="true" attribute on the selected row
           (added by SessionsTable consumers when they receive
           selectedRowKey). -->
      …Phase 4 list children…
    </aside>

    <article class="session-pane" data-state="ready-placeholder">
      <!-- Right pane. <article> is the spec-mandated
           accessibility landmark (spec line 1121). The
           data-state attribute drives both ARIA live-region
           politeness and the visible state machine:
           "empty" | "loading" | "ready-placeholder" |
           "session_not_found". -->
      <header class="session-pane__header">
        <p class="session-pane__hint">Session view coming in Milestone 2.</p>
      </header>
    </article>
  </main>

  <!-- Toast queue stays a sibling of <main> (Phase 4 pattern) -->
</body>
```

### 3.2 `<main class="split-pane">` recipe

| Property | Wide (≥ 900 px) | Narrow (< 900 px) |
|----------|-----------------|-------------------|
| `display` | `grid` | `grid` |
| `grid-template-columns` | `minmax(300px, 380px) 1fr` | `1fr` |
| `gap` | `0` | `0` |
| `max-width` | `1400px` (Phase-4 baseline) | `1400px` |
| `margin` | `0 auto` | `0 auto` |
| `padding` | `0` | `0` |

(The `body` keeps its Phase-4 `padding: var(--space-6)` so the page
gutters do not collapse to the viewport edge — that one carries
over verbatim. The M1a `<main>` recipe, by contrast, intentionally
**replaces** Phase 4's `<main>` rules entirely: Phase 4's
`padding: 0 var(--space-4)`, `margin: var(--space-6) auto var(--space-8)`,
and `gap: var(--space-6)` are all dropped, because the spec at
§Inspection Surface Layout line 497 prescribes a fresh recipe
(`max-width: 1400px; margin: 0 auto; gap: 0; padding: 0`). So the
relationship is "preserve body gutter, replace `<main>` recipe in
full" — not "exactly like Phase 4". `<main>` itself contributes no
padding; its children's panes own their internal padding.)

Activation:

```css
.split-pane { grid-template-columns: 1fr; }
@media (min-width: 900px) {
  .split-pane { grid-template-columns: minmax(300px, 380px) 1fr; }
}
```

(`min-width: 900px` matches the spec acceptance criterion at
exactly 900 px → split-pane.)

### 3.3 List pane (`<aside class="list-pane">`)

| Property | Wide | Narrow + `narrowMode="list"` | Narrow + `narrowMode="session"` |
|----------|------|------------------------------|----------------------------------|
| Visibility | always rendered | full width | `display: none` |
| `border-right` | `1px solid var(--color-border)` | none | none |
| `min-inline-size` | `300px` | `100%` | n/a |
| `max-inline-size` | `380px` | `100%` | n/a |
| Internal layout | unchanged from Phase 4 | unchanged | unchanged |

The `border-right` is the **hairline gutter** (signature-detail #4).
It only renders on wide viewports because the narrow-mode CSS hides
the list pane when `narrowMode === "session"` and there is no second
pane to gutter against when `narrowMode === "list"`.

```css
.list-pane {
  /* No border on narrow viewports — gutter only exists between two
     visible panes. */
}
@media (min-width: 900px) {
  .list-pane {
    border-right: 1px solid var(--color-border);
  }
}
@media (max-width: 899.98px) {
  .split-pane[data-narrow-mode="session"] .list-pane { display: none; }
}
```

(The `899.98px` literal is spec-mandated — line 516 — to avoid the
inclusive-vs-exclusive ambiguity at the boundary.)

### 3.4 Session pane (`<article class="session-pane">`)

| Property | Value |
|----------|-------|
| Element | `<article>` (spec line 1121) |
| Wrapping role | landmark `article`; assistive tech announces it as a self-contained section |
| `aria-busy` | `"true"` while `data-state === "loading"`; otherwise `"false"` |
| `aria-live` | `"polite"` (so right-pane state changes are announced once) |
| `data-state` | `"empty" \| "loading" \| "ready-placeholder" \| "session_not_found"` — drives both styling and screen-reader scope |
| Padding | `var(--space-8) var(--space-6)` (≈ 32 px / 24 px). Generous, editorial. |
| Background | `var(--color-bg)` (Phase-4 baseline; M2 swaps to warm-paper / deep-ink) |
| Min-height | none (hugs content) on M1a; M2 sets `min-block-size: 60vh` once tabs ship |

| Narrow visibility | rule |
|-------------------|------|
| `narrowMode="list"` | `display: none` |
| `narrowMode="session"` | `display: block` (full width) |

```css
.session-pane {
  padding: var(--space-8) var(--space-6);
  /* state-driven content styled per state; see §4 */
}
@media (max-width: 899.98px) {
  .split-pane[data-narrow-mode="list"] .session-pane { display: none; }
}
```

### 3.5 Back-to-list affordance (narrow viewport only)

| Property | Value |
|----------|-------|
| Element | `<button type="button" class="back-to-list">` |
| Visible | only when `narrowMode === "session"` AND viewport < 900 px |
| Position | first child of `.session-pane`, before `.session-pane__header` |
| Label | `← Back to list` (literal arrow glyph + space + text) |
| Style | quiet text-link (no border, no fill, just text color + underline on hover/focus). Distinguished visually from primary actions. |
| Padding | `var(--space-1) var(--space-2)` (touch-friendly hit area without becoming chunky) |
| Color | `var(--color-text-muted)` resting; `var(--color-text)` on hover/focus |
| Focus | visible 2 px solid `var(--color-accent)` outline with 2 px offset |
| Action | sets `narrowMode = "list"` only; **does NOT** clear `selectedRowKey` or URL |

```css
.back-to-list {
  display: none;
  appearance: none;
  background: transparent;
  border: 0;
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.back-to-list:hover,
.back-to-list:focus-visible { color: var(--color-text); text-decoration: underline; }
.back-to-list:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
@media (max-width: 899.98px) {
  .split-pane[data-narrow-mode="session"] .back-to-list { display: inline-block; }
}
```

### 3.6 Selected row treatment (over Phase 4's 8-column table)

The list-row anatomy stays Phase 4 in M1a. The only visual additions
are:

| Variant | Background | Other |
|---------|------------|-------|
| Default | transparent (inherits surface) | (Phase 4 hairline border-bottom) |
| Hover | `color-mix(in srgb, var(--color-text) 4%, transparent)` | cursor: pointer |
| Selected (`aria-current="true"`) | `color-mix(in srgb, var(--color-accent) 8%, transparent)` | inset 2 px sienna left edge via `box-shadow: inset 2px 0 0 var(--color-accent)` |
| Selected + hover | `color-mix(in srgb, var(--color-accent) 12%, transparent)` | (selected wins; hover deepens) |
| Deep-link pulse (`data-deep-link="true"`) | keyframe peak `color-mix(in srgb, var(--color-accent) 22%, transparent)` → settles to selected tint | one-shot 600 ms ease-out, URL-driven mount only |

The 2 px left edge uses `box-shadow: inset 2px 0 0 var(--color-accent)`
(NOT a `border-left`) so adding the inset does not change row width or
shift the first cell — the row layout is byte-equivalent to Phase 4
when not selected. The recipe is friendly to M2's oklch redefinition:
the recipe consumes `var(--color-accent)`, not a hex.

```css
tr[aria-current="true"] {
  background-color: color-mix(in srgb, var(--color-accent) 8%, transparent);
  box-shadow: inset 2px 0 0 var(--color-accent);
}
tr[aria-current="true"]:hover {
  background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
tr[data-deep-link="true"] {
  animation: deep-link-pulse var(--motion-pulse-m1, 600ms) var(--ease-out-m1, ease-out) 1;
}
@keyframes deep-link-pulse {
  0%   { background-color: color-mix(in srgb, var(--color-accent) 22%, transparent); }
  100% { background-color: color-mix(in srgb, var(--color-accent)  8%, transparent); }
}
```

(The fallback values `--motion-pulse-m1` / `--ease-out-m1` are
**purely defensive** — if the developer leaves them undefined, CSS
falls through to `600ms` and `ease-out`. M2 introduces real
`--motion-pulse` / `--ease-out` tokens; until then we hard-code per
spec §Structural literals line 934. The `M1` suffix in the fallback
name makes the intent obvious and is a CSS custom-property naming
courtesy, not a token.)

## 4. States & variants

### 4.1 Right-pane state matrix

| `data-state` | When | Copy + visual treatment | Buttons |
|--------------|------|-------------------------|---------|
| `empty` | no `selectedRowKey`; not deep-linked | Two-paragraph preface (verbatim spec lines 591–593): <br/>**Para 1**: `Select a session from the list to view its content.` <br/>**Para 2**: `The session view shows the full Transcript chronologically, a Skim outline (one block per user message), the Raw NDJSON for verification, and the session's Metadata.` <br/>**Plus**: small text-only mark (a lone `·` middle-dot or `§` glyph at `var(--text-xl)` weight 200 in `var(--color-text-muted)`) centered above the prose. Decision: text-only over SVG illustration — see §6.1. | none |
| `loading` | `selectedRowKey` set AND any of source/stored/scan-errors GETs in flight AND the row hasn't merged yet | Single short line: `Reading session…` in `var(--color-text-muted)` `var(--text-sm)`. No spinner. Rationale: the editorial mood prefers quiet over busy — and the 5 MB cap (M3) bounds the wait. | none |
| `ready-placeholder` | row IS selected and merged in; M1a has no tabs yet | Single short line: `Session view coming in Milestone 2.` in `var(--color-text-muted)` `var(--text-sm)`. Optional secondary line (deferred — see §6.2): "Tabs (Transcript, Skim, Raw, Metadata) land in M2." | none in M1a (M1b adds the vestigial "Open detail" button) |
| `session_not_found` | URL `?session=<rowKey>` AND all three GETs settled AND no row matches | Two-line message: <br/>**Heading**: `Session not found in current view` (`var(--text-lg)`, `var(--color-text)`) <br/>**Hint**: `The session referenced by the URL was not in the merged set after the latest scan.` (`var(--text-sm)`, `var(--color-text-muted)`) <br/>Plus two buttons (see right column). | `Clear selection` (quiet button — text + 1 px hairline border, no fill) → calls `selectRow(null)`, removes the URL `?session=` param. <br/>`Try Rescan` (quiet button) → calls `refetchAll()` (App.tsx). |

### 4.2 Layout variants

| Layout | `narrowMode` | List visible? | Session visible? | Hairline gutter? | Back-to-list visible? |
|--------|--------------|---------------|-------------------|-------------------|------------------------|
| Wide (≥ 900 px) | n/a (ignored) | yes | yes | yes | no |
| Narrow + list | `"list"` | yes (full-width) | no | no (only one pane) | no |
| Narrow + session | `"session"` | no | yes (full-width) | no | yes |
| Narrow + session + no `selectedRowKey` | should not occur | the "Back to list" semantics ensure narrowMode falls back to "list" if selection clears | — | — | — |

**Unreachable-state recovery**: if a future code path lands the user
in `narrowMode === "session"` with `selectedRowKey === null`, the
right pane renders the `empty` state and the developer is expected to
synchronously revert to `narrowMode = "list"`. This is documented in
the implementation acceptance checklist (§8 item 18).

### 4.3 List-row variants (over Phase-4 8-column table)

| Variant | DOM / attr | CSS recipe |
|---------|-----------|------------|
| Default | `<tr>` | (Phase 4 baseline) |
| Hover | `<tr>:hover` | `background-color: color-mix(in srgb, var(--color-text) 4%, transparent)` |
| Selected | `<tr aria-current="true">` | tint + inset 2 px sienna left edge |
| Selected + hover | `<tr aria-current="true">:hover` | deeper tint |
| Deep-link pulse | `<tr data-deep-link="true">` (one-shot, URL-driven mount only) | 600 ms keyframe; cleared by `onAnimationEnd` OR 2 s safety timer |

## 5. Motion & interaction

### 5.1 Deep-link pulse (signature-detail #3)

Trigger: **URL-driven mount only.** When the app mounts and
`URLSearchParams(window.location.search).get("session")` is non-null,
`App.tsx` writes a `pendingDeepLinkPulseRowKey` alongside
`selectedRowKey`. The matched row reads that and applies
`data-deep-link="true"` for one paint cycle.

Animation:
- **Duration**: 600 ms (spec §Motion table; structural literal §938).
- **Easing**: `ease-out` (cubic-bezier(0.0, 0.0, 0.2, 1)).
- **Property animated**: `background-color` only (composite-cheap; on
  the spec's allow-list at line 1100).
- **Keyframe**: peak `color-mix(in srgb, var(--color-accent) 22%, transparent)` →
  settles to the selected-row tint
  `color-mix(in srgb, var(--color-accent) 8%, transparent)`.
- **One-shot**: `animation-iteration-count: 1`.

Cleanup (whichever fires first):
- The row's `onAnimationEnd` handler clears `pendingDeepLinkPulseRowKey`.
- A 2-second `setTimeout` from initial mount clears it unconditionally
  (safety net: `session_not_found` may mean the row never renders).

**Click-driven selection NEVER fires the pulse.** This is the
defining distinction in spec line 585. The user already knows which
row they clicked; the pulse only orients a returning URL-paste user.

### 5.2 Reduced-motion zero-out

Single global rule in `global.css`. Mirrors spec §Motion lines 102–110:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Effect on M1a:
- The 600 ms deep-link pulse collapses to 0.01 ms (effectively
  invisible — the row renders directly in its selected-tint state).
- The selected-row tint itself is **NOT animated** in M1a (the spec
  introduces the `--motion-base` transition timing in M2). So
  reduced-motion has nothing to suppress on selection state changes
  in M1a — the tint just snaps in.

Verification: with reduced-motion on, every transition completes
within one paint frame.

### 5.3 Interaction model: Esc vs "← Back to list" (Resolved Decision #17)

| Gesture | Effect | Scope |
|---------|--------|-------|
| Click on row | `setSelectedRowKey(rowKey)` + `replaceState(buildUrl(rowKey))` + (narrow only) `setNarrowMode("session")` | always |
| `← Back to list` button (narrow only) | `setNarrowMode("list")` ONLY | preserves `selectedRowKey`, URL, scroll, tab state |
| `Esc` key | `setSelectedRowKey(null)` + `replaceState(buildUrl(null))` + `setNarrowMode("list")` | **scoped**: ignored when focus is in `<input>`, `<textarea>`, `[contenteditable]`, `role="combobox"`. Active when focus is in the session pane OR on a selected row. |
| `popstate` (Back/Forward) | re-read URL, sync `selectedRowKey`. Does NOT call `replaceState`. | always |

**Why Back-to-list is a quiet text link, not a chunky button**:
the editorial mood. Chunky buttons read like primary actions; the
right-pane primary actions live in the M2 tab strip. The
"Back to list" gesture is meta-navigation, not a destination.

**Why Esc is scoped**: the Phase-4 `SessionFilters` search input
already consumes Esc to clear its own value. Letting the global Esc
handler swallow that gesture would regress Phase-4 filter UX. The
scope rule (ignored in editable controls) preserves the existing
behavior.

### 5.4 Loading-while-fetching transition

When a deep-linked row hasn't merged in yet (any of the three GETs in
flight + `?session=` is set), the right pane is in `loading` state.
The transition from `loading` → `ready-placeholder` (or →
`session_not_found`) is **not animated** in M1a — the page-turn fade
(signature-detail #2) is an M2/M4 deliverable. M1a just snaps state.
This is editorial-mood-aligned and code-cheap.

## 6. Accessibility

### 6.1 Landmarks

- **List pane**: `<aside aria-label="Sessions list">` — complementary
  landmark. Assistive tech announces it as a complementary region.
- **Session pane**: `<article>` — the spec-mandated wrapper (spec
  line 1121). I deliberately did **not** add `role="main"` because
  the surrounding `<main>` is already the document main landmark
  and adding `role="main"` to a child would create competing main
  landmarks (an anti-pattern). `<article>` is sufficient.
- **`<main>`**: unchanged from Phase 4 baseline (still the
  document main region).

### 6.2 ARIA on dynamic surfaces

- Selected row: `aria-current="true"` (spec line 545).
- Right-pane container: `aria-busy={state === "loading"}`,
  `aria-live="polite"` (assistive tech announces state-change copy
  once, non-disruptively).
- Right-pane `data-state` attribute is a CSS hook, not an ARIA
  attribute — the visible state copy carries the semantic.

### 6.3 Focus model

- Row click → focus stays on the row. The `:focus-visible` outline
  on `<tr>` (existing Phase 4) stays in place — no M1a override.
- "Back to list" button is keyboard-reachable in normal Tab order
  (it is a normal `<button type="button">`). Focus-visible outline:
  2 px sienna `var(--color-accent)`.
- Right-pane `Clear selection` / `Try Rescan` buttons (in
  `session_not_found` state) sit in the normal Tab order.
- Esc handler is global (attached to `document`) but **scoped**:
  ignored when `event.target` matches `input, textarea,
  [contenteditable="true"], [role="combobox"]`. This is the
  spec-mandated rule (line 567).

### 6.4 Contrast targets

The new colors used in M1a all live on top of Phase-4 baseline tokens.
WCAG AA must hold for:

| Foreground | Background | Target |
|------------|------------|--------|
| `var(--color-text)` row text | `color-mix(--color-accent 8%, transparent)` over `var(--color-bg)` | 4.5:1 (normal text) |
| `var(--color-text)` row text | `color-mix(--color-accent 12%, transparent)` over `var(--color-bg)` (selected+hover) | 4.5:1 |
| `var(--color-text-muted)` empty-pane prose | `var(--color-bg)` | 4.5:1 (Phase-4 baseline already passes) |
| `var(--color-text-muted)` "← Back to list" rest | `var(--color-bg)` | 4.5:1 (same baseline) |
| `var(--color-accent)` (the 2 px sienna inset) | `var(--color-bg)` | 3:1 (graphic, not text) |

The selected-row tint at 8% accent over Phase-4 `--color-bg` (#ffffff)
yields a near-white surface; `--color-text` (#14161a, contrast 16.7:1
on pure white) loses only fractional contrast — well above 4.5:1.
M2's oklch redefinition with warm-paper + deep-ink will be re-measured
in the M6 WCAG sweep; M1a's measurement is the baseline-preserved
case.

### 6.5 Reduced-motion

The single global rule (§5.2) covers all M1a animations. Verification:
manually set `prefers-reduced-motion: reduce` and reload — the
deep-link pulse must complete in one paint frame.

## 7. Decisions & tradeoffs

### 7.1 Empty-pane mark: text glyph vs SVG illustration

Spec line 595 says "small subtle illustration or icon (text-only is
fine; no icon library)". I picked **text-only**: a lone middle-dot
(`·`) at `var(--text-xl)` weight 200, `var(--color-text-muted)`,
centered above the prose. Reasons:

- Zero dependencies; no SVG asset to ship; no decoder pattern needed.
- Matches the Archive-room "ink-on-paper" mood — a typographic
  ornament reads more like a printed reference book than a vector
  illustration would.
- The `·` is intentionally low-information so the prose carries the
  weight; an illustration risks visual noise during loading hand-off.
- Reversible at zero cost if M2 wants a different glyph (`§`, `❦`,
  small-caps "S" in display font, etc.).

### 7.2 "Back to list" as quiet text link, not button

Spec line 627: "Quiet text-link styling, not a chunky button —
preserves the editorial mood." Implementation: `<button>` element
(for keyboard semantics + click handling), styled like a text link
(no border, no fill, no fixed width). I considered making it an
`<a href>` instead, but the action is purely client-side state
mutation and wrapping in `<a>` would invite accidental URL coupling.
Sticking with `<button>` keeps semantics honest.

### 7.3 `<article>` only, no `role="main"` on the session pane

Spec line 1121 says wrap in `<article>`. I did not add `role="main"`
because `<main>` already exists higher in the tree. Two main landmarks
in a single document is a WCAG anti-pattern. `<article>` is enough.

### 7.4 No animation on selected-row tint in M1a

The spec §Motion table line 90 lists "Selected row tint" as 120 ms
ease-out via `--motion-base`. **That motion token lands in M2**, not
M1a. So the selected-row tint snaps in M1a. Reduced-motion users see
the same snap. M2 will introduce the transition once `--motion-base`
exists.

### 7.5 `box-shadow inset` for the 2 px left edge, not `border-left`

A `border-left: 2px solid …` would change the row's content box width
by 2 px and shift the first cell rightward by the same. `box-shadow:
inset 2px 0 0 var(--color-accent)` paints the 2 px inside the row's
content box without changing layout — selecting/deselecting a row
becomes byte-equivalent in cell positions. This is also what spec
line 539 implies ("vertical inset rule").

### 7.6 `data-state` on `<article>` instead of conditional class

Three reasons:
- A single attribute encodes the state machine; CSS reads it via
  attribute selector. No multiple classes to combine.
- The attribute round-trips to the DOM — Playwright tests can
  assert `expect(page.locator(".session-pane")).toHaveAttribute(
  "data-state", "session_not_found")` directly.
- Future M2 tab states (`active-tab="metadata"`) can follow the
  same pattern; consistent.

### 7.7 Hairline gutter as `border-right` on the list pane, not `<div>`

A separate hairline `<div>` would be a nameless visual element
(WCAG-questionable) and would consume a grid track. `border-right`
lives on the list pane element itself, costs zero DOM nodes, and
trivially disappears on stacked-narrow viewports (just don't apply
the rule there). This aligns with spec line 497.

### 7.8 Pulse keyframe settles to selected tint, not transparent

Spec line 581: "settles to the resting selected-row tint". So the
keyframe's 100% stop is `color-mix(--color-accent 8%, transparent)`,
NOT `transparent`. This avoids a visible flash from the pulse
fade-out into a different shade.

## 8. Implementation acceptance checklist

A numbered list the developer can verify against. The reviewer can
also use this as a test plan.

1. `<main>` carries class `split-pane` and is `display: grid;
   grid-template-columns: minmax(300px, 380px) 1fr; gap: 0;
   max-width: 1400px; margin: 0 auto` above 900 px.
2. Below 900 px, `<main>.split-pane` is `display: grid;
   grid-template-columns: 1fr` (single column).
3. The hairline gutter is exactly `border-right: 1px solid
   var(--color-border)` on `.list-pane`, **only** under
   `@media (min-width: 900px)`.
4. List pane wraps in `<aside class="list-pane" aria-label="Sessions
   list">`.
5. Session pane wraps in `<article class="session-pane">`.
6. Session pane carries `data-state` attribute with one of:
   `"empty" | "loading" | "ready-placeholder" | "session_not_found"`.
7. Session pane carries `aria-busy="true"` only when `data-state="loading"`.
8. Session pane carries `aria-live="polite"`.
9. Empty-pane preface text matches spec lines 591–593 verbatim:
   - Para 1: `Select a session from the list to view its content.`
   - Para 2: `The session view shows the full Transcript chronologically,
     a Skim outline (one block per user message), the Raw NDJSON for
     verification, and the session's Metadata.`
   - Plus a single text glyph (e.g. middle-dot) at `var(--text-xl)`
     in `var(--color-text-muted)`.
10. Loading-state copy: `Reading session…` in `var(--color-text-muted)`
    `var(--text-sm)`. No spinner.
11. Ready-placeholder copy: `Session view coming in Milestone 2.` —
    NO "Open detail" button (M1b adds it).
12. `session_not_found` copy: heading `Session not found in current
    view` + hint `The session referenced by the URL was not in the
    merged set after the latest scan.` + buttons `Clear selection`
    and `Try Rescan`.
13. `session_not_found` only renders AFTER all three GETs (source +
    stored + scan-errors) have settled — never during loading.
14. Selected row carries `aria-current="true"` (case-sensitive string
    `"true"`).
15. Selected row background uses `color-mix(in srgb,
    var(--color-accent) 8%, transparent)`.
16. Selected row carries `box-shadow: inset 2px 0 0
    var(--color-accent)` (NOT `border-left`).
17. Hover row uses `color-mix(in srgb, var(--color-text) 4%,
    transparent)`. Selected + hover deepens to
    `color-mix(in srgb, var(--color-accent) 12%, transparent)`.
18. On URL-driven mount with `?session=<rowKey>`, the matched row
    receives `data-deep-link="true"` and animates the 600 ms pulse
    keyframe (peak `color-mix(in srgb, var(--color-accent) 22%,
    transparent)`, settles to selected tint
    `color-mix(in srgb, var(--color-accent) 8%, transparent)`).
19. The deep-link pulse clears via `onAnimationEnd` OR a 2-second
    `setTimeout` from initial mount, whichever fires first. After
    cleanup, `data-deep-link` is removed from the row.
20. Click-driven selection MUST NOT trigger the pulse — only
    URL-driven mount does (`pendingDeepLinkPulseRowKey` is written
    only by the App-on-mount path).
21. Below 900 px, `<main>` carries `data-narrow-mode="list" |
    "session"`. Default is `"list"`. Clicking a row (or selecting one
    via `selectRow`) sets it to `"session"`.
22. Below 900 px with `data-narrow-mode="list"`, `.session-pane`
    is `display: none`. Both panes stay React-mounted.
23. Below 900 px with `data-narrow-mode="session"`, `.list-pane`
    is `display: none`. Both panes stay React-mounted.
24. The `← Back to list` button renders ONLY when below 900 px AND
    `data-narrow-mode="session"`.
25. Clicking `← Back to list` sets `narrowMode="list"` ONLY — does
    NOT clear `selectedRowKey` and does NOT clear the URL `?session=`
    param.
26. `Esc` key calls `setSelectedRowKey(null)` AND
    `replaceState(buildUrl(null))` AND sets `narrowMode="list"`.
27. `Esc` is **ignored** when focus is on `<input>`, `<textarea>`,
    `[contenteditable="true"]`, or `[role="combobox"]`.
28. The reduced-motion zero-out rule lives in `global.css` and
    matches spec lines 102–110 verbatim.
29. Hex isolation: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ |
    wc -l` returns 24 (Phase-4 baseline) after M1a. M1a adds zero
    hex literals.
30. No new `--color-*`, `--font-*`, `--motion-*`, `--text-*`,
    `--measure`, `--noise-overlay-*`, or `--ease-*` tokens added in
    M1a. (`grep -E '^\s*--' apps/frontend/src/styles/tokens.css | wc -l`
    returns 44 — same as Phase-4 baseline.)
31. No new runtime dependencies introduced in M1a.
32. Pulse + selected-tint `color-mix` recipes reference
    `var(--color-accent)` (NOT a hardcoded hex). M2's
    `--color-accent` redefinition automatically retints both.
33. All pre-existing Phase-4 tests stay green
    (`bun test src` / `bun run build` / `bun run test:e2e`).

## 9. References

Spec sections cited (line ranges in `working/phase-5.md` @ `05467ad`):

| Topic | Section | Lines |
|-------|---------|-------|
| Archive-room aesthetic | §Design Language | 15–78 |
| Motion budget table | §Motion & Micro-interactions | 80–96 |
| Reduced-motion rule (verbatim) | §Reduced-motion | 97–110 |
| Performance budget | §Performance budget | 114–128 |
| In-scope (this phase) | §Goal & Scope → in scope | 132–149 |
| Split-pane shell | §Inspection Surface Layout → §Split-pane shell | 495–518 |
| Selected-row visual treatment | §Row visual treatment | 533–545 |
| URL state via History API | §URL state via History API | 559–586 |
| Empty pane state copy | §Empty pane state | 587–595 |
| Mobile / narrow viewport | §Mobile / narrow viewport | 597–611 |
| Routing / URL state | §Routing / URL State | 820–846 |
| `session_not_found` empty state | §Empty States item 5 | 862 |
| Structural literals (M1) | §Design Tokens → §Structural literals | 926–946 |
| Milestone 1 DoD | §Milestones → ### Milestone 1 | 971–989 |
| Acceptance Criteria (M1-relevant) | §Acceptance Criteria | 1080–1102 |
| Resolved Decisions #1 (replaceState) | §Resolved Decisions | 1142 |
| Resolved Decision #10 (Archive-room) | §Resolved Decisions | 1151 |
| Resolved Decision #17 (Esc vs Back) | §Resolved Decisions | 1162 |
| Resolved Decision #19 (deep-link pulse) | §Resolved Decisions | 1164 |
| Resolved Decision #20 (selection ownership) | §Resolved Decisions | 1165 |
| `<article>` testing accessibility | §Testing | 1121 |

Architecture references:
- `ARCHITECTURE.md` — split-pane is consistent with the existing
  document-of-document-views model.
- `PRD.md` line 223 — disabled-summary placeholder copy lands in M5,
  not M1a (this design defers to that explicitly).
- `docs/dependency-rules.md` — Phase 5 dep policy carried over
  unchanged in M1a (no new deps).

## 10. Open questions for the reviewer

1. **Empty-pane glyph: middle-dot (`·`) vs `§` vs `❦` vs nothing**.
   Designer recommends `·`. None of the three changes the prose copy
   (which is spec-frozen). Reviewer can pick a different glyph or
   strike the glyph entirely without breaking spec.
2. **Optional secondary line in `ready-placeholder` state**.
   Designer left it OUT to avoid promising a milestone date the user
   can't reason about. Reviewer might prefer adding "Tabs (Transcript,
   Skim, Raw, Metadata) land in M2." Either way is spec-compliant.
3. **Quiet button border style for `Clear selection` / `Try Rescan`**.
   Designer used 1 px hairline border + transparent fill (matches
   Phase 4 `.empty` callout buttons). Reviewer might want a single
   underlined text link instead. Both work.
4. **Whether to expose `data-narrow-mode` as a `<main>` attribute or
   as React-only state with conditional className**. Designer picked
   the attribute approach for testability + CSS-attribute-selector
   ergonomics. Developer-implementation latitude.
5. **`<aside aria-label>` text**. Designer used `"Sessions list"`.
   Reviewer might prefer `"Session list"` (singular) or
   `"Inspection list"` (matching the Phase-4 doc terminology).
   Cosmetic.

If the reviewer has no concerns on any of these, M1a closes as-is.
