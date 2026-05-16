# Session View

The session view is the persistent right pane of the [inspection surface](inspection-surface.md). It mounts inside the master-detail split-pane layout introduced in Phase 5 and renders the selected session through a four-tab shell.

The session pane (`<article class="session-pane">`) is a landmark with `aria-live="polite"`. It has a four-state machine: `empty` (no selection), `loading` (initial mount), `ready` (row selected; four-tab shell live), and `session_not_found` (deep-link to a row that doesn't exist).

Source files:

- `apps/frontend/src/features/sessions/SessionView.tsx` + `.css` + `.test.tsx`
- `apps/frontend/src/features/sessions/SessionMetadata.tsx`
- `apps/frontend/src/features/sessions/RawTab.tsx`
- `apps/frontend/src/features/sessions/TranscriptView.tsx`
- `apps/frontend/src/features/sessions/SkimView.tsx`
- `apps/frontend/src/features/sessions/BoundaryRow.tsx`
- `apps/frontend/src/components/Tabs.tsx` (shared primitive)
- `apps/frontend/src/features/sessions/parsers/` (per-tool parsers + skim builder)
- `apps/frontend/src/features/sessions/streamRawText.ts` + `useParsedSession.ts`

## Tabs

Four tabs ordered: **Transcript**, **Skim**, **Raw**, **Metadata**. The default active tab on first selection is **Transcript** (`DEFAULT_TAB_ON_SELECTION = "transcript"` exported from `SessionView.tsx`; shifted from `"metadata"` at M4 per Resolved Decision #11). The Tabs primitive (`apps/frontend/src/components/Tabs.tsx`) provides ARIA `tablist` / `tab` / `tabpanel` with Left/Right/Home/End keyboard navigation, selection-follows-focus, and a 1 px ink-stroke active-tab indicator that slides via `transform: translateX($x) scaleX($width)` (unitless `scaleX`; the `px` suffix would yield invalid CSS and an invisible indicator). Panels are keep-mounted across tab switches; the visited-tab matrix lazy-mounts each panel on first activation. Panel entrance is a 120 ms cross-fade-in via inline `style.animation` (not a React `key=`-driven remount).

### Transcript tab

- Renders `parsed.messages` chronologically.
- Per-kind shells: `user`, `assistant`, `tool_use`, `tool_result`, `system`, `boundary`, `unknown`.
- Code-fenced segments swap to the mono font stack.
- Long tool_result body (> 2 KB) is collapsible via native `<details>`, with the byte boundary chosen via a UTF-8-codepoint-safe split.
- Truncation banner (`role="status"`) renders when `parsed.truncated` (the 5 MB cap fired during `streamRawText`); copy includes a bold `Open raw` reference pointing at the session header's `Open raw` anchor.
- Parse-warnings dismissible `<details>` banner; spec-literal copy `{N} parse warnings — click to view.` for all N (no smart pluralization).
- Boundary message kind renders the chapter-break treatment via the shared `BoundaryRow` component (byte-equivalent to Skim's boundary block).
- An optional `messageRange?: { start: number; end: number }` prop scopes rendering to a sub-range with defensive clamping (used by SkimView for `agent_only` and `user_turn`-expanded sub-transcripts).

#### Tool lifecycle + grouping

Phase 7c overlays a render-hint dispatch layer on top of the per-kind shells. The pure function `renderHints(messages, warnings)` in `apps/frontend/src/features/sessions/renderHints.ts` runs once per render and produces a `RenderHint[]` aligned positionally with the message stream. `TranscriptView` switches on `RenderHint.kind` first, then on `Message.kind` for the inner body.

- **Lifecycle pairing.** Adjacent `tool_use` + `tool_result` Messages collapse into a single `.msg-lifecycle` paired card (sienna inline-start rail + header with status dot + chrome-text label + two native `<details>` disclosures for Arguments and Result). Pairing is strict-adjacency: the `tool_result` must be at `messageIndex + 1` of the `tool_use`. Orphan `tool_use` renders the lifecycle card in `data-status="in-flight"` with an "awaiting result" Fraunces small-caps pill; orphan `tool_result` falls back to the standalone `.msg-tool-result` recipe with an inline `stray tool_result` chip.
- **Tool-batch grouping.** `GROUP_THRESHOLD = 2` consecutive lifecycle hints — **regardless of tool name** — collapse into one `.group-card` (native `<details>`). The buffer is permissive: `assistant` standalone hints between lifecycle pairs are **passthrough** — they don't break the run; they're pulled into the group's expanded body as `group-text-member` entries in original interleaved order. This matches real-session shape: Claude Code emits assistant `content[].text` and `content[].tool_use` as separate Messages, so a turn with 2 Edit calls produces 2 lifecycle hints separated by an assistant-text hint (the parser doesn't merge them). **`system` kind is INTENTIONALLY a delimiter, not passthrough**, because the Phase 7b parser-event matrix maps Codex `event_msg.error`, `event_msg.turn_aborted`, review-mode lifecycle, and collaboration lifecycle events to `kind:"system"` — those rows need top-level visibility (errors must stay loud; hiding them in a collapsed group would suppress important signal). The summary row shows the distinct tool names joined with `, ` in first-appearance order (mono) + a `1px` hairline divider + a count badge ("N calls" — count of LIFECYCLES only, not total members) + an aggregate-status indicator (`status-dot` + chrome-text label). For single-tool runs the joined list is one name; for mixed runs (e.g. Edit then Bash) it lists every distinct tool the run invoked. The four aggregate states are `all-success` / `mixed` (`N succeeded · M failed`) / `in-flight` (`running N of M`) / `all-failed`. Expanding the group reveals each lifecycle as a `.group-member.lifecycle-card` on the raised surface (`--color-surface-raised`) AND each assistant text member as its standard `.msg-assistant` card. Delimiters that reset the run: `user` standalone (new turn), `system` standalone (errors, telemetry, lifecycle — kept top-level for visibility), `boundary` (chapter break), task-lifecycle stamped `system` (`task_started`/`task_complete`), `warning-only`, `unknown`, orphan `tool_result` with stray chip, end-of-stream.
- **Empty-body suppression.** `user` and `assistant` Messages with empty or whitespace-only text (typically emitted by the Codex parser when `event_msg.user_message`/`agent_message`/`agent_reasoning` payloads are missing their `message`/`text` field) render no card at all. The parser still emits a structured `warning/payload` warning that surfaces through the session banner — the banner stays loud, the transcript stays clean. If a future parser path attaches an inline-routable warning to the same empty row, the renderer emits a `warning-only` hint so the chip surface is absent (no card to attach to) and the banner carries the notice.
- **Task-lifecycle chapter marker.** Codex `event_msg.task_started` and `event_msg.task_complete` route to `kind: "system"` Messages whose text begins with `task_started · turn ` or `task_complete · turn `. `renderHints.ts` stamps `taskLifecycle: "started" | "complete"` on the `standalone` hint and `TranscriptView` renders a `.msg-task-lifecycle` card — a horizontal hairline pair + Fraunces italic small-caps label ("Task started" / "Task complete") + middle-dot divider + mono turn id. The card is non-interactive: no hover, no focus ring, no `<details>`.
- **Native `<details>` only.** Every expand/collapse surface (per-lifecycle Arguments and Result, group head, inline warning chip, banner) is a native `<details>` with browser-managed open state. There is no controlled `open` attribute, no `useState`-driven expand, and no `onToggle` handler that mirrors expand state into React.

Cross-reference: `apps/frontend/src/features/sessions/renderHints.ts`, [`working/phase-7c.md`](../../working/phase-7c.md), [`working/phase-7c/designs/`](../../working/phase-7c/designs/).

**E2E coverage note.** The Playwright e2e suite does not exercise the grouped-card surface because the seeded fixture session at `tests/fixtures/claude_code/sample_session.jsonl` has 4 lines and zero `tool_use`/`tool_result` rows — it cannot reach `GROUP_THRESHOLD = 2` consecutive lifecycles without enlarging the fixture. The grouping render path is fully covered by the happy-dom unit tests in `apps/frontend/src/features/sessions/TranscriptView.test.tsx` (the `Phase 7c / M3 — Same-tool grouping` block, including the post-Phase-7c polish-r2 `Polish-r2:` regression tests) PLUS the parser-driven integration test `"integration: real Claude Code turn …"` in `apps/frontend/src/features/sessions/renderHints.test.ts` which round-trips a 6-line JSONL fixture through `dispatchParser` before feeding the result to `renderHints`.

#### Metadata events

Phase 7d closes the 12 previously-silenced parser routes by emitting `kind:"metadata"` Messages that surface in the transcript as marginalia rows. Each metadata Message carries a `metaCategory` (`control` / `telemetry` / `title` / `attachment` / `agent` / `prompt` / `context` / `echo`) which drives the visual recipe. The 8-value enum is documented on `MessageKind` in `apps/frontend/src/features/sessions/parsers/types.ts`.

- **Hairline register** (10 routes: `agent-name`, `ai-title`, `attachment`, `custom-title`, `file-history-snapshot`, `last-prompt`, `permission-mode`, `queue-operation`, `event_msg.token_count`, `turn_context`). A single-line `<p class="msg-metadata" data-meta-category=…>` with a decorative middle-dot prefix and the parser-formatted display text (e.g. `· permission mode → default`). Hairline rows take ~1/3 the vertical footprint of a user / assistant card. Per-category typography: mono for control / telemetry / attachment / agent / context; Fraunces italic for title / prompt.
- **Echo register** (2 routes: Codex `response_item.message role=user/assistant`). A single `↺` glyph row (`.msg-metadata-echo`) with no inline text. The hover tooltip + aria-label resolve the back-pointer to the canonical `event_msg.{user,agent}_message` line. The two duplicate-anchor rows surface so "no event hidden" holds but the canonical row carries the content.
- **Cluster collapse.** Two or more consecutive metadata hints collapse into a single `<details class="msg-metadata-cluster">` whose summary reads `N metadata events` (mixed-register clusters use the generic copy; the expanded body renders each row in its native register). Threshold is exported as `METADATA_COLLAPSE_THRESHOLD = 2` from `renderHints.ts`. Below threshold the metadata hint stays at top level as a singleton.
- **Tool-batch interaction.** Metadata hints are **delimiters** for the Phase 7c tool-batch grouping pass — a `permission-mode` event between two `Edit` calls flushes the lifecycle buffer; the metadata row renders at top level; the trailing calls form a new batch. Same rule as `system` errors (`event_msg.error`).

The cluster summary is a focusable `<summary>` (Tab moves to the disclosure); singleton metadata rows are non-focusable static `<p>`s. Color contrast pair P42 (`--color-ink-muted` on `--color-surface`) clears WCAG AA text at 7.04 : 1 light / 7.36 : 1 dark — re-used from Phase 7c with no new pair introduced. Zero new tokens, zero new hex literals; the recipe lives in `TranscriptView.css` under the "Phase 7d — Metadata marginalia hairline + echo + cluster" header.

Cross-reference: `apps/frontend/src/features/sessions/TranscriptView.tsx` `MetadataRow` + `MetadataCluster`, [`working/phase-7d/designs/design.md`](../../working/phase-7d/designs/design.md) §3 + §4.

#### Inline warnings

Phase 7b extended `ParseWarning` with `severity` + `category` + `messageIndex`. Phase 7c consumes the structured shape to route each warning into one of four buckets:

| Severity   | Category          | Bucket                  | Visual                                              |
|------------|-------------------|-------------------------|-----------------------------------------------------|
| `error`    | (any)             | `render-normally`       | Chip below message body; summary is the reason     |
| `warning`  | `schema` / `payload` | `render-normally`    | Chip below message body; summary is the reason     |
| `warning`  | `lexer` / `timestamp` | `collapse-by-default` | Chip below message body; summary is `1 warning`   |
| `warning`  | `meta`            | `warning-only`          | No chip on the message (banner only)               |
| `info`     | (any)             | `hide-with-inspect`     | Corner Inspect link; chip nested behind it         |

The classifier is the pure function `classifyWarning(warning)` in `renderHints.ts`. Each chip is a native `<details>` carrying the severity dot + chip label + category tag; the expanded body shows the full `warning.reason` in mono. Chip placement is consistent: `render-normally` and `collapse-by-default` chips sit in a `.chip-wrapper` below the message body (`margin-top: var(--space-3)`); the `hide-with-inspect` chip sits inside a corner `.inspect-affordance` (`<details>` whose summary is an accent-colored "Inspect" link); `warning-only` warnings render no chip at all (their message body is suppressed entirely via the `warning-only` RenderHint).

The session-level parse-warnings banner stays loud (Resolved Decision #6): every warning appears there regardless of inline routing. Inline chips are additive — nothing hides absolutely.

**Chip visibility on collapsed group heads.** Inline warnings on a `group-member` lifecycle do NOT surface on the collapsed group head (design.md §15.7). The chip is visible after the user expands the group; the session banner still surfaces the warning at the top of the transcript.

Cross-reference: `apps/frontend/src/features/sessions/renderHints.ts` (`classifyWarning`), [`working/phase-7c/designs/design.md`](../../working/phase-7c/designs/design.md) §9.

### Skim tab

- Renders `parsed.skim` (a `SkimBlock[]` produced by `buildSkim`).
- Four block kinds:
  - **user_turn**: inline body via the shared `renderBodyWithCode` helper + nested Agent reaction `<details>` summary `Agent reaction (N messages)` containing the disabled placeholder copy + nested `Expand to raw messages` `<details>` mounting a scoped `<TranscriptView messageRange={{ start: block.start + 1, end: block.end }} />`.
  - **boundary**: chapter break via the shared `BoundaryRow` (full-width hairline + Fraunces italic small-caps label `SESSION RESUMED` / `CONVERSATION COMPACTED`); never merged into a neighbor.
  - **agent_only**: collapsed by default (`<details>` with no controlled `open` attribute); expanding mounts a scoped `<TranscriptView messageRange={{ start: block.start, end: block.end }} />`. Summary copy: `Agent-only session (N messages)` (where N = `end - start + 1`).
  - **oversized_user_message**: collapsed by default; expanding reveals the verbatim body in a `<pre>` with `--font-mono` and a `--color-warn` 4 px left border. Summary copy: `Oversized user message ({sizeKB} KB) — collapsed by default`. NEVER summarized (PRD line 257).
- N=1 pluralization: ships spec-literal verbatim — `Agent-only session (1 messages)` / `Agent reaction (1 messages)` — spec-literal beats grammar (M3a precedent).
- Block stagger animation: keyframe animates ONLY `opacity` + `transform: translateY(4px → 0)` (per spec line 93). `animationDelay` is `Math.min(idx, 8) * 40` ms, capping the stagger at 320 ms.

### Raw tab

- Byte-equivalent to the retired Phase 4 drawer raw preview (256 KB / 20-line cap via `consumeRawPreview`).
- Same caption strings, same cancel-on-cleanup semantics. `AbortController` cleanup fires only on: (1) `selectedRowKey` change; (2) `row.storedSessionUid` change; (3) Retry counter bump; (4) `SessionView` unmount. **Tab switches are NOT a cleanup trigger** per the keep-mounted contract (spec lines 650–658).
- Non-JSON markers render via `--color-ink-muted` italic (NOT `--color-warn`; M2b WCAG-driven decision).
- State machine: `idle` / `loading` / `success` (below caps / at line cap / at byte cap) / `error` / `non_2xx` / `not_imported`.

### Metadata tab

- 19 `SessionRow` fields rendered as a `<dl class="metadata-meta">` — 18 verbatim from Phase 4's drawer body + the Phase 6 M2 "Title source" caption row inserted immediately after `title`:
  - `session_key`, `session_uid`, `row_key`, `tool`, `source_session_id`, `presence`, `status`, `status_conflict`, `title`, **`Title source`** (Phase 6 M2), `project_path`, `source_path` (labeled `Last seen source path` when `sourcePathIsStale` is true), `source_path_is_stale`, `source_fingerprint`, `has_subagent_sidecars`, `stored_raw_ref`, plus three timestamps annotated as either source-clock (`created_at`, `source_updated_at`) or backend-clock (`ingested_at`).
- **Title source caption row** (Phase 6 M2, Resolved Decision #12): maps the contract's `TitleSource | null` to a terse `<dd>` caption with a longer explanatory tooltip on the same `<dd>`'s native HTML `title=` attribute. Pure helper `titleSourceCaption(value)` in `SessionMetadata.tsx`; strings pinned verbatim to spec §Frontend Rendering caption table:
  - `custom` → "Origin" / "Title brought in from the original coding session (e.g. Claude Code's customTitle record)."
  - `first_user_message` → "Opening message" / "Extracted from the first user message in this session."
  - `slug` → "Path slug" / "Derived from the session's source path as a fallback when no usable message text was found."
  - `generated` → "Generated" / "AI-generated title (reserved for a later phase; not produced in Phase 6)."
  - `null` (legacy row imported before title-source tracking) → "Unknown" / "This session was imported before title-source tracking was added; rescan to populate."
  - No new component, no JS popover, no new tokens — the row reuses the existing `<dt>` / `<dd>` grid + native browser tooltip mechanism that mirrors the list-panel title-cell pattern.
- Copy path button (Clipboard API + manual-select fallback for environments without `navigator.clipboard`).
- Inline subagent sidecar badge alongside `has_subagent_sidecars` per Resolved Decision #8.
- `View raw` anchor only when `storedSessionUid !== null`.
- Status conflict badge (top-level header) uses the `--color-warn` recipe per spec line 622 + M2b colors.md H09 (NOT `--color-error`; semantic — error ≠ warning).

## Parsers

Per-tool architecture under `apps/frontend/src/features/sessions/parsers/`:

- `types.ts` — `Message`, `MessageKind` (8 variants since Phase 7d's `metadata` addition), `MetaCategory`, `SkimBlock`, `BlockKind`, `ParseWarning`, `ParserOutput`, `ParsedSession`, `StreamMeta`.
- `claude_code.ts` — pure / total / synchronous parser for Claude Code NDJSON. Session-level chrome (`agent-name`, `ai-title`, `attachment`, `custom-title`, `file-history-snapshot`, `last-prompt`, `permission-mode`, `queue-operation`) routes through `kind:"metadata"` per Phase 7d.
- `codex.ts` — pure / total / synchronous parser for Codex NDJSON; the anchor principle is preserved (`event_msg.user_message` / `agent_message` is canonical) but the `response_item.message role=user/assistant` duplicate-anchor rows now emit `kind:"metadata"` with `metaCategory:"echo"` (Phase 7d). `event_msg.token_count` → `metaCategory:"telemetry"`; `turn_context` → `metaCategory:"context"`.
- `buildSkim.ts` — dual-tracker algorithm producing `SkimBlock[]` from `Message[]`. Constants: `USER_MSG_OVERSIZE_THRESHOLD = 65_536` (strict `>`); empty stream emits `[{kind: "agent_only", start: 0, end: -1, meta: {empty: 1}}]`.
- `index.ts` — `PARSERS: Record<Tool, ParserFn>` registry + `dispatchParser(tool, rawText, streamMeta): ParsedSession`. Two layers of defence against future-Tool drift (static `Record` + runtime exhaustiveness test).

Parsers are pure (no I/O), total (never throw — failures go to `warnings[]`), and synchronous. Adding a third tool is one registry entry plus a new `parsers/<tool>.ts` file plus a co-located test file — NOT a control-flow edit anywhere else.

### Warning taxonomy

Phase 7b extended `ParseWarning` to carry `severity`, `category`, and optional `messageIndex` in addition to the banner-visible `lineOrdinal` and `reason`. The current Transcript and Skim warning banners still render only `reason`; the extra fields are carried for Phase 7c's inline routing.

Severity values:

- `error` — the parser could not reliably inspect the line, such as malformed JSON, an empty mid-document line, a non-object top-level JSON value, or a missing required discriminator.
- `warning` — the line was parsed, but its schema or payload is anomalous and may indicate source drift or corrupt data.
- `info` — reserved for unusual-but-handled parser observations. Phase 7b does not intentionally emit info warnings for expected metadata.

Category values:

- `lexer` — failures before object inspection, including empty lines, malformed JSON, and top-level non-objects.
- `schema` — top-level discriminator or shape drift, including missing `type`, unknown top-level type, unknown `event_msg` type, or unknown `response_item` payload type.
- `payload` — message-body or sub-field anomalies, including role mismatches, invalid content item shapes, missing command/output fields, or missing event message text.
- `timestamp` — unparseable or non-string timestamp fields.
- `meta` — reserved for session-level metadata anomalies. Expected Claude Code and Codex metadata is explicitly routed and silenced instead.

The Phase 7b invariant is that the real local corpus sweep emits zero parser warnings. Run `bun run parser-warning-sweep` from `apps/frontend/`; it walks Claude Code and Codex JSONL roots, prints per-`tool/severity/category` counts, and exits non-zero if any warning fires. Synthetic warning fixtures live under `tests/fixtures/parser-warnings/` and are excluded from the real-session sweep.

## Stream caps

- **Skim / Transcript full-payload fetch**: 5 MB cap via `streamRawText.ts` (constant `STREAM_RAW_TEXT_BYTE_CAP`). Multi-byte UTF-8 character straddling the boundary may yield `U+FFFD` per spec line 402 (byte-anchored contract). Cap-equality is exact: `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` when truncated. `reader.cancel()` fires at cap trip. Listener cleanup in `finally`.
- **Raw tab preview**: 256 KB / 20 lines via `consumeRawPreview` (Phase 4 unchanged).
- The two consumers are independent: no shared state, no double-fetch.

## LRU cache + epoch invalidation

`useParsedSession` owns a module-scoped LRU(5) cache of `ParsedSession` keyed by `(storedSessionUid, tool)`. In-flight fetches are coalesced via a separate `inFlight` map; controllers via `inFlightControllers`. `bumpCacheEpoch()` is exported from `useParsedSession.ts` and called from `App.tsx` on Rescan / Import success (success path only, never `finally`, never on error path). The epoch counter aborts every in-flight controller, clears cache + inFlight + controllers, and increments. Both the cache write AND the state transition are gated on `cacheEpoch === epochAtStart`; coalesced siblings capture `epochAtSubscription` at coalescing time and gate the `.then` transition independently. `isAbortError` filter ensures unmount / row-change / hard-reset abort silently no-ops.

Retry path: `retry()` bumps `retryNonce` only when the current state is `"error"` (spec line 434); the dep array `[storedSessionUid ?? null, tool ?? null, retryNonce]` triggers a fresh fetch bypassing cache + inFlight.

## Oversize threshold

User messages > 64 KB (`USER_MSG_OVERSIZE_THRESHOLD = 65_536`; strict `>`, not `>=`) become `oversized_user_message` blocks in `buildSkim`. They are NEVER summarized (PRD line 257). The verbatim body renders in a `<pre>` inside the collapsed `<details>` and is byte-faithful.

## Expansion semantics

- **Skim `user_turn` "Expand to raw messages"**: mounts a scoped `<TranscriptView messageRange={{ start: block.start + 1, end: block.end }} />`. The `+1` skips the user message itself so only the agent reaction is shown.
- **Skim `agent_only` expand**: mounts a scoped `<TranscriptView messageRange={{ start: block.start, end: block.end }} />`.
- **Empty-stream sentinel** (`{kind: "agent_only", start: 0, end: -1, meta: {empty: 1}}`): renders as a collapsed `agent_only` block with `Agent-only session (0 messages)` summary; expanding mounts the TranscriptView empty-state copy (`No messages parsed.`) via the defensive clamp at `TranscriptView.tsx`.

## Known limitation: source-only rows

Spec line 626 documents an alternate "Open raw" anchor copy for `storedSessionUid === null` rows. M4 implemented the anchor as hidden when the row has no stored uid (no alternate copy rendered). Revisit if user feedback surfaces the need.

## JSON.stringify(undefined) pitfall

Per-tool parsers always guard `JSON.stringify(payload.X ?? null)` to avoid the runtime-shape bug where `JSON.stringify(undefined) === undefined` (NOT a string), which would violate the `Message.text: string` type contract. Any future parser additions must preserve this guard at every `JSON.stringify` site where the input may be `undefined`. Cross-reference: spec line 779 also documents an asymmetry where `exec_command` stringifies its command but `exec_command_output` passes its output through raw (the "/" separator in the spec table is positional alternation, NOT shared transformation).
