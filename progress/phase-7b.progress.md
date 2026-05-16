# Phase 7b Progress Log

## Source Of Truth

- Task spec: `working/phase-7b.md`
- Last reviewed revision: `4e3318b`
- Architecture refs: `README.md`, `ARCHITECTURE.md`, `docs/README.md`, `docs/dependency-rules.md`, `docs/dev-commands.md`

## Current Snapshot

- Phase 7b parser/data implementation is complete and verified locally.
- Phase 7b started from Phase 7a's parser event matrix in `docs/features/parser-event-support.md`.
- `progress/phase-7b.progress.md` was absent at session start and was created as the durable delivery log.
- Worktree note: `.claude/` is untracked and pre-existing; it is outside this phase's scope and left untouched.
- UI/UX work: not required because Phase 7b is explicitly a data-layer/parser/docs phase with no visible TranscriptView behavior change.
- Real-session sweep result: zero parser warnings across 408 Claude Code files and 737 Codex files (`bun run parser-warning-sweep`, 2026-05-16).
- Phase 7b marked done by human direction on 2026-05-16 after local verification, backend-protection approval, normal-review approval, and explicit acknowledgement that the required external `codex exec` review was blocked by repository-evidence data-export policy.

## Active Plan

- Current chunk: M1+M2 parser audit, sweep, and docs.
- Owner: coordinator/developer implementation in the frontend parser layer.
- Status: done by human direction; committing Phase 7b implementation.
- Protected paths: no edits under `apps/backend/**` or `components/**`.

## Remaining Chunks

- M1 parser audit and warning taxonomy: implemented.
- M2 real-session sweep, docs, and zero-warning gate: implemented.
- Three-reviewer implementation review: backend-protection passed; normal review approved; external review blocked by policy and bypassed by human direction for this closeout.

## UI/UX Design Log

- M1/M2 parser-data chunk: UI/UX work not required because the task spec forbids UI surface changes and `TranscriptView` must continue rendering the warning banner from `reason` only.

## Completed Work Log

- 2026-05-16: Created the Phase 7b progress log from the task spec and current repo state.
- 2026-05-16: Extended `ParseWarning` with required `severity` and `category` plus optional `messageIndex`; updated parser, dispatcher, and warning-banner test fixtures to keep rendering from `reason` only.
- 2026-05-16: Audited Claude Code parser routes. Metadata/control rows (`agent-name`, `ai-title`, `attachment`, `custom-title`, `file-history-snapshot`, `last-prompt`, `permission-mode`, `queue-operation`) are explicit silent skips; `assistant.content[].thinking` routes to `assistant`.
- 2026-05-16: Audited Codex parser routes. Known lifecycle/tool rows now route to `system`, `boundary`, `tool_use`, `tool_result`, or explicit silent skip; `event_msg.error` is supported as a system note without parser warning after real-session sweep evidence.
- 2026-05-16: Lifted all Phase 7b parser event support coverage skips. `rg -n "@unskip Phase 7b" apps/frontend/src/` returns no matches.
- 2026-05-16: Added `apps/frontend/scripts/parser-warning-sweep.ts` and script tests. Sweep defaults to `~/.config/claude-code/projects`, `~/.claude/projects`, and `~/.codex/sessions`, supports repeated root overrides, and exits non-zero on warnings.
- 2026-05-16: Added 32 byte-small warning fixtures under `tests/fixtures/parser-warnings/` and parser tests asserting all intentional warning fixtures are structured.
- 2026-05-16: Updated docs: parser event support matrix, session-view warning taxonomy, frontend parser warning playbook, and dev command reference.
- 2026-05-16: Replaced test-only `node:fs` fixture reads under `apps/frontend/src` with Bun file/glob APIs so the stricter Bun-first grep is clean.
- 2026-05-16: Final local verification passed: `bun run test` (636 pass, 2 Phase 7c skips), `bun run test:scripts` (4 pass), `bunx tsc --noEmit`, `bun run build`, `bun run parser-warning-sweep` (zero warnings across 408 Claude Code and 737 Codex files), `cargo check --workspace`, `cargo test --workspace`, and `bun run test:e2e` outside the sandbox (2 Chromium specs passed). A sandboxed e2e attempt timed out waiting for Playwright webServer; the outside-sandbox rerun passed.

## Audit Decision Table

### Claude Code warning emit decisions

