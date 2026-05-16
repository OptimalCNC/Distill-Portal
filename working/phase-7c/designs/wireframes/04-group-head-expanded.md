# Wireframe 04 — Group head expanded

Spec ref: working/phase-7c.md §Data Model — `RenderHint.kind === "group-head"`,
`<details>` open. Members render as their full lifecycle cards on the
RAISED surface so the nested visual hierarchy reads clearly.

```
+-----------------------------------------------------------------+
| ▾ Read │ 3 calls │                          ● all succeeded     |  <- group head (same as collapsed)
|-----------------------------------------------------------------|  <- hairline border-top divider
|                                                                 |
|   +---------------------------------------------------------+   |
|   | | TOOL · Read · 5 min ago               ● succeeded     |   |  <- group-member.lifecycle-card
|   | |-----------------------------------------------------  |   |     on var(--color-surface-raised)
|   | | > Arguments  tokens.css                               |   |
|   | | > Result     read 4.1 KB                              |   |
|   +-^-------------------------------------------------------+   |
|     |    sienna rail (var(--color-accent), 0.55 opacity)         |
|                                                                 |
|       gap: var(--space-4) = 16 px between members               |
|                                                                 |
|   +---------------------------------------------------------+   |
|   | | TOOL · Read · 5 min ago               ● succeeded     |   |
|   | |-----------------------------------------------------  |   |
|   | | > Arguments  TranscriptView.tsx                       |   |
|   | | > Result     read 21.4 KB                             |   |
|   +-^-------------------------------------------------------+   |
|                                                                 |
|       gap: var(--space-4) = 16 px                               |
|                                                                 |
|   +---------------------------------------------------------+   |
|   | | TOOL · Read · 5 min ago               ● succeeded     |   |
|   | |-----------------------------------------------------  |   |
|   | | > Arguments  types.ts                                 |   |
|   | | > Result     read 6.2 KB                              |   |
|   +-^-------------------------------------------------------+   |
|                                                                 |
+-----------------------------------------------------------------+
```

## Key visual decisions

1. **Member cards sit on `--color-surface-raised`** (one notch up from
   the page's bare `--color-surface`). The outer group hairline reads
   as the boundary; the inner raised surface marks them as nested
   machinery without inventing a new color.
2. **The group-head summary row** stays visually identical when open
   or closed; the difference is the hairline `border-top` on the
   `.group-members` container plus the disclosure-triangle rotation
   the browser provides natively.
3. **Member rhythm = 16 px (var(--space-4))** — matching the default
   Phase 5 rhythm between adjacent messages. The grouping itself
   creates the visual cluster; we don't tighten the rhythm further.
4. **Native `<details>` only.** No React controlled `open` state.
   Browser-managed open state survives tab switches per Phase 5 M5/M6
   precedent and Phase 7c Resolved Decision #9.
