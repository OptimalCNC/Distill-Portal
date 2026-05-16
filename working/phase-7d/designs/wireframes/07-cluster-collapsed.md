# Wireframe 07 — Cluster (collapsed)

When 2+ adjacent hints all carry `kind === "metadata"`, the
`clusterMetadata` renderHints pass collapses them into a
`metadata-cluster-head` hint that renders as a single `<details>`
row. Threshold matches Phase 7c polish-r2's lowered
`GROUP_THRESHOLD` (3 → 2).

## Collapsed state

```
        ▸  2 metadata events
```

DOM:

```html
<li class="msg msg-li">
  <details class="msg-metadata-cluster">
    <summary aria-label="2 metadata events, click to expand">
      <span class="meta-prefix" aria-hidden="true">·</span>
      <span class="meta-cluster-count">2 metadata events</span>
    </summary>
    <ol class="meta-cluster-body" role="list" hidden>
      <!-- nested rows live here -->
    </ol>
  </details>
</li>
```

Typography:

- `.meta-cluster-count` — `--font-chrome`, `--text-xs`, uppercase,
  letter-spaced 0.08em, `--color-ink-muted`.
- The native disclosure triangle (browser-rendered) sits at the
  inline-start before the middle-dot prefix.

## Sample copies

The count text is `{N} metadata events` — plural noun verbatim
regardless of N. For N=1 the cluster doesn't exist (threshold is 2);
the row renders individually as a hairline (or as an echo glyph,
depending on the source `metaCategory`).

```
        ▸  2 metadata events     ← typical turn boundary (permission-mode + last-prompt)
        ▸  3 metadata events
        ▸  6 metadata events
        ▸  12 metadata events
```

A cluster of mixed hairline + echo rows uses the same summary
copy. The expanded body distinguishes by per-row register (§ 08).

## Focus behavior

The `<summary>` is the cluster's single focus stop. Tab moves to it;
Enter / Space toggles. Native focus ring (Phase 5 inherited).

## Accessibility

Screen readers announce the disclosure as `"2 metadata events,
click to expand, button, collapsed"`. After expansion: `"expanded"`.
