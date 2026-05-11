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

- 18 `SessionRow` fields verbatim from Phase 4's drawer body — `session_key`, `session_uid`, `row_key`, `tool`, `source_session_id`, `presence`, `status`, `status_conflict`, `title`, `project_path`, `source_path` (labeled `Last seen source path` when `sourcePathIsStale` is true), `source_path_is_stale`, `source_fingerprint`, `has_subagent_sidecars`, `stored_raw_ref`, plus three timestamps annotated as either source-clock (`created_at`, `source_updated_at`) or backend-clock (`ingested_at`).
- Copy path button (Clipboard API + manual-select fallback for environments without `navigator.clipboard`).
- Inline subagent sidecar badge alongside `has_subagent_sidecars` per Resolved Decision #8.
- `View raw` anchor only when `storedSessionUid !== null`.
- Status conflict badge (top-level header) uses the `--color-warn` recipe per spec line 622 + M2b colors.md H09 (NOT `--color-error`; semantic — error ≠ warning).

## Parsers

Per-tool architecture under `apps/frontend/src/features/sessions/parsers/`:

- `types.ts` — `Message`, `MessageKind`, `SkimBlock`, `BlockKind`, `ParseWarning`, `ParserOutput`, `ParsedSession`, `StreamMeta`.
- `claude_code.ts` — pure / total / synchronous parser for Claude Code NDJSON.
- `codex.ts` — pure / total / synchronous parser for Codex NDJSON; implements the anchor principle (`response_item.message` of role user/assistant is silently skipped because `event_msg.user_message` / `agent_message` is the canonical anchor).
- `buildSkim.ts` — dual-tracker algorithm producing `SkimBlock[]` from `Message[]`. Constants: `USER_MSG_OVERSIZE_THRESHOLD = 65_536` (strict `>`); empty stream emits `[{kind: "agent_only", start: 0, end: -1, meta: {empty: 1}}]`.
- `index.ts` — `PARSERS: Record<Tool, ParserFn>` registry + `dispatchParser(tool, rawText, streamMeta): ParsedSession`. Two layers of defence against future-Tool drift (static `Record` + runtime exhaustiveness test).

Parsers are pure (no I/O), total (never throw — failures go to `warnings[]`), and synchronous. Adding a third tool is one registry entry plus a new `parsers/<tool>.ts` file plus a co-located test file — NOT a control-flow edit anywhere else.

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