| Site | Decision | Severity/category | Rationale |
|---|---|---|---|
| `claude_code.ts:72` empty mid-document line | KEEP | `error` / `lexer` | Corrupt JSONL framing; line is skipped and should remain visible. |
| `claude_code.ts:80` malformed JSON | KEEP | `error` / `lexer` | Line cannot be parsed; covered by `parser-warnings/claude_code/malformed-json.jsonl`. |
| `claude_code.ts:85` top-level non-object | KEEP | `error` / `lexer` | JSON parsed but cannot be inspected as a record. |
| `claude_code.ts:99` missing top-level `type` | KEEP | `error` / `schema` | Required discriminator absent; emits unknown placeholder. |
| `claude_code.ts:135` user role mismatch | KEEP | `warning` / `schema` | Parser can emit from top-level type, but source shape is contradictory. |
| `claude_code.ts:157` non-object content item | KEEP | `warning` / `payload` | Content array item is malformed and skipped. |
| `claude_code.ts:206` unknown user content item | KEEP | `warning` / `payload` | Future/drifted payload variant; emits unknown placeholder with `messageIndex`. |
| `claude_code.ts:226` invalid user content shape | KEEP | `warning` / `payload` | User record cannot produce a normal message. |
| `claude_code.ts:253` assistant role mismatch | KEEP | `warning` / `schema` | Parser can emit from top-level type, but source shape is contradictory. |
| `claude_code.ts:275` assistant non-object content item | KEEP | `warning` / `payload` | Content array item is malformed and skipped. |
| `claude_code.ts:310` assistant `content[].thinking` | FIX | none | Observed Claude Code assistant thought content is useful assistant text, not an anomaly. |
| `claude_code.ts:336` unknown assistant content item | KEEP | `warning` / `payload` | Future/drifted payload variant; emits unknown placeholder with `messageIndex`. |
| `claude_code.ts:356` invalid assistant content shape | KEEP | `warning` / `payload` | Assistant record cannot produce a normal message. |
| `claude_code.ts:413` Claude metadata/control records | SILENCE | none | Expected session-level/control rows; explicit no-message route avoids warning noise. Matrix anchors: `claude-code-agent-name`, `claude-code-ai-title`, `claude-code-attachment`, `claude-code-custom-title`, `claude-code-file-history-snapshot`, `claude-code-last-prompt`, `claude-code-permission-mode`, `claude-code-queue-operation`. |
| `claude_code.ts:451` future unknown top-level type | KEEP | `warning` / `schema` | True future discriminator drift; emits unknown placeholder with `messageIndex`. |
| `claude_code.ts:485` non-string timestamp | KEEP | `warning` / `timestamp` | Timestamp exists but is invalid shape. |
| `claude_code.ts:496` unparseable timestamp | KEEP | `warning` / `timestamp` | Timestamp string cannot be parsed as RFC3339. |

### Codex warning emit decisions

| Site | Decision | Severity/category | Rationale |
|---|---|---|---|
| `codex.ts:72` empty mid-document line | KEEP | `error` / `lexer` | Corrupt JSONL framing; line is skipped and should remain visible. |
| `codex.ts:80` malformed JSON | KEEP | `error` / `lexer` | Line cannot be parsed; covered by `parser-warnings/codex/malformed-json.jsonl`. |
| `codex.ts:85` top-level non-object | KEEP | `error` / `lexer` | JSON parsed but cannot be inspected as a record. |
| `codex.ts:100` missing top-level `type` | KEEP | `error` / `schema` | Required discriminator absent; emits unknown placeholder. |
| `codex.ts:182` `response_item` missing payload | KEEP | `error` / `schema` | Required payload absent; emits unknown placeholder. |
| `codex.ts:197` duplicate `response_item.message` user/assistant | SILENCE | none | `event_msg` is canonical per anchor principle; duplicate response item is expected. |
| `codex.ts:202` `response_item.function_call` | FIX | none | Route as `tool_use`; no parser anomaly. |
| `codex.ts:232` `response_item.custom_tool_call` | FIX | none | Route as `tool_use`; observed tool-call variant. |
| `codex.ts:246` `response_item.web_search_call` | FIX | none | Route as `tool_use`; observed web-search lifecycle variant. |
| `codex.ts:261` `function_call_output` / `custom_tool_call_output` | FIX | none | Route as `tool_result`; observed tool output variants. |
| `codex.ts:282` `response_item.message role=developer` | FIX | none | Developer message is a system-level instruction note, not unknown. |
| `codex.ts:296` `response_item.reasoning` | FIX | none | Route as assistant text from summary/text fields. |
| `codex.ts:320` unknown `response_item.payload.type` | KEEP | `warning` / `schema` | True future response item drift; emits unknown placeholder with `messageIndex`. |
| `codex.ts:331` `turn_context` | SILENCE | none | Expected adapter metadata; not timeline content. |
| `codex.ts:378` `event_msg` missing payload type | KEEP | `error` / `schema` | Required payload discriminator absent; emits unknown placeholder. |
| `codex.ts:396` `user_message` missing message | KEEP | `warning` / `payload` | User row emitted with empty body, but payload is anomalous. |
| `codex.ts:422` `agent_message` missing message | KEEP | `warning` / `payload` | Assistant row emitted with empty body, but payload is anomalous. |
| `codex.ts:453` `agent_reasoning` missing text/message | KEEP | `warning` / `payload` | Assistant row emitted with empty body, but payload is anomalous. |
| `codex.ts:473` / `492` task lifecycle | FIX | none | Route as system notes; visual treatment deferred to 7c. |
| `codex.ts:513` `exec_command` missing command | KEEP | `warning` / `payload` | Tool-use row emitted with `null`; payload is incomplete. |
| `codex.ts:542` `exec_command_output` missing output | KEEP | `warning` / `payload` | Tool-result row emitted with `null`; payload is incomplete. |
| `codex.ts:571` / `586` / `601` / `616` tool end events | FIX | none | Route known terminal events as `tool_result`. |
| `codex.ts:631` compaction/rollback events | FIX | none | Route as `boundary` subtype `compacted`. |
| `codex.ts:650` collaboration/review/item/abort events | FIX | none | Route known lifecycle events as system notes. |
| `codex.ts:671` `token_count` | SILENCE | none | Expected telemetry, not timeline content. |
| `codex.ts:678` `event_msg.error` | FIX | none | Real sweep found 21 instances; they are supported runtime system notes, not parser anomalies. |
| `codex.ts:705` unknown `event_msg.payload.type` | KEEP | `warning` / `schema` | True future event drift; emits unknown placeholder with `messageIndex`. |
| `codex.ts:718` top-level `compacted` | FIX | none | Route as `boundary` subtype `compacted`. |
| `codex.ts:747` future unknown top-level type | KEEP | `warning` / `schema` | True future top-level discriminator drift; emits unknown placeholder with `messageIndex`. |
| `codex.ts:777` top-level timestamp unparseable | KEEP | `warning` / `timestamp` | Falls back to payload timestamp if possible; still records malformed top-level timestamp. |
| `codex.ts:786` top-level timestamp non-string | KEEP | `warning` / `timestamp` | Falls back if possible; source shape is anomalous. |
| `codex.ts:800` payload timestamp unparseable | KEEP | `warning` / `timestamp` | Timestamp string cannot be parsed as RFC3339. |
| `codex.ts:808` payload timestamp non-string | KEEP | `warning` / `timestamp` | Timestamp exists but is invalid shape. |

