# M2b motion timing reference

This is a single-screen lookup for the developer landing M2b. It
re-tabulates the spec §Motion budget rows that M2b activates, names
each surface, and pins the implementation idiom. Reduced-motion
fallback behavior is documented per surface.

## M2b's three new motion surfaces

The chunk activates three motion surfaces from the spec's §Motion
budget at `working/phase-5.md:84-95`. Two of them are signature
details (#5 and #2 from §Design Language). **No other M2b surface
animates.** The frozen motion budget permits animation only on
`transform`, `opacity`, and `background-color` AND only on the
specific surfaces listed in the spec table; M2b activates exactly
the three rows below and nothing more.

| #   | Surface                                  | Property            | Duration             | Easing                    | Trigger                            | Idiom                          |
|-----|------------------------------------------|---------------------|----------------------|---------------------------|------------------------------------|--------------------------------|
| 1   | **Tab indicator slide** *(signature #5)* | `transform: translateX` + `scaleX` | `--motion-base` (120 ms) | `--ease-standard` | active-tab change                  | CSS `transition: transform`    |
| 2   | **Tab panel cross-fade-IN**              | `opacity: 0 → 1`    | `--motion-base` (120 ms) | `--ease-out`             | active-tab change (CSS `animation-name` toggle on `<div role="tabpanel">` from `none` → `tab-fade-in`) | CSS `@keyframes tab-fade-in` + animation-name re-trigger (NO React key remount) |
| 3   | **Page-turn fade** *(signature #2)*      | `opacity: 0 → 1` + `transform: translateX(4px → 0)` | `--motion-disclosure` (200 ms) | `--ease-out`        | `selectedRowKey` change (mount of `<SessionView key={...}>`) | CSS `@keyframes session-page-turn` + React key remount on the OUTER session-pane element |

## M2b's INSTANT (non-animated) surfaces

These M2b surfaces undergo state changes with NO animation /
transition. The change applies on the next paint without
interpolation:

| #   | Surface                                  | State change              | Trigger                  |
|-----|------------------------------------------|---------------------------|--------------------------|
| 4   | Tab text color (active ↔ inactive shift) | `--color-ink-muted` → `--color-ink` (bold) | active-tab change |
| 5   | Tab text color (hover, inactive only)    | shifts via `color-mix`    | pointer enter            |
| 6   | Copy path button hover                   | background tint           | pointer enter            |
| 7   | Retry button hover                       | background tint           | pointer enter            |
| 8   | "Open raw" anchor hover underline        | border-bottom color       | pointer enter            |
| 9   | Tab focus-visible outline                | outline appears           | focus arrives            |

Why instant rather than animated: `color`, `border-color`, and
hover `background-color` on these surfaces are **NOT** in the
spec's frozen motion budget at `working/phase-5.md:84-95`. The
budget is load-bearing per spec line 1100; adding animations on
unlisted surfaces requires a coordinator waiver, which M2b does not
seek. Instant state changes still feel responsive at 60 Hz; the
animated surfaces (#1, #2, #3) carry the chunk's animation budget.

## Idiom details

### Surface 1 — Tab indicator slide

Single absolutely-positioned `<span class="indicator">` inside the
tablist. Its `transform: translateX(...) scaleX(...)` is computed from
the active tab's `getBoundingClientRect()` and applied imperatively
on activation. The transition only animates `transform` (compositor-
cheap; no layout reflow):

```css
.tabs .indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 1px;                /* base extent — load-bearing, see below */
  height: 1px;
  background: var(--color-accent);
  transform-origin: left;
  transform: translateX(0) scaleX(0);
  transition: transform var(--motion-base) var(--ease-standard);
  pointer-events: none;
}
```

The `width: 1px` is load-bearing: an empty absolutely-positioned
`<span>` resolves to `width: auto` (= 0), and `scaleX(N) × 0 = 0`
would render an invisible indicator. With the 1 px base, the JS-
written `transform: translateX(${x}px) scaleX(${tabRect.width})`
grows the indicator to the active tab's measured pixel width.

On initial mount the indicator settles via `requestAnimationFrame`
so font-swap metrics shifts (Fraunces fallback per M2a §4) don't
strand the indicator off-target.

### Surface 2 — Tab panel cross-fade-IN

CSS animation-name re-trigger on the panel's own
`<div role="tabpanel">` element. The panel's React subtree is
**STABLE** across tab switches (Resolved Decision #12 / spec lines
650–658 require visited panels to stay React-mounted so RawTab's
`consumeRawPreview` consumer keeps streaming and so M3+
`useParsedSession` results are not recomputed on every flip). The
keyframe is defined once at module scope:

```css
@keyframes tab-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

The panel toggles its inline `animation` style based on `isActive`:

```jsx
<div role="tabpanel"
     hidden={!isActive}
     id={`panel-${tabId}`}
     aria-labelledby={`tab-${tabId}`}
     tabIndex={isActive && (tabId === "skim" || tabId === "transcript" || tabId === "raw") ? 0 : undefined}
     style={{ animation: isActive
                          ? "tab-fade-in 120ms var(--ease-out) both"
                          : "none" }}>
  {/* STABLE content — never remounted on tab change */}
</div>
```

The browser fires the keyframe each time the inline `animation`
property string changes from `"none"` to a real animation. Active →
active re-renders DON'T re-fire (the property string is unchanged).
`animation-fill-mode: both` ensures opacity stays at 1 after the
animation completes. Outgoing panel hides instantly via the `hidden`
attribute (display: none) — no fade-out.

**Do NOT use a React `key={activeTab}` on the panel content** —
that would unmount + remount the subtree on every tab change,
aborting in-flight work and breaking the keep-mounted contract.
Codex round 3 caught the previous artifact draft regressing to
`key={activeTab}`; the corrected mechanism above does NOT touch the
React tree on tab change.

### Surface 3 — Page-turn fade

CSS keyframes on `.session-pane`. React's `key={selectedRowKey}` on
the outer `<article>` makes every selection change a fresh mount;
the `@keyframes` fires automatically:

```css
.session-pane {
  animation: session-page-turn var(--motion-disclosure) var(--ease-out) both;
}

@keyframes session-page-turn {
  from { opacity: 0; transform: translateX(4px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

The two surfaces (cross-fade + page-turn) fire on **separate DOM
nodes** — one is the `.session-pane` root, the other is the active
panel's own `<div role="tabpanel">` element (the same element that
carries `hidden`, `tabIndex`, and the inline `animation` style toggle
shown above; matches design.md §3.2 / §5.2 / §7.4 + prototype.html:567).
They never collide. When a selection change also lands on a different
default tab, both fire in parallel; the compositor handles them
independently without re-layout.

## Reduced-motion fallback

The global rule in `apps/frontend/src/styles/global.css` (landed at
M1a, unchanged in M2b):

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

Effect on M2b's surfaces:

- **Tab indicator slide**: zeroed transition → indicator teleports to
  the active tab's coordinates without sliding.
- **Tab cross-fade-IN**: zeroed animation duration → panel snaps to
  opacity 1 immediately.
- **Page-turn fade**: zeroed animation duration → new SessionView
  appears at full opacity with no transform entrance.
- **Instant hover + active surfaces (#4–#9)**: unaffected (they
  weren't animated to begin with).

The reading-wash noise overlay is also suppressed under reduced-motion
(M2a established a SEPARATE rule for this since `background-image` is
not in the global zero-out's property list). M2b doesn't change that.

## Spec acceptance gates

- §Motion table entries that M2b activates: row 1 (Tab strip
  indicator), row 2 (Tab panel cross-fade), row 7 (Session-pane
  content fade). All three are present in this artifact and
  nothing else animates.
- §Performance budget (lines 114–128): only `transform` + `opacity` +
  `background-color` allowed AND only on the surfaces listed in the
  spec table. M2b activates `transform` (#1, #3) and `opacity`
  (#2, #3) and nothing else. M2b does NOT animate `color`,
  `border-color`, or hover `background-color` on any surface.
- §Reduced-motion (lines 97–112): all three M2b animations zero out
  via the global rule. Verified at chunk close per checklist item
  61 in `design.md`.

## Token references

| Token                  | Value                                |
|------------------------|--------------------------------------|
| `--motion-fast`        | 80 ms                                |
| `--motion-base`        | 120 ms                               |
| `--motion-disclosure`  | 200 ms                               |
| `--motion-pulse`       | 600 ms (M1a deep-link pulse — NOT M2b's surface, listed for reference) |
| `--ease-standard`      | `cubic-bezier(0.4, 0, 0.2, 1)`       |
| `--ease-out`           | `cubic-bezier(0.0, 0.0, 0.2, 1)`     |
| `--ease-in-out`        | `cubic-bezier(0.4, 0, 0.6, 1)`       |

No new motion tokens introduced for M2b. Token count invariant:
`grep -cE '^\s*--' apps/frontend/src/styles/tokens.css` is unchanged
from M2a.
