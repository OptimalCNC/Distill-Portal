# Wireframe 05 — Lifecycle inside an expanded group

Spec ref: working/phase-7c.md §Data Model — `RenderHint.kind === "group-member"`.

A single member lifecycle as it appears INSIDE the expanded group
container. Visually similar to the top-level lifecycle card (wireframe 02),
with three differences:

1. Background is `--color-surface-raised` (not bare `--color-surface`).
2. The sienna inline-start rail is the SAME 2px accent stripe; only the
   backdrop changes.
3. The card carries no outer `margin-block` of its own — the parent
   `.group-members` container governs the inter-member rhythm.

```
   parent .group-members container (bg = --color-surface-raised? NO, just spacing)
   +-----------------------------------------------------------+
   |                                                           |
   |  +-----------------------------------------------------+  |  group-member lifecycle-card
   |  | | TOOL · Read · 5 min ago               ● succeeded |  |  on --color-surface-raised
   |  | |----------------------------------------------     |  |
   |  | | > Arguments  { "file_path": ".../tokens.css" }    |  |
   |  | |                                                   |  |
   |  | | > Result     read 4.1 KB                          |  |
   |  | |                                                   |  |
   |  +-^---------------------------------------------------+  |
   |    |  2 px sienna rail var(--color-accent) at 0.55 alpha  |
   |                                                           |
   +-----------------------------------------------------------+

   Notes:
   - The card hairline border (var(--color-border) 1px) reads softly
     against the raised surface — same border token, slight reduction
     in apparent contrast. WCAG-irrelevant (border is decorative SC 1.4.11).
   - The pre/code blocks inside this member still use --color-surface-raised
     for their background — they read flush with the member surface, which
     is fine because the member card itself is now on a raised surface
     (production should consider whether to bump pre backgrounds further;
     prototype leaves them at surface-raised to avoid introducing a token).
   - The disclosure triangles are the same native marker the browser
     renders for any <details>. No customization.
```
