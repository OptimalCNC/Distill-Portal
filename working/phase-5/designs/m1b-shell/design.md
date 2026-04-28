# M1b — compact list (4 essentials + Select) + sticky list-pane footer + filter `<details>` wrap + vestigial "Open detail" button

Design artifact for **Phase 5 / Milestone 1 / Chunk b**.
Spec frozen at `working/phase-5.md` @ `05467ad` on `main`.
Implementation predecessor: M1a closed at impl SHA `a59b3f6` on `main`.
Designer: UI/UX subagent dispatched 2026-04-28.

This is a **reference artifact**. The developer subagent re-implements
against the production stack (Bun + Vite + React + TS + per-component
sibling CSS). Nothing in this folder is shipped to `apps/frontend/`.

---

## 1. Chunk scope summary

M1b retires or relocates each Phase 4 list-pane surface that survived
M1a's split-pane shell. It (a) compresses `SessionsTable` from 8
columns to 5 (Select + Title + Status + Project + Updated), with the
Title cell carrying an inline tool badge + muted mono rowKey + an
optional `(refresh)` marker; (b) relocates `<ActionBar>` and
`<Pagination>` out of their current inline positions into a new
`.list-pane-footer` strip that `position: sticky; bottom: 0`s within
the list pane; (c) wraps `<SessionFilters>` inside a `<details>` element
below the 1100 px breakpoint with an active-filter-count chip in the
summary; and (d) introduces a vestigial "Open detail" text-link button
in `SessionView`'s `ready-placeholder` state, which is the new entry
point to the still-mounted Phase 4 `<Drawer>` (row click no longer
auto-mounts the drawer).

