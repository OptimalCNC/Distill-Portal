# Codex Storage Guide for Distill Portal

## Purpose

This document is the Distill Portal integration guide for Codex session storage.

It is intended to help the Distill Portal developer implement the `codex` collector adapter, parser, skim-block builder, and sync behavior defined in [PRD.md](../PRD.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

These notes are based on local inspection on 2026-04-18 of:

- `codex --version` -> `codex-cli 0.121.0`

Observed storage layout and schemas can change in future Codex releases. The adapter should therefore be tool-aware, raw-first, and explicit about parse failures.

## Distill Portal v1 Contract for Codex

| Decision | Distill Portal behavior |
| --- | --- |
| Main transcript source | Ingest only the main session `.jsonl` file under `~/.codex/sessions/YYYY/MM/DD/`. |
| Source of truth | Store the raw JSONL bytes exactly as collected. Do not flatten Codex into a generic conversation schema. |
| Project grouping | Derive `project_path` from `session_meta.payload.cwd`, using `turn_context.payload.cwd` only as corroboration. |
| Dedup key | Use `(tool = codex, source_session_id = <session-id>)`. |
| Skim blocks | Build blocks from Codex user-turn events, not from every `response_item.message` record. |
| Boundary handling | Keep tool-initiated boundaries distinct from user-turn blocks instead of merging them into neighboring blocks. |

## Where Codex Stores Session Artifacts

### Main session files

Codex stores primary sessions under a date-bucketed directory tree:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<session-id>.jsonl
```

Observed examples:

```text
~/.codex/sessions/2026/04/17/rollout-2026-04-17T19-00-32-019d9b19-7dbe-7513-a559-38a19d88f0ea.jsonl
~/.codex/sessions/2026/04/09/rollout-2026-04-09T15-13-36-019d7116-daa4-7701-9ef8-f125ae40fdfb.jsonl
```

Key observations:

- the filename contains the session id
- sampled files start with a `session_meta` record whose payload repeats that id
- the directory path is date-based, not project-based

### Related directories

| Artifact | Example path | Use in Distill Portal v1 |
| --- | --- | --- |
| Main session transcript | `~/.codex/sessions/YYYY/MM/DD/rollout-...jsonl` | Ingest |
| Shell snapshots | `~/.codex/shell_snapshots` | Ignore for v1 ingestion |
| Logs | `~/.codex/log` | Ignore for v1 ingestion |
| Memories | `~/.codex/memories` | Ignore for v1 ingestion |
| Prompts | `~/.codex/prompts` | Ignore for v1 ingestion |
| Rules | `~/.codex/rules` | Ignore for v1 ingestion |
| Temp files | `~/.codex/tmp` | Ignore for v1 ingestion |

## Recommended Discovery Rules

### Discovery glob

For v1, the Codex collector should discover session files by scanning:

```text
~/.codex/sessions/*/*/*/*.jsonl
```

The date bucket is useful for discovery only. It must not be used for project attribution.

### Session identity extraction

Use the filename to extract `source_session_id`:

```text
rollout-2026-04-17T19-00-32-019d9b19-7dbe-7513-a559-38a19d88f0ea.jsonl
-> source_session_id = 019d9b19-7dbe-7513-a559-38a19d88f0ea
```

Then validate during parse:

- the first `session_meta.payload.id` should match
- if it matches, accept
- if it is missing but the file otherwise parses, keep the filename-derived id and log a warning
- if it conflicts, treat the file as malformed and surface a parse failure

## On-Disk Format

Codex session files are JSON Lines:

```text
one JSON object per line
```

Important properties for the collector:

- the file behaves like an append-only event log
- the collector must parse strictly line by line
- the collector must ignore a partially-written trailing line until the next poll
- the raw JSONL should be stored exactly as safely-read

Unlike Claude Code, Codex uses a regular outer envelope:

- top-level `timestamp`
- top-level `type`
- top-level `payload`

The schema complexity lives mostly inside `payload`.

## Rough Outer Record Shape

### Observed outer record types

Observed in sampled Codex sessions:

- `session_meta`
- `event_msg`
- `response_item`
- `turn_context`

### `session_meta`

Observed `payload` keys:

- `id`
- `timestamp`
- `cwd`
- `originator`
- `cli_version`
- `source`
- `model_provider`
- `base_instructions`

Observed `originator` values:

- `codex-tui`
- `codex_sdk_ts`
- `codex_exec`

Distill Portal implication:

- do not assume all Codex sessions come from the TUI
- `cwd` here is the primary source for `project_path`

### `turn_context`

Observed `payload` keys:

- `turn_id`
- `cwd`
- `current_date`
- `timezone`
- `approval_policy`
- `sandbox_policy`
- `model`
- `personality`
- `collaboration_mode`
- `effort`
- `summary`
- `truncation_policy`
- `realtime_active`

Distill Portal implication:

- this is execution context, not by itself a human user turn
- `turn_id` is essential for Codex skim-block keys and relinking

### `event_msg`

Observed nested payload types:

- `task_started`
- `user_message`
- `token_count`
- `agent_message`
- `exec_command_end`
- `patch_apply_end`
- `task_complete`

Observed `user_message` payload keys:

- `message`
- `images`
- `local_images`
- `text_elements`
- `type`

Observed `agent_message` payload keys:

- `message`
- `phase`
- `memory_citation`
- `type`

Observed `exec_command_end` payload keys:

- `aggregated_output`
- `call_id`
- `command`
- `cwd`
- `duration`
- `exit_code`
- `formatted_output`
- `parsed_cmd`
- `process_id`
- `source`
- `status`
- `stderr`
- `stdout`
- `turn_id`
- `type`

Observed `patch_apply_end` payload keys:

- `call_id`
- `changes`
- `status`
- `stderr`
- `stdout`
- `success`
- `turn_id`
- `type`

Distill Portal implication:

- many user-visible and tool-visible events live here
- command completion and patch application are agent-side reaction events, not user-turn anchors

### `response_item`

Observed nested payload types:

- `message`
- `reasoning`
- `function_call`
- `function_call_output`
- `custom_tool_call`
- `custom_tool_call_output`

Observed `message` payload keys:

- `content`
- `role`
- `type`

Observed `message.role` values:

- `assistant`
- `user`
- `developer`

Observed content item types:

- `output_text`
- `input_text`

Observed `function_call` payload keys:

- `arguments`
- `call_id`
- `name`
- `type`

Observed common function-call names:

- `exec_command`
- `write_stdin`
- `update_plan`
- `wait_agent`
- `spawn_agent`

Observed `custom_tool_call` payload keys:

- `call_id`
- `input`
- `name`
- `status`
- `type`

Observed custom tool name:

- `apply_patch`

Distill Portal implication:

- not every `response_item.message` is a human or assistant conversational turn
- `developer` and `user` messages often represent injected context or system framing, not the user's actual prompt for skim grouping
- tool-call records here are part of the agent reaction stream

### `reasoning`

Observed keys:

- `content`
- `encrypted_content`
- `summary`
- `type`

Distill Portal implication:

- reasoning records belong in raw transcript provenance
- encrypted reasoning is not plain-text searchable or directly suitable for skim summaries

## Mapping Codex Into Distill Portal Shared Fields

| Shared field / hint | Codex adapter recommendation |
| --- | --- |
| `tool` | Constant `codex` |
| `source_session_id` | Filename-derived session id validated against `session_meta.payload.id` |
| `source_path` | Absolute path to the main session JSONL |
| `raw_blob` | Exact bytes of the safely-read main JSONL |
| `project_path` | Prefer `session_meta.payload.cwd`; use `turn_context.payload.cwd` only as corroboration |
| `created_at` | Prefer `session_meta.payload.timestamp`; otherwise earliest outer `timestamp` |
| `updated_at` | Latest outer `timestamp`; fall back to file mtime if needed |
| `title_hint` | Derive from the first real `event_msg.user_message.message` |
| `originator_hint` | Preserve `session_meta.payload.originator` as tool-specific raw metadata |

### Project attribution details

Per [ARCHITECTURE.md](../ARCHITECTURE.md), the Codex adapter should:

- prefer `session_meta.payload.cwd`
- use `turn_context.payload.cwd` as corroboration
- never derive `project_path` from the date-based directory tree
- leave `project_path = null` if no trustworthy working directory is available

## Codex-Specific Skim-Block Guide

### What opens a `user_turn` block

For Codex, a skim block should open on a real user-turn event, which in current sampled files is:

- `type = event_msg`
- `payload.type = user_message`

This should be the primary user-turn anchor for the Codex adapter.

### What does not open a new block

These should not start a new skim block:

- `response_item.message` with `role = developer`
- `response_item.message` with `role = user` when it is clearly injected context rather than a real prompt
- `turn_context`
- `event_msg.task_started`
- `response_item.function_call`
- `response_item.function_call_output`
- `response_item.custom_tool_call`
- `response_item.custom_tool_call_output`
- `event_msg.exec_command_end`
- `event_msg.patch_apply_end`

### What belongs in `agent_events[]`

For Codex, the agent reaction after a user turn may include:

- `event_msg.agent_message`
- `response_item.message` with `role = assistant`
- `response_item.function_call`
- `response_item.function_call_output`
- `response_item.custom_tool_call`
- `response_item.custom_tool_call_output`
- `event_msg.exec_command_end`
- `event_msg.patch_apply_end`
- `event_msg.task_complete`

### Block key

Per [ARCHITECTURE.md](../ARCHITECTURE.md), Codex skim blocks relink by:

```text
block_key = codex:<session_uid>:<turn_id>:<idx>
```

where:

- `turn_id` comes from the current `turn_context`
- `idx` is the zero-based user-message index within that turn

Practical adapter guidance:

- track the most recent active `turn_context.payload.turn_id` as the stream is parsed
- when an `event_msg.user_message` appears, assign it to that current turn
- increment `idx` if multiple `user_message` events occur inside one turn

### Boundary blocks

Codex is the more likely source of explicit `boundary` blocks in v1 because it carries:

- turn-context changes
- task-start/task-complete events
- compaction or resume-like injected context messages

Recommendation:

- only emit a `boundary` block when the adapter can identify a tool-initiated marker with confidence
- do not use ordinary command completions or assistant chatter as boundaries
- keep the marker explicit rather than merging it into a neighboring `user_turn`

### Agent-only sessions

If a Codex session contains no real `event_msg.user_message`, render a single synthetic `agent_only` block.

This keeps the UI contract aligned with the PRD even for tool-driven or automated sessions.

## Sync, Update, and Relinking Guidance

### Safe fingerprinting

Use the architecture-defined `source_fingerprint` approach:

- last complete line offset
- line count
- last complete line hash
- source file mtime

### Expected update shape

Codex sessions look append-only in normal use. Distill Portal should therefore expect:

- more `event_msg` and `response_item` lines appended over time
- new `turn_context` blocks appearing as the run progresses
- existing `(turn_id, idx)` block keys remaining stable during ordinary appends

### Path changes

If the same `source_session_id` later appears at a different `source_path`, treat it as the same session and update provenance. Do not create a duplicate session.

### Summary relinking

Existing Codex summaries should relink by:

- `block_key = codex:<session_uid>:<turn_id>:<idx>`
- then content-hash guardrail

If the block content hash changes, mark the summary stale and regenerate lazily.

### Important parser caution

Codex mixes multiple layers in one file:

- human-visible conversation
- developer/system context
- tool-call requests
- tool-call results
- execution telemetry

The adapter should therefore avoid a naive "all message-like records are turns" approach. Distill Portal needs a tool-aware stream interpretation for Codex.

## Search, Scrubbing, and LLM-Egress Notes

Codex raw sessions can contain highly sensitive material because they capture:

- shell stdout and stderr
- patch inputs
- developer instructions
- environment and sandbox context

Practical guidance:

- keep raw search local
- apply the same pre-egress scrubber used by Summary and Distill
- assume scrubber coverage is imperfect
- rely on `do_not_send_to_llm` and Purge for real protection

## Recommended Test Fixtures for the Codex Adapter

The Distill Portal developer should build fixtures for at least:

1. Minimal session with `session_meta`, one `turn_context`, one `event_msg.user_message`, and a simple assistant reply.
2. Session with multiple turns and multiple `turn_context` records.
3. Session with `function_call` / `function_call_output` pairs.
4. Session with `custom_tool_call = apply_patch`.
5. Session with `exec_command_end` and `patch_apply_end` events.
6. Session with `developer` and injected `user` context messages that should not become skim anchors.
7. Session with no real `event_msg.user_message`, to validate `agent_only`.
8. Session with trailing partial JSONL line to verify safe-read truncation.
9. Session whose path changes while `source_session_id` remains the same.

## Implementation Checklist

- Discover only `~/.codex/sessions/*/*/*/*.jsonl` as session sources.
- Validate filename id against `session_meta.payload.id`.
- Derive `project_path` from `session_meta.payload.cwd`, never from the date directory.
- Preserve raw JSONL unchanged after safe read.
- Build skim blocks from `event_msg.user_message`, not from every message-like payload.
- Track `turn_context.turn_id` so block keys are stable.
- Keep tool calls and command completions inside `agent_events[]`.
- Treat context/resume markers as possible `boundary` blocks only when explicitly recognized.
