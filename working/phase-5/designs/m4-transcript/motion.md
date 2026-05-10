# M4 motion timing reference

This is a single-screen lookup for the developer landing M4. It
re-tabulates the spec §Motion budget rows that M4 activates, names
each surface, and pins the implementation idiom. Reduced-motion
fallback behavior is documented per surface. PROHIBITED properties
are enumerated explicitly so a future codex round can verify M4
introduces no motion-budget violations.

## M4's two new motion surfaces

The chunk activates two motion surfaces from the spec's §Motion
budget at `working/phase-5.md:84-95`. **No other M4 surface
animates.** The frozen motion budget permits animation only on
`transform`, `opacity`, and `background-color` AND only on the
specific surfaces listed in the spec table. M4 activates exactly the
two rows below and nothing more.

| #   | Surface                                   | Property            | Duration                  | Easing                  | Trigger                                          | Idiom                         |
|-----|-------------------------------------------|---------------------|---------------------------|-------------------------|--------------------------------------------------|-------------------------------|
| 1   | **Truncation banner appearance**          | `opacity: 0 → 1`    | `--motion-base` (120 ms)  | `--ease-out`            | `parsed.truncated` becomes true (component mount) | CSS `@keyframes` + animation rule on `.transcript-banner-truncation` |
| 2   | **Disclosure (`<details>`) expand/collapse** | `block-size` (via `interpolate-size: allow-keywords`) | `--motion-disclosure` (200 ms) | `--ease-in-out`         | user toggle on `<summary>`                        | Native `<details>` element + global CSS rule on `details > *` |

## M4's INSTANT (non-animated) surfaces

These M4 surfaces undergo state changes with NO animation /
transition. The change applies on the next paint without
interpolation:

| #   | Surface                                  | State change                                | Trigger              |
|-----|------------------------------------------|---------------------------------------------|----------------------|
| 3   | Message panel mount                      | none — panels appear at full opacity         | first paint per session |
| 4   | Tool `<pre>` block scroll                | native scroll                                | user scroll          |
| 5   | Parse-warnings banner mount              | none — banner appears at full opacity        | `warnings.length > 0` |
| 6   | Dismiss button hover                     | border-color swap (instant)                  | pointer enter        |
| 7   | Retry button hover                       | border-color swap (instant)                  | pointer enter        |
| 8   | tool_result "Expand" summary hover       | `text-decoration: underline` swap (instant)  | pointer enter        |
| 9   | `<summary>` focus-visible                | outline appears                              | focus arrives        |
| 10  | Code-fence segment render                | none — `<pre>` / `<code>` swap is structural | first paint          |

