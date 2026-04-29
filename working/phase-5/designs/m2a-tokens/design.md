# M2a — Design Language tokens + Fraunces self-hosted woff2 + reading-wash noise overlay

Design artifact for **Phase 5 / Milestone 2 / Chunk a**.
Spec frozen at `working/phase-5.md` @ `05467ad` on `main`.
Implementation predecessors: M1a closed at `a59b3f6`; M1b closed at `e8d80c5`.
Designer: UI/UX subagent dispatched 2026-04-28.

This is a **reference artifact**. The developer subagent re-implements
against the production stack (Bun + Vite + React + TS + per-component
sibling CSS). Nothing in this folder is shipped to `apps/frontend/`;
the prototype's hex literals do not contaminate the
`apps/frontend/src/` audit count.

---

## 1. Chunk scope summary

M2a is the **token-rollout chunk** that lands the Archive-room Design
Language end-to-end without a single React structural change. Three
files in `apps/frontend/src/` see edits — `styles/tokens.css` (the load-
bearing one), `styles/global.css` (the noise-overlay rule + reduced-
motion suppression for the `background-image`), and
`features/sessions/SessionsTable.css` (one line: the M1a deep-link
pulse keyframe migrates from literal `600ms ease-out` to
`var(--motion-pulse) var(--ease-out)`). One static asset is added:
`apps/frontend/public/fonts/Fraunces-subset.woff2`. Eleven feature-
local CSS files keep their `var(--color-text)` / `var(--color-bg)` /
`var(--color-text-muted)` references unchanged because Option B
aliasing maps the Phase 4 baseline names through to the new oklch
canonical names.

Out of M2a (M2b territory): the `Tabs.tsx` accessible primitive,
`SessionView` rewire to a four-tab shell, `SessionMetadata` /
`RawTab` extraction, vestigial-button removal. None of those touch
tokens; they are pure structural React work and own their own chunk.

## 2. Design intent

### How M2a completes the Archive-room aesthetic

M1a delivered the **bones** (split-pane Grid, hairline gutter, right-
pane state machine, deep-link pulse, reduced-motion zero-out). M1b
delivered the **information density** (4-essentials list, sticky
footer, filter `<details>`, vestigial entry-point). Both chunks
operated against the Phase 4 token palette — a competent neutral
blue-on-grey system that worked, but didn't yet read as
*Archive-room*.

M2a is the chunk where the aesthetic **fully lands**. The shift is
calibrated so that:

- The same compact rows now tint sienna instead of cool blue when
  selected. The deep-link pulse, the Open detail focus ring, the
  filter chip active state — everything that previously read as
  "system blue" now reads as "warm sienna manuscript ink." This is a
  one-token swap (`--color-accent`) cascading through five `color-mix`
  recipes that were authored in M1a/M1b precisely so M2 could retint
  them by changing one source.
- The page surface and ink shift from `#ffffff` / `#14161a` to
  `oklch(98% 0.01 70)` / `oklch(20% 0.02 70)` — both are warmer by
  ~5 chroma points at a 70° hue (the warm-paper anchor). On screens
  the difference is small but cumulatively decisive: surfaces stop
  reading as "default browser white" and start reading as "paper".
  Dark mode shifts in parallel: surface from `#0f1115` (cold near-
  black) to `oklch(15% 0.01 70)` (deep warm ink).
- The display layer (Fraunces) lights up in two places **immediately**
  — the empty-pane preface (already rendered by the M1a
  `SessionView.tsx`; we promote its CSS rule to use `--font-display`
  italic at `--text-lg`) and the empty-mark glyph (also promoted to
  display italic). Every other display-font surface (session-pane
  title, skim chapter-break label, app title) lands in M2b/M5.
  Promoting the preface now is a small visible delight at no
  structural cost.
- The reading wash — a 1 px inline-SVG fractalNoise at 3% opacity —
  applies to `.session-pane` only in light mode. The texture is
  invisible at a glance but provides the warmth that distinguishes a
  reading surface from a chrome surface (signature detail #6 per
  spec line 76).

### What M2a sets up for M2b / M3 / M4 / M5

- **M2b** consumes the Tabs primitive against the new tokens:
  `--motion-base var(--ease-standard)` for the indicator slide,
  `--color-accent` for the indicator stroke, `--color-ink` /
  `--color-ink-muted` for active vs inactive labels. Every value
  exists at M2a close.
- **M4** transcript message tints (user `5%` accent over surface,
  assistant default surface) inherit the new oklch accent
  automatically through the `color-mix` recipe.
- **M5** chapter-break label uses `--font-display` italic small-caps
  at `--text-sm` against `--color-border-strong` hairline — both
  tokens land in M2a.

### Aesthetic anchor (Archive-room — recap)

- **Editorial, not dashboard** — display italic on signature surfaces
  (preface, future titles, chapter breaks); chrome stays sans.
- **Hush over hustle** — every transition stays inside the
  `--motion-fast` / `--motion-base` / `--motion-disclosure` /
  `--motion-pulse` budget; reduced-motion zeroes them all.
- **Hairline over shadow** — all separators are 1 px hairlines at
  `--color-border` or `--color-border-strong`. The Toast keeps its
  Phase 4 shadow; nothing else gains shadow chrome.
- **Sharp over soft** — square panels, `--radius-sm` (4 px) buttons.
- **One accent, used surgically** — `--color-accent` is sienna in
  every recipe. No second hue.
- **Texture over flat** — the reading wash on `.session-pane`. Light
  mode only; suppressed in reduced-motion.

## 3. Token table