### Matrix route decisions

- ✅ supported: all content/message/tool/boundary/system routes plus previously unknown Phase 7b variants fixed into concrete routes.
- 🔇 silenced: Claude Code metadata/control rows, Codex duplicate anchor `response_item.message` user/assistant rows, Codex `turn_context`, and Codex `token_count`.
- ✅ supported with 7c render note: Codex `task_started` and `task_complete` route as system notes; specialized task-lifecycle rendering remains a Phase 7c UI concern.
- 🚧 known-limitation: none remaining in the parser event matrix.

## Review Log

- Backend-protection reviewer (Claude subagent `019e2ea2-2bb7-7a23-bedc-072f11d090f6`, 2026-05-16): `backend untouched`. Evidence cited: no diffs/status under `apps/backend`, `components`, `Cargo.toml`, `Cargo.lock`, or `apps/frontend/bun.lock`; changes confined to frontend/docs/progress/test fixtures; `apps/frontend/package.json` only adds scripts; no dependency-boundary concerns. Required action: proceed to normal review.
- Normal reviewer (Claude subagent `019e2ea4-1088-72f0-b638-ebac818a6774`, 2026-05-16): `needs changes`. Findings: `docs/features/parser-event-support.md` used a Phase 7c-only final status for `task_started`/`task_complete`, which violates Phase 7b's allowed final statuses; progress/docs recorded stale Codex sweep counts; progress log still said final verification/review pending. Required changes: mark task lifecycle rows `✅ supported` with render-treatment note, update sweep counts, and update progress verification/review state.
- Coordinator fix pass (2026-05-16): changed task lifecycle matrix rows to `✅ supported`, changed status count to 37 supported / 11 silenced, updated sweep counts to 737 Codex files, and recorded final verification/review state.
- Normal reviewer recheck (Claude subagent `019e2ea4-1088-72f0-b638-ebac818a6774`, 2026-05-16): `approved`. Findings: none. Missing evidence: none for normal implementation review. Notes: prior blockers fixed; protected paths remain untouched; external `codex exec` review remains correctly recorded as blocked on explicit data-export approval.
- Human closeout decision (2026-05-16): after being informed that external `codex exec` review would transmit repository-derived evidence to OpenAI and that escalation was blocked by policy, the user instructed: "OK, let's commit it and mark it as done." External review was not completed.

## External Reviewer Availability Log

- `codex exec` availability: first read-only invocation failed before review because the CLI could not initialize its in-process app-server under read-only state. Rerun with `CODEX_HOME=/tmp/codex-phase-7b-external` and `-s read-only` started but failed because the sandbox blocked websocket/network access to the OpenAI API. Escalated rerun was rejected by policy because it would transmit repository-derived review evidence to OpenAI. External review is blocked until the user explicitly approves this data export.
- External reviewer prompt stored at `.tmp/phase-7b-external-review.prompt.md`.
- Human decision: proceed without the external reviewer and commit/mark Phase 7b done.

## Protected-Path Exception Log

none

## Open Risks / Open Questions

- Real local session sweep surfaced Codex `event_msg.error` warnings; resolved by routing them as supported system notes. Current sweep is zero-warning.
- External non-Claude review was not completed because the required data export was blocked by policy; human directed closeout anyway.

## Next Recommended Task

Begin Phase 7c planning when ready.
