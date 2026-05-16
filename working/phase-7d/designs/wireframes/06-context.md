# Wireframe 06 — `context` category

Covers: Codex `turn_context`.

Source fixture:

```json
{"type":"turn_context","payload":{"cwd":"/workspace/distill-portal","current_date":"2026-05-16"}}
```

Rendered hairline:

```
        ·  TURN CONTEXT  →  cwd /workspace/distill-portal
```

The `current_date` field is dropped from the inline display — the
session header already carries the start time; the per-turn date
is noise at this register.

## With model / sandbox / approval

A real-world `turn_context` carries additional fields per the
matrix entry:

```json
{"type":"turn_context","payload":{
  "cwd":"/workspace/distill-portal",
  "model":"gpt-5",
  "sandbox":"read-only",
  "approval":"on-request"
}}
```

Rendered:

```
        ·  TURN CONTEXT  →  cwd /workspace/distill-portal · model gpt-5 · sandbox read-only · approval on-request
```

The display formula appends ` · model {X}`, ` · sandbox {Y}`, and
` · approval {Z}` IF the respective field is set in the payload.
Order is fixed: cwd first, model, sandbox, approval. Each
middle-dot separator is U+00B7.

**Round-2 open-question resolution** (designer's call): the
`approval` field is **always appended** when present in the
payload. Round 1 considered an "only-if-differs-from-session-
default" rule; the designer chose always-append because (a) the
field is security-relevant and a per-turn audit trail benefits from
always seeing it, (b) detecting "differs from session default"
requires reaching into session-header state from the renderHints
layer, which the layer otherwise avoids, and (c) the truncation
rule (78 chars + U+2026) handles oversize automatically.

## Long cwd truncation

A long cwd path uses a leading ellipsis to keep the trailing
directory visible:

```
        ·  TURN CONTEXT  →  cwd …/long-path-to-the-repo/distill-portal · model gpt-5
```

Truncation rule: if `cwd` is longer than 40 chars, replace the
leading portion with U+2026 to keep the last 39 chars visible. The
full cwd is in the hover tooltip.

aria-label: `"Metadata: turn context, cwd /workspace/distill-portal,
model gpt-5, sandbox read-only"`
