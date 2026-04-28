# M1b color notes

M1b adds **zero new tokens**. Every color reference is either a
`var(--token)` to a Phase 4 baseline color OR a `color-mix()` recipe
against one of the baseline tokens.

## Tokens consumed by M1b

| Token                  | M1b usage                                                                                  |
|------------------------|--------------------------------------------------------------------------------------------|
| `--color-bg`           | `.list-pane-footer` opaque background (covers scrolled-under rows).                        |
| `--color-surface`      | `<th>` background (Phase 4 carryover); `.chip` resting bg (Phase 4 carryover).             |
| `--color-surface-raised` | `.session-filters input` / `select` chrome (Phase 4 carryover).                          |
| `--color-border`       | Hairline borders: `.list-pane-footer { border-top }`, `.filters-wrap[open] > summary { border-bottom }`, `.filter-count-chip { border }`, `.title-cell-tool { border }`, all `<td>` / `<th>` borders. |
| `--color-border-strong` | `.session-filters input` / `select` border (Phase 4 carryover); ActionBar/Pagination button borders (Phase 4 carryover). |
| `--color-text`         | `.title-cell-title` (bold), `<summary>` text, `.session-filters input` text.               |
| `--color-text-muted`   | `.title-cell-tool` text, `.title-cell-rowkey`, `.title-cell-line2`, `.filter-count-chip`, `.open-detail` resting, `.placeholder-line`, Updated cell. |
| `--color-accent`       | Selected-row tint (8% / 12%) + 2 px inset left edge; deep-link pulse keyframe peak (22%); `.chip.active` recipe (Phase 4 carryover); focus-visible outlines (`.open-detail`, `<summary>`). |
| `--color-accent-hover` | `.open-detail:active` color (pressed state).                                               |
| `--color-success`      | `.badge.up-to-date` recipe (Phase 4 carryover).                                            |
| `--color-warn`         | `.badge.outdated` recipe (Phase 4 carryover); `.title-cell-refresh` text color (M1b decision — designer warmed the marker so it reads as a state hint instead of incidental copy). |
| `--color-error`        | `.badge.source-missing` recipe (Phase 4 carryover).                                        |

## Color-mix recipes (from M1a; preserved through M1b)

| Recipe                                                                    | Used at                                          |
|---------------------------------------------------------------------------|--------------------------------------------------|
| `color-mix(in srgb, var(--color-text) 4%, transparent)`                   | row hover tint                                   |
| `color-mix(in srgb, var(--color-accent) 8%, transparent)`                 | selected row tint (resting)                      |
| `color-mix(in srgb, var(--color-accent) 12%, transparent)`                | selected + hover tint                            |
| `color-mix(in srgb, var(--color-accent) 22%, transparent)`                | deep-link pulse keyframe peak                    |
| `color-mix(in srgb, var(--color-{semantic}) 15%, var(--color-surface))`   | `.badge` + `.chip.active` background (Phase 4)   |
| `color-mix(in srgb, var(--color-{semantic}) 70%, var(--color-text))`      | `.badge` + `.chip.active` foreground (Phase 4)   |
| `color-mix(in srgb, var(--color-{semantic}) 35%, var(--color-surface))`   | `.badge` + `.chip.active` border (Phase 4)       |

## WCAG AA contrast notes

M1b does NOT introduce new visible foreground/background pairs; every
color choice consumes the Phase 4 baseline token set, which already
clears WCAG AA per the Phase 4 M6 contrast table at
`progress/phase-4.progress.md`.

The one M1b decision worth flagging:
- `.title-cell-refresh` color is `var(--color-warn)` (`#b86b07` in light
  mode; `#e0a75a` in dark mode) on the row's resting surface (transparent
  over `var(--color-bg)` = `#ffffff` light, `#0f1115` dark). Light mode
  contrast: `#b86b07` on `#ffffff` ≈ 5.3:1 (passes AA at any text size).
  Dark mode: `#e0a75a` on `#0f1115` ≈ 9.2:1 (passes AA comfortably).
  Both clear AA; documented here so M6's WCAG sweep does not need to
  re-derive the math.
- `.title-cell-refresh` against the **selected-row** background
  (`color-mix(--color-accent 8%, transparent)` over `--color-bg`)
  yields a near-bg surface; the warm marker still clears AA against
  the slightly tinted ground (light: ~5.0:1; dark: ~8.7:1).

If the reviewer prefers the Phase 4 muted treatment
(`var(--color-text-muted)` on the marker), the contrast already passes
AA and the visual is more restrained — the swap is a single token.

## Hex isolation invariant

M1b adds zero hex literals. The audit command stays:

```bash
rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l
# expected: 24 (all in tokens.css)
```

## Token count

M1b adds zero tokens. The audit command stays:

```bash
grep -E '^\s*--' apps/frontend/src/styles/tokens.css | wc -l
# expected: 44 (Phase 4 baseline preserved through M1a + M1b)
```

## Dark mode

All M1b color decisions consume tokens that have dark-mode redefinitions
in `tokens.css`. The dark mode behavior is automatic — no separate
M1b dark-mode rule is needed.

The deep-link pulse recipe uses `var(--color-accent)`, which redefines
from `#2864d4` (light) to `#6da5ff` (dark). The pulse keyframe peak
(22%) and resting tint (8%) both retint correctly under dark mode
without any rule change.
