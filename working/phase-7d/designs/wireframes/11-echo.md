# Wireframe 11 — `echo` category

Covers: Codex `response_item.message role="user"` and
`response_item.message role="assistant"` — the 2 duplicate-anchor
variants. Phase 7d round-2 amendment: these surface as
**echo glyph rows** rather than staying silenced.

## Why echo (not hairline)

The canonical content lives in `event_msg.user_message` /
`event_msg.agent_message`, which already renders as a body-weight
user/assistant message. Rendering the duplicate row at hairline
weight would still echo the content twice — visually competing
with the canonical row.

The echo register is the design's answer to "no event hidden, but
do not duplicate". A single glyph in the marginalia gutter says
"this event existed" without claiming any of the reader's attention
beyond presence. The hover tooltip resolves the cross-reference.

## Source fixtures

```json
{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Refactor the dark-mode block."}]}}
```

```json
{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Done. The dark block is re-derived."}]}}
```

Both rows land on a single NDJSON line that ALSO carries an
`event_msg.user_message` / `event_msg.agent_message` for the same
content. The parser records the `lineOrdinal` in
`Message.echoOf.lineOrdinal` so the back-pointer resolves to the
canonical row.

## Rendered echo

```
        ·  ↺
```

The glyph is a single `↺` (U+21BA, ANTICLOCKWISE OPEN CIRCLE ARROW)
in `--color-ink-muted` at `--text-xs`. No label, no value, no
separator. Total horizontal footprint ~30 px; total vertical
footprint ~16 px (half a hairline).

Spans:

```
.meta-prefix-echo
   ↓
   ↺
   (font-chrome, text-xs, ink-muted)
```

## DOM

```html
<li class="msg msg-li">
  <p class="msg-metadata msg-metadata-echo" data-category="echo"
     title="duplicate of event_msg.user_message at line 42"
     aria-label="Echo: duplicate of canonical user message at line 42">
    <span class="meta-prefix meta-prefix-echo" aria-hidden="true">↺</span>
  </p>
</li>
```

## Tooltip resolution

The `title` attribute holds the back-pointer string:

```
duplicate of event_msg.user_message at line 42
```

or

```
duplicate of event_msg.agent_message at line 87
```

The line number comes from `Message.echoOf.lineOrdinal` (0-indexed
NDJSON line). Format: `duplicate of {event_msg.user_message |
event_msg.agent_message} at line {N}`.

If the parser cannot determine the canonical line (defensive
fallback), the tooltip degrades to `duplicate of canonical
{user,assistant} message (line unknown)` and the aria-label
mirrors.

## Aria-label

```
Echo: duplicate of canonical user message at line 42
```

or

```
Echo: duplicate of canonical assistant message at line 87
```

The label distinguishes from the hairline aria-labels (which start
with `Metadata:`) — screen readers can announce the visual
distinction.

## Glyph choice

`↺` (U+21BA) chosen for:

- Recognizable "loopback / refer back" semantic — closest unicode
  match for "echo".
- Lightweight stroke; available in every system font; no font-
  fallback surprises.
- Distinct from the hairline middle-dot (`·`) — readers cannot
  confuse the two registers.

Alternatives considered:
- `⟲` (U+27F2) — same semantic, heavier weight; too loud.
- `※` (U+203B reference mark) — closer to "see also" semantic but
  weight-heavy in most fonts.
- `↻` (U+21BB CLOCKWISE OPEN CIRCLE ARROW) — same weight as `↺`
  but the clockwise direction reads as "redo / forward in time"
  rather than "loop back to a prior anchor". `↺` is the better
  semantic fit.

## Cluster participation

Echo rows participate in the cluster collapse at the same
threshold as hairlines (`METADATA_COLLAPSE_THRESHOLD = 2`). A run
of 2+ echo rows OR a mixed hairline + echo run collapses into the
standard `<details>` cluster. The cluster summary says "N metadata
events" regardless of mix; the expanded body renders each member in
its native register (§ 08).

## Focus & accessibility

Echo rows are NOT focusable (same as hairlines). The cluster
summary is the focus stop.

Screen-reader announcement (for a standalone echo row):
`"Echo: duplicate of canonical user message at line 42"`.

Inside a cluster, the echo row's aria-label is announced as part
of the expanded body walk.
