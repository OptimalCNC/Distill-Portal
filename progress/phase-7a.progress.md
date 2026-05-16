# Phase 7a Progress

## Source-Of-Truth Reference

- Task spec: `working/phase-7a.md`
- Last reviewed in this session: 2026-05-16, local working tree before Phase 7a edits had only pre-existing untracked `.claude/`.
- Architecture references: `README.md`, `docs/README.md`, `docs/dependency-rules.md`, `docs/dev-commands.md`, `ARCHITECTURE.md`, `PRD.md`

## Current Snapshot

Phase 7a implementation is complete, locally verified, and approved by the three required reviewers. The invocation block was inferred from the user's request:

- `task_name`: `phase-7a`
- `task_spec_path`: `working/phase-7a.md`
- `progress_log_path`: `progress/phase-7a.progress.md`
- Protected paths: `apps/backend/**`, `components/**`, `tests/e2e/**`
- Protected exceptions: none
- Forbidden scope: backend changes, parser logic changes, renderer logic changes, `ParseWarning` shape changes, new runtime dependencies
- Required verification performed: `bun run test`, `bunx tsc --noEmit`, `bun run build`, link audit, grep contract, enumeration reproducibility; Rust workspace gates were also run before the final docs/tests/comments-only updates.

## Active Plan

- Current chunk: Milestone 1 - enumerate, classify, link, fixture, and test the event support matrix.
- Owner: coordinator locally, with planner/explorer subagents for independent review of scope and existing test/parser/render surfaces.
- Status: complete; three-reviewer rule passed on the final 48-row evidence pack.

## Remaining Chunks

- None for Phase 7a.
- Phase 7b inherits the 29 `@unskip Phase 7b` parser-route work items.
- Phase 7c inherits the 2 `@unskip Phase 7c` task-lifecycle render work items.

## Completed Work Log

- 2026-05-16: Loaded coordinator prompt, task spec, repository rules, architecture references, and existing parser/renderer/test surfaces. Decided UI/UX design gate is not required because Phase 7a does not introduce or modify user-visible structure, interaction, motion, copy, or accessibility behavior in production UI.
- 2026-05-16: Added `apps/frontend/scripts/event-support-enumerate.ts`. The first determinism check failed because the active Codex session changed between runs; the script now excludes files modified in the last 120 seconds by default, with `--stable-seconds 0` available for active-file enumeration. Back-to-back default runs are deterministic.
- 2026-05-16: Authored `docs/features/parser-event-support.md` with 48 rows, all 9 required columns, status counts, fixture links, parser links, render links, and 7b/7c worklists. Added `docs/README.md` Feature Guides link.
- 2026-05-16: Added 48 fixtures under `tests/fixtures/parser-events/` and the two required test files: `apps/frontend/src/features/sessions/parsers/event-support-coverage.test.ts` and `apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx`.
- 2026-05-16: Added comment-only `Matrix:` JSDoc anchors to `claude_code.ts`, `codex.ts`, and `TranscriptView.tsx`. Parser logic, renderer logic, and `ParseWarning` shape were not changed.
- 2026-05-16: External review of the 47-row snapshot surfaced `codex event_msg / agent_reasoning` in the current stable Codex corpus. Added the matrix row, fixture, parser/render coverage rows, and bidirectional source comments for `codex-event-msg-agent-reasoning`.
- 2026-05-16: Tightened both coverage tests so the fixture parity assertion catches extra fixture files as well as missing fixture files.
- 2026-05-16: Fixed the normal-review link nit by pointing `codex-event-msg-agent-reasoning` at `codex.ts`.
- 2026-05-16: Fixed the external-review Phase 7c marker attribution finding by putting each deferred render-test row's `anchor` and `skipMarker: "@unskip Phase 7c"` on the same line.
- 2026-05-16: Completed the three-reviewer rule. Backend-protection returned `backend untouched`, normal review returned `approved with nits` with the nit fixed, and final external review returned `approved`.

## Enumeration Result

Command: `bun apps/frontend/scripts/event-support-enumerate.ts`

Line counts below are a recorded stable-corpus snapshot; active local session files can change later counts. The Phase 7a acceptance target is the 48-row observed tuple set recorded in `docs/features/parser-event-support.md`.

```text
=== claude_code ===
roots: /home/huwei/.claude/projects
stable window: excluding files modified in the last 120s
missing roots: /home/huwei/.config/claude-code/projects
agent-name                                                    127 lines
ai-title                                                      402 lines
assistant / content[].text                                   5625 lines
assistant / content[].thinking                               1763 lines
assistant / content[].tool_use                              13275 lines
attachment                                                    874 lines
custom-title                                                  109 lines
file-history-snapshot                                         551 lines
last-prompt                                                  1155 lines
permission-mode                                              1122 lines
queue-operation                                               282 lines
system                                                        411 lines
user / content[].text                                          24 lines
user / content[].tool_result                                13335 lines
user / message.content string                                 770 lines

=== codex ===
roots: /home/huwei/.codex/sessions
stable window: excluding files modified in the last 120s
compacted                                                      17 lines
event_msg / agent_message                                   10476 lines
event_msg / agent_reasoning                                   134 lines
event_msg / collab_agent_interaction_end                      227 lines
event_msg / collab_agent_spawn_end                            302 lines
event_msg / collab_close_end                                  233 lines
event_msg / collab_waiting_end                                598 lines
event_msg / context_compacted                                  17 lines
event_msg / entered_review_mode                                 1 lines
event_msg / error                                              21 lines
event_msg / exec_command_end                                10791 lines
event_msg / exited_review_mode                                  1 lines
event_msg / item_completed                                      9 lines
event_msg / mcp_tool_call_end                                   6 lines
event_msg / patch_apply_end                                  1562 lines
event_msg / task_complete                                    1817 lines
event_msg / task_started                                     1975 lines
event_msg / thread_rolled_back                                  4 lines
event_msg / token_count                                     30482 lines
event_msg / turn_aborted                                      100 lines
event_msg / user_message                                     1983 lines
event_msg / web_search_end                                    498 lines
response_item / custom_tool_call                             2214 lines
response_item / custom_tool_call_output                      2214 lines
response_item / function_call                               29877 lines
response_item / function_call_output                        29877 lines
response_item / message role=assistant                       9358 lines
response_item / message role=developer                        943 lines
response_item / message role=user                            3433 lines
response_item / reasoning                                   14519 lines
response_item / web_search_call                               553 lines
session_meta                                                  779 lines
turn_context                                                 1862 lines
```