Why instant rather than animated: `color`, `border-color`,
`text-decoration`, and hover `background-color` on these surfaces
are **NOT** in the spec's frozen motion budget at
`working/phase-5.md:84-95`. The budget is load-bearing per spec
line 1100; adding animations on unlisted surfaces requires a
coordinator waiver, which M4 does not seek. Instant state changes
still feel responsive at 60 Hz; the animated surfaces (#1, #2)
carry the chunk's animation budget.

## Idiom details

### Surface 1 — Truncation banner appearance

CSS `@keyframes` on `.transcript-banner-truncation`. The banner is
mounted by the React renderer when `state === "truncated"`; the
animation fires automatically on first paint:

```css
.transcript-banner-truncation {
  /* Static visual recipe — colors and layout, no animation. */
  background: color-mix(in srgb, var(--color-warn) 8%, var(--color-surface));
  border-inline-start: 3px solid var(--color-warn);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  color: var(--color-ink);
  font: var(--text-sm) / var(--leading-comfortable) var(--font-chrome);
  margin-block-end: var(--space-6);

  /* Animation — opacity ONLY. */
  animation: transcript-banner-fade var(--motion-base) var(--ease-out) both;
}

@keyframes transcript-banner-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

The `animation-fill-mode: both` keeps opacity at 1 after the keyframe
completes (matches M2b's `tab-fade-in` pattern at `SessionView.css`).
On the FIRST mount of `<TruncationBanner>` (e.g. when state
transitions `loading → truncated`), the keyframe fires; on subsequent
re-renders inside the same mount, the property string doesn't change
and the keyframe doesn't re-fire. This is correct: the banner appears
once per truncation.

**The animation explicitly targets `opacity` and ONLY `opacity`.**
The static visual recipe (background, border, padding, color) is set
at component mount via the static `.transcript-banner-truncation`
selectors above; the static colors are NOT interpolated in.

### Surface 2 — Disclosure (`<details>`) expand/collapse

Native `<details>` element + a global CSS rule already in place from
M2b:

```css
/* Lives in apps/frontend/src/styles/global.css (M2b authorization) */
@supports (interpolate-size: allow-keywords) {
  :root {
    interpolate-size: allow-keywords;
  }
}

details > *:not(summary) {
  /* The disclosure animation: 200 ms ease-in-out on block-size.
   * Per the documented exemption (spec line 88), this is the ONLY
   * layout-touching animation in Phase 5. */
  transition: block-size var(--motion-disclosure) var(--ease-in-out);
}
```

M4 reuses this rule for three surfaces:
- `tool_use` "Arguments" disclosure.
- `tool_result` "Expand ({Nmore} more bytes)" overflow disclosure.
- Parse-warnings banner `<details>` element.

If `interpolate-size` is unavailable, the `<details>` snaps without
animation. Acceptable per spec line 124 fallback. M4 does NOT
fallback-test (the M2b suite already covers this).

**The transition explicitly targets `block-size` and ONLY `block-size`.**
No other property is interpolated during expand/collapse. Open/closed
state itself is browser-managed (the `[open]` attribute toggles
internally; React doesn't drive it).

## PROHIBITED properties — what M4 must NOT animate

This section is the codex defense. Every property listed below was a
codex blocking finding in M2b round 1 or earlier; M4 must not regress.

### Properties FORBIDDEN on ALL M4 surfaces

These properties are forbidden per the §Motion budget + §Performance
budget enumeration in spec lines 84-128. M4 must NOT have ANY CSS
declarations matching:

- `transition: color …`
- `transition: border-color …`
- `transition: width …`
- `transition: height …`
- `transition: top …`
- `transition: padding …`
- `transition: margin …`
- `transition: font-size …`
- `transition: letter-spacing …`
- `transition: line-height …`

Audit: `rg -n 'transition: (color|border-color|width|height|top|padding|margin|font-size|letter-spacing|line-height)' apps/frontend/src/features/sessions/TranscriptView.css` must return zero matches.

### Properties FORBIDDEN on message panels

These properties may animate elsewhere in Phase 5 (e.g. row hover,
selected row tint, deep-link pulse) but NOT on message panels:

- `transition: background-color` on `.msg`, `.msg-user`, `.msg-assistant`,
  `.msg-tool-use`, `.msg-tool-result`, `.msg-system`, `.msg-boundary`,
  `.msg-unknown`. The user/assistant tint differential is STATIC
  (color-mix() resolved at mount); no transition on tint change
  because tint doesn't change within a single render. If the user
  toggles between two messages, that's a render of two distinct
  panels, not a tint transition.
- `transform` on `.msg*` selectors. Messages do not slide, scale,
  rotate, or skew. They appear at their final layout position.

Audit: `rg -nE '\.msg.* (transition|transform)' apps/frontend/src/features/sessions/TranscriptView.css` should match only the global `transform-origin` declarations (none expected) — the absence of message-panel transitions/transforms is the verification.

### Properties FORBIDDEN inside the truncation banner

The truncation banner authorizes `opacity` ONLY:

- NO `transition: background-color` on the banner. The 8 % warn-tint
  background is STATIC (resolved at mount via color-mix); it does not
  fade in or shift. The fade is the OPACITY of the entire banner
  layer.
- NO `transform` on the banner. It does not slide or scale.
- NO `border-color` transition on the warn stripe. The stripe color
  is static.

Codex precedent: M2b r1 #2 caught a `background-color` transition on
the `.session-conflict-badge` that M4's truncation banner deliberately
echoes the design of. M4's banner uses opacity-only entrance to avoid
the same misuse pattern.

### Properties FORBIDDEN inside parse-warnings banner

The parse-warnings banner is a `<details>` element with native
disclosure animation (block-size). NO additional motion:

- NO `transition: background-color` on the banner shell.
- NO `transition: border-color` on the dismiss button.
- NO `transform` on any element.
- NO opacity animation on mount (the banner is not opacity-faded —
  it appears synchronously when `parsed.warnings.length > 0`).

The disclosure animation is the ONLY motion on this surface; it
inherits from the global `details > *` rule and adds nothing M4-specific.

### Properties FORBIDDEN on disclosure summaries

The `<summary>` elements (Arguments, Expand, parse-warnings):

- NO `transition` on `color`, `border-color`, `background-color`,
  `text-decoration`. Hover state changes are INSTANT.
- NO `transform` rotation on the disclosure marker. The native
  triangle-rotation animation provided by the browser is NOT
  customized; M4 does not override it.

### Properties FORBIDDEN on Retry / Dismiss buttons

Same recipe as M2b's `.raw-retry` and `.metadata-copy-btn`:

- NO `transition` declarations at all on the buttons.
- Hover and focus-visible states are INSTANT.

This is the M2b-established pattern; M4 does not deviate.

### Properties FORBIDDEN on the boundary chapter-break

The boundary message:

- NO `transition` or `animation` on the wrapper, the rules, or the
  label. The chapter break is STRUCTURAL — it appears with the rest
  of the transcript stream's first paint (no per-element entrance).
- NO opacity fade on the boundary specifically. The page-turn fade
  at the SessionView outer layer covers the entire stream's mount;
  the boundary inherits that animation as a passive participant.

### Properties FORBIDDEN on the entire transcript stream

- NO Skim-style stagger animation on the messages. Spec line 93
  authorizes a stagger ONLY for Skim's first paint (M5); M4's
  transcript stream paints all messages at the same time. The
  page-turn fade at the SessionView layer is the only entrance
  animation that touches M4's content.

## Reduced-motion fallback

The global rule in `apps/frontend/src/styles/global.css` (landed at
M1a, unchanged through M4):

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

Effect on M4's surfaces:

- **Truncation banner appearance**: zeroed animation duration → banner
  snaps to opacity 1 immediately on mount.
- **Disclosure expand/collapse**: zeroed transition duration →
  `<details>` snaps open/closed instantly. (The native browser
  triangle still rotates; that's a UA-internal animation not
  governed by the page CSS.)
- **Instant hover surfaces (#6, #7, #8, #9)**: unaffected (they
  weren't animated to begin with).

The reading-wash noise overlay on `.session-pane` continues to be
suppressed under reduced-motion via M2a's separate rule (the noise
overlay is a `background-image` which is not zeroed by the global
rule's `animation-duration` / `transition-duration` reset). M4 does
not change that.

## Spec acceptance gates

- §Motion table entries that M4 activates: row 3 (Disclosure
  expand/collapse — already authorized at M2b for tool_use Arguments;
  M4 extends to tool_result overflow + parse-warnings) and row 9
  (Truncation banner appearance — NEW for M4). All other rows
  unchanged.
- §Performance budget (lines 114-128): only `transform` + `opacity` +
  `background-color` allowed AND only on the surfaces listed in the
  spec table. M4 activates `opacity` (#1) and `block-size` (#2 — the
  documented exemption). M4 does NOT animate `color`, `border-color`,
  `width`, `height`, `top`, `padding`, `margin`, hover
  `background-color`, or `transform` on any surface.
- §Reduced-motion (lines 97-112): both M4 animations zero out via
  the global rule. Verified at chunk close.

## Token references

| Token                  | Value                                |
|------------------------|--------------------------------------|
| `--motion-fast`        | 80 ms (NOT used by M4 — listed for reference) |
| `--motion-base`        | 120 ms                               |
| `--motion-disclosure`  | 200 ms                               |
| `--motion-pulse`       | 600 ms (M1a deep-link pulse — NOT M4's surface) |
| `--ease-standard`      | `cubic-bezier(0.4, 0, 0.2, 1)` (NOT used by M4) |
| `--ease-out`           | `cubic-bezier(0.0, 0.0, 0.2, 1)`     |
| `--ease-in-out`        | `cubic-bezier(0.4, 0, 0.6, 1)`       |

No new motion tokens introduced for M4. Token count invariant:
`grep -cE '^\s*--' apps/frontend/src/styles/tokens.css` is unchanged
from M2a (= 83).

## Codex pre-emption notes

The motion-budget catches codex is most likely to flag:

1. **`background-color` transition on a non-enumerated surface**.
   M2b r1 #2 caught this on `.session-conflict-badge`. M4's
   truncation banner has a STATIC color-mix background — only opacity
   animates. The colors.md and design.md both call this out
   explicitly.

2. **Animated `color` / `border-color` on hover surfaces**. The
   Dismiss / Retry / "Expand" hover states in M4 are INSTANT (no
   `transition` declarations). Codex should look for and find none.

3. **Animated `transform` on message panels**. M4's panels do not
   transform. The page-turn fade at the SessionView outer layer is
   the only `transform` in flight; it operates on `.session-pane`,
   not on any `.msg*` selector.

4. **Skim-style stagger on the transcript stream**. M4 explicitly
   does NOT stagger message entrance. Codex looks for any
   per-message `animation-delay` declaration; M4 has zero.

5. **Inline `style` writes that bypass the CSS budget**. The
   developer might be tempted to use `style={{ transition: "..." }}`
   on a per-message basis to "fade in messages". M4 forbids this —
   all motion is declarative CSS in `TranscriptView.css`.

If codex finds any of these, the developer fixes by removing the
violating declaration; no token additions, no exception requests.

## Implementation guard

A small developer-facing self-check:

```bash
# Property-budget audit
rg -nE 'transition: (color|border-color|width|height|top|padding|margin|font-size|letter-spacing|line-height)' apps/frontend/src/features/sessions/TranscriptView.css
# Expected: empty.

# Background-color on message panels (forbidden)
rg -n 'transition: background-color' apps/frontend/src/features/sessions/TranscriptView.css | rg '\.msg'
# Expected: empty.

# Transform on message panels (forbidden)
rg -nE '\.msg.*transform:' apps/frontend/src/features/sessions/TranscriptView.css
# Expected: empty.
```

These are documented in m4-plan §9 alongside the verification commands.
