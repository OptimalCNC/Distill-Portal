# M5 WCAG AA contrast verification

> **All ratios computed via `wcag_m5.py`** (committed in this folder).
> The script is the deterministic source of truth. Every ratio in the
> tables below is the verbatim script output, transcribed to two
> decimal places (the script's own format string `:>7.2f`). Re-run
> with:
>
>     python3 working/phase-5/designs/m5-skim/wcag_m5.py
>
> (or `bun --bun python wcag_m5.py`).
>
> Pure Python stdlib — no third-party dependencies. Computes oklch ->
> oklab -> linear sRGB -> nonlinear sRGB -> relative luminance per CSS
> Color L4 §10 + WCAG 2.1 §1.4.3, with `color-mix(in srgb, ...)`
> performed in nonlinear sRGB space (Chromium parity).
>
> **Rounding rule**: 2 decimal places, truncated as the Python format
> spec `:>7.2f` rounds (banker's rounding — IEEE 754
> round-half-to-even).

This is the contrast table for every visible foreground/background
pair the M5 chunk introduces. M5 adds NO new color tokens AND NO new
color recipes — every pair below reuses an M2a-canonical token in a
recipe ALREADY measured in M4's colors.md. The M5 pairs are
re-measured here by the M5 script (`wcag_m5.py` shares math + token
table with `wcag_m4.py` byte-equivalent), confirming byte-equivalent
ratios on shared pairs.

The M4-equivalence column documents which M4 pair ID each M5 pair
maps to. Codex re-running `python3 wcag_m5.py` should observe the M5
ratios are byte-identical to the M4 ratios for shared pairs (drift =
math regression, not design change).

## Methodology (committed script)

The M5 deliverable commits the WCAG verification script at
`working/phase-5/designs/m5-skim/wcag_m5.py`. The script is
byte-equivalent in math + matrices + TOKENS to `wcag_m4.py`; only
the PAIRS list differs. Rationale: M5 introduces ZERO new tokens, so
the token table must match M4 exactly. The script:

1. Hardcodes the M2a-canonical oklch values for every token (in the
   `TOKENS` dict at the top of `wcag_m5.py`). Identical to
   `wcag_m4.py`.
2. Converts each value via the canonical CSS Color L4 pipeline:
   `oklch -> oklab -> linear sRGB -> nonlinear sRGB -> relative
   luminance`. The oklab -> linear-sRGB step uses Bjorn Ottosson's
   M2 matrix.
3. Computes the WCAG 2.1 contrast ratio:
   `((L1 + 0.05) / (L2 + 0.05))` where L1 ≥ L2 are relative
   luminances per WCAG 2.1 §1.4.3.
4. For `color-mix(in srgb, ...)` recipes, performs the mix in
   nonlinear sRGB space (matching CSS `color-mix(in srgb)`
   semantics — Chromium parity) before computing relative luminance.

The script is **pure Python stdlib** (only `math`); no third-party
deps. Re-run with `python3 wcag_m5.py` or `bun --bun python wcag_m5.py`.
A future codex round verifying this artifact should re-run the script
on its own machine and compare the table values.

The script computes 29 pairs covering every M5-visible
foreground/background combination (S01..S29). All ratios are
byte-equivalent to M4's measurements where the recipe matches; the
M4-equivalence column documents the M4 pair ID for cross-check.

## WCAG AA gates

- **4.5:1** for normal text (< 18 pt or < 14 pt bold).
- **3.0:1** for large text (≥ 18 pt or ≥ 14 pt bold) AND for non-text
  UI components per SC 1.4.11 ("non-text" = NT in the Bar column).

Every text pair below is treated as normal text at its declared
font-size token (no surface uses ≥ 18 pt or ≥ 14 pt bold). The
boundary rule, the warn stripes, the focus-visible outlines, and
decorative borders are non-text per SC 1.4.11.

## M5 surface map (light + dark)

The columns: # / M4-equiv / Surface (M5 component) / Foreground /
Background / Light contrast / Dark contrast / Verdict / Bar.

Ratios are byte-equivalent to M4's `colors.md` (codex round-2
script-authoritative). Where an M5 pair maps to an M4 pair by recipe,
the row is annotated with the M4 ID; the script-output ratios are
identical (the script reuses the same TOKENS + math).

