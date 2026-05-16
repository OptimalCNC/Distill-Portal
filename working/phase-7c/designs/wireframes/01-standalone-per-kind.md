# Wireframe 01 — Standalone (per existing kind, unchanged from Phase 5)

Spec ref: working/phase-7c.md §Data Model — `RenderHint.kind === "standalone"`.

Phase 7c keeps every Phase 5 per-kind treatment verbatim for the `standalone`
RenderHint. This wireframe shows the existing recipe for cross-reference so
the developer can verify that nothing about the per-kind render changes
when the message carries no pairing/grouping/inline-warning metadata.

```
.transcript-stream                                              max-inline-size 70ch
+--------------------------------------------------------------+
|                                                              |
|  +--------------------------------------------------------+  |  msg-user (5% accent tint)
|  | USER · 3 min ago                                       |  |
|  |--------------------------------------------------------|  |
|  | Please run the test suite and report results.          |  |
|  +--------------------------------------------------------+  |
|     gap: var(--space-4) = 16 px                              |
|  +--------------------------------------------------------+  |  msg-assistant (bare surface)
|  | ASSISTANT · just now                                   |  |
|  |--------------------------------------------------------|  |
|  | I'll run the suite now and report back.                |  |
|  +--------------------------------------------------------+  |
|     gap: var(--space-4) = 16 px                              |
|  +--------------------------------------------------------+  |  msg-tool-use (hairline)
|  | TOOL · Read · 2 min ago                                |  |
|  | > Arguments                                            |  |
|  +--------------------------------------------------------+  |
|     gap: var(--space-6) = 24 px (same-kind override)         |
|  +--------------------------------------------------------+  |  msg-tool-result (hairline)
|  | TOOL RESULT · Read · 2 min ago                         |  |
|  | <pre>file contents...</pre>                            |  |
|  | > Expand (1024 more bytes)                             |  |
|  +--------------------------------------------------------+  |
|     gap: var(--space-4) = 16 px                              |
|  +--------------------------------------------------------+  |  msg-system (no panel chrome)
|  | SYSTEM · session opened                                |  |
|  +--------------------------------------------------------+  |
|     gap: var(--space-8) = 32 px (boundary breathing)         |
|  --------------- SESSION  RESUMED ---------------             |  msg-boundary (chapter break)
|     gap: var(--space-8) = 32 px                              |
+--------------------------------------------------------------+
```

The standalone render is the existing Phase 5 vocabulary. Phase 7c
treats every message that does NOT participate in a pair/group/chip
as `standalone` and routes it through the same render branch.
