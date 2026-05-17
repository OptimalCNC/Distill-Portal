# Phase 9b M1 — Job Center UX design

Artifact directory: `working/phase-9b/designs/m1-job-center/`.

This file is the structured design record for the Phase 9b Job Center
surface. The sibling `prototype.html` exercises every state described
below; the sibling `wireframes/` directory captures ASCII layouts for
each enumerated state; the sibling `wcag.py` script computes contrast
ratios for every new visible foreground/background pair.

## 1. Chunk scope summary

The Job Center is a right-anchored, modal-dialog tray that lists every
non-terminal operation in an Active section and the most recent 50
terminal operations in a Recent section. Each operation renders as a
hairline-bordered card with a monogram kind icon, kind label, status
pill, relative time, cancel button (active ops) or result summary
(terminal ops), and a native `<details>` expand revealing the raw
`result_json` / `error_json` as pretty-printed JSON in a `<pre>` block.
The Phase 9a `.action-bar-operation-badge` becomes a labelled button
("Job Center") with an inline numeric count chip; the Phase 9a
`.action-bar-operation-pill` (last-completed) is removed.

## 2. Design intent

The surface serves the Phase 5 Archive-room aesthetic: a quiet reading
room where the user inspects a ledger of past and in-flight work, not
a control panel. The tray is opaque, square-cornered, hairline-bordered,
and avoids decorative shadows — the same chrome discipline used by
`SessionView` and the metadata drawer (Phase 5 §"Hairline over shadow",
§"Sharp over soft", §"One accent, used surgically").

The Job Center button + tray REPLACES the Phase 9a M3 ActionBar status
surface as documented in
`working/phase-9a/designs/m3-http-frontend-cutover/design.md` §"ActionBar
Anatomy" and §"States": the `.action-bar-operation-badge` becomes the
trigger button; the `.action-bar-operation-pill` is retired and its
information lives in the tray's Recent section. The manual
`Refresh status` button (9a) is also removed because Phase 9b M3 will
replace polling with SSE — there is no fixed cadence to nudge.

The visual language extends one degree of vocabulary: the tray
introduces FIVE new pill variants beyond the three the Phase 9a M3
ActionBar already uses (`success`, `error`, `neutral`). Each new pill
follows the same `color-mix()` recipe (10–12% fill / 35–55% border /
75% text) against the existing canonical tokens (`--color-accent`,
`--color-warn`, `--color-success`, `--color-error`, `--color-ink-muted`).
No new color tokens are introduced; the 24-hex / 83-token invariant
holds.

## 3. Component anatomy

Notation: `T:` = typography token, `C:` = color token(s), `S:` = spacing,
`B:` = border/hairline treatment. All values are CSS variable
references from `apps/frontend/src/styles/tokens.css`.

### 3.1 ActionBar trigger button

- Shell: hairline-bordered button replicating other action-bar
  primaries.
  - T: `--font-chrome` at `--text-base` line-height inherits the
    action-bar default.
  - C: background `--color-surface`, label `--color-text`, border
    `--color-border-strong` (matches the existing
    `.action-bar button` rule).
  - S: padding `var(--space-1) var(--space-3)`; `min-height: 1.75rem`.
  - B: `1px solid var(--color-border-strong)`, `--radius-sm`.
- Inline count chip (`.jc-trigger-count`):
  - T: `--font-mono`, `--text-xs`, tabular-nums.
  - C: background `color-mix(in srgb, var(--color-accent) 10%,
    var(--color-surface))`; text
    `color-mix(in srgb, var(--color-accent) 75%, var(--color-text))`;
    border `color-mix(in srgb, var(--color-accent) 35%,
    var(--color-surface))` (byte-equivalent to the 9a accent badge).
  - S: `min-width: 1.5rem`, `height: 1.25rem`, padding `0 var(--space-1)`.
  - B: `1px solid` (mixed accent border), `--radius-sm`.
  - Hidden when count = 0 (`display: none`).
  - Count > 9 renders as the literal string `9+`; `aria-label`
    on the chip carries the exact integer.

### 3.2 Tray frame (native `<dialog>`)

- Container: native `<dialog class="jc-dialog">`. Width 360 px (final
  value pinned at M1 — see §7.4). Height `100dvh` so it spans from
  beneath the app header to the bottom of the viewport. Right-anchored
  via `inset: 0 0 0 auto`.
  - C: background `--color-surface`, ink `--color-text`,
    inline-start hairline `1px solid var(--color-border)`.
  - B: square outer corners (no border-radius) so the tray meets the
    viewport edge cleanly.