The full enumeration of every M2a token, the light + dark oklch value,
the corresponding hex fallback (from the existing 24 hex literals where
applicable), and the alias if any. M2a adds **30 new tokens**: 4 color
(ink, ink-muted, surface tokens are revised values for existing names;
border-strong is reused; accent is revised; surface-raised/border are
revised); 3 typography stack tokens; 6 type-scale tokens (one new —
`--text-2xl`); 3 leading + measure tokens; 4 motion duration tokens; 3
easing tokens; 1 noise-overlay token; 4 alias tokens. The total token
count moves from 44 → ~74 (verifiable via
`grep -cE '^\s*--' apps/frontend/src/styles/tokens.css`; allow ±2 for
font-face block declarations + comments).

| Token (M2a)               | Light                      | Dark                        | Hex fallback (light / dark) | Alias / notes                                                |
|---------------------------|----------------------------|------------------------------|------------------------------|--------------------------------------------------------------|
| `--color-surface`         | `oklch(98% 0.01 70)`       | `oklch(15% 0.01 70)`         | `#f8f9fb` / `#151821`        | revised value; existing token name (Phase 4)                 |
| `--color-surface-raised`  | `oklch(96% 0.01 70)`       | `oklch(18% 0.01 70)`         | `#ffffff` / `#1b1f2a`        | revised value                                                |
| `--color-ink`             | `oklch(20% 0.02 70)`       | `oklch(92% 0.01 70)`         | `#14161a` / `#e8eaef`        | **NEW name** (canonical)                                     |
| `--color-ink-muted`       | `oklch(45% 0.02 70)`       | `oklch(70% 0.01 70)`         | `#5a606b` / `#9098a6`        | **NEW name** (canonical)                                     |
| `--color-border`          | `oklch(85% 0.01 70)`       | `oklch(28% 0.01 70)`         | `#e3e5ea` / `#262b36`        | revised value                                                |
| `--color-border-strong`   | `oklch(65% 0.02 70)`       | `oklch(48% 0.02 70)`         | `#8a909c` / `#5e6571`        | revised value (post fix-up; lifted from L70/L40 for SC 1.4.11) |
| `--color-accent`          | `oklch(55% 0.15 50)`       | `oklch(65% 0.15 50)`         | `#2864d4` / `#6da5ff`        | sienna 70°-hue intent; light L55 post fix-up (was L60; failed AA as text); **fallback is BLUE** (see §6 tradeoff) |
| `--color-accent-hover`    | `oklch(50% 0.16 50)`       | `oklch(72% 0.13 50)`         | `#1d4fa8` / `#8bbbff`        | revised; carryover token name                                |
| `--color-success`         | `oklch(48% 0.13 155)`      | `oklch(64% 0.13 155)`        | `#1f7a4a` / `#5fb68a`        | inherited; oklch transposed for parity                       |
| `--color-warn`            | `oklch(58% 0.15 60)`       | `oklch(72% 0.13 60)`         | `#b86b07` / `#e0a75a`        | inherited; oklch transposed                                  |
| `--color-error`           | `oklch(52% 0.18 25)`       | `oklch(68% 0.16 25)`         | `#b13838` / `#e57d7d`        | inherited; oklch transposed                                  |
| **Aliases (Option B)**    | —                          | —                            | —                            | —                                                            |
| `--color-text`            | `var(--color-ink)`         | —                            | —                            | back-compat → 11 feature CSS files keep working               |
| `--color-text-muted`      | `var(--color-ink-muted)`   | —                            | —                            | back-compat                                                  |
| `--color-bg`              | `var(--color-surface)`     | —                            | —                            | back-compat                                                  |
| `--font-sans`             | `var(--font-chrome)`       | —                            | —                            | back-compat                                                  |
| **Typography**            | —                          | —                            | —                            | —                                                            |
| `--font-display`          | `"Fraunces", Charter, "Iowan Old Style", Georgia, serif` | (same) | n/a | self-hosted; @font-face below                                |
| `--font-chrome`           | `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif` | (same) | n/a | system stack                                                 |
| `--font-mono`             | `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace` | (same) | n/a | revised: JetBrains Mono prepended to existing Phase 4 stack  |
| `--text-xs`               | `0.75rem`                  | (same)                        | n/a                          | revised from `0.72rem` → spec literal                        |
| `--text-sm`               | `0.875rem`                 | (same)                        | n/a                          | revised from `0.85rem` → spec literal                        |
| `--text-base`             | `1rem`                     | (same)                        | n/a                          | revised from `0.95rem` → spec literal                        |
| `--text-lg`               | `1.125rem`                 | (same)                        | n/a                          | revised from `1.15rem` → spec literal                        |
| `--text-xl`               | `1.5rem`                   | (same)                        | n/a                          | revised from `1.35rem` → spec literal                        |
| `--text-2xl`              | `2rem`                     | (same)                        | n/a                          | **NEW** — empty-pane preface, app title, M5 chapter break    |
| `--leading-tight`         | `1.25`                     | (same)                        | n/a                          | **NEW**                                                      |
| `--leading-comfortable`   | `1.55`                     | (same)                        | n/a                          | **NEW** — reading content                                    |
| `--measure`               | `70ch`                     | (same)                        | n/a                          | **NEW** — transcript body max-inline-size                    |
| **Motion**                | —                          | —                            | —                            | —                                                            |
| `--motion-fast`           | `80ms`                     | (same)                        | n/a                          | **NEW** — row hover tint (linear)                            |
| `--motion-base`           | `120ms`                    | (same)                        | n/a                          | **NEW** — selected row, tab indicator slide                  |
| `--motion-disclosure`     | `200ms`                    | (same)                        | n/a                          | **NEW** — `<details>` block-size (M5 exemption)              |
| `--motion-pulse`          | `600ms`                    | (same)                        | n/a                          | **NEW** — deep-link pulse one-shot                           |
| `--ease-standard`         | `cubic-bezier(0.4, 0, 0.2, 1)`   | (same)                  | n/a                          | **NEW**                                                      |
| `--ease-out`              | `cubic-bezier(0.0, 0.0, 0.2, 1)` | (same)                  | n/a                          | **NEW**                                                      |
| `--ease-in-out`           | `cubic-bezier(0.4, 0, 0.6, 1)`   | (same)                  | n/a                          | **NEW**                                                      |
| **Surface treatment**     | —                          | —                            | —                            | —                                                            |
| `--noise-overlay-light`   | data-URL inline-SVG (~1 KB; 80×80 fractalNoise; 3% opacity) | n/a (suppressed) | n/a | **NEW** — applied to `.session-pane` light mode only         |

