# Claude Code Storage Guide for Distill Portal

## Purpose

This document is the Distill Portal integration guide for Claude Code session storage.

It is intentionally narrower than a general "how Claude Code works" note. The goal is to help the Distill Portal developer build the `claude_code` collector adapter, parser, renderer input model, and sync behavior described in [PRD.md](../PRD.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

These notes are based on local inspection on 2026-04-18 of:

- `claude --version` -> `2.1.114 (Claude Code)`

Observed storage layout and schemas can change in future Claude Code releases. The adapter should therefore be conservative, raw-first, and explicit about parse failures.

## Distill Portal v1 Contract for Claude Code

| Decision | Distill Portal behavior |
| --- | --- |
| Main transcript source | Ingest only the primary session `.jsonl` file under `~/.claude/projects/<project-key>/<session-id>.jsonl`. |
| Source of truth | Store the raw JSONL bytes exactly as collected. Do not normalize Claude sessions into a cross-tool transcript schema. |
| Subagent sidecars | Detect `subagents/` directories and expose `has_subagent_sidecars = true`, but do not ingest sidecar JSONL content in v1. |
| Project grouping | Derive `project_path` primarily from `cwd` inside records. Use the folder `<project-key>` only as a fallback hint. |
| Dedup key | Use `(tool = claude_code, source_session_id = <session-id>)`. |
| Skim blocks | Build blocks from actual human user turns, not from Claude's synthetic tool-result `user` records. |

## Where Claude Code Stores Session Artifacts

### Main transcript files

Claude Code stores primary session transcripts here:

```text
~/.claude/projects/<project-key>/<session-id>.jsonl
```

Observed examples:

```text
~/.claude/projects/-home-huwei-ai-codings-sub2api/602e6403-4100-44c2-9893-70eb34e8f959.jsonl
~/.claude/projects/-mnt-d-Dropbox-OptimalCNC-MetaNC/3271ca0b-c5f4-470e-8bce-4380122d627f.jsonl
```

Key observations:

- `<session-id>` is UUID-like and also appears inside records as `sessionId`.
- `<project-key>` is a sanitized absolute path such as `-home-huwei-ai-codings-sub2api`.
- The directory is project-grouped, which is useful for discovery, but `cwd` inside records is the stronger source for `project_path`.

### Related artifacts around a session

| Artifact | Example path | Use in Distill Portal v1 |
| --- | --- | --- |
| Main transcript | `~/.claude/projects/<project-key>/<session-id>.jsonl` | Ingest |
| Subagent transcript | `~/.claude/projects/<project-key>/<session-id>/subagents/agent-<id>.jsonl` | Do not ingest |
| Subagent metadata | `~/.claude/projects/<project-key>/<session-id>/subagents/agent-<id>.meta.json` | Do not ingest; presence may drive `has_subagent_sidecars` |
| Tool-result spill files | `~/.claude/projects/<project-key>/<session-id>/tool-results/...` | Do not ingest in v1 |
| File history | `~/.claude/file-history/<session-id>/...` | Ignore for v1 ingestion |
| Session environment | `~/.claude/session-env/<session-id>/...` | Ignore for v1 ingestion |
| Tasks | `~/.claude/tasks/<session-id>/...` | Ignore for v1 ingestion |
| Small runtime session metadata | `~/.claude/sessions/*.json` | Ignore as transcript source |
| Global config | `~/.claude.json` | Ignore as transcript source |

## Recommended Discovery Rules

### Discovery glob

For v1, the Claude collector should discover primary session files by scanning:

```text
~/.claude/projects/*/*.jsonl
```

and explicitly excluding:

- nested `subagents/*.jsonl`
- any non-JSONL sidecars under `<session-id>/`

### Session identity extraction

Use the filename stem as the first extraction of `source_session_id`:

```text
602e6403-4100-44c2-9893-70eb34e8f959.jsonl
-> source_session_id = 602e6403-4100-44c2-9893-70eb34e8f959
```

Then validate during parse:

- if parsed records consistently carry the same `sessionId`, accept
- if `sessionId` is missing but the file otherwise parses, keep the filename-derived id and log a warning
- if records carry a conflicting `sessionId`, treat the file as malformed and surface a parse failure rather than inventing a new identity

This matches the architecture's requirement that `(tool, source_session_id)` stay stable and trustworthy.

## On-Disk Format

Claude Code main session files are JSON Lines:

```text
one JSON object per line
```

Important properties for the collector:

- the file behaves like an append-only event log
- the collector must parse line by line
- the collector must tolerate a partially-written trailing line and ignore it until the next poll
- the raw file should be stored as-is in the Raw Store after safe-read truncation of any incomplete trailing bytes

## Rough Record Shape

### Common top-level fields

Many Claude Code record types include some or most of:

- `type`
- `sessionId`
- `timestamp`
- `uuid`
- `parentUuid`
- `cwd`
- `entrypoint`
- `version`
- `gitBranch`
- `userType`
- `isSidechain`
- `slug`

### Observed top-level record types

Observed in a sampled real session:

- `permission-mode`
- `file-history-snapshot`
- `user`
- `attachment`
- `system`
- `assistant`
- `custom-title`
- `agent-name`
- `queue-operation`
- `last-prompt`

This is an event stream, not a single nested chat object.

## Parser-Relevant Record Semantics

### `user`

Observed top-level keys:

- `cwd`
- `entrypoint`
- `gitBranch`
- `isMeta`
- `isSidechain`
- `message`
- `origin`
- `parentUuid`
- `permissionMode`
- `promptId`
- `sessionId`
- `sourceToolAssistantUUID`
- `timestamp`
- `toolUseResult`
- `type`
- `userType`
- `uuid`
- `version`

Observed shapes:

- human-authored prompt: `message.content` is a string
- tool result echo: `message.content` is a list whose items include `type = tool_result`

Observed `tool_result` item keys:

- `content`
- `is_error`
- `tool_use_id`
- `type`

Observed `toolUseResult` keys:

- `stdout`
- `stderr`
- `interrupted`
- `isImage`
- `noOutputExpected`

Distill Portal implication:

- not every Claude `user` record is a human user turn
- a `user` record whose content is only `tool_result` is part of the agent reaction and must not start a new skim block

### `assistant`

Observed top-level keys:

- `cwd`
- `entrypoint`
- `gitBranch`
- `isApiErrorMessage`
- `isSidechain`
- `message`
- `parentUuid`
- `sessionId`
- `slug`
- `timestamp`
- `type`
- `userType`
- `uuid`
- `version`

Observed `message` keys:

- `content`
- `id`
- `model`
- `role`
- `stop_details`
- `stop_reason`
- `stop_sequence`
- `type`
- `usage`

Observed assistant content item types:

- `thinking`
- `tool_use`
- `text`

Observed `tool_use` keys:

- `caller`
- `id`
- `input`
- `name`
- `type`

Observed example `tool_use.input` keys for a Bash call:

- `command`
- `description`

Distill Portal implication:

- Claude splits one tool execution across two parts:
  - assistant `tool_use`
  - later synthetic user `tool_result`
- the Claude renderer and skim-block builder must keep those two pieces in the same agent-reaction region

### `attachment`

Observed top-level keys:

- `attachment`
- `cwd`
- `entrypoint`
- `gitBranch`
- `isSidechain`
- `parentUuid`
- `sessionId`
- `timestamp`
- `type`
- `userType`
- `uuid`
- `version`

Observed attachment categories:

- `file`
- `skill_listing`
- `task_reminder`
- `date_change`
- `plan_mode`
- `plan_mode_exit`
- `queued_command`

Observed file-attachment shape:

- `attachment.type = "file"`
- `attachment.filename`
- `attachment.displayPath`
- `attachment.content`

Observed `attachment.content.file` keys:

- `filePath`
- `content`
- `numLines`
- `startLine`
- `totalLines`

Distill Portal implication:

- Claude can inline full file contents directly into the session stream
- raw payload size, search cost, and LLM egress risk can grow quickly even when the visible user prompt is small

### `system`

Observed keys include:

- `cause`
- `cwd`
- `durationMs`
- `entrypoint`
- `error`
- `gitBranch`
- `isMeta`
- `isSidechain`
- `level`
- `maxRetries`
- `messageCount`
- `parentUuid`
- `retryAttempt`
- `retryInMs`
- `sessionId`
- `slug`
- `subtype`
- `timestamp`
- `type`
- `userType`
- `uuid`
- `version`

Observed subtypes:

- `api_error`
- `turn_duration`

Distill Portal implication:

- these records belong in the raw transcript view
- they should not be treated as user-turn anchors

### `file-history-snapshot`

Observed keys:

- `type`
- `messageId`
- `snapshot`
- `isSnapshotUpdate`

Observed `snapshot` keys:

- `messageId`
- `timestamp`
- `trackedFileBackups`

Distill Portal implication:

- useful as raw provenance
- not a skim-block boundary on its own in v1

## Mapping Claude Code Into Distill Portal Shared Fields

| Shared field / hint | Claude adapter recommendation |
| --- | --- |
| `tool` | Constant `claude_code` |
| `source_session_id` | Filename stem, validated against record `sessionId` |
| `source_path` | Absolute path to the main session JSONL |
| `raw_blob` | Exact bytes of the safely-read main JSONL |
| `source_project_hint` | Parent folder `<project-key>` |
| `project_path` | Prefer `cwd` from records; if absent, reverse-decode `<project-key>`; otherwise `null` |
| `created_at` | Earliest parsed record timestamp; fall back to file mtime if missing |
| `updated_at` | Latest parsed record timestamp; fall back to file mtime if needed |
| `title_hint` | Prefer `custom-title.customTitle`; otherwise derive from the first human user prompt |
| `has_subagent_sidecars` | `true` if `<session-id>/subagents/` exists beside the main transcript |

### Project attribution details

Per [ARCHITECTURE.md](../ARCHITECTURE.md), the Claude adapter should:

- prefer `cwd` inside records
- use the folder `<project-key>` only as a fallback
- store that fallback as a hint, not as proof
- leave `project_path = null` if neither source is trustworthy

Failed project attribution must not block ingestion.

## Claude-Specific Skim-Block Guide

### What opens a `user_turn` block

A Claude skim block should open only when the adapter sees a true human-authored user prompt.

In practice, that means:

- `type = user`
- `message.content` is a prompt string or user-authored text payload
- the record is not merely a synthetic tool-result echo

### What belongs inside the opening side of the block

The following should be treated as part of the user's turn context, not as separate turns:

- the opening human `user` record
- immediately-associated `attachment` records that provide user context, such as file attachments

### What belongs in `agent_events[]`

For Claude, the agent reaction after a user turn should include:

- assistant `text`
- assistant `thinking`
- assistant `tool_use`
- synthetic user `tool_result`
- relevant `system` records
- relevant `queue-operation` and similar tool-generated records

### What does not open a new block

These should not start a new skim block:

- `user` records that only contain `tool_result`
- `attachment` records on their own
- `system`
- `file-history-snapshot`
- `permission-mode`
- `queue-operation`

### Block key

Use the opening human user record `uuid` as the stable skim-block id:

```text
block_key = claude:<session_uid>:<user_uuid>
```

This matches the relinking strategy in [ARCHITECTURE.md](../ARCHITECTURE.md).

### Boundary blocks

Current observed Claude samples did not reveal a clear v1-worthy session-resume or compaction marker comparable to the Codex boundary examples in the architecture doc.

Recommendation:

- do not synthesize Claude `boundary` blocks from ordinary metadata records
- keep the adapter open to future explicit boundary types if a later Claude release adds them

### Agent-only sessions

If a Claude session contains no human user prompt at all, render a single synthetic `agent_only` block.

This includes cases where the file only contains metadata records such as `permission-mode`.

## Sync, Update, and Relinking Guidance

### Safe fingerprinting

Use the architecture-defined `source_fingerprint` approach:

- last complete line offset
- line count
- last complete line hash
- source file mtime

Do not hash the whole file for steady-state polling.

### Expected update shape

Claude sessions look append-only in normal use. Distill Portal should therefore expect:

- new lines appended to the same `.jsonl`
- stable earlier `uuid`s for existing records
- existing block keys remaining valid across ordinary session growth

### Path changes

If the same `source_session_id` later appears at a different `source_path`, treat it as the same session and update provenance. Do not create a duplicate session.

### Summary relinking

Existing Claude summaries should relink by:

- `block_key = claude:<session_uid>:<user_uuid>`
- then content-hash guardrail

If the block content hash changes, mark the summary stale and regenerate lazily.

### Sidecar-presence edge case

Claude sidecar presence is important to the UI because it drives `has_subagent_sidecars`, but sidecar content is not ingested in v1.

That creates a practical implementation edge case:

- the main transcript file may remain unchanged
- the sidecar directory may appear later
- the backend's no-op dedup logic is driven by `source_fingerprint` of the main file

Recommendation for the Distill Portal developer:

- treat `has_subagent_sidecars` as a collector-observed hint that must be refreshed whenever sidecar presence changes
- if the current ingest path no-ops identical `source_fingerprint`s, add an explicit allowance for hint-only updates or a secondary collector-side "metadata changed" trigger

Without that, the sidecar badge can become stale until the main transcript file changes again.

## Search, Scrubbing, and LLM-Egress Notes

Claude is especially risky for external-summary and distill egress because:

- file attachments may inline whole file contents
- tool-result echoes may contain large shell outputs
- queued command/task reminder attachments can carry operational detail

Practical guidance:

- keep raw search local
- pass summaries and distill inputs through the pre-egress scrubber
- do not assume scrubbed output is safe enough for secrets; Purge and `do_not_send_to_llm` remain the real controls

## Recommended Test Fixtures for the Claude Adapter

The Distill Portal developer should build fixtures for at least:

1. Empty session with only `permission-mode`.
2. Simple user -> assistant text exchange with no tool usage.
3. User turn followed by assistant `tool_use` and synthetic user `tool_result`.
4. Session with file `attachment` that inlines file content.
5. Session with `custom-title`.
6. Session with `subagents/` directory present but no sidecar ingestion.
7. Session with trailing partial JSONL line to verify safe-read truncation.
8. Session whose file path changes but whose `source_session_id` stays the same.

## Implementation Checklist

- Discover only `~/.claude/projects/*/*.jsonl` as primary transcripts.
- Exclude `subagents/` content from raw ingestion in v1.
- Validate filename id against parsed `sessionId`.
- Prefer record `cwd` for `project_path`.
- Preserve raw JSONL unchanged after safe read.
- Build skim blocks from real user prompts, not synthetic tool-result records.
- Use Claude user `uuid` as `block_key`.
- Surface `has_subagent_sidecars` as a boolean hint on the shared record.