- Backdrop: `dialog::backdrop { background: var(--color-backdrop); }`
  (already an `rgba(0, 0, 0, 0.45)` literal in `tokens.css`; alpha
  intent identical light + dark — Phase 5 baseline).
- Open/close motion: `transform: translateX(100%)` collapsed,
  `translateX(0)` open; transition `transform 200ms var(--ease-standard)`
  (the 200 ms `--motion-disclosure` slot from the Phase 5 motion
  budget). Suppressed under `prefers-reduced-motion: reduce`.

### 3.3 Tray header (`.jc-header`)

- Layout: flex row, space-between, vertically centered.
  - S: padding `var(--space-3) var(--space-4)`.
  - B: `border-block-end: 1px solid var(--color-border)`.
- Title `<h2>` "Job Center":
  - T: `--font-chrome`, `--text-base`, weight 600, letter-spacing
    0.02em.
  - C: `--color-text`.
- Close button:
  - T: `--font-mono`, `--text-sm`, lowercase label "Close".
  - C: text `--color-text-muted`; hover `--color-text`.
  - S: padding `var(--space-1) var(--space-2)`.
  - B: borderless, square; focus ring `2px solid --color-accent` at
    outline-offset 2.

### 3.4 Section header (`.jc-section-label`)

- Anatomy: small-caps chrome label with a mono tabular-numeral
  count suffix.
  - T: label `--font-chrome`, `--text-xs`, weight 600, letter-spacing
    0.08em, uppercase. Count `--font-mono`, `--text-xs`, tabular-nums.
  - C: both `--color-text-muted`.
  - S: margin `0 0 var(--space-2)`.
- Section divider: when both Active and Recent render, the second
  `.jc-section` carries `margin-top: var(--space-6); padding-top:
  var(--space-4); border-block-start: 1px solid var(--color-border)`.

### 3.5 Per-op card (`details.jc-card`)

Native `<details>`. The summary row is a CSS Grid layout (matching
the Phase 5 M5/M6 disclosure precedent):

```
| icon |   kind label                          | status pill |
|      |   relative time                       |             |
|      |   --- dashed mid-rule -----------------               |
| ---  bottom row (full width)  ---                            |
| ---  Cancel button OR summary text                           |
```

- Shell:
  - C: background `--color-surface`, border `--color-border`. When
    `[open]`, border becomes `--color-border-strong` to signal active
    focus.
  - S: padding `var(--space-3)`; cards stack with
    `margin-block-end: var(--space-2)`.
  - B: `1px solid`, `--radius-sm`.
- Kind icon (`.jc-icon`):
  - 1.75 rem square, hairline-bordered, surface-raised fill.
  - T: `--font-mono`, `--text-sm`, weight 600.
  - C: glyph `--color-text`, background `--color-surface-raised`,
    border `--color-border`.
  - Glyph: monospaced letter — `I` for `import_sessions`, `R` for
    `rescan_sources`. Future kinds (e.g. `summarize_session` → `S`)
    follow the same one-letter rule. **No emoji** anywhere.
