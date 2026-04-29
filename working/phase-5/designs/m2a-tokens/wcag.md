# M2a WCAG AA contrast verification

This is the comprehensive contrast table for every visible
foreground/background pair the M1a + M1b consumers depend on, under
the new oklch ramp. Ratios are now **codex-measured** (not designer-
estimated): the M2a fix-up round 1 ran a Python WCAG 2.1 contrast
script that converts each oklch value via the canonical
oklch → oklab → linear sRGB → sRGB → relative luminance pipeline
and computes `((L1 + 0.05) / (L2 + 0.05))` for every pair. The
designer's original CIE2000-anchored estimates were optimistic —
codex's numerical computation is authoritative and what now lands
in this artifact.

## Pass / fail table

WCAG AA gates: **4.5:1** for normal text (< 18 pt or < 14 pt bold),
**3:1** for large text and non-text UI components (SC 1.4.11). Every
text pair below is treated as normal text unless explicitly noted as
"large".

The values reflect the post-fix-up oklch ramp:
- `--color-accent` light = `oklch(55% 0.15 50)` (was `60%` pre-fix-up;
  codex measured the original at 3.93:1 vs surface — failed AA text).
- `--color-border-strong` light = `oklch(65% 0.02 70)` (was `70%`;
  codex measured original at 2.53:1 — failed SC 1.4.11).
- `--color-border-strong` dark = `oklch(48% 0.02 70)` (was `40%`;
  codex measured original at 2.13:1 — failed SC 1.4.11).
- `--color-accent` dark stays at `oklch(65% 0.15 50)` (codex did not
  flag dark accent; verified 5.78:1 vs surface, 5.52:1 vs surface-
  raised — both clear AA).

### Light mode

| #  | Foreground                                          | Background                                       | Ratio   | Verdict             |
|----|-----------------------------------------------------|--------------------------------------------------|---------|---------------------|
| 01 | `--color-ink`                                       | `--color-surface`                                | 17.10:1 | AAA · normal        |
| 02 | `--color-ink-muted`                                 | `--color-surface`                                | 7.04:1  | AAA · normal        |
| 03 | `--color-ink`                                       | `--color-surface-raised`                         | 16.13:1 | AAA · normal        |
| 04 | `--color-ink-muted`                                 | `--color-surface-raised`                         | 6.64:1  | AAA · normal        |
| 05 | `--color-ink`                                       | row hover (4% ink mix)                           | 15.79:1 | AAA · normal        |
| 06 | `--color-ink`                                       | row selected (8% accent mix)                     | 15.36:1 | AAA · normal        |
| 07 | `--color-ink`                                       | row deep-link pulse peak (22% accent mix)        | 12.62:1 | AAA · normal        |
| 08 | `--color-warn` (no longer used as text — was `.title-cell-refresh`; reverted to `--color-text-muted` in fix-up round 2) | `--color-surface`                                | 4.21:1 (informational) | not consumed as text post round 2 |
| 09 | `--color-warn` (informational; not consumed as text post round 2)              | row selected tint                                | 3.79:1 (informational) | not consumed as text post round 2 |
| 08b | `.title-cell-refresh` italic (`--color-text-muted`)                  | `--color-surface`                                | 7.04:1  | AAA · normal        |
| 09b | `.title-cell-refresh` italic (`--color-text-muted`)                  | row selected tint (8% accent mix)                | ~6.32:1 | AAA · normal        |
| 09c | `.title-cell-refresh` italic (`--color-text-muted`)                  | selected+hover tint (12% accent mix)             | ~6.05:1 | AAA · normal        |
| 09d | `.title-cell-refresh` italic (`--color-text-muted`)                  | deep-link pulse peak (22% accent mix)            | ~5.40:1 | AAA · normal        |
| 10 | `--color-accent` (text use, post fix-up L=55)       | `--color-surface`                                | 4.84:1  | AA · normal         |
| 10b | `--color-accent` (text use, post fix-up L=55)      | `--color-surface-raised`                         | 4.57:1  | AA · normal         |
| 11 | up-to-date pill fg (success 70% mix on ink)         | up-to-date pill bg (success 15% mix on surface)  | 6.69:1  | AAA · normal        |
| 12 | not-stored pill fg (accent 70% mix on ink)          | not-stored pill bg (accent 15% mix on surface)   | 5.95:1  | AAA · normal        |
| 13 | outdated pill fg (warn 70% mix on ink)              | outdated pill bg (warn 15% mix on surface)       | 5.43:1  | AAA · normal        |
| 14 | source-missing pill fg (error 70% mix on ink)       | source-missing pill bg (error 15% mix on surface)| 6.60:1  | AAA · normal        |
| 15 | `.toast.success` border (65% mix)                   | `--color-surface-raised`                         | 3.34:1  | SC 1.4.11           |
| 16 | `.toast.error` border (65% mix)                     | `--color-surface-raised`                         | 3.53:1  | SC 1.4.11           |
| 17 | `.toast.info` border (70% mix, post fix-up)         | `--color-surface-raised`                         | 3.22:1  | SC 1.4.11           |
| 18 | `--color-border-strong` (post fix-up L=65)          | `--color-surface`                                | 3.06:1  | SC 1.4.11           |
| 19 | `--color-border` (decorative)                       | `--color-surface`                                | 1.49:1  | not-gated           |
| 20 | empty-pane preface (display italic on `--color-ink`)| session-pane (surface + 3% noise)                | ~17.0:1 | AAA · normal        |
| 21 | `--color-ink-muted` (Open detail resting)           | `--color-surface`                                | 7.04:1  | AAA · normal        |