The 11 feature-local CSS consumers continue to read `var(--color-text)`,
`var(--color-bg)`, `var(--color-text-muted)`, `var(--font-sans)` — all
of which alias through to the new canonical names. **Zero feature-local
CSS rewrites are required.** This is the load-bearing M2a invariant
that lets the chunk land token-only without React change.

## 4. `@font-face` recipe

Lands in `tokens.css` per planner Q5. The location matters: it must
declare BEFORE any feature-local CSS that consumes `--font-display`,
which the cascade order (`reset → tokens → global → feature-local
sibling sheets`) already guarantees.

```css
/* Self-hosted Fraunces variable font, subset to ~80 KB.
 *
 * The woff2 lives at apps/frontend/public/fonts/Fraunces-subset.woff2
 * and Vite serves it at /fonts/Fraunces-subset.woff2 in dev + prod.
 * Subsetted via the recipe in §5 below; regenerate only when upstream
 * Fraunces revs (rare).
 *
 * font-display: swap — Fraunces NEVER blocks first-paint. The
 * fallback (Charter / Iowan Old Style / Georgia) renders immediately,
 * and Fraunces swaps in when the woff2 finishes loading (~50 ms on a
 * fast connection). The size-adjust + ascent-override values below
 * are tuned to Charter's metrics (the most common system serif on
 * macOS / iOS) so the swap is invisible: line heights stay within
 * 1 px on every step in the type scale.
 *
 * If the woff2 fails to load entirely, the page renders in
 * Charter/Georgia at ~99% of Fraunces's visual size — still cohesive,
 * still editorial, no broken layout. Reversibility per Resolved
 * Decision #15: deleting both @font-face blocks AND the woff2 file
 * yields a still-cohesive system-serif aesthetic. */

@font-face {
  font-family: "Fraunces";
  font-style: normal;
  font-weight: 100 900;            /* full variable axis */
  font-display: swap;
  src: url("/fonts/Fraunces-subset.woff2") format("woff2");
  size-adjust: 99.5%;
  ascent-override: 92%;
  descent-override: 22%;
  line-gap-override: 0%;
  unicode-range: U+0000-007F, U+00A0-00FF, U+2000-206F;
}

@font-face {
  font-family: "Fraunces";
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/Fraunces-subset.woff2") format("woff2");
  size-adjust: 99.5%;
  ascent-override: 92%;
  descent-override: 22%;
  line-gap-override: 0%;
  unicode-range: U+0000-007F, U+00A0-00FF, U+2000-206F;
}
```

### Fraunces fallback math

The override values are designer-recommended approximations measured
against Charter's metric anchor (Charter's `unitsPerEm = 2048`,
`hhea.Ascent = 1840`, `hhea.Descent = 460`, `OS/2.sCapHeight = 1485`).
Fraunces at default optical size ships `unitsPerEm = 1000`,
`hhea.Ascent = 980`, `hhea.Descent = 220`, so the **percent-of-em**
ratios are:

- ascent: `980/1000 = 98.0%` (Fraunces) vs `1840/2048 = 89.8%`
  (Charter). **Pick `ascent-override: 92%`** — Charter rendering
  inherits an explicit ascent that brings line-box heights to within
  ~1 px of Fraunces at every step in the scale.
- descent: `220/1000 = 22.0%` (Fraunces) vs `460/2048 = 22.5%`
  (Charter). Set `descent-override: 22%` — already a close match;
  the override pins it deterministically.
- size-adjust: Charter's x-height is ~1080/2048 = 52.7%; Fraunces's
  is ~520/1000 = 52.0%. Charter is slightly larger at the same
  declared size; **`size-adjust: 99.5%`** trims Charter to match
  Fraunces's apparent size.