- Kind label (`.jc-kind`):
  - T: `--font-chrome`, `--text-sm`, weight 600.
  - C: `--color-text`.
  - Copy: human-readable kind name ("Import sessions", "Rescan
    sources").
- Relative time (`.jc-time`):
  - T: `--font-mono`, `--text-xs`, tabular-nums.
  - C: `--color-text-muted`.
  - `title=` attribute carries the absolute ISO timestamp; the
    expanded view also surfaces submitted + finished as `<dl>`
    metadata.
- Status pill: see §3.6.
- Bottom row (`.jc-bottom`):
  - Layout: flex row, summary text left (`flex: 1 1 auto`, ellipsis),
    cancel button right.
  - B: `border-block-start: 1px dashed var(--color-border)` (the
    dashed mid-rule is a Phase 5 signature consistent with
    SessionView's expanded-block subdivisions).
- Cancel button (`.jc-cancel`, active ops only):
  - T: `--font-chrome`, `--text-xs`.
  - C: text `color-mix(in srgb, var(--color-error) 75%,
    var(--color-text))`; border `color-mix(in srgb,
    var(--color-error) 35%, var(--color-border))`; background
    `--color-surface`. Hover deepens the fill to
    `color-mix(in srgb, var(--color-error) 8%, var(--color-surface))`.
  - S: padding `var(--space-1) var(--space-3)`.
  - B: `1px solid`, `--radius-sm`.
  - Disabled state (post-click, while `cancel_requested`): label
    becomes "Cancelling…", `[disabled]` lowers opacity to 0.55.
- Result summary (`.jc-summary-text`, terminal ops):
  - T: `--font-chrome`, `--text-sm`.
  - C: `cancelled` / `interrupted` → `--color-text-muted`;
    `succeeded` → `color-mix(in srgb, var(--color-success) 75%,
    var(--color-text))`; `failed` → `color-mix(in srgb,
    var(--color-error) 75%, var(--color-text))`.
  - Truncation: single line, `text-overflow: ellipsis`, max ~80 chars.
    The full text always lives in the expanded `<pre>`; `title=`
    surfaces it on hover.

### 3.6 Status pill (`.jc-pill`)

Composed entirely with `color-mix()` against existing tokens. Each
pill is a `<span>` with a 0.5 rem-square `.jc-pill-dot` ornament.

- T: `--font-chrome`, `--text-xs`, weight 600, uppercase,
  letter-spacing 0.04em.
- S: padding `0 var(--space-2)`, `min-height: 1.25rem`,
  `gap: var(--space-1)` between dot and label.
- B: `1px`, `--radius-sm`. Border style varies by status — see
  §3.6.1.

Seven variants:

| Status              | Fill                                                                                    | Text                                                                                  | Border                                                                                              | Border style | Dot shape         |
|---------------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|--------------|-------------------|
| `queued`            | `--color-surface`                                                                       | `--color-text-muted`                                                                   | `--color-border-strong`                                                                              | **dotted**   | hollow ring       |
| `running`           | `color-mix(in srgb, --color-accent 10%, --color-surface)`                               | `color-mix(in srgb, --color-accent 75%, --color-text)`                                | `color-mix(in srgb, --color-accent 35%, --color-surface)`                                            | solid        | filled, **pulses**|
| `cancel_requested`  | `color-mix(in srgb, --color-warn 12%, --color-surface)`                                 | `color-mix(in srgb, --color-warn 75%, --color-text)`                                  | `color-mix(in srgb, --color-warn 55%, --color-surface)`                                              | **dashed**   | filled            |
| `succeeded`         | `color-mix(in srgb, --color-success 12%, --color-surface)`                              | `color-mix(in srgb, --color-success 75%, --color-text)`                               | `color-mix(in srgb, --color-success 35%, --color-surface)`                                           | solid        | filled            |
| `failed`            | `color-mix(in srgb, --color-error 12%, --color-surface)`                                | `color-mix(in srgb, --color-error 75%, --color-text)`                                 | `color-mix(in srgb, --color-error 35%, --color-surface)`                                             | solid        | filled            |
| `cancelled`         | `--color-surface-raised`                                                                | `--color-text-muted`                                                                   | `--color-border-strong`                                                                              | solid        | filled **square** |
| `interrupted`       | `--color-surface`                                                                       | `--color-text-muted`                                                                   | `--color-border-strong`                                                                              | **dashed**   | hollow **square** |

#### 3.6.1 Non-color disambiguation

Every pair of statuses differs in at least TWO of {border-style, fill
tint, text tint, dot shape, dot fill, animation}. This makes the
status legible under monochromatic vision, monochrome printing,
brightness-only displays, and reduced color filters. See
`wireframes/06-status-pills.txt` for the full disambiguation matrix.

### 3.7 Expanded panel (`.jc-expand`)

Visible when the user expands a card. Always visible for terminal ops
(the result_json / error_json is the payoff for opening the card);
active ops can also expand but their panel only carries the submitted
timestamp.

- C: background `--color-surface-raised`, top hairline
  `1px solid --color-border`.
- S: padding `var(--space-3)`.
- Metadata `<dl>`:
  - T: `--font-mono`, `--text-xs`, tabular-nums.
  - C: `--color-text-muted` for both `<dt>` and `<dd>`.
  - Items: `Submitted` / `Started` (when present) / `Finished`.
- Pretty JSON `<pre>`:
  - T: `--font-mono`, `--text-xs`, line-height 1.5.
  - C: text `--color-text`, background `--color-surface`,
    hairline border `--color-border`.
  - S: padding `var(--space-2) var(--space-3)`.
  - Overflow: horizontal scroll; never wraps (matches the existing
    raw-NDJSON `<pre>` discipline in `SessionView`).
- **Phase 8 upgrade path**: when Phase 8 (Raw View Polish) ships its
  bespoke JSON inspector, the `<pre>` here is replaced 1:1 by the
  inspector component. The card shell + data source
  (`operation.result_json` / `operation.error_json`) are unchanged.

### 3.8 Backdrop, empty state

- Backdrop: `dialog::backdrop` uses `--color-backdrop` (canonical
  Phase 4 token, already at appropriate alpha for both modes).
  Click-to-close handled by the dialog `click` listener (`event.target
  === dialog` → close).
- Empty state (`.jc-empty`):
  - T: `--font-chrome`, `--text-sm`, italic.
  - C: `--color-text-muted`.
  - S: padding `var(--space-6) 0`, centered.
  - Copy: "No operations." when both sections are empty. When only
    one section is empty, the section renders its label + "No active
    operations." / "No recent operations." inside that section.

## 4. States & variants

Every state in this list is rendered in the prototype + wireframed in
the sibling `wireframes/` directory.

### 4.1 ActionBar trigger button

| State        | Visible chip | aria-label     | Notes                                         |
|--------------|--------------|----------------|-----------------------------------------------|
| count = 0    | hidden       | (none)         | Button label "Job Center" stays visible.      |
| count = 1    | "1"          | "1 running"    | mono tabular-nums chip                        |
| count = 2    | "2"          | "2 running"    |                                                |
| count > 9    | "9+"         | "{actual} running" | exact count carried on aria-label only.   |

### 4.2 Per-op card per status (7 statuses × {collapsed, expanded})

- `queued` — Active. Summary text: "Waiting for the {kind} worker."
  Cancel button enabled. Pill: dotted neutral border, hollow ring dot.
- `running` — Active. Summary text: kind-specific live caption
  ("Scanning collector roots." / "Importing selected sessions.").
  Cancel button enabled. Pill: accent fill, pulsing dot
  (`var(--motion-pulse)`).
- `cancel_requested` — Active. Summary text: "Cancelling… stopping at
  next checkpoint." Cancel button disabled, label "Cancelling…". Pill:
  warn fill, dashed border.
- `succeeded` — Recent. Summary text: kind-specific success summary
  ("3 sessions imported." / "12 sources discovered."). Success-tinted.
  Expanded panel renders `result_json` `<pre>`.
- `failed` — Recent. Summary text: `error_json.detail` truncated to
  80 chars; full text in `title=` + expanded `<pre>`. Error-tinted.
- `cancelled` — Recent. Summary text: "Cancelled by user." Pill:
  muted, square dot.
- `interrupted` — Recent. Summary text: "Backend restarted." Pill:
  muted, hollow square dot, dashed border.

### 4.3 Tray composite states

- `open` — dialog `showModal()`; backdrop visible; tray translated
  to `translateX(0)`; focus on close button.
- `closed` — `dialog.close()`; backdrop removed; tray off-screen;
  focus returns to the trigger button (browser default).
- `empty` — both sections empty; single "No operations." line.
- `one-active` — Active section with one card; Recent section
  renders a "No recent operations." line.
- `many-active` — Active section with N ≥ 2 cards; Recent section
  empty or populated.
- `many-recent` — Recent section with up to 50 cards (capped by
  spec); virtualization NOT required at 50 entries (~60 px per card →
  3000 px scrollable content fits comfortably in the tray's overflow
  container).
- `mixed` — both sections populated. See
  `wireframes/02-tray-open-mixed.txt`.

### 4.4 Multi-tab behaviour

Each browser tab opens its own SSE connection (Phase 9b §SSE Channel
Design). The visual consequence is that each tab independently
animates pill transitions and card insertions. No cross-tab
coordination is attempted. See §7.7.

## 5. Motion & interaction

| Surface                                  | Property              | Duration                          | Easing                | Trigger                         |
|------------------------------------------|------------------------|------------------------------------|------------------------|----------------------------------|
| Tray open/close                          | `transform: translateX` | `--motion-disclosure` (200 ms)    | `--ease-standard`     | dialog open/close                |
| Pill status transition                   | `background-color`, `border-color`, `color` | `--motion-base` (120 ms) | `--ease-out`          | status enum change              |
| Pulsing dot (`.jc-pill[data-pulse=true]`)| `opacity`, `transform: scale` | `--motion-pulse` (600 ms)         | `ease-in-out` infinite | `.running` pill rendered         |
| Card hover / focus                       | `border-color`        | `--motion-fast` (80 ms)            | `linear`              | pointer hover, focus-visible    |
| `<details>` expand/collapse             | (native)              | (native)                           | (native)               | user toggle                     |

### 5.1 Reduced motion

The Phase 5 `global.css` zero-out rule (`@media
(prefers-reduced-motion: reduce)` → `transition-duration: 0.01ms !important`,
`animation-duration: 0.01ms !important`) governs the page. The prototype
includes an inline copy of the rule so it can be verified in isolation.

Under reduced motion:
- Tray transition collapses to instant.
- Pulsing dot stops at first frame (no perpetual animation).
- Status pill transitions collapse to instant.

### 5.2 Keyboard interaction

- Trigger button: Enter / Space → open dialog (native button
  semantics).
- Inside the open dialog:
  - Tab cycles through focusable elements; native `<dialog>` traps
    focus inside the dialog (browser-implemented `inert` on the
    background).
  - Escape closes (native `<dialog>` behavior).
  - Enter / Space on a `<summary>` toggles the `<details>` (native).
  - Enter / Space on the cancel button triggers cancel.
- Close button activation returns focus to the trigger that opened
  the dialog (native restoration when the trigger has `aria-haspopup`).

### 5.3 Focus management

- On open: focus moves to the close button (explicit
  `requestAnimationFrame(() => closeBtn.focus())`) so Tab cycles
  inward and Escape is always one keypress away.
- On close: focus returns to the trigger (native `<dialog>`
  restoration). Verified in the prototype.

## 6. Accessibility

### 6.1 Dialog-vs-aside decision

**Decision: native `<dialog>` with `showModal()`.**

Rationale (referenced in §7 and §10):
- Free, browser-managed focus trap. Manual focus trapping is a known
  source of accessibility bugs and Phase 5 explicitly avoided
  re-implementing one (it bypassed the `focus-trap-react` slot).
- Free `inert` on the background. Screen readers correctly skip the
  underlying app while the dialog is open.
- Free Escape close.
- Free top-layer rendering. The dialog sits above the existing
  `.action-bar.sticky` regardless of z-index — verified by Phase 5
  precedent.
- Free `aria-modal="true"` semantics implicit via the dialog role.
- Precedent: the Phase 5 M5 Metadata drawer already uses
  `<dialog>.showModal()` in the codebase; the Job Center reuses the
  same pattern.

Alternative considered: non-modal `<aside aria-labelledby=…>` with
manual focus management + `inert` on the document. Rejected because
(a) `inert` lacks broad browser support outside the dialog context;
(b) manual focus traps add JS surface area for a feature that the
platform supplies for free.

### 6.2 ARIA + landmarks

- Trigger button: `aria-haspopup="dialog"`, `aria-controls="jc-dialog"`,
  `aria-expanded` flipping with open/close. The count chip carries
  `aria-label="{N} running"` so screen readers announce the exact
  integer (even when the visible text is `9+`).
- Dialog: `<dialog aria-label="Job Center">`.
- Tray body: `<div role="region" aria-live="polite"
  aria-labelledby="jc-dialog-title">` so screen readers announce new
  operations (e.g. "Operation queued") as SSE events arrive.
- Section headers `<h3 class="jc-section-label">` form the heading
  outline inside the dialog.
- Each card: `<details>` carries native ARIA disclosure semantics.
  Status pills are inert `<span>` with text content (the announced
  pill label is the visible text — no `aria-label` needed because the
  text IS the label).

### 6.3 Contrast targets

- All body text on tray surface: WCAG AA 4.5:1 (verified by `wcag.py`).
- All hairlines (cards, sections, expand panel): SC 1.4.11 3.0:1.
- Status pill text: AA 4.5:1.
- Status pill border: SC 1.4.11 3.0:1.
- AAA is not required by Phase 5 baseline; the script reports it for
  reference.

## 7. Decisions & tradeoffs

These resolve every Open Consideration from `working/phase-9b.md`
§"Open Considerations".

### 7.1 Cancel confirmation pattern — ONE-CLICK

Picked: **one-click cancel**. No confirm modal, no second-click confirm.

Rationale:
- Cancel is **recoverable**. Per Phase 9a §Idempotency Model,
  cancelled and failed rows do NOT participate in idempotency lookups
  — the user can resubmit the same params and get a fresh row.
- A confirm modal adds friction for a low-stakes, reversible action.
- Second-click confirm muddies the click target ("did I have to
  click twice?") and trains users to double-click everything.
- The visible feedback already answers "did my click register?":
  the pill flips to `cancel_requested` within one paint frame, the
  summary line updates to "Cancelling…", and the button disables
  itself with a "Cancelling…" label. The interaction is observable.
- The cancel is also **bounded**: the worker checks its cancel guard
  at the next checkpoint and transitions to `cancelled`. There is no
  unbounded blast radius requiring a confirmation gate.
- Race with terminal: `DELETE /api/v1/operations/:id` returns 409 if
  the op transitioned to a terminal state between render and click.
  The client gracefully removes the Cancel button + shows the current
  terminal state (Phase 9b §Risks row 5). The user observes the
  outcome correctly.

### 7.2 Status pill visual variants — distinct, not collapsed

Picked: **`running` and `cancel_requested` are visually DISTINCT**.

- `running` uses the accent (sienna) at 10% fill + animated pulsing
  dot. Reads as forward motion.
- `cancel_requested` uses warn (amber) at 12% fill + dashed border +
  static dot. Reads as "in motion but tinted with caution".

Rationale: the user cancelling an operation needs to see, immediately
and unambiguously, that their cancel registered. A pulsing-running →
non-pulsing-warn-dashed transition is the loudest available signal
without introducing a new token. Collapsing the two visual treatments
("both are in motion") would weaken the feedback for the most
load-bearing user action in the tray.

Color usage stays within the 83-token budget: warn was already in
`tokens.css` since Phase 4 baseline; the only new application is the
`cancel_requested` pill recipe.

### 7.3 Expanded card formatting — `<pre>` with Phase 8 upgrade slot

Picked: **simple pretty-JSON `<pre>` block** in Phase 9b.

- The `<pre>` lives inside `.jc-expand` and consumes
  `operation.result_json` / `operation.error_json` as input.
- The `<pre>` is hairline-bordered against `--color-surface-raised`,
  matching the existing raw-NDJSON `<pre>` discipline in
  `SessionView`.
- **Phase 8 upgrade**: when the bespoke JSON inspector lands in
  Phase 8, the `<pre>` is swapped 1:1 for the inspector component.
  The data source, the surrounding `<details>` shell, and the
  Submitted/Finished metadata are unchanged. This is documented in
  the Phase 9b plan §"Open Considerations" and in
  `docs/playbooks/modify-frontend-page.md` (sweep target for M3).

### 7.4 Recent-history cutoff — 50 + no "see all"

Picked: **50 most recent terminal ops, no "see all" affordance**.

- The 50-row cap is enforced server-side (snapshot phase of the SSE
  channel: "current non-terminal ops + most recent 50 terminal ops").
- The tray is the only Job Center surface in Phase 9b. A dedicated
  `/operations` route would require routing, pagination, filters —
  all explicitly deferred (Phase 9b §"Out of scope").
- A "see all" link without a destination would be a broken
  affordance; it is therefore omitted entirely.
- The list scrolls vertically inside `.jc-body`. 50 cards × ~60 px
  → ~3000 px scrollable content; well within native scroll
  performance.

### 7.5 Auto-open on long-failure — NO

Picked: **NO auto-open**. Tray opens only on user click.

Rationale:
- Auto-popping UI fights the Archive-room "hush over hustle"
  aesthetic (Phase 5 §"Hush over hustle"). Surfaces don't ambush the
  user.
- The trigger button's count chip is sufficient signal that work is
  happening; the user opens the tray when they want to act on it.
- Failures are also surfaced through the existing toast system (9a
  carry-forward) — auto-opening the tray would double-announce.
- If a future user research finding shows that critical failures need
  louder UI, a per-kind opt-in (e.g. summarization in Phase 10+ may
  want it) is a strictly additive change. Phase 9b stays conservative.

### 7.6 SSE event coalescing — NONE (emit all)

Picked: **emit all transitions; no coalescing**.

- A `queued → running → succeeded` sequence in <50 ms still emits
  three events.
- Rationale: coalescing would create a behavioral split between fast
  and slow ops the user cannot predict. Emit-all preserves
  the invariant "every visible state was once observable".
- The pulsing dot animation is short enough (600 ms cycle) that even
  a sub-50-ms `running` state is visually perceptible: the dot flashes
  once. Acceptable.
- The ring buffer (Phase 9b §SSE) at 200 entries is more than enough
  headroom for the no-coalesce flow.

### 7.7 Multi-tab handling — each tab is independent

Picked: **each browser tab opens its own SSE connection**. No
cross-tab coordination.

- The server broadcaster's `tokio::sync::broadcast::Sender` fans out
  naturally to N receivers (Phase 9b §SSE Server-side).
- Visual consequence: every open tab independently animates pill
  transitions and card insertions. The same operation appears in every
  tab's tray.
- A user with 3 tabs sees 3 simultaneous "running" → "succeeded"
  pill flips. This is correct and consistent; no debouncing required.
- Cross-tab coordination (e.g. BroadcastChannel deduping) is a
  measurable complexity cost for a feature the user does not request.
  Deferred indefinitely.

## 8. References

- `working/phase-9b.md`:
  - §"Why this phase exists" — the gap analysis the Job Center closes.
  - §"Job Center UX" — the layout spec the tray implements.
  - §"Documentation" — the 6-surface sweep M3 will land.
  - §"Open Considerations" — items 1–7 resolved in §7 above.
  - §"Risks" — row 1 (SSE buffer), row 3 (visual conflict), row 5
    (cancel race) all addressed by design.
  - §"Resolved Decisions" — items 8 (default-closed), 9 (badge → button,
    pill removed), 12 (native `<details>`), 13 (no new deps), 14
    (mandatory design gate).
- `working/phase-9a.md`:
  - §"Idempotency Model" — basis for §7.1's "cancel is recoverable".
  - `OperationStatus` enum — the 7 statuses the pill family covers.
- `working/phase-9a/designs/m3-http-frontend-cutover/design.md`:
  - §"ActionBar Anatomy" — the surface the trigger button replaces.
  - §"States" — the 9a `.action-bar-operation-pill` whose info now
    lives in the Recent section.
- `working/phase-5.md`:
  - §"Design Language" → Aesthetic principles — load-bearing.
  - §"Motion & Micro-interactions" — motion budget honored.
  - §"Color philosophy" — tokens consumed by `color-mix()`.
  - §"Signature details" #4 (hairline gutter), #5 (tab indicator
    motion budget transferable to tray slide).
- `apps/frontend/src/components/ActionBar.css` — the
  `.action-bar-operation-badge`/`.action-bar-operation-pill` recipe
  the pill family extends.
- `apps/frontend/src/styles/tokens.css` — the 83-token, 24-hex
  canonical surface the design composes against.

## 9. WCAG

39 foreground/background pairs are enumerated in the sibling
`wcag.py` script. The pairs cover:

- Tray frame: hairlines, header title, section label, empty state.
- Per-op card: kind icon glyph + square border, kind label, relative
  time, cancel button (text, border, hover fill).
- Result summary: success / error / muted tint variants.
- All 7 status pills: text on fill, border on tray surface, dot.
- Expanded panel: `<pre>` body, hairline, metadata `<dl>`.
- Trigger button: label, border, count chip (text, border).

**Expected outcome**: 0 failures in both light and dark modes. The
recipe (10–12% fill / 35–55% border / 75% text) is byte-equivalent to
Phase 9a M3's `.action-bar-operation-pill.success` and
`.action-bar-operation-pill.error` (already shipping at AA), and the
new accent / warn applications use the same recipe.

**Verification**: run `python3 wcag.py` from
`working/phase-9b/designs/m1-job-center/`. The full output goes into
`wireframes/wcag-output.txt`. The script EXIT 1 on any failure; the
M2 dispatch should block on `exit code == 0`.

See `wireframes/wcag-output.txt` for the stub + remediation notes
prepared in advance.

## 10. Implementation acceptance checklist

The developer (and the UI/UX reviewer) verify each item against the
production React component before M3 close.

### 10.1 Tokens & color discipline
1. No new color tokens are added to `apps/frontend/src/styles/tokens.css`.
   Hex count stays at 24; token count stays at 83.
2. Every pill variant uses `color-mix()` against existing canonical
   tokens (`--color-accent`, `--color-success`, `--color-warn`,
   `--color-error`, `--color-ink-muted`, `--color-border-strong`,
   `--color-surface`, `--color-surface-raised`).
3. The cancel button text/border uses the same `color-mix()` recipe
   shape as the pill family (75% / 35% mix; hover at 8% fill).

### 10.2 Trigger button
4. `<button class="jc-trigger">` carries `aria-haspopup="dialog"`,
   `aria-controls="jc-dialog"`, and `aria-expanded` reflecting the
   dialog state.
5. The count chip `<span class="jc-trigger-count">` is hidden when
   count = 0 via `data-count="0"` + CSS (no JS branch).
6. Counts > 9 render as the literal "9+"; an `aria-label` on the
   chip carries the exact integer.
7. The trigger uses `--color-border-strong` border + `--color-surface`
   background, byte-equivalent to other action-bar primaries.
8. Phase 9a's `.action-bar-operation-pill` is REMOVED from
   `ActionBar.tsx` and `ActionBar.css`. The element does not appear in
   any rendered ActionBar tree.

### 10.3 Tray surface
9. Tray is a native `<dialog>` opened via `dialog.showModal()`.
10. Tray width is exactly 360 px (`width: 360px`).
11. Tray height is `100dvh`; anchored to the right edge via
    `inset: 0 0 0 auto`.
12. Backdrop uses `--color-backdrop` (the existing token).
13. Tray slide-in transition is `transform 200ms var(--ease-standard)`.
14. Under `@media (prefers-reduced-motion: reduce)` the transition
    duration collapses (verified by the page-wide rule in
    `global.css`).
15. Backdrop click closes the dialog (`event.target === dialog`
    handler).
16. Escape closes the dialog (native behavior, verified by Playwright).

### 10.4 Tray header
17. Header has `border-block-end: 1px solid var(--color-border)`.
18. Title is `<h2>` with id `jc-dialog-title`; dialog `aria-labelledby`
    points at it.
19. Close button uses `--font-mono`, text label "Close", and is
    keyboard-activatable.
20. On open, focus moves to the close button via
    `requestAnimationFrame`.

### 10.5 Sections
21. Section labels render as uppercase chrome at `--text-xs`, weight 600,
    letter-spacing 0.08em, color `--color-text-muted`, with a mono
    tabular-numeral count suffix.
22. The Recent section is preceded by a hairline divider
    (`border-block-start: 1px solid var(--color-border)`) when the
    Active section is also visible.
23. Empty state renders the literal "No operations." (entire-tray) or
    "No active operations." / "No recent operations." (single section
    empty); italic, muted, centered with `var(--space-6)` vertical
    padding.

### 10.6 Per-op card
24. Each card is a native `<details>` with `class="jc-card"`.
25. The `<summary>` uses CSS Grid (icon / label-time / pill / bottom)
    matching the anatomy described in §3.5.
26. The native disclosure marker is hidden via `list-style: none` +
    `::-webkit-details-marker { display: none }`.
27. The kind icon `<span class="jc-icon">` carries a one-letter
    monospaced glyph in a hairline-bordered square; `aria-hidden="true"`
    (the kind label adjacent provides the accessible name).
28. The relative time renders mono tabular-nums; `title=` carries the
    absolute ISO timestamp.
29. The bottom row has `border-block-start: 1px dashed var(--color-border)`.
30. Active ops show a `<button class="jc-cancel">`; terminal ops show
    a `<span class="jc-summary-text">`.
31. The summary text truncates to a single line with ellipsis; the
    full text lives in the `title=` attribute and the expanded `<pre>`.

### 10.7 Status pill
32. The pill is a `<span class="jc-pill {status}">` containing a
    `<span class="jc-pill-dot" aria-hidden="true">` and a visible label
    that IS the status name (the label IS the accessible name; no
    `aria-label`).
33. Each of the 7 statuses uses the recipe table in §3.6 — verified
    against the prototype via grep:
      ```
      grep -E "jc-pill\.(queued|running|cancel_requested|succeeded|failed|cancelled|interrupted)" \
        apps/frontend/src/features/operations/OperationCard.css
      ```
34. The pulsing dot animation only runs when the pill carries
    `data-pulse="true"` (i.e. only on `.running`). The animation uses
    `--motion-pulse` (600 ms) + `ease-in-out infinite`.
35. Pill transitions between statuses use `--motion-base` (120 ms) +
    `--ease-out`, suppressed under reduced-motion.

### 10.8 Cancel interaction
36. Cancel button is `type="button"`.
37. Click maps to `DELETE /api/v1/operations/:id`. On success, the
    client treats the SSE event as the canonical state change;
    locally, the pill flips to `cancel_requested` and the button
    disables with "Cancelling…" label.
38. A 409 from the cancel call removes the cancel button and lets the
    SSE transition take over (Phase 9b §Risks row 5).
39. No confirm modal, no second-click confirm. Single click commits.

### 10.9 Expanded panel
40. The expanded panel is a `<div class="jc-expand">` appended inside
    `<details>` after `<summary>`.
41. It contains a `<dl class="jc-expand-meta">` with Submitted +
    Finished (when present) timestamps.
42. It contains a `<pre>` with pretty-formatted JSON (2-space indent)
    of `operation.result_json` for terminal succeeded ops, or
    `operation.error_json` for terminal failed ops.
43. The `<pre>` is hairline-bordered against `--color-surface-raised`.
44. For active ops, the expanded panel renders the Submitted timestamp
    only — no JSON until the row is terminal.
45. Phase 8 will replace the `<pre>` with the bespoke JSON inspector;
    the surrounding `<details>` + data flow remain unchanged.

### 10.10 Accessibility
46. `<dialog>.showModal()` is used (NOT `show()`) so the platform
    `aria-modal` semantics + focus trap engage.
47. Tray body carries `role="region"` + `aria-live="polite"` so new
    op events are announced.
48. All interactive elements have visible focus rings using
    `outline: 2px solid var(--color-accent); outline-offset: 2px`.
49. Color contrast: `python3 wcag.py` returns 0 failures (`exit 0`).
50. The trigger button is reachable by keyboard from any sensible Tab
    starting point (ActionBar is a top-level landmark).

### 10.11 SSE-feed wire-up (verified in M3 only)
51. The tray reads from `useOperationsFeed.ts`'s map; rendering is
    O(N) over the map size, sorted by `submitted_at DESC`.
52. The trigger button's count is `Object.values(map).filter(o =>
    NON_TERMINAL.has(o.status)).length`.
53. The Active section filters non-terminal ops; the Recent section
    filters terminal ops, slices to 50 most recent.
54. No persistence of tray open/closed state across reloads
    (Phase 9b §"Out of scope"). Default closed at mount.