Status counts:

- `✅ supported`: 11
- `🔇 silenced`: 3
- `⚠ unknown`: 29
- `🚧 known-limitation`: 3
- `🎨 deferred to 7c`: 2

Skip-marker counts:

- `@unskip Phase 7b`: 29
- `@unskip Phase 7c`: 2
- Phase 7c same-line marker audit: matched exactly `codex-event-msg-task-complete` and `codex-event-msg-task-started`.

Link audit:

- `anchors=48, sourceAnchors=48, links=145`
- `rowStatusCounts={"⚠ unknown":29,"✅ supported":11,"🚧 known-limitation":3,"🎨 deferred to 7c":2,"🔇 silenced":3}`
- Result: passed.

Verification:

- `bun apps/frontend/scripts/event-support-enumerate.ts` twice + `diff`: passed after stable-file window update.
- `bun test src/features/sessions/parsers/event-support-coverage.test.ts`: 20 pass, 29 skip, 0 fail, 89 expects.
- `bun test src/features/sessions/TranscriptView.event-coverage.test.tsx`: 47 pass, 2 skip, 0 fail, 50 expects.
- `bun test src/features/sessions/parsers/event-support-coverage.test.ts src/features/sessions/TranscriptView.event-coverage.test.tsx`: 67 pass, 31 skip, 0 fail, 139 expects.
- `bun test apps/frontend/src/features/sessions/parsers/event-support-coverage.test.ts apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx` from the repository root: 67 pass, 31 skip, 0 fail, 139 expects.
- `bun run test`: 605 pass, 31 skip, 0 fail, 1925 expects.
- `bunx tsc --noEmit`: passed.
- `bun run build`: passed; output `dist/index.html`, `dist/assets/index-XT89q4pQ.css`, `dist/assets/index-77k8NUmv.js`.
- `cargo check --workspace`: passed.
- `cargo test --workspace`: passed.
- `bun run test:e2e`: initial sandbox run failed because binding `127.0.0.1:4100` was not permitted; escalated rerun passed, 2 browser tests.
- Hex invariant: `rg -o "#[0-9A-Fa-f]{3,8}" apps/frontend/src | wc -l` = 24.
- Token invariant: `grep -cE '^\s*--' apps/frontend/src/styles/tokens.css` = 83.

## UI/UX Design Log

- Milestone 1: UI/UX work not required because the phase is observational docs, fixtures, tests, tooling, and source comments only; no production UI behavior or appearance changes are in scope.

## Review Log

- Backend-protection reviewer: `backend untouched`; findings none, missing evidence none. Confirmed no backend/components/e2e/dependency/`ParseWarning` changes and parser/renderer source diffs are comment-only.
- Normal reviewer: `approved with nits`; findings none, missing evidence none, required changes none. Nit: `codex-event-msg-agent-reasoning` parser link was imprecise; fixed by linking to `codex.ts`.
- External reviewer: `approved`; findings none, missing evidence none, required changes none. Note: Phase 7b/7c skips are consistent with the Phase 7a skip contract; Rust gates were not re-run after doc/test/comment-only updates, but no Rust/backend files were touched.

## External Reviewer Availability Log

- First attempted command with unsupported `--reasoning-effort` flag failed before review.
- A long 47-row external review run did not return a final verdict and was stopped.
- A bounded 47-row final review found the now-stable `event_msg / agent_reasoning` tuple; that finding was fixed by updating the matrix, fixtures, source comments, and coverage tests to 48 rows.
- A focused 48-row review found the Phase 7c skip-marker attribution was hard to verify by same-line grep; fixed by putting `anchor` and `skipMarker` on the same object-literal line for the two deferred render rows.
- A follow-up focused external review loop verified the fix but did not return a final verdict and was stopped.
- Final narrow external reviewer command: `codex exec --skip-git-repo-check --model gpt-5.2 -`. Result:
  - **Verdict**: approved
  - **Findings**: none
  - **Missing Evidence**: none
  - **Required Changes**: none
  - **Notes**: Phase 7b/7c skips appear consistent with the Phase 7a skip contract; Rust gates were not re-run after doc/test/comment-only updates, but no Rust/backend files were touched per the evidence pack.

## Protected-Path Exception Log

- None.

## Open Risks / Open Questions

- The spec names `~/.config/claude-code/projects/`; this machine has no files there, but has Claude Code JSONL sessions under `~/.claude/projects/`. The enumeration script reports both roots and uses existing roots so the local corpus is not missed.
- Phase 7b must decide KEEP / SILENCE / FIX for the 29 `⚠ unknown` rows.
- Phase 7c inherits 2 task-lifecycle render-treatment skips.

## Next Recommended Task

Start Phase 7b with the 29 `@unskip Phase 7b` parser-route work items.
