# Wireframe 02 — Lifecycle paired (tool_use + tool_result)

Spec ref: working/phase-7c.md §Data Model — `RenderHint.kind === "lifecycle"`,
`pairWithIndex: number`.

```
+---------------------------------------------------------------+
| | TOOL · Read · 3 min ago                  ● succeeded        | <- lifecycle-head (hairline divider below)
| |---------------------------------------------------------    |
| | > Arguments  { "file_path": ".../tokens.css" }              | <- details (closed by default)
| |   <pre>{ "file_path": "..." }</pre>     (when open)         |
| |                                                             |
| | > Result     file contents read (4.1 KB)                    | <- details (closed by default)
| |   <pre>/* Design tokens ... */</pre>    (when open)         |
| |                                                             |
+-^-------------------------------------------------------------+
  |
  +-- 2px sienna inline-start rail var(--color-accent) at 0.55 opacity
      Connects the use side (top half) to the result side (bottom half)
      so they read as a single lifecycle, not two adjacent cards.
```

## Failure case (Codex exec, exit_code: 1)

```
+---------------------------------------------------------------+
| | TOOL · exec · 2 min ago                  ● failed           |  ← red status dot + "failed" label
| |---------------------------------------------------------    |
| | > Arguments  bun run build                                  |
| |                                                             |
| | > Result     exit_code: 1 · build failed (3 errors)         |
| |              <pre>exit_code: 1\nerror: ...</pre>            |
| |                                                             |
+-^-------------------------------------------------------------+
  |
  +-- 2px ERROR-color inline-start rail (var(--color-error)) at 0.70 opacity
```

## Aggregate status dot recipe

The same dot recipe used in lifecycle-head, group head, and chip
severity. ALWAYS accompanied by a visible chrome-text label — color
is reinforcement, not the primary cue (accessibility constraint).

```
●        all-success    fill: var(--color-success)
●        mixed          fill: var(--color-warn)
●        all-failed     fill: var(--color-error)
○        in-flight      border: var(--color-ink-muted); fill: transparent
```