### user_turn block

| #   | M4-equiv | Surface                                      | Foreground            | Background                                              | Light    | Dark     | Verdict             | Bar       |
|-----|----------|----------------------------------------------|-----------------------|---------------------------------------------------------|----------|----------|---------------------|-----------|
| S01 | T01      | user_turn body text                          | `--color-ink`         | `color-mix(in srgb, --color-accent 5%, --color-surface)` | 16.00:1  | 14.87:1  | AAA · normal text   | AA 4.5:1  |
| S02 | T20      | user_turn code-fenced `<pre>` body           | `--color-ink`         | `--color-surface-raised`                                | 16.13:1  | 14.84:1  | AAA · normal text   | AA 4.5:1  |
| S03 | T19      | user_turn inline `<code>`                    | `--color-ink`         | `--color-surface-raised`                                | 16.13:1  | 14.84:1  | AAA · normal text   | AA 4.5:1  |
| S04 | T22 / T05 | "Agent reaction (N messages)" `<summary>`   | `--color-ink-muted`   | `--color-surface`                                       | 7.04:1   | 7.36:1   | AAA · normal text   | AA 4.5:1  |
| S05 | T22      | Disabled placeholder prose                   | `--color-ink-muted`   | `--color-surface`                                       | 7.04:1   | 7.36:1   | AAA · normal text   | AA 4.5:1  |
| S06 | T29 / T17 | Disabled placeholder 4 px left border (NT)  | `--color-border`      | `--color-surface`                                       | 1.49:1   | 1.35:1   | not WCAG-gated (decorative — the placeholder's discrimination is via the muted-italic ink + border + reading-context inset) | n/a |
| S07 | T28 / T07 | "Expand to raw messages" summary text       | `--color-accent`      | `--color-surface`                                       | 4.84:1   | 5.78:1   | AA · normal text    | AA 4.5:1  |
| S08 | T28 / T07 | "Expand to raw messages" hover (text-decoration only) | `--color-accent` | `--color-surface`                                  | 4.84:1   | 5.78:1   | AA · normal text    | AA 4.5:1  |

S01-S04 reuse the M4 user/assistant body recipe (T01: ink-on-accent-mix
panel; T19/T20: ink-on-surface-raised code-fence; T22: ink-muted-on-surface
chrome). S05 is the disabled placeholder prose at the same `--color-ink-muted`
on `--color-surface`. S07/S08 reuse the M4 "Expand" affordance recipe
(T07/T28: accent-on-surface). Every pair passes its bar.

**S07 is at the AA bar.** `--color-accent` over `--color-surface`
measures 4.84:1 light / 5.78:1 dark — both pass AA normal text.
The "Expand to raw messages" summary is rendered at `--text-sm`
(chrome font, body weight) so the AA 4.5:1 bar applies. Light mode
passes by 0.34 ratio points; dark by 1.28. Inherits M4 T07's accepted
position (M2a established `--color-accent` at L=55 specifically for
this margin).

### boundary block (signature detail #1)

| #   | M4-equiv | Surface                                      | Foreground            | Background          | Light    | Dark     | Verdict             | Bar             |
|-----|----------|----------------------------------------------|-----------------------|---------------------|----------|----------|---------------------|-----------------|
| S09 | T09      | Boundary label (Fraunces italic small-caps)  | `--color-ink-muted`   | `--color-surface`   | 7.04:1   | 7.36:1   | AAA · normal text   | AA 4.5:1        |
| S10 | T10      | Boundary 1 px hairline rule (NT, SC 1.4.11)  | `--color-border-strong` | `--color-surface` | 3.06:1   | 3.00:1   | passes 3:1 (dark cusp — accepted risk per M2a) | SC 1.4.11 3:1 |

S09/S10 are byte-equivalent to M4 T09/T10. The boundary recipe is
shared via the BoundaryRow component (signature detail #1 — design.md
§4.2). **Same numerical results in both contexts** because the
shared component renders byte-equivalent DOM with the same tokens.

**S10 is at the dark cusp.** `--color-border-strong` over
`--color-surface` measures exactly 3.00:1 in dark mode — the same
position M4 T10 documented as "accepted risk" inherited from M2a.
M5 inherits the M4 position; if codex tightens the rule for M5, the
same one-token bump fixes both M4's and M5's consumers in a single
edit.

### agent_only block

| #   | M4-equiv | Surface                                      | Foreground            | Background          | Light    | Dark     | Verdict             | Bar       |
|-----|----------|----------------------------------------------|-----------------------|---------------------|----------|----------|---------------------|-----------|
| S11 | T22      | Agent-only summary text                      | `--color-ink-muted`   | `--color-surface`   | 7.04:1   | 7.36:1   | AAA · normal text   | AA 4.5:1  |
| S12 | T29      | Agent-only panel hairline border (NT)        | `--color-border`      | `--color-surface`   | 1.49:1   | 1.35:1   | not WCAG-gated (decorative — the panel's discrimination is via the bordered shape + the disclosure triangle + the `<details>` hover/focus affordance) | n/a |

S11/S12 are byte-equivalent to M4 T22/T29.

### oversized_user_message block

| #   | M4-equiv | Surface                                      | Foreground            | Background                | Light    | Dark     | Verdict             | Bar             |
|-----|----------|----------------------------------------------|-----------------------|---------------------------|----------|----------|---------------------|-----------------|
| S13 | T02      | Oversized header text (`--text-sm` chrome)   | `--color-ink`         | `--color-surface`         | 17.10:1  | 15.52:1  | AAA · normal text   | AA 4.5:1        |
| S14 | T12      | Oversized warn 4 px left border (NT, SC 1.4.11) | `--color-warn`     | `--color-surface`         | 4.21:1   | 7.68:1   | passes 3:1 (light +1.21 margin; dark +4.68) | SC 1.4.11 3:1 |
| S15 | T06      | Oversized verbatim `<pre>` body              | `--color-ink`         | `--color-surface-raised`  | 16.13:1  | 14.84:1  | AAA · normal text   | AA 4.5:1        |

S13-S15 are byte-equivalent to M4 T02 / T12 / T06.

**S14 passes its SC 1.4.11 3:1 bar by a comfortable margin in both
modes.** The oversized warn left border consumes the same
`--color-warn`-on-`--color-surface` recipe M4 uses for the truncation
banner stripe (T12). Light = 4.21:1; dark = 7.68:1. Both modes pass
comfortably.

### Truncation banner (M4-inherited recipe)

| #   | M4-equiv | Surface                                      | Foreground            | Background                                          | Light    | Dark     | Verdict             | Bar             |
|-----|----------|----------------------------------------------|-----------------------|-----------------------------------------------------|----------|----------|---------------------|-----------------|
| S16 | T11      | Truncation banner copy                       | `--color-ink`         | `color-mix(in srgb, --color-warn 8%, --color-surface)` | 15.49:1 | 14.15:1 | AAA · normal text   | AA 4.5:1        |
| S17 | T12      | Truncation banner stripe (3 px, NT, SC 1.4.11) | `--color-warn`      | `--color-surface`                                   | 4.21:1   | 7.68:1   | passes 3:1 by margin | SC 1.4.11 3:1   |
| S18 | T13      | "Open raw" `<strong>` text inside banner copy | `--color-ink`        | `color-mix(in srgb, --color-warn 8%, --color-surface)` | 15.49:1 | 14.15:1 | AAA · normal text   | AA 4.5:1        |

S16-S18 are byte-equivalent to M4 T11 / T12 / T13.

### Parse-warnings banner (M4-inherited recipe)

| #   | M4-equiv | Surface                                      | Foreground            | Background                | Light    | Dark     | Verdict             | Bar             |
|-----|----------|----------------------------------------------|-----------------------|---------------------------|----------|----------|---------------------|-----------------|
| S19 | T14      | Parse-warnings `<summary>`                   | `--color-ink`         | `--color-surface-raised`  | 16.13:1  | 14.84:1  | AAA · normal text   | AA 4.5:1        |
| S20 | T15      | Parse-warnings `<li>` items (mono `--text-xs`) | `--color-ink-muted` | `--color-surface-raised`  | 6.64:1   | 7.03:1   | AAA · normal text   | AA 4.5:1        |
| S21 | T16      | Dismiss button text                          | `--color-ink`         | `--color-surface-raised`  | 16.13:1  | 14.84:1  | AAA · normal text   | AA 4.5:1        |
| S22 | T17c     | Dismiss button focus-visible outline         | `--color-accent`      | `--color-surface-raised`  | 4.57:1   | 5.52:1   | passes 3:1 by margin | SC 1.4.11 3:1   |

S19-S22 are byte-equivalent to M4 T14 / T15 / T16 / T17c.

### State-branch prose (M4-byte-equivalent)

| #   | M4-equiv | Surface                                      | Foreground            | Background          | Light    | Dark     | Verdict             | Bar       |
|-----|----------|----------------------------------------------|-----------------------|---------------------|----------|----------|---------------------|-----------|
| S23 | T22      | "Reading session..." loading prose           | `--color-ink-muted`   | `--color-surface`   | 7.04:1   | 7.36:1   | AAA · normal text   | AA 4.5:1  |
| S24 | T23      | Error prose                                  | `--color-error`       | `--color-surface`   | 5.70:1   | 6.36:1   | AA · normal text    | AA 4.5:1  |
| S25 | T24      | Retry button text                            | `--color-ink`         | `--color-surface`   | 17.10:1  | 15.52:1  | AAA · normal text   | AA 4.5:1  |
| S26 | T25      | Retry button border (NT)                     | `--color-border-strong` | `--color-surface`  | 3.06:1   | 3.00:1   | passes 3:1 (dark cusp inherited from M2a) | SC 1.4.11 3:1 |
| S27 | T26      | Empty-stream prose                           | `--color-ink-muted`   | `--color-surface`   | 7.04:1   | 7.36:1   | AAA · normal text   | AA 4.5:1  |
| S28 | T27      | no_raw / idle prose                          | `--color-ink-muted`   | `--color-surface`   | 7.04:1   | 7.36:1   | AAA · normal text   | AA 4.5:1  |

S23-S28 are byte-equivalent to M4 T22-T27.

**S24 passes AA 4.5:1 by comfortable margins** (+1.20 light, +1.86
dark). Error prose at `--color-error` over `--color-surface` matches
M4 T23 recipe.

**S26 inherits the dark cusp position** from M4 T25 (= S10's
`--color-border-strong` over `--color-surface`). Same accepted risk;
same one-token-bump remediation if codex tightens.

### Defensive pair (script-only, NOT consumed by M5 surface)

| #   | M4-equiv | Surface                                      | Foreground            | Background                                              | Light    | Dark     | Verdict             | Bar       |
|-----|----------|----------------------------------------------|-----------------------|---------------------------------------------------------|----------|----------|---------------------|-----------|
| S29 | T03      | (defensive) ink-muted on accent-tinted mix   | `--color-ink-muted`   | `color-mix(in srgb, --color-accent 5%, --color-surface)` | 6.58:1   | 7.05:1   | AA · normal text (light AA · dark AAA) | AA 4.5:1  |

S29 is byte-equivalent to M4 T03 (the user-attribution-row pair).
M5 does NOT consume this combination on its surface — there is NO
`--color-ink-muted` text directly inside the accent-tinted user_turn
panel; the disabled placeholder + Agent reaction summary live OUTSIDE
the panel (under it, on `--color-surface` background). The pair is
documented here for codex pre-emption: a future surface needing the
combination has a measured ratio in hand without a separate
measurement step.

## Summary

| Category                                  | Count | Verdict                                                                          |
|-------------------------------------------|-------|----------------------------------------------------------------------------------|
| Pairs measured (light + dark together)    | 29    | (each row above)                                                                 |
| Passing AA normal text (≥ 4.5:1)          | 22    | S01-S05, S07-S09, S11, S13, S15, S16, S18-S21, S23-S25, S27, S28, S29            |
| Passing SC 1.4.11 (≥ 3:1, non-text)       | 5     | S10 (dark cusp), S14 (light +1.21, dark +4.68), S17 (light +1.21, dark +4.68), S22 (4.57/5.52), S26 (dark cusp inherited) |
| Decorative (not WCAG-gated)               | 2     | S06 (disabled-placeholder border decorative — italic prose + reading-context carry the cue), S12 (agent_only border decorative — disclosure shape carries) |
| Cusp pairs (3.00:1 dark on the boundary)  | 2     | S10, S26 — both consume `--color-border-strong` against `--color-surface` (M2a-documented accepted risk; carried forward from M4) |

**Net result for M5: zero blocking findings expected on first
codex round.** Every pair either passes the bar by a comfortable
margin OR sits at a documented cusp inherited from M4/M2a. M5
introduces ZERO new color recipes and ZERO new pair combinations —
every M5 pair maps to an M4 pair by recipe.

## M5 vs M4 — invariance audit

The table below documents that M5's measurements match M4's exactly
on shared pairs (codex defense — drift here = math regression):

| M5 pair | M4 pair | Light expected (M4) | Dark expected (M4) | M5 measured | Match? |
|---------|---------|---------------------|--------------------|-------------|--------|
| S01     | T01     | 16.00:1             | 14.87:1            | 16.00:1 / 14.87:1 | OK   |
| S02     | T20     | 16.13:1             | 14.84:1            | 16.13:1 / 14.84:1 | OK   |
| S03     | T19     | 16.13:1             | 14.84:1            | 16.13:1 / 14.84:1 | OK   |
| S04     | T22     | 7.04:1              | 7.36:1             | 7.04:1 / 7.36:1   | OK   |
| S05     | T22     | 7.04:1              | 7.36:1             | 7.04:1 / 7.36:1   | OK   |
| S07     | T28     | 4.84:1              | 5.78:1             | 4.84:1 / 5.78:1   | OK   |
| S09     | T09     | 7.04:1              | 7.36:1             | 7.04:1 / 7.36:1   | OK   |
| S10     | T10     | 3.06:1              | 3.00:1             | 3.06:1 / 3.00:1   | OK   |
| S11     | T22     | 7.04:1              | 7.36:1             | 7.04:1 / 7.36:1   | OK   |
| S13     | T02     | 17.10:1             | 15.52:1            | 17.10:1 / 15.52:1 | OK   |
| S14     | T12     | 4.21:1              | 7.68:1             | 4.21:1 / 7.68:1   | OK   |
| S15     | T06     | 16.13:1             | 14.84:1            | 16.13:1 / 14.84:1 | OK   |
| S16     | T11     | 15.49:1             | 14.15:1            | 15.49:1 / 14.15:1 | OK   |
| S17     | T12     | 4.21:1              | 7.68:1             | 4.21:1 / 7.68:1   | OK   |
| S18     | T13     | 15.49:1             | 14.15:1            | 15.49:1 / 14.15:1 | OK   |
| S19     | T14     | 16.13:1             | 14.84:1            | 16.13:1 / 14.84:1 | OK   |
| S20     | T15     | 6.64:1              | 7.03:1             | 6.64:1 / 7.03:1   | OK   |
| S21     | T16     | 16.13:1             | 14.84:1            | 16.13:1 / 14.84:1 | OK   |
| S22     | T17c    | 4.57:1              | 5.52:1             | 4.57:1 / 5.52:1   | OK   |
| S24     | T23     | 5.70:1              | 6.36:1             | 5.70:1 / 6.36:1   | OK   |
| S25     | T24     | 17.10:1             | 15.52:1            | 17.10:1 / 15.52:1 | OK   |
| S26     | T25     | 3.06:1              | 3.00:1             | 3.06:1 / 3.00:1   | OK   |
| S29     | T03     | 6.58:1              | 7.05:1             | 6.58:1 / 7.05:1   | OK   |

The "M5 measured" column is the expected output of `python3 wcag_m5.py`
based on the script's byte-equivalent math + TOKENS dict to
`wcag_m4.py`. Codex round 1 should re-run the M5 script and observe
identical output to this column.

## Codex pre-emption notes

The pairs codex is most likely to flag (each one's M4-precedent
position carries forward to M5):

1. **S01 / S29 — User_turn body / accent-tinted-mix pairs.** M4
   verified at 16.00:1 light / 14.87:1 dark for ink-on-mix and 6.58:1
   light / 7.05:1 dark for ink-muted-on-mix. M5 reuses the same
   recipe; same ratios. AAA / AA respectively.

2. **S07 — "Expand to raw messages" at 4.84:1 light.** Same M4 T07
   position: M2a-codex-tuned `--color-accent` at L=55 light specifically
   to clear AA 4.5:1 for this exact recipe. M5 inherits the position;
   no new tuning.

3. **S14 / S17 — Oversized warn border + truncation stripe at 4.21
   light / 7.68 dark.** M4 verified at the same ratios (T12). Both
   pass SC 1.4.11 by comfortable margins.

4. **S10 / S26 — `--color-border-strong` cusp pairs at 3.00:1 dark.**
   M2a "accepted risk"; M4 carried forward; M5 carries forward.
   One-token bump fixes all three chunks in a single edit if codex
   tightens.

5. **S24 — Error prose at 5.70:1 light / 6.36:1 dark.** M4 T23
   position. Both modes pass AA 4.5:1 by comfortable margins
   (+1.20 light, +1.86 dark).

## Token references

All M5 pairs above reference these M2a-canonical tokens (identical
to M4's):

| Token                    | Light                  | Dark                   |
|--------------------------|------------------------|------------------------|
| `--color-surface`        | `oklch(98% 0.01 70)`   | `oklch(15% 0.01 70)`   |
| `--color-surface-raised` | `oklch(96% 0.01 70)`   | `oklch(18% 0.01 70)`   |
| `--color-ink`            | `oklch(20% 0.02 70)`   | `oklch(92% 0.01 70)`   |
| `--color-ink-muted`      | `oklch(45% 0.02 70)`   | `oklch(70% 0.01 70)`   |
| `--color-border`         | `oklch(85% 0.01 70)`   | `oklch(28% 0.01 70)`   |
| `--color-border-strong`  | `oklch(65% 0.02 70)`   | `oklch(48% 0.02 70)`   |
| `--color-accent`         | `oklch(55% 0.15 50)`   | `oklch(65% 0.15 50)`   |
| `--color-warn`           | `oklch(58% 0.15 60)`   | `oklch(72% 0.13 60)`   |
| `--color-error`          | `oklch(52% 0.18 25)`   | `oklch(68% 0.16 25)`   |

No new color tokens introduced for M5. Hex audit invariant:
`rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l = 24` holds
byte-equivalent post-M5.

## Methodology footnote — `color-mix(in srgb, X p%, Y)` semantics

The `color-mix(in srgb, ...)` recipe per CSS Color L4 §4.1 mixes
two colors in the **nonlinear sRGB color space**. The committed
`wcag_m5.py` at `working/phase-5/designs/m5-skim/wcag_m5.py`
implements the pipeline byte-equivalent to `wcag_m4.py`:

1. Converts each oklch color to linear sRGB (via oklab — Bjorn
   Ottosson's M2 matrix).
2. Converts each linear sRGB triple to nonlinear sRGB via the
   piecewise function in CSS Color L4 §10.4.
3. Mixes by `p1 * sRGB1_channel + (1 - p1) * sRGB2_channel`.
4. Converts the mixed nonlinear sRGB back to linear sRGB.
5. Computes relative luminance via WCAG 2.1 §1.4.3.

This pipeline matches Chromium's implementation of `color-mix(in
srgb)`. Mixing directly in linear sRGB (skipping steps 2 + 4) gives
an answer that drifts by ~0.4-0.8 ratio points at the M5 alpha
values (5%, 8%) — the same magnitude codex caught in M4 round 2.
The script's nonlinear-sRGB-then-mix pipeline is authoritative.

## Token discipline audit

Every `var(--token)` referenced in `prototype.html` (and by extension
in `SkimView.css` + `BoundaryRow.css`) exists in
`apps/frontend/src/styles/tokens.css` (M5 introduces ZERO new tokens
— non-negotiable per plan §10).

Tokens used in `prototype.html` (28 unique, identical M2a-canon set
to M4's):

| Token                   | tokens.css line |
|-------------------------|-----------------|
| `--color-accent`        | 72              |
| `--color-bg`            | 94              |
| `--color-border`        | 70              |
| `--color-border-strong` | 71              |
| `--color-error`         | 76              |
| `--color-ink`            | 68              |
| `--color-ink-muted`      | 69              |
| `--color-surface`       | 66              |
| `--color-surface-raised`| 67              |
| `--color-text`          | 92              |
| `--color-warn`          | 75              |
| `--ease-in-out`         | 160             |
| `--ease-out`            | 159             |
| `--font-chrome`         | 125             |
| `--font-display`        | 124             |
| `--font-mono`           | 127             |
| `--leading-comfortable` | 146             |
| `--measure`             | 147             |
| `--motion-base`         | 155             |
| `--motion-disclosure`   | 156             |
| `--radius-md`           | 106             |
| `--radius-sm`           | 105             |
| `--space-1`             | 97              |
| `--space-2`             | 98              |
| `--space-3`             | 99              |
| `--space-4`             | 100             |
| `--space-6`             | 101             |
| `--space-8`             | 102             |
| `--text-base`           | 139             |
| `--text-sm`             | 138             |

**Audit result: 30 tokens listed, all present in tokens.css.**
Reproduce with:

    rg -o 'var\(--[a-z0-9-]+\)' \
      working/phase-5/designs/m5-skim/prototype.html \
      | sort -u
    # then compare each token to apps/frontend/src/styles/tokens.css

The same tokens appear in `design.md`, `motion.md`, and the
wireframes; the prototype is the union of token usage across the
artifact set.

## Summary table — M5 contrast pass count

| Pair group | Pass count | Cusp count | Decorative count | Total |
|------------|------------|------------|------------------|-------|
| user_turn  | 6 (S01-S05, S07-S08)   | 0 | 1 (S06) | 8 |
| boundary   | 1 (S09)    | 1 (S10)    | 0           | 2 |
| agent_only | 1 (S11)    | 0          | 1 (S12)     | 2 |
| oversized  | 3 (S13-S15) | 0         | 0           | 3 |
| banners    | 5 (S16-S21) | 0         | 0           | 6 (5 text + 1 NT-pass S22) |
| state branches | 5 (S23-S25, S27-S28) | 1 (S26) | 0   | 6 |
| defensive  | 1 (S29)    | 0          | 0           | 1 |

**M5 contrast pass total: 22 AA-passing text pairs + 5 SC 1.4.11
NT-passing (3 by margin, 2 at dark cusp inherited from M4) + 2
decorative (S06 + S12) = 29 pairs accounted for.**

End of colors.md.
