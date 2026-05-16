# Wireframe 03 — Group head collapsed

Spec ref: working/phase-7c.md §Data Model — `RenderHint.kind === "group-head"`,
collapsed via native `<details>` (Resolved Decision #9).

```
+---------------------------------------------------------------+
| ▸ Read │ 12 calls │                          ● all succeeded  | <- the only visible row when collapsed
+---------------------------------------------------------------+
  ^   ^      ^         ^                          ^
  |   |      |         |                          |
  |   |      |         |                          +-- aggregate-label
  |   |      |         |                              chrome text (uppercase, letter-spaced)
  |   |      |         |                              + status dot (color reinforces)
  |   |      |         |
  |   |      |         +-- gap to right-align the aggregate via margin-inline-start: auto
  |   |      |
  |   |      +-- count badge: 12 calls
  |   |          var(--font-mono) var(--text-xs)
  |   |          var(--color-surface-raised) bg
  |   |          1px var(--color-border) hairline
  |   |          var(--radius-sm) corners
  |   |
  |   +-- hairline divider (1px wide × 1em tall) var(--color-border)
  |
  +-- tool name: "Read"
      var(--font-mono) var(--text-sm) var(--color-ink)

Whole row sits on var(--color-surface) with var(--color-border) 1px
hairline + var(--radius-md) corners + var(--space-3) var(--space-4)
padding. Native browser disclosure triangle preserved (list-style: revert).
```

## Mixed status variant

```
+---------------------------------------------------------------+
| ▸ exec │ 3 calls │              ● 2 succeeded · 1 failed      |
+---------------------------------------------------------------+
                                  ^
                                  +-- warn-colored dot, label
                                      reads as "2 of 3 succeeded".
```

## In-flight variant

```
+---------------------------------------------------------------+
| ▸ Bash │ 5 calls │                  ○ running 2 of 5          |
+---------------------------------------------------------------+
                                      ^
                                      +-- HOLLOW dot (ink-muted border, transparent fill).
                                          No spinner: the editorial aesthetic forbids
                                          motion-y indicators. The label carries the meaning.
```

## All-failed variant

```
+---------------------------------------------------------------+
| ▸ apply_patch │ 4 calls │                    ● all failed     |
+---------------------------------------------------------------+
                                              ^
                                              +-- error-colored dot.
```
