# Wireframe 06 — Inline warning chip — render-normally

Spec ref: working/phase-7c.md §Data Model — `InlineWarning.classification === "render-normally"`.

The chip renders BELOW the message body, visible by default. The
chip itself is a native `<details>` so it can expand to show the full
`reason` text in mono. Severity dot at inline-start; category tag
as Fraunces italic small-caps marginalia at the end of the summary.

```
+---------------------------------------------------------------+
| USER · just now                                               |  <- existing per-kind card
|---------------------------------------------------------------|
| Please run the test suite and report results.                 |     (msg-body)
+---------------------------------------------------------------+

  gap: var(--space-3) = 12 px (chip-wrapper margin-top)

+---------------------------------------------------------------+
| ● Unknown user content item type 'image'   PAYLOAD     ▸      |  <- chip summary (closed)
+---------------------------------------------------------------+

Expanded:

+---------------------------------------------------------------+
| ● Unknown user content item type 'image'   PAYLOAD     ▾      |
|                                                               |
|   user record content[].type === 'image' is not a recognized  |  <- chip-reason mono body
|   variant; emitted as 'unknown' placeholder.                  |     (--font-mono --text-xs
|   messageIndex: 12.                                           |      --color-ink-muted)
+---------------------------------------------------------------+

  ● = severity dot, 10 px diameter, color reinforces severity:
       error -> --color-error
       warning -> --color-warn
       info -> --color-ink-muted (hollow with border)

  PAYLOAD = category tag, Fraunces italic small-caps marginalia,
            --color-ink-muted, --text-xs.

  Chip background: --color-surface-raised
  Chip border:     1px --color-border
  Chip radius:     --radius-sm
  Chip padding:    --space-2 var(--space-3)
```

## Why below, not above

The chip is render-time supplementary metadata about the message; it
attaches to the message but reads AFTER it. Placing the chip below
keeps the message body the primary visual focus and lets the chip
inherit the visual hierarchy of an annotation/footnote rather than
a headline. Above-body placement would loudly disrupt the editorial
ink-on-paper rhythm Phase 5 established.
