# Wireframe 10 — States grid

Each row in the matrix is exercised in the prototype's light and
dark columns.

| State                              | Visual signal                                                                  |
|------------------------------------|--------------------------------------------------------------------------------|
| standalone-single (hairline)       | Single line, ink-muted, indented 24 px.                                        |
| standalone-single (echo)           | Single `↺` glyph (no label, no value), ink-muted, indented 24 px. Tooltip resolves canonical line. |
| adjacent-collapsed-collapsed (≥ 2) | Single line: `▸ 2 metadata events`. Triangle visible.                          |
| adjacent-collapsed-expanded        | `▾ 2 metadata events` + nested rows at 36 px indent.                            |
| mixed cluster (hairline + echo)    | Collapses at N≥2; expanded body renders each member in its native register.   |
| inside-tool-batch-group            | **N/A** — metadata flushes the batch (see wireframe 09).                       |
| dark mode                          | Same recipe; ink-muted swaps to dark-mode token (oklch 70% / 1.55 hex `#9098a6`). |
| reduced motion                     | Cluster transition snaps. Single row has no motion to begin with.              |
| hover (hairline)                   | Native browser tooltip shows raw NDJSON line.                                  |
| hover (echo)                       | Native browser tooltip: `"duplicate of event_msg.{user,agent}_message at line N"`. |
| hover (cluster summary)            | Browser-native `:hover` (none additional).                                     |
| focus-visible (single)             | **Not focusable** — Tab skips.                                                 |
| focus-visible (cluster summary)    | Native focus ring (inherited from Phase 5 global).                             |
| empty payload (hairline)           | `display = "(empty)"`. Row renders normally.                                   |
| oversize payload (hairline)        | `display` truncated to 78 chars + U+2026. Full payload in `title` tooltip.     |
| missing echoOf line                | Tooltip degrades to `"…(line unknown)"`. Row still renders.                    |
| warning-only attached              | Row renders normally. Banner carries the warning. No inline chip.              |

## Visual hierarchy comparison

A vertical slice showing how the marginalia hairline sits among
existing TranscriptView surfaces:

```
   ╭──────────────────────────────────────╮
   │  ASSISTANT body panel  (loudest)     │  ← user/assistant
   ╰──────────────────────────────────────╯

   ╭──────────────────────────────────────╮
   │  TOOL · Read   ● succeeded            │
   │  ▸ Arguments                          │  ← lifecycle card
   │  ▸ Result                             │
   ╰──────────────────────────────────────╯

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                Task started                  ← task-lifecycle (chapter pair)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

         ·  PERMISSION MODE  →  default       ← metadata hairline (quiet)
                                              (Phase 7d NEW)

         ·  ↺                                  ← echo glyph (quietest)
                                              (Phase 7d NEW — duplicate-anchor)
```

Six visual registers, from loudest to quietest:
1. **Message panels** — full card, body type, surface color.
2. **Lifecycle / group cards** — full card, mono + chrome.
3. **System notes** — bare panel, chrome text, glyph prefix.
4. **Task-lifecycle** — hairline pair, Fraunces italic SC label, centered.
5. **Metadata hairlines** — no chrome, ink-muted text, indented marginalia.
6. **Metadata echoes** — no chrome, single ink-muted glyph, no body text.

The metadata echo register IS the quietest visible element. By
construction, nothing else in the TranscriptView vocabulary can be
confused for an echo row.
