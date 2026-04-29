# M2a motion notes

M2a introduces the **first motion tokens**. The chunk's only behavioral
diff to motion (other than the token introduction) is the M1a deep-link
pulse keyframe migration from a literal `600ms ease-out` to
`var(--motion-pulse) var(--ease-out)`.

## New tokens

| Token                  | Value                              | Used by                                           |
|------------------------|-------------------------------------|---------------------------------------------------|
| `--motion-fast`        | `80ms`                             | row hover tint (M1a) — currently inline literal   |
| `--motion-base`        | `120ms`                            | selected row, M2b tab indicator, M4 page-turn fade|
| `--motion-disclosure`  | `200ms`                            | `<details>` `block-size` (M5 exemption)           |
| `--motion-pulse`       | `600ms`                            | deep-link pulse one-shot (M1a → M2a migrated)     |
| `--ease-standard`      | `cubic-bezier(0.4, 0, 0.2, 1)`     | M2b tab indicator slide                           |
| `--ease-out`           | `cubic-bezier(0.0, 0.0, 0.2, 1)`   | M1a pulse, M4 transcript fade                     |
| `--ease-in-out`        | `cubic-bezier(0.4, 0, 0.6, 1)`     | M5 disclosure block-size                          |

## Keyframe migration (the only motion diff in M2a)

In `apps/frontend/src/features/sessions/SessionsTable.css`:

**BEFORE M2a:**
```css
table tbody tr[data-deep-link="true"] {
  animation: deep-link-pulse 600ms ease-out 1;
}
```

**AFTER M2a:**
```css
table tbody tr[data-deep-link="true"] {
  animation: deep-link-pulse var(--motion-pulse) var(--ease-out) 1;
}
```

The `1` iteration count stays a literal — it is not a designed-in token,
it's the algorithmic count.

The `@keyframes deep-link-pulse` block itself does NOT change. Its `0%`
peak (`color-mix(... var(--color-accent) 22% ...)`) and `100%` resting
(`color-mix(... var(--color-accent) 8% ...)`) consume
`var(--color-accent)`, so the new oklch sienna retints the keyframe
automatically. **Critical**: the pulse on first paint after M2a
reads sienna instead of blue. Visual delta is large; aesthetic delta
is exactly the intent of the M2 chunk — the pulse becomes a signature
detail of Archive-room, not a generic system-blue UI flash.

## What M2a does NOT touch

- No new `@keyframes` blocks. The M5 chapter-break and M4 page-turn
  fade keyframes land in their own milestones.
- No M1a global reduced-motion zero-out edit — the existing rule in
  `global.css` (lines 145-154) already targets every M2a-related
  property (`animation-duration`, `transition-duration`,
  `scroll-behavior`). The only addition under reduced-motion is the
  `background-image: none` rule on `.session-pane` (the noise overlay
  is decorative; suppressed). That rule is documented in
  `design.md §9` and is **separate from** the motion zero-out.

## Reduced-motion behavior with the new tokens

With `prefers-reduced-motion: reduce` set, every transition collapses
to `0.01ms` per the global rule. The deep-link pulse, the row hover
tint, and the selected-row tint **all complete in one paint frame**.
The noise overlay disappears. The page is fully usable; no signal is
lost.

The motion tokens themselves (`--motion-pulse: 600ms`) do NOT change
under reduced motion — the global zero-out overrides them at the
property level via `transition-duration: 0.01ms !important`. The
tokens still hold their canonical values for any future code that
inspects them (e.g., a Playwright test asserting the token value).

## Performance budget posture

The M2a additions are token introductions, not new animated surfaces.
The performance budget commentary in §Motion / §Performance budget
of the spec applies to the M5 disclosure exemption, not to anything
M2a lands. Specifically:

- The deep-link pulse stays `background-color`-only (compositor-
  cheap; no layout).
- The reading wash is a static `background-image` (no animation; the
  decorative noise is rasterized once and cached by the browser).
- The motion tokens themselves are `:root`-scoped CSS variables
  (zero runtime cost; resolved at parse time).

No frame-time risk introduced by M2a.
