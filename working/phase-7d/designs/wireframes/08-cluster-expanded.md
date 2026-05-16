# Wireframe 08 — Cluster (expanded)

The same disclosure opened. The body renders each nested metadata
row in its native register (hairline OR echo glyph), slightly more
indented to visually parent into the cluster summary.

## Expanded state — hairline-only N=2 (typical turn boundary)

```
        ▾  2 metadata events
            ·  PERMISSION MODE  →  default
            ·  LAST PROMPT  :  "Deliver phase 7a."
```

DOM (with disclosure open):

```html
<li class="msg msg-li">
  <details class="msg-metadata-cluster" open>
    <summary>
      <span class="meta-prefix" aria-hidden="true">·</span>
      <span class="meta-cluster-count">2 metadata events</span>
    </summary>
    <ol class="meta-cluster-body" role="list">
      <li>
        <p class="msg-metadata" data-category="control"
           title='{"type":"permission-mode","permissionMode":"default"}'
           aria-label="Metadata: permission mode set to default">
          <span class="meta-prefix" aria-hidden="true">·</span>
          <span class="meta-label">permission mode</span>
          <span class="meta-sep" aria-hidden="true">→</span>
          <span class="meta-value">default</span>
        </p>
      </li>
      <li>
        <p class="msg-metadata" data-category="prompt"
           title='{"type":"last-prompt","prompt":"Deliver phase 7a."}'
           aria-label="Metadata: last prompt — Deliver phase 7a.">
          <span class="meta-prefix" aria-hidden="true">·</span>
          <span class="meta-label">last prompt</span>
          <span class="meta-sep" aria-hidden="true">:</span>
          <span class="meta-value">"Deliver phase 7a."</span>
        </p>
      </li>
    </ol>
  </details>
</li>
```

## Expanded state — mixed hairline + echo

```
        ▾  2 metadata events
            ·  TOKENS  :  127↓ 245↑
            ·  ↺                              (hover: "duplicate of event_msg.agent_message at line 87")
```

DOM excerpt for the echo member:

```html
<li>
  <p class="msg-metadata msg-metadata-echo" data-category="echo"
     title="duplicate of event_msg.agent_message at line 87"
     aria-label="Echo: duplicate of canonical assistant message at line 87">
    <span class="meta-prefix meta-prefix-echo" aria-hidden="true">↺</span>
  </p>
</li>
```

## Expanded state — echo-only N=2

```
        ▾  2 metadata events
            ·  ↺                              (hover: "duplicate of event_msg.user_message at line 42")
            ·  ↺                              (hover: "duplicate of event_msg.agent_message at line 87")
```

Each nested row inherits its native register from the source
`Message.metaCategory`. The cluster summary copy is uniform
("N metadata events"); the per-row register lives inside.

## Indentation

The cluster summary indents `--space-6` (24 px) from the column
edge, same as a single-row hairline.

The nested rows indent an ADDITIONAL `--space-3` (12 px) past that,
so they sit 36 px from the column edge. This extra inset visually
parents the rows into the cluster summary without introducing a
nested card or background tint.

## Motion

The native `<details>` `block-size` transition (200 ms) plays on
expand / collapse. Reduced-motion zeros it. Phase 5 M4 motion
budget inherited verbatim.
