# M2a color notes

M2a is the **first chunk that adds tokens** since Phase 4. The
introductions enumerate below; the `var(--token)` references in M1a
+ M1b CSS keep working unchanged because of the Option B aliases.

## Tokens introduced or revised in M2a

| Token                    | Status   | Light                       | Dark                         |
|--------------------------|----------|-----------------------------|-------------------------------|
| `--color-surface`        | revised  | `oklch(98% 0.01 70)`        | `oklch(15% 0.01 70)`          |
| `--color-surface-raised` | revised  | `oklch(96% 0.01 70)`        | `oklch(18% 0.01 70)`          |
| `--color-ink`            | NEW      | `oklch(20% 0.02 70)`        | `oklch(92% 0.01 70)`          |
| `--color-ink-muted`      | NEW      | `oklch(45% 0.02 70)`        | `oklch(70% 0.01 70)`          |
| `--color-border`         | revised  | `oklch(85% 0.01 70)`        | `oklch(28% 0.01 70)`          |
| `--color-border-strong`  | revised  | `oklch(70% 0.02 70)`        | `oklch(40% 0.02 70)`          |
| `--color-accent`         | revised  | `oklch(60% 0.15 50)`        | `oklch(65% 0.15 50)`          |
| `--color-accent-hover`   | revised  | `oklch(50% 0.16 50)`        | `oklch(72% 0.13 50)`          |
| `--color-success`        | revised  | `oklch(48% 0.13 155)`       | `oklch(64% 0.13 155)`         |
| `--color-warn`           | revised  | `oklch(58% 0.15 60)`        | `oklch(72% 0.13 60)`          |
| `--color-error`          | revised  | `oklch(52% 0.18 25)`        | `oklch(68% 0.16 25)`          |

The four alias declarations (Option B):

| Alias                 | Resolves to             |
|-----------------------|--------------------------|
| `--color-text`        | `var(--color-ink)`       |
| `--color-text-muted`  | `var(--color-ink-muted)` |
| `--color-bg`          | `var(--color-surface)`   |
| `--font-sans`         | `var(--font-chrome)`     |

## Color-mix recipes (M1a + M1b carryover; retinted automatically)

These are unchanged from M1a/M1b — they consume `var(--color-accent)`
or `var(--color-ink)` and retint automatically when the underlying
token shifts to oklch. The developer does NOT re-author them.

| Recipe                                                                    | Used at                                          |
|---------------------------------------------------------------------------|--------------------------------------------------|
| `color-mix(in srgb, var(--color-ink) 4%, transparent)`                    | row hover tint (M1a; M1b previously read `--color-text` → aliased) |
| `color-mix(in srgb, var(--color-accent) 8%, transparent)`                 | selected row tint (resting)                      |
| `color-mix(in srgb, var(--color-accent) 12%, transparent)`                | selected + hover tint                            |
| `color-mix(in srgb, var(--color-accent) 22%, transparent)`                | deep-link pulse keyframe peak                    |
| `color-mix(in srgb, var(--color-success) 15%, var(--color-surface))`      | `.badge.up-to-date` background                   |
| `color-mix(in srgb, var(--color-success) 70%, var(--color-ink))`          | `.badge.up-to-date` foreground                   |
| `color-mix(in srgb, var(--color-success) 35%, var(--color-surface))`      | `.badge.up-to-date` border                       |
| `color-mix(in srgb, var(--color-{success|error|accent}) 65%, var(--color-border))` | toast variant border (3:1 SC 1.4.11 anchor)   |

The recipes use `in srgb` color space mixing. The new oklch source
tokens get converted to sRGB before the mix; the resulting tints are
slightly different from a hypothetical `in oklch` mix, but every
recipe was authored against `in srgb` in Phase 4 + M1a + M1b and
the WCAG measurements were calibrated against the sRGB output. **Do
not change `in srgb` to `in oklch`** in M2a — it would silently
shift every tinted surface and require a full WCAG re-run.

## Hex fallback layer

The 24 existing hex literals in `tokens.css` form the
`@supports not (color: oklch(0% 0 0))` fallback layer. The fallback
preserves the **Phase 4 cool-blue palette**, not the Archive-room
warm palette — see design.md §9.3 for the rationale. The hex audit
holds at exactly 24:

```bash
rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l
# expected: 24 (all in tokens.css)
```

## Dark mode

All M2a color decisions have dark-mode oklch redefinitions in
`tokens.css`. The compositional behavior is automatic — none of the
11 feature-local CSS files needs a dark-mode override; everything
re-resolves through `var(...)` against the dark-mode token block.

## Status pill foreground/background ratios across the new ramp

The Phase 4 status pill recipe (`background = 15% mix; foreground =
70% mix; border = 35% mix`) was calibrated for the Phase 4 sRGB
palette. The §7 contrast table in design.md confirms the recipes
hold under the new oklch ramp (every pill clears AA at 4.5:1 on
both light + dark). The risky pair is the `.badge.outdated` on
`--color-surface` in light mode (4.7:1) — it sits closest to the
4.5:1 floor. If the developer's measurement comes in below 4.5:1
after oklch CIE2000 conversion, the mitigation is to bump the warn
foreground mix from 70% to 75%; this lifts contrast ~5% without
changing the visual character.

## `.title-cell-refresh` (the M1b decision)

M1b warmed `.title-cell-refresh` from `--color-text-muted` to
`--color-warn` (`#b86b07` light / `#e0a75a` dark in fallback;
`oklch(58% 0.15 60)` / `oklch(72% 0.13 60)` in oklch). The §7
contrast table confirms it still clears AA against both
`--color-surface` (4.9:1 light / 5.4:1 dark) and the selected-row
tint (4.6:1 light / 5.1:1 dark) under the new oklch ramp.
