# Wireframe 07 — Inline warning chip — collapse-by-default

Spec ref: working/phase-7c.md §Data Model — `InlineWarning.classification === "collapse-by-default"`.

The chip is collapsed by default — the summary shows just the severity
dot + the count ("1 warning") + the category tag. The full reason is
hidden until the user expands. Same DOM as render-normally; only the
SUMMARY copy differs.

```
+---------------------------------------------------------------+
| ASSISTANT · just now                                          |
|---------------------------------------------------------------|
| I'll run the suite now and report back.                       |
+---------------------------------------------------------------+

  gap: var(--space-3) = 12 px

+----------------------------+
| ● 1 warning   TIMESTAMP  ▸ |  <- chip summary (closed)
+----------------------------+

Expanded:

+---------------------------------------------------------------+
| ● 1 warning   TIMESTAMP  ▾                                    |
|                                                               |
|   timestamp '2026-05-16Tx' could not be parsed; surfaced from |
|   the message body's timestamp field.                         |
+---------------------------------------------------------------+
```

## Difference from render-normally

| Aspect           | render-normally                | collapse-by-default        |
|------------------|--------------------------------|----------------------------|
| Summary copy     | full short reason              | "{N} warning" + category   |
| Default state    | closed (but reason teased)     | closed (no reason teased)  |
| Width            | as wide as the message column  | content-width chip         |
| Visibility       | every reason visible at a tap  | reason hidden until expand |

The bucket assignment routes lower-signal warnings (lexer / timestamp)
to this surface so they remain discoverable without dominating the
reading surface.
