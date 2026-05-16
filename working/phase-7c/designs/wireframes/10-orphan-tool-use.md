# Wireframe 10 — Orphan tool_use (no matching tool_result)

Spec ref: working/phase-7c.md §Data Model — `RenderHint.kind === "lifecycle"`,
`pairWithIndex: null`.

A `tool_use` Message with no matching `tool_result` Message in the
stream. Renders as a lifecycle card with the in-flight rail color +
an explicit "awaiting result" pill in Fraunces italic small-caps
marginalia.

```
+---------------------------------------------------------------+
| | TOOL · Bash · awaiting result · just now    ○ in-flight     |  <- pill = Fraunces SC marginalia
| |---------------------------------------------------------    |     ○ = hollow status dot
| |                                                             |
| | > Arguments  bun run test:e2e                               |
| |                                                             |
| | "No tool_result observed before end of stream."             |  <- ink-muted italic explanation
| |                                                             |
+-^-------------------------------------------------------------+
  |
  +-- in-flight rail: var(--color-ink-muted) 2 px, 0.55 alpha
      (NOT sienna — the muted rail signals "incomplete").
```

## Distinct from a paired-but-failed lifecycle

| Aspect              | Orphan tool_use         | Paired lifecycle, failed   |
|---------------------|-------------------------|-----------------------------|
| `pairWithIndex`     | `null`                  | `number` (matching result)  |
| Rail color          | --color-ink-muted       | --color-error               |
| Status dot          | hollow (border only)    | filled error                |
| Status label        | "in-flight"             | "failed"                    |
| Marginalia pill     | "awaiting result"       | (none)                      |
| Body                | args + explanatory note | args + result with errors   |

The visual distinction is intentional: an orphan use is an
*incomplete* call, not a *failed* one. The reader should not assume
the lifecycle errored just because no result is present.
