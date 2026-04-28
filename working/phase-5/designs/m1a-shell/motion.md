# M1a — Motion table

Phase 5 / Milestone 1 / Chunk a.

This is the M1a-scoped subset of the spec's full motion budget table
(`working/phase-5.md` §Motion & Micro-interactions, lines 80–96).
Other entries in the spec table land in later milestones.

## Animations introduced in M1a

| Surface | Property animated | Duration | Easing | Trigger | Notes |
|---------|-------------------|----------|--------|---------|-------|
| List row — deep-link pulse | `background-color` | 600 ms | `ease-out` (cubic-bezier(0.0, 0.0, 0.2, 1)) | URL-driven mount only | One-shot. Cleared by `onAnimationEnd` OR 2 s safety timer. NEVER fires on click-driven selection. |

That is the only M1a animation. Everything else is a snap.

## Animations NOT introduced in M1a (deferred to M2+)

The spec's full motion table includes the following — none of them
land in M1a:

- Tab strip indicator slide (M2; needs Tabs primitive)
- Tab panel cross-fade (M2)
- Disclosure expand/collapse (M3+; needs `<details>` content)
- Row hover tint **transition** (M2; the `--motion-fast` token lands in M2)
- Row selected tint **transition** (M2; the `--motion-base` token lands in M2)
- Session-pane content fade (M2/M4; signature-detail #2 needs the tab strip)
- Skim-block stagger (M5)
- Truncation banner appearance (M4)

In M1a, the row hover tint and the selected-row tint **snap** rather
than transition. That is intentional: the motion tokens (`--motion-fast`,
`--motion-base`) and the easing tokens (`--ease-standard`) land in M2
per the spec's "added in M2" annotations. Adding a transition with
hardcoded duration values in M1a would churn through M2 anyway. M1a
keeps motion to the single deep-link pulse.

## Reduced-motion behavior

A single global rule lands in `apps/frontend/src/styles/global.css`,
matching spec lines 102–110 verbatim:

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

Effect on M1a's only animation:

- The 600 ms deep-link pulse collapses to 0.01 ms — effectively
  invisible. The row renders directly in its selected-tint state.
- The keyframe still runs (because `animation-iteration-count: 1`)
  but completes in one paint frame, so `onAnimationEnd` still fires
  and the `data-deep-link` attribute is cleaned up promptly.
- The 2 s safety timer is unaffected (it's a JS timeout, not a CSS
  animation property), but in practice it never fires because
  `onAnimationEnd` always wins.

## Performance budget (M1a)

- The pulse animates `background-color` only — composite-cheap on
  every modern engine.
- The pulse runs on at most one row at a time (deep-link arrival is
  a single-row event).
- No layout-touching animations in M1a. The selected-row 2 px sienna
  inset is rendered via `box-shadow` (composite-only), not
  `border-left` (which would shift cell positions and re-trigger
  layout).
- No `width` / `top` / `padding` animations in M1a.

This means M1a comfortably fits the spec's overall performance budget
(spec §Performance budget, lines 114–128) — there is nothing in M1a
that approaches the budget's documented exemption (`<details>`
expand/collapse via `interpolate-size`) which lands in later
milestones.

## Verification

The following checks are M1a-relevant. The developer should add them
to the M1a verification step:

1. With reduced-motion off, the deep-link pulse runs once for ~600 ms
   on URL-driven mount, settling to the selected-row tint. Visible
   to the eye but not jarring.
2. With reduced-motion on (browser DevTools → Rendering →
   Emulate CSS media feature `prefers-reduced-motion: reduce`), the
   pulse collapses to a single paint frame. The row renders in its
   selected-tint state immediately.
3. Click-driven selection NEVER triggers the pulse — only URL-driven
   mount does. (Verified by clicking through 5 rows; no row pulses.
   Then reload with `?session=row-3` in the URL; row-3 pulses on
   mount.)
4. The pulse cleans itself up: after ~600 ms the `data-deep-link`
   attribute is gone from the DOM (verified via DevTools inspector).
5. `onAnimationEnd` cleanup beats the 2 s safety timer in normal
   conditions; the safety timer is a fallback for the
   `session_not_found` case where the row never renders. (Verified
   by deep-linking to a known-missing rowKey: after 2 s the React
   state's `pendingDeepLinkPulseRowKey` is cleared even though no
   row pulsed.)
