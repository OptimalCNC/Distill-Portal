# Wireframe 11 — Orphan tool_result (no preceding tool_use)

Spec ref: working/phase-7c.md §Data Model — `RenderHint.kind === "standalone"`
(plus an inline chip in the `render-normally` bucket flagging the
orphan state).

A `tool_result` Message with no preceding `tool_use` in the stream.
Renders as a regular per-kind tool_result card (the Phase 5
treatment), prefixed/postfixed with a "STRAY RESULT" marginalia
pill in the header AND a `render-normally` warning chip below the
body explaining the orphan state.

```
+---------------------------------------------------------------+
| TOOL RESULT · (unknown) · stray result · 1 min ago            |  <- standalone-head with pill
|---------------------------------------------------------------|
|   <pre>file contents follow...</pre>                          |     existing tool_result body
+---------------------------------------------------------------+

  gap: var(--space-3) = 12 px

+---------------------------------------------------------------+
| ● stray tool_result — no preceding tool_use   PAYLOAD    ▾    |  <- render-normally chip
|                                                               |
|   tool_result at messageIndex 47 has no matching tool_use_id  |
|   in the prior stream; rendered as standalone.                |
+---------------------------------------------------------------+
```

## Why this routes differently from orphan tool_use

| Concern          | Orphan tool_use             | Orphan tool_result               |
|------------------|------------------------------|----------------------------------|
| RenderHint kind  | `lifecycle` (pairWithIndex null) | `standalone` (no pairing)      |
| Visual treatment | full lifecycle-card recipe   | existing tool_result per-kind    |
| Status marker    | hollow "in-flight" dot       | none on header; chip carries it  |
| Warning surface  | marginalia pill in header    | marginalia pill + inline chip    |
| Rationale        | Will likely be paired later  | Result with no use is anomalous; |
|                  | (truncated session, etc.)    | the inline chip flags it.         |
```

## Marginalia "STRAY RESULT" pill

Same recipe as the orphan tool_use "AWAITING RESULT" pill:
Fraunces italic small-caps, `--color-ink-muted`, `--text-xs`. The
pill is purely typographic — no background, no border, no icon.
The chip below carries the diagnostic detail; the pill carries the
fast-scan visual cue.
