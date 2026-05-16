# Wireframe 00 — Overview

The marginalia hairline treatment in vertical context, with real
transcript content above and below. Scale is approximate (1 ch ≈ 8 px,
1 line ≈ 16 px).

```
╭─────────────────────────────────────────────────────────────────╮
│                                                                 │
│   ASSISTANT · 3 min ago                                         │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ I'll inspect tokens.css and then patch the dark block.  │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│         ·  PERMISSION MODE  →  default                          │   ← metadata hairline
│                                                                 │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ TOOL · Read · 2 min ago                       ● succeeded│  │
│   │ ────────────────────────────────────────────────────────│  │
│   │ ▸ Arguments   { "file_path": "…/tokens.css" }           │  │
│   │ ▸ Result      read 4.1 KB                               │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│         ·  TOKENS  :  127↓ 245↑                                 │   ← metadata hairline
│         ·  2 metadata events                              ▸     │   ← cluster (collapsed)
│         ·  ↺                                                    │   ← echo glyph (duplicate-anchor)
│                                                                 │
│   USER · 1 min ago                                              │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ Make sure dark mode still passes WCAG AA.               │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                 │
╰─────────────────────────────────────────────────────────────────╯

Legend:
   ·     — middle-dot prefix marking the row as marginalia.
   →     — arrow separator (control / attachment / agent / context).
   :     — colon separator (telemetry / title / prompt).
   ▸     — native disclosure triangle (cluster only).
   ●     — solid status dot (existing lifecycle vocabulary).
   ↺     — echo glyph (duplicate-anchor; even quieter than hairline).
```

Key visual properties:

- Metadata rows sit indented `--space-6` (24 px) from the column
  edge — like a footnote indent in a printed book.
- No card, no background, no border, no radius. Pure typography.
- Single line, `--text-xs` (0.75rem = 12 px), tight leading.
- All text in `--color-ink-muted` against bare `--color-surface`.
- Adjacent runs ≥ 2 collapse into a `<details>` cluster (matches
  Phase 7c polish-r2's lowered `GROUP_THRESHOLD`). The figure above
  shows the two states split to demonstrate both registers and a
  trailing echo row.
- Total vertical footprint of a single hairline row: ~24 px including
  padding — roughly 1/4 the height of a user-message panel.
- Total vertical footprint of a single echo row: ~16 px (half a
  hairline; the glyph carries no text body, only the gutter glyph).
