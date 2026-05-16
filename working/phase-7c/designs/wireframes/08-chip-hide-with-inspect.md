# Wireframe 08 — Inline warning chip — hide-with-inspect

Spec ref: working/phase-7c.md §Data Model — `InlineWarning.classification === "hide-with-inspect"`.

The chip is hidden behind a tiny corner affordance. The message card
shows a quiet bottom-right "{N} info · Inspect" link in accent
chrome-text. Clicking expands a nested chip with the full reason.
No vertical room is consumed when the affordance is collapsed.

```
+---------------------------------------------------------------+
| ASSISTANT · just now                                          |
|---------------------------------------------------------------|
| Tests passed; full report attached below.                     |
|                                                               |
|                                                               |
|                                          1 info · Inspect ▸   |  <- inspect-link affordance
+---------------------------------------------------------------+      bottom-right corner
                                                                       (--color-accent text)

Expanded (when the user clicks Inspect):

+---------------------------------------------------------------+
| ASSISTANT · just now                                          |
|---------------------------------------------------------------|
| Tests passed; full report attached below.                     |
|                                                               |
|                                          1 info · Inspect ▾   |
|                                                               |
|                  +--------------------------------------------+
|                  | ● info-only note   META                    |
|                  |                                            |
|                  |   parser routed this record through the    |
|                  |   default branch; not an anomaly.          |
|                  |   messageIndex: 91.                        |
|                  +--------------------------------------------+
+---------------------------------------------------------------+
```

## Affordance recipe

```
.inspect-link
  font-family: var(--font-chrome)
  font-size: var(--text-xs)
  color: var(--color-accent)
  cursor: pointer
  list-style: revert        (native disclosure triangle preserved)
  :hover { text-decoration: underline }
```

The link sits in a flex container `justify-content: flex-end` so it
attaches to the message card's bottom-right corner. Native `<details>`
handles the expansion; the inner chip is the same recipe as the
other buckets.

## Why info-severity routes here

`info` severity warnings are typically meta or trace-style: they are
useful for the developer doing parser bring-up, but they would clutter
the reading surface for a session inspector. The hide-with-inspect
bucket keeps them ONE click away without inflating the reading column.