### Dark mode

| #  | Foreground                                          | Background                                       | Ratio   | Verdict             |
|----|-----------------------------------------------------|--------------------------------------------------|---------|---------------------|
| 01 | `--color-ink`                                       | `--color-surface`                                | 15.52:1 | AAA · normal        |
| 02 | `--color-ink-muted`                                 | `--color-surface`                                | 7.36:1  | AAA · normal        |
| 03 | `--color-ink`                                       | `--color-surface-raised`                         | 14.84:1 | AAA · normal        |
| 04 | `--color-ink-muted`                                 | `--color-surface-raised`                         | 7.03:1  | AAA · normal        |
| 05 | `--color-ink`                                       | row hover (4% ink mix)                           | 14.56:1 | AAA · normal        |
| 06 | `--color-ink`                                       | row selected (8% accent mix)                     | 14.41:1 | AAA · normal        |
| 07 | `--color-ink`                                       | row deep-link pulse peak (22% accent mix)        | 11.83:1 | AAA · normal        |
| 08 | `--color-warn`                                      | `--color-surface`                                | 7.68:1  | AAA · normal        |
| 09 | `--color-warn`                                      | row selected tint                                | 7.13:1  | AAA · normal        |
| 10 | `--color-accent`                                    | `--color-surface`                                | 5.78:1  | AAA · normal        |
| 10b | `--color-accent`                                   | `--color-surface-raised`                         | 5.52:1  | AAA · normal        |
| 11 | up-to-date pill                                     | up-to-date pill bg                               | 6.94:1  | AAA · normal        |
| 12 | not-stored pill                                     | not-stored pill bg                               | 6.62:1  | AAA · normal        |
| 13 | outdated pill                                       | outdated pill bg                                 | 7.74:1  | AAA · normal        |
| 14 | source-missing pill                                 | source-missing pill bg                           | 6.91:1  | AAA · normal        |
| 15 | `.toast.success` border (65% mix)                   | `--color-surface-raised`                         | 3.55:1  | SC 1.4.11           |
| 16 | `.toast.error` border (65% mix)                     | `--color-surface-raised`                         | 3.60:1  | SC 1.4.11           |
| 17 | `.toast.info` border (70% mix)                      | `--color-surface-raised`                         | 3.62:1  | SC 1.4.11           |
| 18 | `--color-border-strong` (post fix-up L=48)          | `--color-surface`                                | 3.00:1  | SC 1.4.11 (cusp)    |
| 19 | `--color-border`                                    | `--color-surface`                                | 1.35:1  | not-gated           |

## Codex fix-up round 2 closure (April 2026)

Round 2 codex review caught **1 BLOCKING finding** that round 1 had
deferred as "out-of-scope":

- **`.title-cell-refresh` consumed `--color-warn` directly as
  normal-size text**. The M2a oklch retint regressed the warn-as-text
  pair vs `--color-surface` from ~5.3:1 (Phase 4 hex `#b86b07` on
  `#ffffff`) to **4.21:1** (`oklch(58% 0.15 60)` on
  `oklch(98% 0.005 250)`) — fails AA 4.5:1. Worse against the row-
  state tints: 3.79:1 selected, lower under selected+hover and the
  deep-link pulse peak.
  - **Fix**: revert `.title-cell-refresh` color from
    `var(--color-warn)` to `var(--color-text-muted)` in
    `apps/frontend/src/features/sessions/SessionsTable.css:217`.
    No token values changed.
  - **Post-fix-up**: 7.04:1 vs surface (light), 7.36:1 (dark);
    ~6.32:1 vs selected tint; all PASSES AA normal text. The
    M1b designer documented this exact mitigation in
    `working/phase-5/designs/m1b-shell/colors.md` lines 56-58 —
    "the swap is a single token". The `--color-warn` token itself
    stays at `oklch(58% 0.15 60)` (light) / `oklch(72% 0.13 60)`
    (dark); pill + toast-border consumers (rows 13, 17) are
    unaffected.

## Codex fix-up round 1 closure (April 2026)

Three codex BLOCKING findings were resolved by adjusting two oklch
tokens. Verbatim post-fix-up measurements:

- **Finding 1**: `.toast.info` border (70% mix(`--color-accent`,
  `--color-border`)) vs `--color-surface-raised`.
  - Pre-fix-up (accent L=60): **2.79:1** — failed SC 1.4.11.
  - Post-fix-up (accent L=55): **3.22:1** — passes.
- **Finding 2**: `--color-accent` as normal-size text (`.action-bar-clear`,
  `.toast-details summary`).
  - Pre-fix-up vs surface: 3.93:1 — failed AA. Vs surface-raised: 3.71:1.
  - Post-fix-up vs surface: **4.84:1** — passes. Vs surface-raised: **4.57:1**.
