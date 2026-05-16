# Wireframe 09 — Metadata flushes a tool batch

Per §5.1: a metadata standalone is a delimiter for the
`groupLifecycles` pass. A metadata row mid-batch flushes the buffer
and renders at top level.

## Input stream

```
tool_use Edit (#42)
tool_result (#43)
tool_use Edit (#44)
tool_result (#45)
tool_use Edit (#46)
tool_result (#47)
system permission-mode (#48)            ← metadata standalone
tool_use Edit (#49)
tool_result (#50)
tool_use Edit (#51)
tool_result (#52)
```

## Rendered output

With `GROUP_THRESHOLD = 2`:

```
┌──────────────────────────────────────────────────────────────┐
│ ▸  Edit · 3 calls                              ● all succeeded│   ← group head 1
└──────────────────────────────────────────────────────────────┘
        ·  PERMISSION MODE  →  default                              ← metadata hairline (top level)
┌──────────────────────────────────────────────────────────────┐
│ ▸  Edit · 2 calls                              ● all succeeded│   ← group head 2
└──────────────────────────────────────────────────────────────┘
```

The metadata row appears at top level between two group heads. The
reader sees the structural break: a permission-mode event paused
the batch.

## Rationale

The minimum-disruption principle would have argued metadata should
be passthrough (so the batch doesn't split). But this design
treats mid-batch metadata as a deliberate structural cue: when the
agent changes permission mode, an attachment lands, the user
enqueues a prompt — those are not invisible chrome events, they
are turn-shape disturbances. The flush makes them visible at top
level so the reader can see the temporal cause-and-effect.

Phase 7c's `system` errors / Codex telemetry use the same flush
behavior. Phase 7d extends the rule to metadata.

## Alternative considered

A metadata-passthrough mode would have rendered:

```
┌──────────────────────────────────────────────────────────────┐
│ ▾  Edit · 5 calls                              ● all succeeded│   ← single group, expanded
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ TOOL · Edit · 1                              ● succeeded │ │
│ │ TOOL · Edit · 2                              ● succeeded │ │
│ │ TOOL · Edit · 3                              ● succeeded │ │
│ │ ·  PERMISSION MODE  →  default                           │ │   ← buried
│ │ TOOL · Edit · 4                              ● succeeded │ │
│ │ TOOL · Edit · 5                              ● succeeded │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Rejected — the permission-mode event is invisible when the group is
collapsed. The reader skims a "5 Edit calls all succeeded" group
and misses the permission-mode change.