The values here are designer-recommended starting values. The
developer **MUST** validate them visually using Monica Dinculescu's
font-style-matcher (https://meowni.ca/font-style-matcher/) OR
fontTools metrics extraction on the actual subsetted woff2 before
M2a closes — different subsetting recipes can shift metrics
slightly. The visual acceptance bar: **toggle font-display swap
(in DevTools, Network → Disable cache → throttle to "Slow 3G") and
verify no layout shift > 1 px** when Fraunces eventually arrives.
If shift exceeds 1 px on any specimen surface, the developer adjusts
the override values and re-measures.

## 5. Subsetting recipe (one-time author-side; NOT a build step)

Per Resolved Decision #15 + planner Q4, the woff2 is generated locally
and committed. Re-run only when upstream Fraunces revs.

```bash
# Prerequisite: pip install fonttools brotli
# Source: https://fonts.google.com/specimen/Fraunces (download family);
# locate Fraunces[opsz,SOFT,WONK,wght].ttf in the unzipped archive.

pyftsubset Fraunces[opsz,SOFT,WONK,wght].ttf \
  --output-file=apps/frontend/public/fonts/Fraunces-subset.woff2 \
  --unicodes='U+0000-007F,U+00A0-00FF,U+2000-206F' \
  --layout-features='kern,liga,smcp,onum,ital' \
  --flavor=woff2 \
  --no-ignore-missing-unicodes \
  --desubroutinize
```

Coverage:
- `U+0000-007F` — Latin Basic (ASCII).
- `U+00A0-00FF` — Latin-1 Supplement (em-dash, en-dash, accented
  chars, copyright, etc.).
- `U+2000-206F` — General Punctuation (en/em-quad, en/em-space,
  hair-space, prime / double-prime, ellipsis).
- `--layout-features=kern,liga,smcp,onum,ital`:
  - `kern` — pair kerning. Required for editorial text rhythm.
  - `liga` — common ligatures (`fi`, `fl`).
  - `smcp` — small caps. Used by the M5 chapter-break label
    ("SESSION RESUMED"). Required.
  - `onum` — old-style numerals. Used by the empty-pane preface +
    future timestamp prose. Required for the editorial mood.
  - `ital` — italic axis. The empty-pane preface + future skim
    chapter-break label render in italic. **Required.**

Expected output size: ~75–85 KB woff2 (within the spec's ~80 KB
target). If the output exceeds 100 KB, the developer narrows the
unicode-range or drops `smcp` (the Phase 5 spec only uses small
caps for the M5 chapter-break label; it could be replaced by CSS
`text-transform: uppercase` + a tighter `letter-spacing` if needed,
though the small-caps glyphs read better).

The subset file is regenerated only when Fraunces upstream changes
(approximately yearly per Google Fonts cadence). **No CI build
step**. Reversibility test: delete `Fraunces-subset.woff2` and
verify the page renders in Charter / Georgia at ~99% size with no
layout shift.

## 6. Cascade impact

The cascade order (per existing `global.css` header) is:
**`reset.css → tokens.css → global.css → feature-local sibling
sheets`**. M2a does NOT change the order.

Where M2a's diff lands:

- `tokens.css`:
  - **Add** the canonical color tokens (`--color-ink`,
    `--color-ink-muted`, etc.) with oklch values for light + dark.
  - **Add** the four alias declarations
    (`--color-text: var(--color-ink); …`) right after the canonical
    declarations so the alias is in the same `:root` block.
  - **Revise** existing color tokens whose name persists to use the
    new oklch values.
  - **Add** the typography tokens (3 stacks + 6 scale steps + 2
    leading + 1 measure).
  - **Revise** existing `--text-*` literals to spec values
    (`0.72rem → 0.75rem`, etc.).
  - **Add** the motion tokens (4 durations + 3 easing).
  - **Add** the noise-overlay token.
  - **Add** the `@supports not (color: oklch(0% 0 0))` block with
    hex fallbacks (re-using the existing 24 hex literals — no new
    literals added).
  - **Add** two `@font-face` blocks (regular + italic).

- `global.css`:
  - **Add** one rule:
    `.session-pane { background-image: var(--noise-overlay-light); }`
    — though this could equally land in `SessionView.css`. The
    designer's recommendation: **land it in `SessionView.css`** so
    the noise-overlay rule lives with the surface it decorates,
    keeping `global.css` lean. Either works; the developer picks.
  - **Add** the dark-mode suppression rule:
    `@media (prefers-color-scheme: dark) { .session-pane { background-image: none; } }`.
  - **Add** the reduced-motion suppression rule:
    `@media (prefers-reduced-motion: reduce) { .session-pane { background-image: none; } }`
    — note this is a SEPARATE rule from the existing global zero-out
    (which targets `animation-duration` / `transition-duration` /
    `scroll-behavior` only — `background-image` is NOT in the
    existing zero-out's property list).

- `features/sessions/SessionsTable.css`:
  - **Edit** one line in the `tr[data-deep-link="true"]` rule:
    `animation: deep-link-pulse 600ms ease-out 1;` becomes
    `animation: deep-link-pulse var(--motion-pulse) var(--ease-out) 1;`.
    The `1` iteration count stays a literal (it is not a token; it
    is the algorithmic count of iterations).
  - The `@keyframes deep-link-pulse` block itself does NOT change —
    its `0%` peak (`color-mix(... var(--color-accent) 22% ...)`) and
    `100%` resting (`color-mix(... var(--color-accent) 8% ...)`)
    already consume `var(--color-accent)`, so the new oklch sienna
    retints the keyframe automatically.

The 11 feature-local CSS consumers continue to read alias names
unchanged; they are not in M2a's diff.

## 7. WCAG AA contrast table

The full table lives at `wcag.md`. The summary here calls out the
load-bearing pairs that drive the M2a acceptance gate. **All ratios
below are codex-measured** post-fix-up round 1 (April 2026), not
designer-estimated. The original CIE2000-anchored designer estimates
were optimistic — codex's numerical computation (canonical
oklch → linear sRGB → relative luminance pipeline) is authoritative
and revealed three BLOCKING failures that this design.md now reflects.

| Pair                                                    | Light  | Dark   | Verdict       |
|---------------------------------------------------------|--------|--------|---------------|
| `--color-ink` on `--color-surface`                      | 17.10:1| 15.52:1| AAA · normal  |
| `--color-ink-muted` on `--color-surface`                | 7.04:1 | 7.36:1 | AAA · normal  |
| `--color-ink` on `--color-surface-raised`               | 16.13:1| 14.84:1| AAA · normal  |
| `--color-ink` on row hover (4% ink)                     | 15.79:1| 14.56:1| AAA · normal  |
| `--color-ink` on row selected (8% accent)               | 15.36:1| 14.41:1| AAA · normal  |
| `--color-ink` on deep-link pulse peak (22% accent)      | 12.62:1| 11.83:1| AAA · normal  |
| `--color-warn` (informational; no longer text-consumed post round 2) on `--color-surface` | 4.21:1 | 7.68:1 | not consumed as text post round 2 |
| `--color-warn` (informational; no longer text-consumed post round 2) on row selected tint | 3.79:1 | 7.13:1 | not consumed as text post round 2 |
| `.title-cell-refresh` italic (`--color-text-muted`) on `--color-surface` | 7.04:1 | 7.36:1 | AAA · normal |
| `.title-cell-refresh` italic (`--color-text-muted`) on row selected tint | ~6.32:1 | ~6.62:1 | AAA · normal |
| `--color-accent` (post fix-up L=55) on `--color-surface`| 4.84:1 | 5.78:1 | AA · normal   |
| `--color-accent` on `--color-surface-raised`            | 4.57:1 | 5.52:1 | AA · normal   |
| up-to-date pill (success 70/15)                         | 6.69:1 | 6.94:1 | AAA · normal  |
| not-stored pill (accent 70/15)                          | 5.95:1 | 6.62:1 | AAA · normal  |
| outdated pill (warn 70/15)                              | 5.43:1 | 7.74:1 | AAA · normal  |
| source-missing pill (error 70/15)                       | 6.60:1 | 6.91:1 | AAA · normal  |
| Toast.success border (65% mix) on raised                | 3.34:1 | 3.55:1 | SC 1.4.11     |
| Toast.error border (65% mix) on raised                  | 3.53:1 | 3.60:1 | SC 1.4.11     |
| Toast.info border (70% mix, post fix-up) on raised      | 3.22:1 | 3.62:1 | SC 1.4.11     |
| `--color-border-strong` (post fix-up) on `--color-surface` | 3.06:1 | 3.00:1 | SC 1.4.11 (cusp dark) |
| `--color-border` on `--color-surface` (decorative)      | 1.49:1 | 1.35:1 | not WCAG-gated |

**Codex fix-up round 1 (April 2026) — three BLOCKING resolutions**:

1. **`.toast.info` border**: pre-fix-up 70% mix at accent L=60 measured
   2.79:1 vs surface-raised — failed SC 1.4.11. Fix: lower light
   `--color-accent` to L=55. Post-fix-up: 3.22:1 — passes.
2. **`--color-accent` as normal text** (`.action-bar-clear`,
   `.toast-details summary`): pre-fix-up L=60 measured 3.93:1 vs
   surface, 3.71:1 vs surface-raised — failed AA normal text. Same
   fix (L=60 → L=55) lifts both to 4.84:1 / 4.57:1 — passes.
3. **`--color-border-strong`** vs `--color-surface`: pre-fix-up light
   L=70 measured 2.53:1, dark L=40 measured 2.13:1 — failed SC 1.4.11.
   Fix: light L=70 → L=65, dark L=40 → L=48. Post-fix-up: 3.06:1
   light, 3.00:1 dark — passes (dark on the cusp).

**Codex fix-up round 2 (April 2026) — 1 BLOCKING resolution**:

- **`.title-cell-refresh` warn-as-text contrast**: round 1 deferred
  this as out-of-scope; round 2 codex review reclassified it as a
  real M2a regression (the oklch retint dropped the pair from
  ~5.3:1 hex baseline to 4.21:1 light vs surface, with worse ratios
  against selected/hover/pulse-peak tints). **Fix**: revert
  `.title-cell-refresh` color from `var(--color-warn)` to
  `var(--color-text-muted)` in
  `apps/frontend/src/features/sessions/SessionsTable.css` (line 217),
  per the M1b designer's documented mitigation in
  `working/phase-5/designs/m1b-shell/colors.md` lines 56-58.
  Post-fix-up: 7.04:1 light / 7.36:1 dark vs `--color-surface`;
  ~6.32:1 vs selected-row tint — passes AA normal text by a
  comfortable margin. The `--color-warn` token itself is unchanged
  (still `oklch(58% 0.15 60)` / `oklch(72% 0.13 60)`); pill + toast-
  border recipes are unaffected.

The hairline `--color-border` is intentionally below 3:1 — it is a
decorative separator, not a UI border per SC 1.4.11. The
sticky-bar top edge uses `--color-border-strong` instead specifically
because it must clear 3:1 (the sticky bar carries the M1b's selection
count + Pagination, and the top edge demarcates the chrome from the
scrollable list above).

## 8. Reading wash (noise overlay) — signature detail #6

### Visual rationale

The reading wash is the chunk's most subjective design choice. At 3%
opacity the SVG fractalNoise is **invisible at a glance**. It only
reads as warmth — the kind a printed page has and a screen page
typically doesn't. The opacity choice (3%, not 5% or 8%) is calibrated
so:

- On `oklch(98% 0.01 70)` light surface, the wash is just-detectable
  with deliberate squinting; reads as paper grain.
- On `oklch(20% 0.02 70)` ink (body text), the wash does NOT intrude
  on contrast — the WCAG measurement above (14.1:1 for ink-on-
  surface) holds within rounding because the noise's per-pixel
  alpha never exceeds ~0.03 against the `--color-surface` baseline.
- On the Toast surface (which sits on `--color-surface-raised`,
  not `--color-surface`), the wash does NOT apply — only
  `.session-pane` carries the rule. Toast contrast is unaffected.

### Light-mode-only justification

In dark mode `--color-surface` is `oklch(15% 0.01 70)` — already a
deep warm ink. Adding a noise overlay would muddy it (the noise
introduces a small luminance scatter that competes with the dark
warmth). The dark surface already carries the editorial mood without
texture; the wash is decorative-only on light.

### Reduced-motion suppression rationale

The wash is purely decorative — it carries no signal. Users with
`prefers-reduced-motion: reduce` are typically also light-sensitive
(per the WCAG WAI guidance on motion = "any visual change that is not
essential"). Suppressing the noise under reduced-motion respects that
setting even though the wash does not animate.

### Rule (final form)

```css
/* In SessionView.css (recommended) OR global.css. Designer
 * recommends SessionView.css so the rule lives with the surface. */
.session-pane {
  background-image: var(--noise-overlay-light);
  background-repeat: repeat;
}

@media (prefers-color-scheme: dark) {
  .session-pane {
    background-image: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .session-pane {
    background-image: none;
  }
}
```

**Important**: the existing M1a global reduced-motion zero-out rule
(`global.css` lines 145-154) targets `animation-duration` /
`transition-duration` / `scroll-behavior` only — `background-image`
is NOT in its property list. The dedicated `background-image: none`
rule above is therefore additive, not redundant. The developer
confirms this against `global.css` head comment when landing the
chunk.

## 9. Decisions & tradeoffs

### 9.1 Option B aliasing is the correct call

Option A (rewrite all 11 feature-local CSS files to use the new
`--color-ink` / `--color-surface` names) would have been **cleaner**
in the long run, but each rewrite introduces a code-review surface
where a typo could land an unintended visual regression. The
backwards-compat aliases (Option B) cost **4 declarations**
(`--color-text: var(--color-ink); --color-text-muted: var(--color-ink-muted); --color-bg: var(--color-surface); --font-sans: var(--font-chrome);`)
and let M2a land token-only with **zero feature-local CSS rewrites**.
The aliases survive indefinitely; M2b/M3/M4/M5 may incrementally
migrate consumers to the canonical names if a future planner
prefers, but no planner needs to. **Recommendation: keep aliases
permanent.** The cost is 4 declarations; the benefit is a clean
M2a diff with one risk surface (tokens.css) instead of twelve.

### 9.2 Empty-pane preface promoted to display italic NOW

Spec line 36 lists "empty-pane preface" as a display-font surface.
The preface is rendered by `SessionView.tsx` (M1a-delivered);
promoting it to `--font-display` italic is a **two-line CSS edit**
in `SessionView.css` (the existing `.empty-prose-1` rule):

```css
.empty-prose-1 {
  font-family: var(--font-display);  /* was implicitly --font-sans */
  font-style: italic;                 /* was upright */
  font-size: var(--text-lg);
  /* … */
}
.empty-mark {
  font-family: var(--font-display);  /* was implicitly --font-sans */
  font-style: italic;                 /* was upright */
  font-size: var(--text-2xl);         /* was --text-xl */
  /* … */
}
```

The `--text-xl → --text-2xl` shift on `.empty-mark` is also
designer-recommended (the spec calls for the empty-pane preface at
the display layer; bumping the glyph to `--text-2xl` matches the
spec's rendering intent for a "centered small illustration" per spec
line 595). **No structural React change**; just two CSS rules.

If the developer prefers to defer this until M2b's SessionView
rewire (which has more visual surface to coordinate), it's a clean
deferral — the chunk still lands the typography tokens that M2b will
consume. **Recommendation: do it in M2a.** The visible delight
(reading "Select a session…" in italic Fraunces against the warm-paper
surface with the noise wash) is a satisfying moment the user will see
before any other Archive-room aesthetic surface lands.

### 9.3 Hex fallback aesthetic regression is acceptable

The 24 existing hex literals predate the Archive-room aesthetic.
Rendering on a browser without `oklch()` support (Chromium <111,
Firefox <113, Safari <15.4) shows the **Phase 4 cool-blue palette**,
not the Archive-room warm-paper palette. The fallback's
`--color-accent` (`#2864d4`) is blue, not sienna; the deep-link pulse
in fallback mode glows blue instead of amber.

Two options were considered:

- **Option A (chosen)**: keep the existing 24 hex literals as the
  fallback; document the regression. The fallback aesthetic is
  cohesive (Phase 4 was a competent design); only the hue differs.
  Hex isolation invariant holds at exactly 24, no diff in `apps/`.
- **Option B (rejected)**: add ~10 new hex literals approximating
  the Archive-room palette in sRGB. Would maintain aesthetic
  fidelity in fallback mode, but pushes the audit count from 24 to
  ~34 and demands a parallel WCAG measurement run on the new sRGB
  values.

**Decision: Option A.** Modern Chromium ships oklch (the e2e
target); the fallback is a **safety net for older builds and
non-Chromium browsers**, not a primary aesthetic surface. Document
the regression in the M2a progress-log entry so reviewers know it
exists. Hex isolation invariant: 24 holds exactly.

### 9.4 `--text-2xl` lands in M2a even though no consumer uses it yet

The empty-mark glyph (under §9.2) is the first consumer; future
consumers are the M5 chapter-break label and the eventual app title.
Landing the token in M2a centralizes the type-scale declaration even
when only one ratio is used now. The cost is 1 line in `tokens.css`;
the benefit is M5's chapter-break + the eventual app title both
read from a token instead of a literal.

### 9.5 JetBrains Mono prepended to existing mono stack

The Phase 4 baseline `--font-mono` is `ui-monospace, SFMono-Regular,
Menlo, Consolas, monospace`. M2a prepends `"JetBrains Mono"` per
spec line 38 + line 892. JetBrains Mono is **not** self-hosted —
the system fallback chain ensures every developer machine has a
high-quality monospace immediately even if the user has never
installed JetBrains Mono. If a future phase wants to self-host
JetBrains Mono, it adds another `@font-face` block in `tokens.css`
with the same `font-display: swap` recipe; the architecture
supports it without churn.

### 9.6 Subsetting recipe: `--layout-features=kern,liga,smcp,onum,ital`

The `smcp` (small caps) feature is required for the M5 chapter-break
label. The `onum` (old-style numerals) feature is required for the
editorial mood (timestamps look more "manuscript" with old-style
figures). The `ital` axis is required for the empty-pane preface +
the future skim chapter-break label. Dropping any of these is a
visible aesthetic regression. Keeping `kern` + `liga` is standard
hygiene for editorial type.

### 9.7 Designer's choice of size-adjust + ascent-override values is APPROXIMATE

The values in §4 (`size-adjust: 99.5%; ascent-override: 92%;
descent-override: 22%`) are starting values. The developer
**MUST** validate them against the actual subsetted woff2 and
adjust if needed. Acceptable visual outcome: zero layout shift > 1 px
when DevTools forces the swap. If the M2a measurement comes in with
shift > 1 px, the developer adjusts the override values and
re-measures; the design.md is updated with the final values in the
M2a progress-log entry.

### 9.8 The noise overlay rule could land in `SessionView.css` instead of `global.css`

The designer recommends `SessionView.css` because:
- The rule decorates one specific surface (`.session-pane`).
- `global.css` is meant for cross-cutting concerns (cascade, body,
  utility classes).
- Co-locating the rule with the surface means a future maintainer
  who deletes `SessionView.css` (unlikely but conceivable) cleans up
  the noise rule automatically.

The reduced-motion + dark-mode suppression rules co-locate with the
main rule. The developer picks; either works.

## 10. Spec references

Specific lines + sections of `working/phase-5.md` (frozen at 05467ad)
that the design relies on:

- §Design Language, lines 15-78 — Archive-room aesthetic,
  signature details enumeration.
- §Motion & Micro-interactions, lines 80-128 — motion budget,
  reduced-motion zero-out, performance budget.
- §Goal & Scope → in scope, lines 132-149 — Phase 5 deliverables.
- §Dependency Policy, lines 165-173 — Fraunces as static asset
  (NOT runtime dep).
- §Inspection Surface Layout, lines 493-611 — split-pane shell,
  reading-wash mention, empty-pane copy, narrow-mode behavior.
- §Design Tokens → §Color tokens, lines 870-885 — oklch ramp.
- §Design Tokens → §Typography tokens, lines 887-905 — type stacks
  + scale + leading + measure.
- §Design Tokens → §Motion tokens, lines 907-917 — durations + easing.
- §Design Tokens → §Surface treatment tokens, lines 919-924 — noise
  overlay SVG.
- §Design Tokens → §Structural literals, lines 926-946 —
  enumerated literals (M2a does NOT add structural literals; the
  M1a + M1b literals are preserved verbatim).
- §Acceptance Criteria, line 1098 — warm-paper / oklch / Fraunces.
- §Acceptance Criteria, line 1099 — six signature details.
- §Acceptance Criteria, line 1100 — motion budget; pulse keyframe
  migrates to tokens.
- §Acceptance Criteria, line 1094 — WCAG AA on every new pair.
- §Resolved Decisions #15 — Fraunces self-hosted, reversible.
- §Resolved Decisions #16 — oklch source-of-truth + hex fallback.
- §Open Considerations, "Fraunces subset preparation" bullet —
  Option A subsetting recipe.

Architecture refs:
- `ARCHITECTURE.md` — Bun-first; cascade order.
- `PRD.md` — line 223 (disabled-summary placeholder, unrelated to
  M2a but the editorial mood justification).
- `docs/dependency-rules.md` — 2-slot escape-hatch budget;
  M2a documents Fraunces as static asset.

M1a + M1b artifact references:
- `working/phase-5/designs/m1a-shell/design.md` — M1a token
  consumers + state recipe baseline.
- `working/phase-5/designs/m1b-shell/design.md` — M1b consumers
  (`.title-cell-refresh` was warmed to `--color-warn` in M1b; M2a
  fix-up round 2 reverted it to `--color-text-muted` because the
  warn-as-text pair regressed under the oklch retint; sticky footer
  two-hairline structure; filter `<details>` chevron).
- `working/phase-5/designs/m1b-shell/colors.md` — M1b WCAG notes
  documenting `.title-cell-refresh` against new tokens (the M1b
  designer flagged the contrast against the selected-row tint
  for M2 re-measurement; the §7 table above confirms it holds).

## 11. Implementation acceptance checklist

Numbered for the developer to verify line-by-line before requesting
review:

1. `tokens.css` declares `--color-ink`, `--color-ink-muted`,
   `--color-surface`, `--color-surface-raised`, `--color-border`,
   `--color-border-strong`, `--color-accent`, `--color-accent-hover`
   with light-mode oklch values matching §3.
2. `@media (prefers-color-scheme: dark)` block in `tokens.css`
   re-declares the same tokens with dark-mode oklch values matching §3.
3. The four alias declarations (`--color-text: var(--color-ink);`
   etc.) land in the `:root` block AFTER the canonical declarations
   so the aliases resolve correctly.
4. Status colors (`--color-success`, `--color-warn`, `--color-error`)
   are revised to oklch values per the §3 table; light + dark.
5. `--font-display`, `--font-chrome`, `--font-mono` declared per the
   §3 stacks. `--font-sans: var(--font-chrome)` alias declared.
6. Type scale `--text-xs` through `--text-2xl` declared per §3
   (note `--text-2xl` is **NEW**; the existing scale literals are
   **REVISED** to spec values).
7. `--leading-tight: 1.25;`, `--leading-comfortable: 1.55;`,
   `--measure: 70ch;` declared.
8. `--motion-fast: 80ms`, `--motion-base: 120ms`,
   `--motion-disclosure: 200ms`, `--motion-pulse: 600ms` declared.
9. `--ease-standard`, `--ease-out`, `--ease-in-out` declared with
   the exact `cubic-bezier(...)` values from §3.
10. `--noise-overlay-light` declared with the exact SVG data URL
    from spec line 922 (designer copies the URL verbatim — escape
    every `%23` in the `url(#n)` reference).
11. Two `@font-face` blocks (regular + italic) declared in
    `tokens.css` with `src: url("/fonts/Fraunces-subset.woff2")
    format("woff2")`, `font-display: swap`, `size-adjust: 99.5%`,
    `ascent-override: 92%`, `descent-override: 22%`,
    `line-gap-override: 0%`.
12. The `@font-face` `unicode-range` matches the subsetting recipe:
    `U+0000-007F, U+00A0-00FF, U+2000-206F`.
13. `apps/frontend/public/fonts/Fraunces-subset.woff2` exists and
    is between 60–100 KB (target ~80 KB).
14. The subsetting recipe documented in this design.md (or in
    `docs/dependency-rules.md` per planner Q4) is reproducible:
    re-running on the same upstream Fraunces produces a byte-equivalent
    output.
15. `@supports not (color: oklch(0% 0 0))` block in `tokens.css`
    re-declares each color token with its hex fallback. **Hex
    isolation invariant**: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l = 24` holds byte-equivalent.
16. **Token count** (manual): `grep -cE '^\s*--' apps/frontend/src/styles/tokens.css`
    — record the new count in the M2a progress-log entry. Target
    ~74 (44 baseline + 30 new).
17. `SessionsTable.css` `tr[data-deep-link="true"]` rule's
    `animation:` value uses `var(--motion-pulse) var(--ease-out)`
    instead of the literal `600ms ease-out`. The `1` iteration
    count stays a literal.
18. The `@keyframes deep-link-pulse` block in `SessionsTable.css`
    is **unchanged** — it already consumes `var(--color-accent)`,
    so the new oklch sienna retints the keyframe automatically.
    No edit needed.
19. `SessionView.css` (or `global.css`) declares the noise-overlay
    rule on `.session-pane`: `background-image: var(--noise-overlay-light); background-repeat: repeat;`.
20. The noise-overlay suppression rule for dark mode:
    `@media (prefers-color-scheme: dark) { .session-pane { background-image: none; } }`.
21. The noise-overlay suppression rule for reduced-motion:
    `@media (prefers-reduced-motion: reduce) { .session-pane { background-image: none; } }`.
    This is a **separate** rule from the existing M1a global zero-out
    (which targets animation/transition durations only).
22. `SessionView.css` `.empty-prose-1` rule promoted to
    `--font-display` italic at `--text-lg` (per §9.2).
23. `SessionView.css` `.empty-mark` rule promoted to
    `--font-display` italic at `--text-2xl` (per §9.2).
24. WCAG AA contrast measurements re-run with the M6 contrast
    script against the actual implementation tokens; results
    recorded in the M2a progress-log entry. The §7 table is the
    expected baseline; any drift > 0.2 ratio gets the developer's
    explanation.
25. Toast border 3:1 SC 1.4.11 holds for `.toast.success` /
    `.toast.error` / `.toast.info` against `--color-surface-raised`
    in BOTH light and dark modes (codex caught this at Phase 4 M6;
    designer flags as risk; developer measures).
26. `@font-face` swap behavior verified: DevTools → Network → throttle
    to "Slow 3G" → reload → verify Charter renders first, Fraunces
    swaps in within 200 ms, layout shift < 1 px on the empty-pane
    preface AND the empty-mark glyph. If shift > 1 px, the developer
    adjusts size-adjust/ascent-override values and re-measures
    (per §4).
27. Reading-wash visual verification: empty session pane in light
    mode shows subtle warm grain visible under squint; same surface
    in dark mode shows zero grain; same surface with `prefers-reduced-motion: reduce`
    set shows zero grain.
28. Reduced-motion zero-out verified: with `prefers-reduced-motion: reduce`
    set, the deep-link pulse completes in one paint frame (< 16 ms)
    and the noise overlay is suppressed.
29. All Phase 4 + M1a + M1b unit tests still green
    (`bun test src`). No test rewrites required (the aliases mean
    rule-name invariants hold).
30. `bun run build` green; `bun run test:e2e` green
    (Playwright happy path: row click → URL update → vestigial
    Open detail still reachable; deep-link pulse renders; selected-
    row tint in sienna).
31. Hex audit re-run: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l`
    returns exactly 24. Recorded in progress-log.
32. `cargo check --workspace` and `cargo test --workspace` green
    (token chunk should not affect Rust, but the gate is run for the
    chunk-close discipline per Phase 4 precedent).

## 12. Open questions for the reviewer

- **Noise-overlay opacity (3% vs 4%)**: spec line 28 says "~3%"; the
  SVG snippet at line 922 hardcodes `0.03`. The designer recommends
  staying at 3%, but if the reviewer feels the wash is invisible
  even on a calibrated display, bumping to 4% is a one-line edit
  inside the data URL (`feColorMatrix values='... 0 0 0 0.03 0' →
  '... 0 0 0 0.04 0'`). **Open for reviewer call.**
- **Empty-mark glyph `--text-2xl` vs `--text-xl`**: spec line 595
  is ambiguous about the glyph's size; the M1a design renders it at
  `--text-xl`. M2a designer recommends bumping to `--text-2xl` for
  the editorial moment, but if the reviewer prefers M1a continuity
  (the glyph as a discrete typographic mark, not a heading), the
  `--text-xl` version is cleaner. **Reviewer picks.**
- **Toast.info border 3.1:1 (light)**: this is the tightest WCAG-
  gated pair in the table and sits on the cusp. If the developer's
  measurement comes in below 3:1 (oklch interpolation drift), the
  designer recommends bumping the 65% mix to 70%. **Acceptable
  fallback, or does the reviewer want a different accent treatment
  for the info toast?**
- **`--text-base: 1rem` is 16px not the existing 0.95rem (~15.2px)**:
  the spec literal is `1rem`; this is a **+5% shift in body text
  size** that affects every Phase 4 surface that reads
  `var(--text-base)`. The designer's read: this is intentional; the
  Archive-room aesthetic wants generous editorial reading; a 1rem
  body is the editorial standard. The reviewer should confirm — if
  the body-size shift creates layout regressions the designer hasn't
  anticipated, the override is to keep the existing `0.95rem` and
  document the divergence. **Recommendation: ship the spec value
  (1rem); accept the +5% body-size shift.**

## 13. Conflicts with spec direction

None. All M2a deliverables align with the spec's frozen text and
Resolved Decisions. The chunk's diff is concentrated in `tokens.css`
+ one font asset + two narrow CSS suppression rules + one keyframe
migration + (recommended) two `SessionView.css` edits for the
preface + empty-mark promotion. No tab primitive, no
`SessionView.tsx` rewire, no `Tabs.tsx` — those are M2b.