Out of M1b (deferred): the M2 Tabs primitive + Design Language token
rollout (Fraunces + oklch palette + motion tokens + signature
noise-overlay) all land in M2; the still-mounted drawer + `SessionDetail`
deletion is M6 (Resolved Decision #6).

## 2. Design intent

### How M1b builds on M1a

M1a delivered the bones — the split-pane Grid, the hairline gutter, the
right-pane state machine, the deep-link pulse, the global Esc handler
with editable-control scoping, the reduced-motion zero-out — and
preserved Phase 4's row-click → drawer behavior verbatim so the
visible list chrome stayed identical. M1b is the **list-side
recomposition** chunk: same tokens, same grid, same gutter; what
changes is *what reads as the list*.

The four M1b surface shifts are deliberately quiet:

- The 4-essential row anatomy compresses information density without
  changing the M1a row-state recipe (default / hover / selected /
  selected+hover / deep-link pulse) — the visual hierarchy survives
  the column compression because the recipe consumes
  `var(--color-accent)` against a transparent background; the row's
  resting tint is still the warm-paper / deep-ink surface.
- The sticky list-pane footer is a hairline-bordered strip with no
  shadow — the editorial principle "hairline over shadow" continues.
  Its sticky behavior (anchored to the closest scrolling ancestor —
  the page viewport in M1a/M1b's layout) makes the bar persistently
  visible without introducing new chrome.
- The `<details>` wrap below 1100 px engages **only** at the wrap
  breakpoint; above 1100 px the existing Phase 4 inline strip reads
  through unchanged. The disclosure uses the browser-native
  `::marker` chevron — no SVG, no icon library — and instant
  open/close (no `block-size` transition; that's the M5 Skim
  exemption per spec line 1100).
- The vestigial "Open detail" button is a verbatim parallel of M1a's
  `.back-to-list` quiet text-link: transparent bg, no border, muted
  resting color, underline on hover/focus, sienna focus ring with
  2 px offset. It does its job without anchoring visual weight that
  M2 will inherit. M2 deletes it; the surface is intentionally
  expendable.

### What M1b sets up for M2

- **Compressed information per row** means M2's right-pane Tabs
  primitive (Transcript / Skim / Raw / Metadata) can claim the wider
  reading column without competing with a wide table. The 4-essential
  row was sized to the 300-380 px list pane; rows do not require
  horizontal scroll on viewports ≥ 900 px.
- **Sticky footer rhythm** establishes the "list-pane chrome lives at
  the bottom" pattern that M2 inherits when it adds the right-pane
  tab strip's own footer (e.g., the truncation banner anchor).
- **Filter `<details>` wrap** is the first appearance of disclosure
  semantics in this codebase; M5 expands disclosure usage in
  SkimView ("Agent reaction" toggle, oversized-message expansion,
  agent-only expansion). The M1b chevron + focus-visible ring
  recipes carry over.
- **Vestigial button precedent** — when M2 deletes this button and
  Tabs become the canonical entry point, the deletion is a
  one-component sweep with no token churn. The spec even names the
  button "vestigial" to telegraph this.

### Aesthetic anchor (Archive-room)

The Archive-room aesthetic principles M1a committed to (warm-paper
light / deep-ink dark, sienna single accent, hairlines over shadows,
sharp panels, restrained motion) carry through M1b without exception.
The single new visual element introduced in M1b — the
`.filter-count-chip` — uses **only** a hairline border on transparent
ground; no fill, no glow, no shadow. The chevron is the browser's
default `::marker`; we explicitly do not import an icon set.

## 3. Component anatomy

### 3.1 DOM tree (wide viewport, row selected)

```
<main class="split-pane" data-narrow-mode="list">
  <aside class="list-pane" aria-label="Sessions list">

    <details class="filters-wrap" open>
      <!-- ABOVE 1100 px: <summary> hidden by CSS; body always rendered.
           BELOW 1100 px: <summary> visible; <details> toggles. -->
      <summary>
        <span aria-hidden="true">Filters</span>
        <span class="filter-count-chip" hidden>3 active</span>
      </summary>
      <div class="session-filters" role="group" aria-label="Session filters">
        ...Phase 4 filter rows (tool / storage / status / project / search / sort)...
      </div>
    </details>

    <div class="list-pane-body">
      <!-- table-wrap is the table's overflow shell;
           .list-pane-body is the prototype's scroll container.
           In production the page viewport scrolls. -->
      <div class="table-wrap">
        <table class="sessions-table">
          <thead>
            <tr>
              <th class="select-col"><input type="checkbox" /></th>
              <th>Title</th>
              <th>Status</th>
              <th>Project</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            <!-- 4-essential rows; M1a row-state recipe preserved. -->
            <tr aria-current="true">
              <td class="select-col">...</td>
              <td>
                <div class="title-cell">
                  <div class="title-cell-line1">
                    <span class="title-cell-title">{title}</span>
                    <span class="title-cell-tool">{tool}</span>
                  </div>
                  <div class="title-cell-line2">
                    <span class="title-cell-rowkey mono">{rowKey}</span>
                    <span class="title-cell-refresh">(refresh)</span>  <!-- if statusConflict -->
                  </div>
                </div>
              </td>
              <td><span class="badge {status}">{label}</span></td>
              <td class="project-cell" title="{full path}">{project}</td>
              <td class="updated-cell" title="{ISO}">{relative time}</td>
            </tr>
            ...
          </tbody>
        </table>
      </div>
    </div>

    <!-- M1b sticky list-pane footer. Pagination ABOVE ActionBar. -->
    <div class="list-pane-footer">
      <div class="pagination">...</div>
      <div class="action-bar">
        <div class="action-bar-buttons">
          <button>Rescan</button>
          <span class="action-bar-last-rescan">last rescan from this browser X ago</span>
          <button disabled>Import N selected</button>
        </div>
      </div>
    </div>
  </aside>

  <article class="session-pane" data-state="ready-placeholder">
    <div class="session-state">
      <p class="placeholder-line">Session view coming in Milestone 2.</p>
      <!-- M1b vestigial Open detail button. Renders ONLY in
           ready-placeholder state. -->
      <button type="button" class="open-detail">Open detail</button>
    </div>
  </article>
</main>
```

### 3.2 Compact `SessionsTable` rows

| Column     | What renders                                                                                                                                                                                    |
|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Select     | Checkbox (`isImportable(row) === true` only — Phase 4 importability rule preserved). Width clamp: `width: 2.25rem` (Phase 4 baseline literal).                                                  |
| Title      | Two-line stack: bold title + tool badge inline (line 1); muted mono rowKey + optional `(refresh)` marker (line 2). Stack gap = `var(--space-1)` = 4 px (spec line 543).                          |
| Status     | Phase 4 badge (`badge.up-to-date` / `badge.not-stored` / `badge.outdated` / `badge.source-missing`). Recipe verbatim from `SessionsTable.css`.                                                  |
| Project    | `row.projectPath ?? "—"`, single-line ellipsis truncation (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`); full path on `title=` hover.                                       |
| Updated    | `relativeTimeFrom(now, row.sourceUpdatedAt)`; absolute ISO on `title=` hover. Mono font for column alignment (Phase 4 pattern preserved).                                                       |

**Dropped columns** (visible only via the still-mounted Phase 4 drawer
until M2's Metadata tab takes over): Tool / Stored Copy / Source Path.

**Title cell anatomy**:

```
.title-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);   /* 4 px between line 1 and line 2 */
  min-width: 0;          /* enables ellipsis truncation */
}
.title-cell-line1 {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
.title-cell-title {
  font-weight: 600;
  color: var(--color-text);
  /* single-line ellipsis on overflow */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.title-cell-tool {
  flex-shrink: 0;
  display: inline-block;
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  letter-spacing: 0.02em;
  line-height: 1.6;
}
.title-cell-line2 {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  min-width: 0;
}
.title-cell-rowkey {
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.title-cell-refresh {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--color-warn);
  font-style: italic;
}
```

**Tool badge** is a hairline-bordered chip on transparent ground —
intentionally NOT the filled `.badge.{variant}` recipe; tool identity
is a quiet contextual signal, not a status (which is the row's
dedicated column).

**`(refresh)` marker** — the Phase 4 muted text marker stays inline
with the rowKey on line 2. Sized at `var(--text-xs)` and tinted at
`var(--color-warn)` so it telegraphs the "refresh" semantic without
competing with the status pill. Phase 4 used `var(--color-text-muted)`;
M1b warms it to `--color-warn` so the marker reads as a state hint
rather than incidental copy. (If the reviewer prefers the Phase 4
muted treatment for visual restraint, that is a one-token swap; both
are token-driven recipes.)

**Row anatomy** (per spec line 543):
- `min-height: 36px` on `<tr>` (also on `<td>` for defense-in-depth).
- Vertical padding: `var(--space-2)` = 8 px.
- Horizontal padding: `var(--space-3)` = 12 px.
- Cell gutter: `var(--space-2)` = 8 px (achieved via cell padding + the
  Title cell's flex-gap on line 1).
- Title-stack gap: `var(--space-1)` = 4 px.

**Row click semantic shift** (M1b): the row click handler now invokes
`onSelectRow(row.rowKey)` only. The Phase 4 `onOpenDetail(rowKey,
triggerEl)` call is removed from the row click path. The
`<Drawer>` no longer auto-mounts on row click — the vestigial
"Open detail" button is the new entry point. The checkbox-cell
propagation guard from M1a is preserved (clicking the checkbox stops
propagation and toggles selection only).

### 3.3 Sticky list-pane footer

```
.list-pane-footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background: var(--color-bg);                    /* opaque cover for scrolled rows */
  border-top: 1px solid var(--color-border);      /* hairline-over-shadow */
  padding: var(--space-2) var(--space-3) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
```

**Layout inside the footer** (top to bottom): Pagination strip ABOVE
ActionBar. Each component is a row; the footer's flex-direction:
column stacks them. Per spec line 555: Pagination "lives between the
table and the action bar" — so when the user reads top-down, the
order is **Table → Pagination → ActionBar**.

**Sticky behavior**: `position: sticky; bottom: 0` anchors the footer
to the **closest scrolling ancestor**. In the current layout
(`.list-pane` does NOT carry `overflow: auto` in M1a/M1b), the closest
scrolling ancestor is the page viewport. The footer is therefore
always visible — which is the intended "bar always visible on tall
lists" UX.

If a future chunk gives `.list-pane` its own `overflow: auto`, the
footer would stick to the list-pane viewport instead. This is
acceptable behavior — and the prototype demonstrates this case in the
"scrolled" demo. M1b does not need to lock down which ancestor stickies
to, only that the recipe is `position: sticky; bottom: 0; z-index: 1`.

**Visual treatment**:
- Hairline `border-top: 1px solid var(--color-border)` — the sole
  visual separator from the table content above. Archive-room
  hairline-over-shadow.
- Background `var(--color-bg)` — opaque enough to cover scrolled-under
  rows. NO drop shadow. NO surface tint.
- Pagination strip and ActionBar each get internal padding + gap from
  their existing Phase 4 recipes; the footer wrapper does NOT add
  surface chrome to either.
- The `.action-bar` retains its Phase 4 internal `border-top: 1px
  solid var(--color-border)` to separate the buttons row from the
  Pagination strip above. This is two stacked hairlines (footer's
  outer + ActionBar's internal) — intentional: the outer hairline
  separates footer-from-table; the inner hairline separates
  Pagination-from-ActionBar.

**Phase 4 carryovers** preserved:
- `<ActionBar>`'s "last rescan from this browser X ago" caption.
- `<ActionBar>`'s "Import N selected" disabled state when N === 0.
- `<Pagination>`'s 50 / 100 / 200 page-size selector.
- `<Pagination>`'s "Page N of M · X results" caption.

The standalone `<ActionBar>` instance currently rendered inside
`<section className="panel">` in `App.tsx` is **removed** — the only
remaining instance is inside `.list-pane-footer`.

### 3.4 SessionFilters `<details>` wrap

```html
<details class="filters-wrap" open>
  <summary>
    <span aria-hidden="true">Filters</span>
    <span class="filter-count-chip" hidden>3 active</span>
  </summary>
  <div class="session-filters" role="group" aria-label="Session filters">
    ...existing Phase 4 filter rows verbatim...
  </div>
</details>
```

**Above 1100 px**: the `<summary>` element is hidden via CSS
(`display: none`). The body renders open regardless of the `open`
attribute (forced via `display: flex !important` to defeat the
browser's `<details>` default). The result is the existing Phase 4
inline filter strip — no behavioral change above the breakpoint.

**Below 1100 px**: the `<summary>` becomes visible; the disclosure
toggles the body. Default open state: closed. The implementation uses
`window.matchMedia("(min-width: 1100px)")` mirroring M1a's narrow-mode
listener pattern (App.tsx lines 800-826) to set the `open` attribute
on first paint AND on resize crossings. The user's manual toggle
below 1100 px is preserved (the listener should NOT clobber it on
mid-session resizes within the same breakpoint).

```css
.filters-wrap {
  border-bottom: 1px solid var(--color-border);
}
.filters-wrap > summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  list-style: revert;       /* restore browser-native ::marker chevron */
  user-select: none;
}
.filters-wrap > summary:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
.filters-wrap[open] > summary {
  border-bottom: 1px solid var(--color-border);  /* hairline separator when open */
}

@media (min-width: 1100px) {
  .filters-wrap { border-bottom: 0; }
  .filters-wrap > summary { display: none; }
  .filters-wrap > .session-filters { display: flex !important; }
}
```

**Chevron**: the browser-native `::marker` triangle (revert from the
Phase 4 reset's `list-style: none` if any). No SVG. No icon library.
The triangle rotates open ↔ closed via the browser's built-in
behavior; M1b adds **no** custom transition (the
`block-size`-via-`interpolate-size` exemption per spec line 1100 is
deferred — the disclosure is editorial-fast in Skim view; the filter
strip toggle is utility, not editorial mood, so instant snap is the
correct gesture).

**`.filter-count-chip` styling**:

```css
.filter-count-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-2);
  min-height: 1.4em;
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--color-text-muted);
  background: transparent;            /* hairline-only, no fill */
  border: 1px solid var(--color-border);
  border-radius: 999px;
  letter-spacing: 0.02em;
}
```

The chip is **not** the existing pill-style `.chip` recipe used by
filter affordances — those carry `background: var(--color-surface)` +
hover ring + active-tint. The summary chip is **quieter**: hairline
border on transparent ground, muted text. Distinct visual rhythm so
the count reads as a passive indicator, not a tappable target. This is
a **reuse-before-invent** consideration: the existing `.chip`
deliberately does NOT apply because (a) it implies tappability, and
(b) its filled active state would compete with the summary's bold
text. A quieter recipe is needed.

**Active-filter count** (the 7 axes):

| Axis             | Default                                                | "Active" predicate                |
|------------------|--------------------------------------------------------|------------------------------------|
| `tool`           | `"all"`                                                | `tool !== "all"`                   |
| `storage`        | `"all"`                                                | `storage !== "all"`                |
| `status`         | `[]` (empty array)                                     | `status.length > 0`                |
| `project`        | `null`                                                 | `project !== null`                 |
| `search`         | `""`                                                   | `search !== ""`                    |
| `importableOnly` | `false`                                                | `importableOnly === true`          |
| `sort`           | `{field: "source_updated_at", direction: "desc"}`      | not deep-equal to default          |

Counting layout: `count === 0` ⇒ chip suppressed (`hidden` attribute
or `display: none`); `count >= 1` ⇒ chip renders `${count} active`.
The summary line stays single-line at all counts (chip max width is
small; long axis-name lists do NOT wrap into the chip).

### 3.5 Vestigial "Open detail" button

```jsx
{state === "ready-placeholder" ? (
  <>
    <p className="placeholder-line">Session view coming in Milestone 2.</p>
    <button type="button" className="open-detail" onClick={onOpenDetail}>
      Open detail
    </button>
  </>
) : null}
```

**Rendering scope**: ONLY when `state === "ready-placeholder"`. The
button is absent in `empty` (no row selected — nothing to open) /
`loading` (row not yet merged — drawer would show empty body) /
`session_not_found` (the `Clear selection` + `Try Rescan` quiet
buttons own that state's affordance vocabulary).

**Copy**: `Open detail` (verbatim per spec line 977). Capital-O
exclusive of "Open Detail" or "open detail" — the spec is
title-case-with-leading-cap.

**Positioning**: directly **under** the placeholder line, with the
`.session-state > * + *` rule from M1a `SessionView.css` providing the
`margin-top: var(--space-3)` gap.

The designer considered the alternative "above the placeholder copy"
positioning. Rationale for **below**: the placeholder line is the
contextual lede ("Session view coming in M2"); the action verb sits
**after** the explanation, mirroring the editorial cadence of the
empty-pane two-paragraph preface from M1a. Putting the button above
would read as a primary CTA; putting it below reads as a "by the way,
here is the temporary affordance" — which is exactly what the
"vestigial" framing wants.

**Visual recipe** (parallel to M1a's `.back-to-list`):

```css
.open-detail {
  display: inline-block;
  appearance: none;
  background: transparent;
  border: 0;
  padding: var(--space-1) var(--space-2);
  margin: 0 0 0 calc(-1 * var(--space-2));   /* unindent so the text aligns with the placeholder line */
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.open-detail:hover,
.open-detail:focus-visible {
  color: var(--color-text);
  text-decoration: underline;
}
.open-detail:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.open-detail:active {
  color: var(--color-accent-hover);
}
```

**Click handler**: invokes the new `onOpenDetail` callback exactly
once; the callback opens the still-mounted Phase 4 `<Drawer>` with
`<SessionDetail>` body. The Drawer's `restoreFocusRef` argument
(currently the row-trigger ref in Phase 4) shifts to a **new ref
captured on the vestigial button itself** — focus restoration target
shifts from "originating row" (Phase 4) to "the vestigial button"
(M1b). When the drawer closes, focus returns to the button so a
subsequent Tab moves the user forward in the natural reading order
(button → next interactive element in the right pane), not back into
the list.

**Vestigial nature**: this button is intentionally low-anchor. It
does not carry M2's primary-action vocabulary (the Tabs primitive
will). When M2 deletes it, the deletion is a one-component sweep:
remove the JSX element from `SessionView.tsx`, remove the
`.open-detail` CSS recipe, remove the `onOpenDetail` prop. No tokens
churn; no other component updates.

## 4. States & variants

### 4.1 SessionsTable row variants

| Variant                           | DOM / attr                                            | CSS recipe                                                                                          |
|-----------------------------------|-------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| Default                           | `<tr>`                                                | (Phase 4 baseline; transparent surface; hairline `border-bottom`)                                   |
| Hover                             | `<tr>:hover`                                          | `background-color: color-mix(in srgb, var(--color-text) 4%, transparent)`                            |
| Selected                          | `<tr aria-current="true">`                            | `color-mix(--color-accent 8%, transparent)` + `box-shadow: inset 2px 0 0 var(--color-accent)`        |
| Selected + hover                  | `<tr aria-current="true">:hover`                      | `color-mix(--color-accent 12%, transparent)` (selected wins; hover deepens)                          |
| Deep-link pulse (one-shot)        | `<tr data-deep-link="true">` (URL-driven mount only)  | `animation: deep-link-pulse 600ms ease-out 1`; keyframe peak 22% → settles to 8% (selected tint)     |

**M1a recipe verbatim — preserved through M1b.** The `tr[aria-current="true"]`
selector remains the single source of truth; the `box-shadow: inset 2px 0 0
var(--color-accent)` inset preserves byte-equivalent cell positions across
selection state changes (no border-induced 2 px shift).

**Title cell sub-states**:

| Sub-state                         | Line 2 contents                                                       |
|-----------------------------------|-----------------------------------------------------------------------|
| Default                           | `<span class="mono">{rowKey}</span>` only                             |
| With `(refresh)` marker           | `<span class="mono">{rowKey}</span> <span class="refresh">(refresh)</span>` when `row.statusConflict === true` |

**`sourcePathIsStale` does NOT survive M1b's compact row.** Phase 4
labelled the source-path cell with a `title=` hover hint when
`row.sourcePathIsStale === true`; M1b drops the Source Path column
entirely (per spec lines 520-531). The staleness signal is reachable
via the still-mounted drawer's `<SessionDetail>` body until M2's
Metadata tab takes over. **Designer's recommendation**: the spec's
compact-row table at lines 524-530 does not include staleness; M1b
exits the row entirely. The reviewer can revisit if they think
staleness deserves a row-level signal.

### 4.2 Sticky list-pane footer states

| State                                  | Visual                                                                                |
|----------------------------------------|---------------------------------------------------------------------------------------|
| At-rest (rows fit; no scroll)          | Footer renders below the last row; hairline border-top + opaque bg.                   |
| Scrolled (rows pass under the footer)  | Footer stickies at `bottom: 0` of the closest scrolling ancestor (page viewport).     |
| ActionBar empty (0 selected)           | "Import 0 selected" button disabled; "last rescan" caption renders normally.          |
| ActionBar with N selected              | "Import N selected" button enabled; clicking dispatches the existing Phase 4 import handler. |

### 4.3 SessionFilters states

| Viewport     | `<details>` open state | Visual                                                                                              |
|--------------|------------------------|-----------------------------------------------------------------------------------------------------|
| ≥ 1100 px    | n/a (forced open + summary suppressed) | Existing Phase 4 inline strip — no `<details>` chrome visible.                       |
| < 1100 px, default (closed) | `[open]` absent        | Single `<summary>` row: chevron (native `::marker`) + "Filters" + chip (if count > 0). Body collapsed. |
| < 1100 px, opened           | `[open]`               | Summary visible; hairline bottom border separates summary from body; body renders all 6 filter rows. |

**Active-filter chip variants**:

| Count | Chip                          |
|-------|-------------------------------|
| 0     | suppressed (`hidden` attribute) |
| 1     | `1 active`                    |
| 2     | `2 active`                    |
| 3     | `3 active`                    |
| ...   | ...                           |
| 7     | `7 active` (max — all axes differ from default) |

### 4.4 Vestigial "Open detail" button states

| State           | Visual                                                                                |
|-----------------|---------------------------------------------------------------------------------------|
| Default (rest)  | Transparent bg, no border, color `var(--color-text-muted)`, no underline.              |
| Hover           | Color `var(--color-text)`, underline, no outline.                                     |
| Focus-visible   | Color `var(--color-text)`, underline, `outline: 2px solid var(--color-accent)` with `outline-offset: 2px`. |
| Active (pressed) | Color `var(--color-accent-hover)`, underline (carry-over from hover).                 |

## 5. Motion & interaction

The only motion change in M1b is **none** — the surface additions are
all instant transitions:

- **`<details>` open/close**: browser-native, instant. The
  `block-size`-via-`interpolate-size` transition documented at spec
  line 1100 is deferred to M5 (SkimView); the filter strip is utility
  chrome and snap-instant is the correct gesture.
- **Sticky footer**: no entrance animation. The footer is always in
  the DOM; sticking is a pure layout behavior.
- **Vestigial Open detail button**: no entrance animation; hover
  underline is the only state transition and the spec already permits
  inline `text-decoration` toggles without a motion entry (parallel to
  M1a's `.back-to-list`).

**M1a motion preserved verbatim**:
- Deep-link pulse (600 ms, ease-out, one-shot) on URL-driven mount —
  recipe unchanged; the M1b row anatomy keeps the keyframe target on
  `<tr>` so the animation still applies.
- Reduced-motion zero-out global rule remains in `global.css`.
- No new `@keyframes` introduced in M1b.

**Focus management for the vestigial button**:
- Tab order: button is focusable in document order (between the
  placeholder line above and any subsequent right-pane content
  below — currently nothing else in M1b).
- Focus restoration: clicking the button captures the button's DOM
  node into the `triggerRef` consumed by the Phase 4 Drawer's
  `restoreFocusRef`. When the drawer closes, focus returns to the
  button.
- Tabbing past the button after closing the drawer moves focus to the
  next interactive element in the right pane (none in M1b; M2's tab
  strip will fill this).

**Reduced-motion behavior** (no-op for M1b additions): the global
zero-out rule from M1a still applies; native `<details>` does not
animate by default; the vestigial button has no transitions to
suppress; the row-state recipes unchanged from M1a.

## 6. Accessibility

### 6.1 Landmarks & roles

- `<aside class="list-pane" aria-label="Sessions list">` — preserved
  from M1a. Complementary landmark.
- `<article class="session-pane">` — preserved from M1a. Self-contained
  section.
- `<details class="filters-wrap">` — native HTML5 disclosure; the
  browser exposes role `group` automatically with `aria-expanded`
  state on the `<summary>`. No additional ARIA needed.
- `<div class="session-filters" role="group" aria-label="Session filters">`
  — preserved from Phase 4. Keeps its own group label so assistive tech
  announces both the disclosure ("Filters, expanded/collapsed") and
  the group when the user enters it.
- `<table class="sessions-table">` — preserved from Phase 4.
- `<tr aria-current="true">` — preserved from M1a. Selected-row
  announcement.
- `.list-pane-footer` — purely structural; it does NOT carry a
  landmark role. The two children (`<Pagination>` and `<ActionBar>`)
  retain their existing Phase 4 ARIA semantics (Pagination buttons
  carry `aria-label`s; ActionBar's last-rescan caption uses `title=`
  for the absolute timestamp).

### 6.2 Keyboard

- `<details>` is keyboard-accessible by default: Tab focuses the
  `<summary>`, Enter/Space toggles the disclosure, focus indication
  via `:focus-visible` ring (2 px sienna outline + 2 px offset).
- Filter chips inside the body retain Tab order; when the disclosure
  is closed, the chips are not in the Tab order (browser-native).
- Vestigial Open detail button: Tab-reachable; Enter/Space activates;
  focus-visible ring (2 px sienna + 2 px offset).
- Esc handler from M1a is preserved verbatim; the new vestigial
  button + the new `<summary>` element are NOT editable controls, so
  Esc still fires its scoped clearing behavior when focus is on
  either of them. (Sanity check: `<summary>` does not match the
  editable selectors `input, textarea, [contenteditable], [role="combobox"]`.)
- Row click semantic shift: clicking a row sets `selectedRowKey` only;
  the drawer is no longer auto-mounted. Keyboard activation (Enter on
  a focused row) follows the same path. Phase 4's checkbox-cell
  propagation guard is preserved verbatim.

### 6.3 ARIA on the active-filter chip

- The chip is decorative content inside the `<summary>`; it carries
  no separate ARIA role.
- The summary's `aria-expanded` (browser-managed) tells assistive tech
  whether the disclosure is open. Combined with the visible "{N}
  active" text, screen readers announce both the toggle state and the
  filter count.
- When `count === 0`, the chip is removed from the accessibility tree
  via the `hidden` attribute (NOT `display: none` via CSS only — the
  attribute is the canonical way to remove an element from both
  visual and assistive-tech rendering).

### 6.4 Focus restoration

- M1b's drawer-open trigger is the vestigial button; the Drawer's
  `restoreFocusRef` consumes the button's DOM node. When the user
  presses Esc inside the drawer or clicks the close button, focus
  returns to the vestigial button.
- e2e step 9 of `inspection.spec.ts` (Phase 4 focus-trap walk) needs
  the trigger shift: the e2e currently clicks a row to open the
  drawer; M1b reroutes step 9 through the vestigial button. The
  focus-restoration assertion target shifts from the row to the
  button. Other sub-steps (b/c/d/e) preserved.

### 6.5 ARIA-live

- `<article class="session-pane" aria-live="polite">` from M1a is
  preserved; the M1b vestigial button addition does NOT change the
  pane's announcement scope.
- `<ActionBar>`'s "last rescan from this browser X ago" caption: the
  existing Phase 4 implementation uses `title=` for the absolute ISO
  timestamp; whether this caption needs `aria-live` to announce
  rescan completions is a Phase 4 question, NOT an M1b regression.
  M1b preserves the existing behavior verbatim.

## 7. Decisions & tradeoffs

### 7.1 `(refresh)` marker color: `--color-warn` vs `--color-text-muted`

Phase 4 used `--color-text-muted`. M1b warms it to `--color-warn`
because (a) the marker is a state hint, not incidental copy; and (b)
the muted-on-muted treatment in the compact row's line 2 (rowKey
already in `--color-text-muted`) made the marker hard to scan. The
warning hue matches the "(refresh)" semantic ("source and stored
disagreed during load — refresh to re-fetch") more closely. **If the
reviewer prefers Phase 4's restraint**, swap `var(--color-warn)` →
`var(--color-text-muted)` — it is a one-token change.

### 7.2 Sticky footer's scrolling ancestor

The current layout (no `overflow: auto` on `.list-pane`) means the
footer stickies to the **page viewport**. This is the intended UX —
the bar is always visible regardless of where the user is in the
list. If a future chunk gives `.list-pane` its own scroll context
(e.g., for very long lists where the page-level scroll is
impractical), the footer would stick to the list-pane viewport
instead. The recipe `position: sticky; bottom: 0; z-index: 1` works
in both modes; the switch is purely an `.list-pane { overflow: auto }`
change. **M1b documents the page-viewport behavior; the reviewer can
revisit if they want list-pane-local scroll instead.**

### 7.3 `display: flex !important` to defeat `<details>` default at ≥ 1100 px

Forcing the body open at ≥ 1100 px requires either (a) JS to set the
`open` attribute and never clear it, or (b) CSS to override the
browser's `<details>` collapsed default. CSS is preferred because it
is reactive to viewport changes without JS round-trips and survives
client-side hydration. The `!important` is regrettable but contained
to one line; the alternative (a more specific selector) is harder to
reason about than the `!important` annotation.

### 7.4 Native `::marker` chevron vs custom SVG

Spec direction is "no icon library"; the natural chevron is the
browser's `::marker`. The native triangle is mode-aware (rotates on
toggle), respects user font-scaling, and has no asset cost. The only
downside is browser-by-browser triangle styling (Chrome, Firefox,
Safari each render a slightly different glyph) — acceptable for
M1b given the aesthetic restraint. If a future chunk wants
visual-cohesion across browsers, the upgrade is a CSS
`summary::-webkit-details-marker { display: none }` + a custom
inline SVG/CSS triangle — but that is M2+ material.

### 7.5 Tool badge: hairline-bordered chip vs `.badge` recipe

The `.badge.{variant}` recipe is reserved for status (the row's
dedicated column). The Title cell's tool badge is a quieter
contextual signal — it identifies the tool, not a status — and using
the filled `.badge` recipe would visually compete with the actual
status pill in the next column. A hairline-bordered chip on
transparent ground (the `.title-cell-tool` recipe) reads as "label
about the row" while the status pill reads as "state of the row".
Same data shape (a tagged label); different semantic role; different
visual weight. **Reuse-before-invent** considered: there is no
existing recipe for "neutral hairline-bordered tag"; the closest is
`.chip` but that's a tappable target. Quiet hairline-only is the
correct new recipe.

### 7.6 Vestigial button positioning: below vs above the placeholder line

Designer chose **below**: the placeholder line ("Session view coming
in Milestone 2.") is the contextual lede; the action verb sits after
the explanation, mirroring the editorial cadence of the M1a empty-
pane two-paragraph preface. Putting the button above would read as a
primary CTA; putting it below reads as a "by the way, here is the
temporary affordance" — which is exactly what "vestigial" wants.

### 7.7 Active-filter chip: hairline border on transparent vs filled pill

Spec direction guides "small muted pill, var(--text-xs),
var(--color-text-muted), no background fill (just a hairline border)".
The hairline-only treatment is editorial-quiet and visually distinct
from the filled `.chip.active` recipe used inside the filter body —
which prevents visual confusion (the summary chip is a passive
indicator; the body chips are tappable affordances).

### 7.8 `sourcePathIsStale` exits the row entirely

Per spec lines 520-531 the compact-row table does not include
staleness. M1b confirms staleness signal exits the row entirely;
reachable via the still-mounted drawer's `<SessionDetail>` body until
M2's Metadata tab takes over the surface. **Reviewer can revisit** if
they think the row should retain a small "stale source path" hint —
designer thinks the spec's "row.title cell stack with bold title +
muted tool badge + muted rowKey + (refresh) marker" envelope is
already at its information-density ceiling for the 300-380 px list
pane, and adding a fourth signal would tip it over.

### 7.9 Row click no longer auto-opens the drawer (M1b semantic shift)

The Phase 4 `onOpenDetail(rowKey, triggerEl)` call is removed from
the row click path. Row click ONLY invokes `onSelectRow(rowKey)` —
which drives URL-synced selection. The vestigial button is the new
drawer entry point. This is the load-bearing M1b interaction shift;
spec lines 977-979 make it explicit (vestigial button is the M1b
discovery path until M2 retires it).

The Phase 4 click-time intersection regression tests (App.test.tsx
M3 filter / M5 cross-page bulk-select / M5 pagination-cross-page)
must still pass byte-equivalent — those tests do NOT depend on the
drawer mounting from row click; they exercise the
selection-against-current-filter-window math. Verified: the tests
pass an explicit `onOpenDetail` no-op stub.

## 8. References

Spec sections cited (line ranges in `working/phase-5.md` @ `05467ad`):

| Topic                                                | Section                                                     | Lines       |
|------------------------------------------------------|-------------------------------------------------------------|-------------|
| Archive-room aesthetic (carry-over from M1a)         | §Design Language                                            | 15–78       |
| Motion budget                                        | §Motion & Micro-interactions                                | 80–128      |
| `<details>` `block-size` exemption (M5, not M1b)     | §Performance budget / spec line                             | 1100        |
| Reduced-motion zero-out (preserved from M1a)         | §Reduced-motion                                             | 97–110      |
| In scope                                             | §Goal & Scope → in scope                                    | 132–149     |
| Compact list rows (4 essentials)                     | §Inspection Surface Layout → §Compact list rows             | 520–531     |
| Row visual treatment                                 | §Row visual treatment                                       | 533–545     |
| Filter bar placement (`<details>` < 1100 px)          | §Filter bar placement                                       | 547–549     |
| Action bar placement (sticky footer)                 | §Action bar placement                                       | 551–553     |
| Pagination placement (above ActionBar)               | §Pagination placement                                       | 555–557     |
| Structural literals (M1)                             | §Design Tokens → §Structural literals                       | 926–946     |
| Filter strip wrap breakpoint                         | §Structural literals — `@media (max-width: 1100px)`        | 930         |
| Milestone 1 DoD                                      | §Milestones → ### Milestone 1                               | 971–989     |
| M1b DoD bullets                                      | §Milestones → vestigial button + footer relocation + filter wrap | 977, 978, 979 |
| Acceptance Criteria                                  | §Acceptance Criteria                                        | 1085, 1093, 1094, 1096, 1100 |
| Risks (click-time intersection regression)           | §Risks                                                      | 1124–1136   |
| Resolved Decision #6 (Drawer + SessionDetail = M6)   | §Resolved Decisions                                         | (M6, not M1b) |
| Resolved Decision #20 (selection ownership in App.tsx) | §Resolved Decisions                                       | (carried from M1a) |

Architecture references:
- `ARCHITECTURE.md` — split-pane is consistent with the existing
  document-of-document-views model.
- `docs/dependency-rules.md` — Phase 5 dep policy preserved; M1b adds
  no new runtime dependencies.
- `docs/features/inspection-surface.md` — Phase 4 form; will be
  rewritten in M6 (the 8-doc sweep). M1b does NOT update.
- M1a artifact: `working/phase-5/designs/m1a-shell/design.md` —
  M1b's row-state recipe + reduced-motion zero-out + landmark roles
  inherit verbatim.

## 9. Implementation acceptance checklist

A numbered list the developer can verify against. The reviewer can
also use this as a test plan.

1. `SessionsTable` renders 5 columns: Select + Title + Status + Project + Updated.
2. Tool / Stored Copy / Source Path columns absent from `<thead>` and `<tbody>`.
3. Title cell stacks: bold title (line 1), tool badge inline on line 1, muted mono rowKey + optional `(refresh)` marker on line 2, with `var(--space-1)` (4 px) gap between line 1 and line 2.
4. `(refresh)` marker renders inside Title cell when `row.statusConflict === true`.
5. M1a row tints PRESERVED VERBATIM (default / hover / selected / selected+hover / deep-link pulse). The `tr[aria-current="true"]` recipe still consumes `color-mix(in srgb, var(--color-accent) 8%, transparent)` + `box-shadow: inset 2px 0 0 var(--color-accent)`.
6. Row click invokes `onSelectRow(row.rowKey)` only — drawer does NOT auto-mount on row click. The Phase 4 `onOpenDetail` call is removed from the row click path.
7. Row anatomy: `min-height: 36px` on `<tr>`; vertical padding `var(--space-2)` (8 px); horizontal padding `var(--space-3)` (12 px); cell gutter `var(--space-2)` (8 px).
8. Project cell truncates with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`; full `row.projectPath` on `title=` hover.
9. Updated cell renders relative time; absolute ISO on `title=` hover; mono font preserved.
10. `<ActionBar>` renders inside `.list-pane-footer` (one instance — the standalone `<ActionBar>` inside `<section className="panel">` in `App.tsx` is removed).
11. `<Pagination>` renders inside `.list-pane-footer` between the table and the action bar (Pagination ABOVE ActionBar).
12. `.list-pane-footer` has `position: sticky; bottom: 0; z-index: 1; background: var(--color-bg); border-top: 1px solid var(--color-border)`.
13. `.list-pane-footer` carries NO drop shadow.
14. `<SessionFilters>` renders inline above 1100 px (no `<details>` wrap visible — summary is `display: none`; body is forced open).
15. `<SessionFilters>` wraps in `<details>` below 1100 px with `<summary>Filters <span class="filter-count-chip">{N active}</span></summary>`.
16. Default open state matches `min-width: 1100px` matchMedia query; the listener mirrors `App.tsx` narrow-mode listener pattern at lines 800-826 (with `addEventListener` on the modern path + legacy `addListener` fallback per M1a precedent).
17. Active-filter-count chip suppressed when count = 0 (via `hidden` attribute); renders `${count} active` otherwise; counts the 7 axes (tool / storage / status / project / search / importableOnly / sort).
18. `.filter-count-chip` styling: `var(--text-xs)`, `var(--color-text-muted)`, transparent background, `1px solid var(--color-border)`, `border-radius: 999px`.
19. `<details>` summary `<summary>` styling: `cursor: pointer`, `:focus-visible` outline `2px solid var(--color-accent)` with `2px` offset, hairline `border-bottom` when `[open]`, `list-style: revert` to keep native `::marker` chevron.
20. NO custom CSS transition on `<details>` open/close (browser-native, instant — the `block-size`-via-`interpolate-size` exemption per spec line 1100 is deferred to M5).
21. Vestigial 'Open detail' button renders ONLY in `state === "ready-placeholder"` (NOT in `empty` / `loading` / `session_not_found`).
22. Copy: `Open detail` (verbatim per spec line 977).
23. Visual treatment parallel to `.back-to-list`: transparent bg, no border, muted color (`var(--color-text-muted)` resting), underline on hover/focus, `2px solid var(--color-accent)` focus ring with `2px` offset.
24. Click invokes the new `onOpenDetail` callback exactly once — opens the still-mounted Phase 4 `<Drawer>` with `<SessionDetail>` body.
25. Focus restoration target: vestigial button (NOT the row). The Drawer's `restoreFocusRef` consumes a ref captured on the button.
26. Hex isolation invariant: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l` returns 24 (Phase 4 baseline preserved); M1b adds zero hex literals.
27. Token count in `tokens.css`: 44 (no new tokens introduced in M1b).
28. No new runtime dependencies (`apps/frontend/package.json` runtime block unchanged).
29. Phase 4 click-time intersection regression tests (App.test.tsx lines 1224 / 1837 / 2028 / 2101 / 2152) pass byte-equivalent.
30. e2e step 9 sub-tests (b/c/d/e) preserved with trigger shift to the vestigial button (focus restoration target shifts from row to button).
31. Tool badge in Title cell uses hairline-only recipe (`border: 1px solid var(--color-border); background: transparent`) — NOT the filled `.badge.{variant}` status-pill recipe.
32. Checkbox cell propagation guard preserved (clicking the checkbox stops propagation and toggles selection only; never triggers `onSelectRow`).
33. `sourcePathIsStale` signal does NOT survive M1b's compact row; it remains reachable via the still-mounted Phase 4 `<Drawer>` until M2's Metadata tab takes over.

## 10. Open questions for the reviewer

1. **`(refresh)` marker color**: M1b warms it from Phase 4's `--color-text-muted` to `--color-warn` so it scans as a state hint, not incidental copy. Reviewer may prefer Phase 4's restraint — one-token swap.
2. **`(refresh)` marker still on row vs moved to drawer/Metadata tab**: spec lists `(refresh)` inside the Title cell (line 526); designer kept it. The reviewer might argue the compact row is dense enough that statusConflict should also exit to the drawer/Metadata tab — but that would diverge from spec. Designer recommends keeping it; reviewer can probe.
3. **Footer's scrolling ancestor**: page viewport (current — no `overflow: auto` on `.list-pane`) vs list-pane viewport (would require an additional `.list-pane { overflow-y: auto }` rule). Designer recommends page viewport for M1b; reviewer may want the list-pane-local scroll if user testing finds the page-level scroll impractical with very long lists. Either way, the sticky recipe is the same.
4. **`!important` on `.filters-wrap > .session-filters { display: flex !important; }` at ≥ 1100 px**: regrettable but contained. Alternative is a more specific JS-driven path. Reviewer can request the JS path if they'd rather avoid the `!important`.
5. **Tool badge fallback for `tool` values that exceed the visual envelope** (e.g., a hypothetical `"long_tool_name_v2"`): designer left the `.title-cell-tool` chip with `flex-shrink: 0` so it does not compress; the title above can ellipsize. Reviewer may want the chip to shrink first instead — opposite priority. Designer's choice keeps the tool identity legible; the title can still ellipsize.

If the reviewer has no concerns on any of these, M1b closes with the
artifact as-is.