- **Finding 3**: `--color-border-strong` vs `--color-surface`.
  - Pre-fix-up light (L=70): 2.53:1 — failed SC 1.4.11.
  - Post-fix-up light (L=65): **3.06:1** — passes.
  - Pre-fix-up dark (L=40): 2.13:1 — failed SC 1.4.11.
  - Post-fix-up dark (L=48): **3.00:1** — passes (on the cusp;
    documented for the next codex round).

## Risk callouts

### Resolved

- **`.title-cell-refresh` warn-as-text contrast** (was 4.21:1 light
  vs surface; failed AA 4.5:1 normal text). Codex round-2 BLOCKING
  finding. **Resolved in M2a fix-up round 2**: reverted
  `.title-cell-refresh` from `var(--color-warn)` to
  `var(--color-text-muted)` per the M1b designer's optional
  recommendation in `working/phase-5/designs/m1b-shell/colors.md`
  lines 56-58. Post-fix: 7.04:1 light / 7.36:1 dark vs surface;
  ~6.32:1 vs selected-row tint (8%); ~6.05:1 vs selected+hover
  tint (12%); ~5.40:1 vs deep-link pulse peak (22%) — all pass
  AA normal text by a comfortable margin in both modes. The
  `--color-warn` token itself is unchanged (`oklch(58% 0.15 60)`
  light / `oklch(72% 0.13 60)` dark); the warn pill + warn toast
  border recipes still consume warn through mixes that already
  passed (rows 13, 17 in light; rows 13, 17 in dark). The semantic
  loss is small: the `(refresh)` marker no longer reads as
  "warning sienna" but as "muted gray italic" — the M1b designer
  approved this back-out path.

### Outstanding (accepted risk)

- **Dark `--color-border-strong` at 3.00:1** sits on the cusp. The
  oklch L=48 was codex's recommended target; my measurement reads
  3.0036 which rounds to 3.00. If a future codex round tightens the
  rounding it may flag this as "below 3:1 by 0.004" — pre-emptive
  mitigation is to bump dark `--color-border-strong` to
  `oklch(50% 0.02 70)` (lifts to ~3.18:1). **Round 2 disposition**:
  accepted-risk — bumping the token would ripple into the sticky-bar
  top edge + filter `<details>` chevron border recipes and demand a
  re-measure across both modes; left for a future round if codex
  tightens the rounding rule.

## Table-row hover/select stack-up

The M1a row state recipe stacks hover, selection, and pulse tints in
predictable layers. The §6 + §7 deep-link-pulse-peak measurement
(12.62:1 light / 11.83:1 dark for `--color-ink` against the pulse
peak) is the WORST-CASE moment in the row's animation — the brief
0% keyframe instant when the accent tint is at 22% mix. Even at this
peak the body text clears AAA in both modes. **No change needed
to the M1a + M1b row state recipe under M2a.**

## Hairline visibility (decorative, not WCAG-gated)

`--color-border` against `--color-surface` lands at 1.49:1 (light) /
1.35:1 (dark). Below WCAG floors, but this is intentional — the
hairline is a decorative separator, not a UI border per SC 1.4.11.
The Archive-room aesthetic specifically wants "hairline over shadow"
(spec line 25), and a hairline that clears 3:1 reads as a heavy
divider rather than a quiet line.

The sticky-bar top edge uses `--color-border-strong` (3.06:1 light /
3.00:1 dark, post fix-up) — that pair MUST clear 3:1 because the
sticky bar is a chrome surface separator that demarcates the action
bar from the scrolling list above it.

## Automated re-measurement

The Phase 5 / M2a contrast script lives at `/tmp/wcag_check.py`
during the fix-up round (one-off measurement tool, not committed to
the repo per Resolved Decision #16's "no third runtime dep" rule).
The script:
1. Hardcodes the post-fix-up oklch values for every M2a token.
2. Converts each oklch value to sRGB via the canonical CSS Color L4
   formula (~30 lines of inline math; no `culori` dep).
3. For each pair in the table above, computes the WCAG 2.1 contrast
   ratio: `((L1 + 0.05) / (L2 + 0.05))`.
4. Emits a Markdown-style summary.

The script was run once during M2a fix-up round 1 to produce the
authoritative ratios above. Re-run only if a future round changes
oklch tokens.

## Hex fallback contrast (`@supports not (color: oklch(0% 0 0))`)

The fallback layer's `--color-border-strong` was lifted in tandem
with the oklch fix to keep parity:
- Light hex `#8a909c` vs `#f8f9fb` surface: **3.04:1** (passes 3:1).
- Dark hex `#5e6571` vs `#151821` surface: **3.02:1** (passes 3:1).

Pre-fix-up the hex fallbacks (`#c8ccd4` light / `#3a404d` dark) were
1.53:1 / 1.71:1 — failing 3:1. The fallback layer therefore now
clears WCAG SC 1.4.11 in addition to the oklch primary layer. The
remaining 22 hex literals are unchanged (Phase 4 cool-blue
aesthetic; documented regression per design.md §9.3).
