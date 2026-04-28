# M1b motion notes

The only motion change in M1b is **none new** — every M1b surface
either inherits motion from M1a (deep-link pulse on URL-driven mount)
or uses instant transitions (sticky footer, `<details>` open/close,
vestigial button hover).

## What animates in M1b

| Surface                                  | Property            | Duration | Easing      | Trigger                       | Note                                                   |
|------------------------------------------|---------------------|----------|-------------|--------------------------------|--------------------------------------------------------|
| Row deep-link pulse (M1a inheritance)    | `background-color`  | 600 ms   | ease-out    | URL-driven mount only          | Recipe verbatim from M1a; preserved through M1b column compression. |
| Row hover tint                            | (none — instant)    | —        | —           | pointer enter                  | M1a does not animate selected-row tint or hover; the spec's `--motion-base` 120 ms transition lands in M2 once the motion tokens exist. |
| `<details>` open/close                   | (none — instant)    | —        | —           | summary toggle                 | Browser-native instant snap. The `block-size`-via-`interpolate-size` exemption per spec line 1100 is deferred to M5 SkimView (where editorial mood requires the smoother reveal). |
| Sticky list-pane footer position changes | (none — pure layout) | —       | —           | viewport scroll                | `position: sticky` is a layout primitive; no animation. |
| Vestigial Open detail button             | `text-decoration` (instant) | —    | —           | hover / focus                  | Underline appears on hover/focus-visible; no transition added. Parallel to M1a's `.back-to-list`. |

## What does NOT animate (intentionally)

- Filter `<details>` open/close — `block-size` / `padding` / `opacity`
  transitions all skipped. The disclosure is utility chrome; instant
  snap is the correct gesture. Spec line 1100 reserves the smoother
  `block-size` transition for M5's Skim view.
- Sticky footer entrance — the footer is always in the DOM; sticking is
  a pure layout behavior with no animation.
- Vestigial button entrance / disappearance — the button mounts when
  `state === "ready-placeholder"` and unmounts otherwise; no entrance
  fade. The session pane's `aria-live="polite"` from M1a already
  signals the state change.
- `(refresh)` marker insertion — when `row.statusConflict` flips, the
  marker appears / disappears instantly. Animating an inline span
  would feel jittery against the otherwise quiet table chrome.

## Reduced-motion behavior

The single global rule from M1a `global.css` is preserved:

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

Effect on M1b additions:
- Deep-link pulse collapses to 0.01 ms (effectively invisible — the
  row renders directly in its selected-tint state). M1a behavior
  preserved.
- All other M1b surfaces are already instant; the rule is a no-op for
  them.

## Signature-detail traceability

The Phase 5 spec's signature details (§Design Language lines 64-78)
that touch M1b's surfaces:

| #  | Detail              | M1b status                                                                              |
|----|---------------------|-----------------------------------------------------------------------------------------|
| 3  | Deep-link pulse     | PRESERVED — M1a recipe carries through M1b's column compression unchanged.              |
| 4  | Hairline gutter     | PRESERVED — `border-right: 1px solid var(--color-border)` on `.list-pane` from M1a.     |
| 1, 2, 5, 6 | (chapter break / page-turn fade / tab indicator / reading wash) | not in M1b scope — land in M2/M4/M5.                                  |

## Frame-budget notes

The deep-link pulse's `background-color` animation is compositor-cheap
and on the spec's allow-list (line 1100). No `width` / `top` /
`padding` / `box-shadow` animations introduced in M1b.
