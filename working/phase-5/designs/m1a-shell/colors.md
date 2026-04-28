# M1a — Color & token reference

Phase 5 / Milestone 1 / Chunk a.

## Tokens consumed (Phase-4 baseline)

M1a uses ONLY the existing 44 tokens declared in
`apps/frontend/src/styles/tokens.css`. **M1a introduces zero new
tokens.** The Phase-5 Design Language tokens (oklch palette, font
stacks, motion timings, surface treatments) all land in M2 per spec
§Design Tokens "added in M2" annotations and Resolved Decision #11.

The M1a-relevant subset of Phase-4 tokens:

| Token | Light | Dark | Used in M1a for |
|-------|-------|------|-----------------|
| `--color-bg` | `#ffffff` | `#0f1115` | Page + session-pane background |
| `--color-surface` | `#f8f9fb` | `#151821` | Filter-strip background, list-pane internal panels (Phase-4 baseline) |
| `--color-surface-raised` | `#ffffff` | `#1b1f2a` | (Phase-4 only — not load-bearing in M1a) |
| `--color-border` | `#e3e5ea` | `#262b36` | **Hairline gutter** (signature-detail #4); row bottom borders (Phase-4 baseline) |
| `--color-border-strong` | `#c8ccd4` | `#3a404d` | (Phase-4 only — not load-bearing in M1a) |
| `--color-text` | `#14161a` | `#e8eaef` | All M1a body text; row text on selected/hover backgrounds |
| `--color-text-muted` | `#5a606b` | `#9098a6` | Empty-pane secondary prose; loading copy; "← Back to list" rest state; `session_not_found` hint; placeholder copy |
| `--color-accent` | `#2864d4` | `#6da5ff` | Selected-row tint base; 2 px sienna left edge inset; deep-link pulse keyframe; focus-visible outline |

(Note: the actual Phase-4 `--color-accent` is a blue, not the
warm sienna/amber the Phase-5 spec describes. M2 redefines
`--color-accent` to `oklch(60% 0.15 50)` — a sienna — and the
selected-row tint + pulse + focus rings retint automatically. In
M1a the accent stays as Phase-4 blue. This is **intentional and
spec-compliant** — Resolved Decision #11 puts the oklch redefinition
in M2.)

## Color recipes M1a introduces

These are **`color-mix` recipes**, not new tokens. They live inline in
component CSS files (`App.css` or the per-component sibling sheets
the developer creates for the new `<aside>` / `<article>` panes).
None contain hex literals; all reference Phase-4 baseline tokens.

| Recipe | Where used |
|--------|------------|
| `color-mix(in srgb, var(--color-text) 4%, transparent)` | Row hover background |
| `color-mix(in srgb, var(--color-accent) 8%, transparent)` | Selected-row background; deep-link pulse settled state |
| `color-mix(in srgb, var(--color-accent) 12%, transparent)` | Selected + hover row background |
| `color-mix(in srgb, var(--color-accent) 22%, transparent)` | Deep-link pulse keyframe peak |

These recipes match spec §Structural literals (lines 932–934) verbatim.

## Hex isolation invariant

- **Phase-4 baseline**: 24 hex literals in `apps/frontend/src/`, all
  in `tokens.css`.
- **M1a target**: same 24. M1a adds zero hex literals anywhere.
- **Verification command**:
  ```bash
  rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l
  # → 24
  ```
- **Verification command, narrowed to outside tokens.css**:
  ```bash
  rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ -g '!styles/tokens.css' | wc -l
  # → 0
  ```

If the second command returns anything but `0`, M1a has bled hex.
The developer should fix before opening the review loop.

## WCAG AA — M1a contrast targets

Every new visible foreground/background pair the design introduces.
The reviewer should re-verify these on real Chromium with
`prefers-color-scheme: light` AND `prefers-color-scheme: dark`.

### Light mode (Phase-4 `--color-bg = #ffffff`)

| Foreground | Effective background | Contrast | Target | Pass? |
|------------|----------------------|----------|--------|-------|
| `--color-text` (#14161a) | `--color-bg` (#ffffff) | 16.7:1 | 4.5:1 normal text | ✅ baseline |
| `--color-text` | `color-mix(--color-accent 8% , transparent)` over #ffffff (≈ #f0f5fc) | ~16.0:1 | 4.5:1 | ✅ |
| `--color-text` | `color-mix(--color-accent 12%, transparent)` over #ffffff (≈ #e6eefa) | ~15.4:1 | 4.5:1 | ✅ |
| `--color-text-muted` (#5a606b) | `--color-bg` (#ffffff) | 7.0:1 | 4.5:1 | ✅ baseline |
| `--color-text-muted` | `color-mix(--color-accent 8%, transparent)` over #ffffff | ~6.7:1 | 4.5:1 | ✅ |
| `--color-accent` (#2864d4) graphic | `--color-bg` (#ffffff) | 5.6:1 | 3:1 graphic | ✅ |
| `--color-accent` graphic (the 2 px inset) | selected row tint over #ffffff | ~5.5:1 | 3:1 | ✅ |

### Dark mode (Phase-4 `--color-bg = #0f1115`)

| Foreground | Effective background | Contrast | Target | Pass? |
|------------|----------------------|----------|--------|-------|
| `--color-text` (#e8eaef) | `--color-bg` (#0f1115) | 15.2:1 | 4.5:1 | ✅ baseline |
| `--color-text` | `color-mix(--color-accent 8%, transparent)` over #0f1115 | ~14.6:1 | 4.5:1 | ✅ |
| `--color-text` | `color-mix(--color-accent 12%, transparent)` over #0f1115 | ~14.0:1 | 4.5:1 | ✅ |
| `--color-text-muted` (#9098a6) | `--color-bg` (#0f1115) | 6.8:1 | 4.5:1 | ✅ baseline |
| `--color-text-muted` | `color-mix(--color-accent 8%, transparent)` over #0f1115 | ~6.5:1 | 4.5:1 | ✅ |
| `--color-accent` (#6da5ff) graphic | `--color-bg` (#0f1115) | 7.3:1 | 3:1 | ✅ |

(Contrast values are computed from the Phase-4 hex tokens. The exact
`color-mix` resolved color depends on the runtime; numbers are
"approximately" because `color-mix(in srgb, X 8%, transparent)` over
a known background is computed by the engine. The values above are
within the AA threshold by a wide margin — even if the exact mix
differs by 0.5 contrast points, AA holds.)

### M2 re-measurement

When M2 redefines the palette to oklch (warm-paper / deep-ink /
sienna), every value in the tables above must be re-measured. M2
delivers the WCAG AA sweep per §Design Tokens line 885 ("Default
rule: reuse before invent"). M1a's measurement is the baseline-
preserved case, recorded here so the M6 progress-log entry can cite
it.
