# Phase 5: Session Views & Master-Detail Inspection Layout

## Status

Frozen at the Chunk A commit on `main`. Subsequent chunks reference this commit's SHA. Phase 4 (the unified-list inspection surface) shipped at `f97181d` (2026-04-27) and is the baseline this phase mutates.

## Why this phase exists

Phase 4 shipped a unified inspection list that solved per-row search/filter/sort/pagination and surfaced an 18-field metadata drawer over a 20-line raw NDJSON preview. The list is correct but layout-heavy: eight content-driven columns (Select / Status / Tool / Title / Project / Updated / Stored Copy / Source Path) consume 1100–1200 px of the 1400 px main, and the modal drawer (`width: min(92vw, 640px)`) overlays the table rather than coexisting. This leaves no surface room to mount the session-content features the PRD describes (transcript in chronological order, skim view with the four block kinds, expand-block-into-raw, derived metadata, eventually summaries / notes / tags / highlights).

Phase 5 restructures the inspection page into a **persistent split-pane master-detail** surface: compact session list on the left, real session-content view on the right. The list compresses from eight columns to four essentials; dropped fields move to a Metadata tab in the right pane. The right pane gains four tabs — Skim / Transcript / Raw / Metadata — backed by per-tool client-side parsers that turn the existing raw NDJSON stream into a typed message timeline plus skim-block boundaries. LLM summary generation and user annotations are explicitly deferred; SkimView renders the disabled-summary placeholder copy mandated by `PRD.md` line 223 instead of generating text.

Reference research (Singularity, Agentlytics, Code Insights — AIDE Memory / Pieces LTM / XHawk are behind marketing pages) converged on this same shape: compact 4-essentials list + right-side detail pane with tabs.

## Goal & Scope

### In scope (must close in Phase 5)

- Split-pane master-detail layout at `<main>` (CSS Grid `minmax(300px, 380px) 1fr` above 900 px; stacked with explicit narrowMode toggle below).
- Compact list rows showing four essentials per row: Title (with inline tool badge + muted rowKey + statusConflict refresh marker), Status pill, Project (truncated with title= hover), Updated relative-time. Phase 4's Source Path / Stored Copy / Tool columns move to the Metadata tab.
- Right-pane four-tab `SessionView`: Skim / Transcript / Raw / Metadata. Tab state is component-local React state (NOT URL-synced; see §Routing).
- Per-tool client-side message parsers for Claude Code and Codex in `apps/frontend/src/features/sessions/parsers/{claude_code,codex}.ts`. Pure, total (failures land in `warnings[]`, never throw), synchronous; consume the existing `/api/v1/sessions/:uid/raw` stream with a 5 MB safety cap.
- Typed `Message`, `MessageKind`, `SkimBlock`, `BlockKind`, `ParsedSession` data model in `parsers/types.ts`.
- `buildSkim.ts` pure function emitting `SkimBlock[]` from `Message[]`.
- TranscriptView: chronological message list with per-kind rendering (`user`, `assistant`, `tool_use`, `tool_result`, `system`, `unknown`), absolute + relative timestamps, collapsible long tool_result (>2 KB), truncation banner when the 5 MB cap fired.
- SkimView: renders all four PRD block kinds (`user_turn`, `boundary`, `agent_only`, `oversized_user_message`); `user_turn` shows the user message verbatim plus a collapsible "Agent reaction" disclosure carrying the disabled-summary placeholder copy "Summary disabled — generation deferred to a later phase" plus an "Expand to raw messages" affordance reusing TranscriptView scoped to the turn's ordinal range; `boundary` renders as a horizontal divider with explicit "Session resumed" / "Conversation compacted" copy and is NEVER merged into a neighbor; `agent_only` and `oversized_user_message` collapsed by default; `oversized_user_message` is NEVER summarized (PRD line 257).
- Raw tab: byte-equivalent to Phase 4's drawer raw-preview block (`streamSessionRaw` + `consumeRawPreview` with the 20-line OR 256 KB cap, AbortController on tab unmount).
- Metadata tab: relocates the 18 SessionRow fields verbatim from the Phase 4 drawer body, plus the subagent sidecar badge (PRD line 226 — flag exists in `SessionRow.hasSubagentSidecars`), the sourcePathIsStale "Last seen source path" label, and the statusConflict badge.
- URL-synced selection: `?session=<rowKey>` via `window.history.replaceState`. `popstate` listener restores selection on Back/Forward. Direct-link missing-row case shows recoverable "Session not found" copy with a "Clear selection" button. No router dependency.
- Accessible Tabs primitive at `apps/frontend/src/components/Tabs.tsx` (ARIA `tablist` / `tab` / `tabpanel` + Left/Right/Home/End keyboard nav).
- Empty-pane state when no session selected; "Back to list" affordance in the session header on stacked-narrow viewports.
- Phase 4 invariants preserved verbatim: filter / sort / search persistence, the click-time intersection rule (filter + pagination variants), the importability rule, per-fetch error isolation, the four documented empty states (no_sessions_at_all / no_matches_after_filter / nothing_to_import / partial_fetch_failure), action-bar selection invariants.
- Eight-doc sweep + WCAG AA contrast measurements for every new visible foreground/background pair (light + dark) + final progress-log entry.

### Out of scope (deferred to Phase 6+)

- LLM summary generation, first-run consent, provider configuration, per-tool/per-project/per-session summary opt-out (PRD lines 247–253). Phase 5 only renders the disabled-state placeholder per PRD line 223.
- Annotations: notes (session-level + block-level), tags, bookmarks, highlights, quality marks (PRD lines 234–235, 309–311). No data persistence layer; backend has no annotation endpoints in v1.
- Orphaned-annotations surface (PRD line 235). Depends on annotations.
- Distill / lens / skill-draft curation (PRD §4 + §5). Larger surface; its own phase.
- Archive / Purge / tombstones / `do_not_send_to_llm` flag UI (PRD lines 405–415, 244, 251). Backend mutations not in v1; UI follows backend.
- Browse-mode views per PRD lines 193–198: Recent activity, Timeline (day/week/month), Project, Tool, Search results. Phase 5 keeps the unified inspection list as the single browse mode.
- Search-within-transcript inside the session view (deferred until annotations land).
- Multi-page routing / router dependency (`react-router-dom` etc.). URL state uses History API directly.
- Transcript virtualization (`@tanstack/react-virtual` — escape-hatch slot 2). Reserved; only fires if Milestone 4's measurement on a 5k-message synthetic fixture shows > 16 ms per frame on Chromium.
- New backend HTTP routes, contract types, or component crates. The existing `/api/v1/sessions/:uid/raw` endpoint suffices.
- Cleaning the small remaining set of stale "three panels" test names from Phase 4 (test bodies still describe the 3-GET network behavior accurately; renaming would only reduce documentation drift).

## Dependency Policy

Inherits Phase 4's policy verbatim:

- At most TWO new runtime dependencies allowed across all of Phase 4 + Phase 5, each only under a documented escape-hatch clause with concrete reproducer evidence.
- Slot 1 consumed: `focus-trap-react@^11` in Phase 4 Milestone 4 E1 (native `<dialog>` Tab #3 escaped focus trap on Chromium 1217). Phase 5 retires the drawer; the dep becomes orphan-installed (negligible cost; future modal needs may revive it). Documented in `docs/dependency-rules.md`.
- Slot 2 reserved: `@tanstack/react-virtual` for transcript virtualization. Only fires after Milestone 4 measures > 16 ms per frame on a 5k-message synthetic fixture on real Chromium.
- Forbidden: Tailwind, MUI/Chakra/Radix/Mantine/shadcn, CSS Modules, CSS-in-JS runtimes (emotion, styled-components, vanilla-extract), state managers (Zustand, Redux, Jotai), data-fetching libraries (TanStack Query, SWR), icon libraries (lucide, heroicons), Bun→Node shims, `npm` / `node` / `child_process` / `jest.fn()` (Bun-first per `feedback_bun_not_node.md`).
- No new escape-hatch dep without a documented reproducer (a JSDoc comment in the consumer's header citing the failing scenario).

## Target Repository Shape

No new apps. No new component crates. No Rust changes.

```text
apps/frontend/
├── package.json                    # at most 2 escape-hatch runtime deps total (Phase 4 + 5)
├── src/
│   ├── main.tsx                     # cascade: reset → tokens → global → feature-local sibling sheets
│   ├── App.tsx                      # split-pane shell + selectedRowKey ownership + URL sync
│   ├── features/
│   │   └── sessions/
│   │       ├── SessionsView.tsx     # NARROWED to compact list panel (no longer hosts drawer)
│   │       ├── SessionsTable.tsx    # 4-column compressed; row-click sets selection
│   │       ├── SessionFilters.tsx   # compact horizontal strip + <details> on narrow viewports
│   │       ├── SessionView.tsx      # NEW — right-pane shell + tab strip
│   │       ├── SkimView.tsx         # NEW — four block kinds renderer
│   │       ├── TranscriptView.tsx   # NEW — chronological message renderer
│   │       ├── SessionMetadata.tsx  # NEW — extracted from SessionDetail.tsx (18-field <dl>)
│   │       ├── RawTab.tsx           # NEW — extracted from RawPreviewBlock
│   │       ├── useSelectedSession.ts # NEW — ?session=<rowKey> via History API
│   │       ├── useParsedSession.ts  # NEW — fetch + parser dispatch + per-(rowKey,tool) cache
│   │       ├── streamRawText.ts     # NEW — full-document fetch with 5 MB cap
│   │       ├── parsers/
│   │       │   ├── types.ts         # NEW — Message / MessageKind / SkimBlock / BlockKind / ParsedSession
│   │       │   ├── claude_code.ts   # NEW — Claude Code per-tool parser
│   │       │   ├── codex.ts         # NEW — Codex per-tool parser
│   │       │   └── buildSkim.ts     # NEW — Message[] → SkimBlock[] pure function
│   │       ├── mergeSessions.ts     # unchanged
│   │       ├── filterSessions.ts    # unchanged
│   │       ├── applyPagination.ts   # unchanged
│   │       ├── relativeTime.ts      # unchanged
│   │       ├── useSessionFilters.ts # unchanged
│   │       ├── useToastQueue.ts     # unchanged
│   │       ├── lastRescan.ts        # unchanged
│   │       ├── rawPreview.ts        # unchanged (consumed by RawTab)
│   │       └── types.ts             # unchanged (SessionRow + isImportable)
│   ├── components/
│   │   ├── ActionBar.tsx            # moved to bottom of list panel
│   │   ├── Pagination.tsx           # moved into list panel
│   │   ├── ScanErrorsCallout.tsx    # unchanged
│   │   ├── Tabs.tsx                 # NEW — accessible tablist primitive
│   │   ├── Toast.tsx                # unchanged
│   │   └── (StatusBadge, Drawer, SessionDetail RETIRED in M2/M6 — see below)
│   ├── lib/
│   │   ├── api.ts                   # unchanged
│   │   ├── config.ts                # unchanged
│   │   └── contracts.ts             # unchanged
│   └── styles/
│       ├── reset.css                # unchanged
│       ├── tokens.css               # unchanged unless WCAG forces a darken on existing token
│       └── global.css               # <main> becomes CSS Grid; @media (max-width: 900px) stacks
└── e2e/                             # extended specs
```

Files removed in this phase (M6): `apps/frontend/src/features/sessions/SessionDetail.tsx` (split into `SessionMetadata.tsx` + `RawTab.tsx` in M2; deleted in M6 once both extractions land), `apps/frontend/src/components/Drawer.tsx` (no modal in Phase 5; deleted in M6).

## Data Model in the Browser

The unified inspection-list data model from Phase 4 is unchanged: `SessionRow` (18 fields), `isImportable`, `mergeSessions` join, filter/sort/pagination pipeline.

Phase 5 adds a per-tool typed-message data model in `apps/frontend/src/features/sessions/parsers/types.ts`:

```ts
export type MessageKind =
  | "user" | "assistant" | "tool_use"
  | "tool_result" | "system" | "unknown";

export type Message = {
  ordinal: number;        // 0-indexed line number in the raw NDJSON
  timestamp: string | null;
  kind: MessageKind;
  text: string;
  toolName?: string;      // populated when kind === "tool_use" or "tool_result"
  raw: string;            // verbatim NDJSON line for "Expand to raw" affordances
  bytes: number;          // approximate UTF-8 byte size for oversize detection
};

export type BlockKind =
  | "user_turn" | "boundary" | "agent_only" | "oversized_user_message";

export type SkimBlock = {
  kind: BlockKind;
  start: number;          // inclusive ordinal
  end: number;            // inclusive ordinal
  meta?: Record<string, string | number>;
};

export type ParseWarning = {
  ordinal: number;
  reason: string;         // human-readable; surfaced as a small dismissible banner
};

export type ParsedSession = {
  tool: Tool;
  messages: Message[];
  skim: SkimBlock[];
  totalBytes: number;
  truncated: boolean;     // true when the 5 MB cap fired during streamRawText
  warnings: ParseWarning[];
};
```

Per-tool parsers are pure, total, synchronous functions:

```ts
export function parseClaudeCode(rawText: string): ParsedSession;
export function parseCodex(rawText: string): ParsedSession;

export function dispatchParser(tool: Tool, rawText: string): ParsedSession {
  return tool === "claude_code" ? parseClaudeCode(rawText) : parseCodex(rawText);
}
```

The parsers re-walk the NDJSON field paths independently. They reference (do NOT share code with) the Rust adapters at `components/collector-runtime/src/adapters/{claude_code,codex}.rs`:

- Claude Code: `/message/role` distinguishes user vs assistant; `/message/content` is either a string OR an array (assistant content arrays split into separate `Message` rows for `text` and `tool_use` shapes); `/timestamp` is RFC3339.
- Codex: top-level `record_type` field tags each line; `session_meta` becomes the first `system` message (a second mid-stream becomes a `boundary` of subtype `session_resumed`); `event_msg` carries `payload.type` and `payload.timestamp`.
- Both: a malformed line lands in `warnings[]` with `{ordinal, reason}`; the message stream skips that ordinal and continues.

The four `BlockKind` values are assigned exclusively in `buildSkim.ts` from the `Message[]` produced by the parsers. Parsers only assign `MessageKind`. This separation prevents a parser bug from corrupting block grouping.

### User-turn boundary algorithm

`buildSkim(messages, threshold)` walks the message stream once with these rules:

1. Empty stream → return one `agent_only` block with `start: 0, end: -1, meta: {empty: 1}`.
2. Initialize `currentTurnStart = null`.
3. For each message in ordinal order:
   - If kind is a boundary marker (Codex `session_resumed`, `compacted`): close any open user_turn at ordinal-1; emit `boundary` block with `start === end === currentOrdinal`; reset `currentTurnStart = null`.
   - Else if kind is `user`:
     - If `bytes > USER_MSG_OVERSIZE_THRESHOLD` (default 64 KB): close any open user_turn at ordinal-1; emit `oversized_user_message` block with `start === end === currentOrdinal`; reset `currentTurnStart = null`.
     - Else if `currentTurnStart === null`: start a new user_turn with `start = currentOrdinal`.
     - Else: close previous user_turn at ordinal-1; start a new user_turn with `start = currentOrdinal`.
   - Else (`assistant`, `tool_use`, `tool_result`, `system`, `unknown`): if `currentTurnStart === null`, start a synthetic agent_only-region accumulator; else extend current user_turn.
4. End of stream:
   - If a user_turn is open, close it at last ordinal.
   - If NO user_turn was emitted across the whole stream, replace any synthetic accumulator with one `agent_only` block spanning `[0, last]`.

### Streaming + 5 MB safety cap

`streamRawText(uid, signal): Promise<{text: string, truncated: boolean}>` consumes `streamSessionRaw(uid, signal)` (the existing `/api/v1/sessions/:uid/raw` exporter from `apps/frontend/src/lib/api.ts`), accumulates chunks via `TextDecoder`, and short-circuits via `reader.cancel()` once the byte cap fires. The cap (`STREAM_RAW_TEXT_BYTE_CAP = 5 * 1024 * 1024 = 5_242_880`) is exported as a constant for a future configuration phase. When the cap fires, `truncated: true` and the SkimView/TranscriptView render a small banner: "Truncated at 5 MB — full payload not parsed; use Raw tab to inspect the rest."

### useParsedSession hook

`useParsedSession(rowKey, tool): {state: "loading" | "success" | "error" | "truncated", parsed?: ParsedSession, error?: Error}` coordinates the lazy fetch + parser dispatch with a per-`(rowKey, tool)` in-memory cache (lives for the lifetime of the React tree; tab switching does NOT re-fetch). Aborts the in-flight fetch on `rowKey` change via `AbortController`. Cache eviction: simple Map; entries cleared when the user clicks Rescan.

## Inspection Surface Layout

### Split-pane shell

`<main>` becomes `display: grid; grid-template-columns: minmax(300px, 380px) 1fr; gap: var(--space-4); max-width: 1400px; margin: 0 auto`. Above 1280 px both panes render side by side. Below 900 px, a single-column layout with a `narrowMode = "list" | "session"` component-local state toggle. All three layouts are pure CSS via media queries — no JS resize listener.

```css
@media (max-width: 900px) {
  main { grid-template-columns: 1fr; }
  /* narrowMode "list" hides .session-pane; "session" hides .list-pane; transitions purely visual */
}
```

The narrowMode toggle is set when the user clicks a list row (→ `"session"`) or the in-session-header "Back to list" button (→ `"list"`). On wide viewports, narrowMode is meaningless because both panes always render.

### Compact list rows (4 essentials)

The `SessionsTable` shrinks from 8 columns to 4:

| Column      | What renders                                                                                                                         |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Title**   | Bold `row.title || "(untitled)"` on top line; muted `row.tool` badge + `row.rowKey` (monospace, smaller) below; `(refresh)` marker if `statusConflict` |
| **Status**  | Same status pill (badge.up-to-date / not-stored / outdated / source-missing) as Phase 4                                              |
| **Project** | `row.projectPath || "—"` truncated with `text-overflow: ellipsis`; full path on `title=` hover                                       |
| **Updated** | `relativeTimeFrom(now, row.sourceUpdatedAt)`; absolute ISO on `title=` hover                                                         |

The Select column from Phase 4 stays (importability rule). Phase 4's Source Path / Stored Copy columns move to the Metadata tab; the Tool column merges into the Title cell. Total visible columns post-compression: Select + Title + Status + Project + Updated = 5 (4 content + 1 select).

Selection visual: the row corresponding to `selectedRowKey` carries `aria-current="true"` and a tinted background (e.g. `color-mix(in srgb, var(--color-accent) 8%, transparent)`).

### Filter bar placement

The existing `<SessionFilters>` strip (5 filter rows from Phase 4) stays at the top of the list panel. Below 1100 px, the strip wraps inside a `<details>` element with summary "Filters" and the row count of active filters as a hint. Default open state: open above 1100 px, closed below.

### Action bar placement

`<ActionBar>` moves from the `<section>` footer to the bottom of the list panel; `position: sticky; bottom: 0; z-index: 1`. Same selection invariants and "last rescan from this browser X ago" caption.

### Pagination placement

Pagination strip lives between the table and the action bar inside the list panel. Defaults stay 50 / 100 / 200; behavior unchanged.

### URL state via History API

`?session=<rowKey>` synced via `window.history.replaceState`. Selection lives in `App.tsx` state and is mirrored to the URL on every change. Mount reads `URLSearchParams(window.location.search).get("session")` and pre-selects.

A `popstate` listener re-reads the URL on browser Back/Forward and sets `selectedRowKey`. Direct-link missing-row case (URL has `?session=foo` but no row matches): right pane renders "Session not found in current view" copy with two buttons: "Clear selection" (removes URL param) and "Maybe try Rescan" (calls `refetchAll`).

`replaceState` (not `pushState`) avoids back-stack pollution as the user clicks through the list. The trade-off: browser Back doesn't navigate between sessions, only between filter changes / out-of-app history.

### Empty pane state

Right pane with no `selectedRowKey` renders:

> Select a session from the list to view its content.
>
> The session view shows a Skim outline (one block per user message), the full Transcript chronologically, the Raw NDJSON for verification, and the session's Metadata.

Plus a small subtle illustration or icon (text-only is fine; no icon library).

### Mobile / narrow viewport (< 900 px)

Stacked layout: list panel renders full-width when `narrowMode === "list"`; session pane renders full-width when `narrowMode === "session"`. Switching uses pure visibility/grid-area changes — both panes stay mounted to preserve scroll position and tab state. The session header carries an explicit "← Back to list" button that sets `narrowMode = "list"` AND clears the URL `?session=` param (so browser Back from list doesn't loop). The Transcript / Skim tabs render at full reading width on mobile.

## Session View (Right Pane)

### Header

- Title (bold; `row.title || "(untitled)"`)
- Tool badge (`row.tool`, monospace)
- Status pill (same recipe as the list-row pill)
- Conflict badge if `row.statusConflict` ("Source ↔ stored disagreed")
- Subagent sidecar badge if `row.hasSubagentSidecars` ("Has Claude Code subagent sidecars on disk — not ingested in v1")
- "Last seen source path" hint inline near sourcePath if `row.sourcePathIsStale`
- Copy-to-clipboard button for `row.sourcePath`
- "Open raw" anchor (target=_blank, identical href to Phase 4 — `/api/v1/sessions/<uid>/raw`)
- On narrow viewports: "← Back to list" button at the very top

### Tab strip

Four tabs: **Skim** / **Transcript** / **Raw** / **Metadata**. Default active tab on first selection: **Skim** (matches PRD intent that summary blocks be the primary anchor for review).

Tab state is component-local React state, NOT URL-synced. Switching tabs does NOT re-fetch raw bytes (the `useParsedSession` cache hit serves all three parsed-content tabs; Raw uses its own streaming consumer).

The Tabs primitive at `apps/frontend/src/components/Tabs.tsx` implements ARIA `tablist` / `tab` / `tabpanel` with Left/Right keyboard nav, Home/End to first/last, automatic activation (selection follows focus per [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)), and `aria-controls` / `aria-labelledby` linkage.

### Skim tab

Renders `parsed.skim` (the `SkimBlock[]` from `buildSkim`). For each block kind:

- **`user_turn`**: renders the user message inline (verbatim text, monospace for code-fenced segments). Below it, a collapsible `<details>` element with summary "Agent reaction (N messages)" and body containing the disabled-summary placeholder copy:

  > Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent's response inline.

  Followed by an "Expand to raw messages" affordance (button): clicking renders a scoped `<TranscriptView>` component restricted to the ordinal range `[block.start+1, block.end]` (the agent reaction).

- **`boundary`**: horizontal divider (`<hr>` styled) with explicit copy: "Session resumed" for `meta.subtype === "session_resumed"`; "Conversation compacted" for `meta.subtype === "compacted"`. Boundaries are NEVER merged into a neighbor.

- **`agent_only`**: collapsed by default. Header: "Agent-only session ({count} messages)". Expanding reveals a scoped TranscriptView spanning `[block.start, block.end]`. PRD line 256 mandates collapsed default.

- **`oversized_user_message`**: collapsed by default. Header: "Oversized user message ({sizeKB} KB) — collapsed by default". Expanding shows the verbatim message text. NEVER summarized (PRD line 257).

The Skim view NEVER renders silently blank for any state — the disabled placeholder always carries copy per PRD line 223.

### Transcript tab

Flat chronological render of `parsed.messages`. For each message:

- **`user`**: panel with "User" label (small caps, muted), monospace for code-fenced text segments, surrounded by a tinted background (`color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))`).
- **`assistant`**: panel with "Assistant" label, default surface background, normal text. Visually distinct from user via the tint difference.
- **`tool_use`**: monospace block with header "Tool: {toolName}" and a collapsible `<details>` for arguments JSON.
- **`tool_result`**: similar header "Tool result: {toolName}". First ~2 KB of body rendered; rest behind "Expand" if larger.
- **`system`**: small muted line (system-message styling).
- **`unknown`**: muted "Unrecognized line: {first 80 chars}" — fallback for unparseable shapes.

Each message row carries a timestamp display: relative time as visible label (`relativeTimeFrom(now, msg.timestamp)`), absolute ISO via `<time dateTime="...">` and on `title=` hover.

If `parsed.truncated`, a small banner at the top of the Transcript: "Truncated at 5 MB — full payload not parsed. Use Raw tab to inspect the remaining bytes."

If `parsed.warnings` is non-empty, a small dismissible banner: "{N} parse warnings — click to view." Expanding reveals the warnings list with ordinal + reason; the messages stream still rendered (warnings are non-blocking).

### Raw tab

Byte-equivalent to Phase 4's drawer raw-preview block. Mounts `RawTab.tsx` (extracted from `SessionDetail.tsx`'s `RawPreviewBlock`): `streamSessionRaw` + `consumeRawPreview` (20-line OR 256 KB cap, AbortController on tab unmount). The full-document fetch used by Skim/Transcript is a SEPARATE consumer (`streamRawText.ts`, 5 MB cap) — they don't share state.

Raw tab is the verifiability hatch: when transcript/skim look wrong, the user inspects the actual on-disk NDJSON.

### Metadata tab

The 18-field `<dl>` extracted verbatim from `apps/frontend/src/features/sessions/SessionDetail.tsx` (lines 160–256 in Phase 4 close), plus the subagent sidecar badge if `row.hasSubagentSidecars`, the sourcePathIsStale label, the statusConflict badge, the copy-to-clipboard button for sourcePath, and the "Open raw" anchor (also present in the header — both surfaces keep the affordance for discoverability).

Phase 5 does NOT add new metadata fields; it relocates the existing 18 fields from drawer to Metadata tab.

## Per-tool Message Parsers (Detail)

### File layout

```text
apps/frontend/src/features/sessions/parsers/
├── types.ts          # Message / MessageKind / SkimBlock / BlockKind / ParsedSession / ParseWarning
├── claude_code.ts    # parseClaudeCode + dispatchParser entry
├── codex.ts          # parseCodex
└── buildSkim.ts      # Message[] → SkimBlock[] (separate from per-tool parsing)
```

Tests sit alongside as `claude_code.test.ts`, `codex.test.ts`, `buildSkim.test.ts`.

### Claude Code field paths (parser uses these; the Rust adapter at `components/collector-runtime/src/adapters/claude_code.rs:160-211` reads the same paths for its own metadata extraction)

- `/timestamp` → `Message.timestamp` (RFC3339; `null` if missing or unparseable)
- `/message/role` → "user" / "assistant" → `Message.kind`
- `/message/content`:
  - If string → `Message.text`
  - If array → multiple `Message` rows: each `{type: "text", text}` becomes one `Message` of kind `assistant` (or `user` based on parent role); each `{type: "tool_use", name, input}` becomes one `Message` of kind `tool_use` with `toolName: name` and `text: JSON.stringify(input)`; each `{type: "tool_result", tool_use_id, content}` becomes one `Message` of kind `tool_result` with `text` being the result content
- Lines that don't match any known shape → `warnings.push({ordinal, reason})` and skipped from `messages`

### Codex field paths (parser uses these; `components/collector-runtime/src/adapters/codex.rs:68-180` reads the same paths)

- `/record_type === "session_meta"`:
  - First occurrence in stream → `Message.kind = "system"` with `text` summarizing meta
  - Subsequent occurrence → `SkimBlock` of kind `boundary` with `meta: {subtype: "session_resumed"}` (after parser; emitted by `buildSkim`)
- `/record_type === "turn_context"` → no message emitted (parser-side); used by Rust adapter for project_path extraction
- `/record_type === "event_msg"`:
  - `payload.type === "user"` → `Message.kind = "user"` with `text: payload.text`
  - `payload.type === "assistant"` → `Message.kind = "assistant"` with `text: payload.text`
  - `payload.type === "tool_call"` → `Message.kind = "tool_use"` with `toolName: payload.name`, `text: JSON.stringify(payload.input)`
  - `payload.type === "tool_output"` → `Message.kind = "tool_result"`
  - Other `payload.type` → `Message.kind = "system"` (fallback)
- `/payload/timestamp` → `Message.timestamp`

### buildSkim algorithm (formal)

Defined in §Data Model "User-turn boundary algorithm" above.

### Truth tables (test fixtures must cover)

- Empty file → `messages: []`, `skim: [{kind: "agent_only", start: 0, end: -1, meta: {empty: 1}}]`
- Single user message (string content) → one `user_turn` block
- User → assistant → user → assistant → two `user_turn` blocks of disjoint ordinal ranges
- User → assistant → tool_use → tool_result → user → ... → still two `user_turn` blocks (tool calls extend the current turn)
- Boundary mid-stream (Codex `session_resumed`) → `user_turn` / `boundary` / `user_turn`
- Agent-only run (no user msg, only assistant + tool messages) → all messages flattened into one `agent_only` block
- Single oversize user message (text > 64 KB) → one `oversized_user_message` block; no `user_turn`
- Malformed line in middle (invalid JSON) → message stream skips that ordinal, warning lands in `warnings[]`
- Tool_use + tool_result inside an assistant turn → both rendered as separate Messages within the same `user_turn` block
- Codex `session_meta` followed by `turn_context` → first message is `system`; project_path NOT extracted by parser (different concern from indexing)
- Codex embedded parent meta (second `session_meta` mid-stream) → `boundary` block of subtype `session_resumed`
- Mixed Claude Code content array (text + tool_use in one message) → splits into two adjacent Messages with the same `ordinal` (or sequential ordinals — pick and document)

## Filters / Sort / Search / Pagination (Carry-Over)

All Phase 4 filter / sort / search / persistence behavior is preserved verbatim. `useSessionFilters.ts`, `filterSessions.ts`, `applyPagination.ts`, `relativeTime.ts` — none change. The pipeline still runs at `App.tsx`: `mergeSessions → applyFilters → applySort → applyPagination → render`. The action bar and pagination strip move to the list panel's footer but remain controlled components driven by `App.tsx` state.

The **click-time intersection rule** is preserved verbatim. The Phase 4 regression test in `App.test.tsx` (`"M5: cross-page bulk-select"` and `"M5: pagination-cross-page click-time intersection"`) MUST still pass after the layout move. Phase 5 does not introduce new click-time-derivation paths.

The four documented empty states from Phase 4 (`no_sessions_at_all`, `no_matches_after_filter`, `nothing_to_import`, partial fetch failure with scan-errors Retry) all render identically in the list panel.

## Routing / URL State

No router dependency.

`apps/frontend/src/features/sessions/useSelectedSession.ts`:

```ts
export type UseSelectedSession = {
  selectedRowKey: string | null;
  selectRow: (rowKey: string | null) => void;
};

export function useSelectedSession(): UseSelectedSession;
```

Behavior:

- **On mount**: read `URLSearchParams(window.location.search).get("session")`; set initial state.
- **`selectRow(key)`**: update React state AND `window.history.replaceState(null, "", buildUrl(key))`.
- **`buildUrl(key)`**: preserves all other query params (future-compat with eventual filter URL state); `null` removes the `session` key entirely.
- **`popstate` listener**: re-reads URL and syncs `selectedRowKey`.

Why `replaceState` not `pushState`: casual scanning (clicking through 20 sessions) shouldn't pollute the back stack. Direct-link bookmarkability still works because the URL reflects the current selection; back navigates out of the app, not between sessions.

Direct-link missing-row case: handled in the right pane (renders recoverable empty state, not an error).

Tab state is NOT URL-synced in Phase 5 (deferred — would only land if needed for shareable deep-links to a specific tab).

## Sort Semantics (Carry-Over from Phase 4)

Unchanged. ASC nulls first, DESC nulls last. Tiebreaker chain: `source_updated_at → ingested_at → created_at → title (case-insensitive ASCII) → rowKey`.

## localStorage Persistence (Carry-Over from Phase 4)

Unchanged. `distill-portal:inspection-filters:v1` (filter state) and `distill-portal:last-manual-rescan:v1` (last rescan caption). Total decoder pattern preserved (corrupt input falls back to defaults).

Phase 5 does NOT add new localStorage keys. Selection state lives only in URL + React; it is intentionally not persisted across browser closes.

## Empty States (Carry-Over + 1 New)

Inherits the four Phase 4 empty states unchanged. Adds:

5. **session_not_found**: when URL `?session=foo` has no matching row in the merged set, the right pane renders "Session not found in current view" with "Clear selection" + "Maybe try Rescan" buttons.

The list panel can also show its existing 4 empty states; the right pane's empty-pane copy ("Select a session…") renders independently.

## Design Tokens

**Default: no new color tokens.** Reuse the Phase 4 palette. Run a WCAG AA contrast check on every new visible foreground/background pair (transcript user-message tint, transcript assistant-message background, tab strip indicator color, skim block boundary divider, "Back to list" button) in BOTH light and dark modes; only add a token if AA fails for an unavoidable pair AND no existing token suffices. Documented in the M6 progress-log entry per Phase 4 precedent.

**New structural literals** (must be enumerated in M1's CSS file headers per design-balloon mitigation):

- `grid-template-columns: minmax(300px, 380px) 1fr` on `<main>`
- `@media (max-width: 900px)` breakpoint
- `2.5rem` tab strip height
- `var(--space-3) var(--space-4)` transcript message panel padding
- `1px dashed var(--color-border-strong)` skim boundary divider
- User message background: `color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))` (mirrors `.chip.active` recipe from M3)
- Assistant message background: `var(--color-surface)`
- Code block background inside a message: `var(--color-surface)` (or new `--color-code-bg` if WCAG fails)
- 16rem max-height inherited from M4 raw-preview block (now in RawTab.css)
- 64 KB `USER_MSG_OVERSIZE_THRESHOLD` constant
- 5 MB `STREAM_RAW_TEXT_BYTE_CAP` constant

## Documentation

Eight-doc sweep (matching Phase 4 §Documentation pattern). Lockstep with the chunk that introduces the change:

- `docs/README.md` — refresh frontend bullet to reflect split-pane layout + parsers/ subdirectory.
- `docs/dependency-rules.md` — reaffirm 2-package escape-hatch budget (1 of 2 consumed; slot 2 unused unless M4 measurement fires); note `focus-trap-react` orphan-installed status post-drawer-retirement.
- `docs/dev-commands.md` — extend test-surface paragraph with new test files (parsers, useSelectedSession, useParsedSession, Tabs, SessionView, SkimView, TranscriptView, SessionMetadata, RawTab, streamRawText).
- `docs/features/inspection-surface.md` — REWRITE to describe master-detail split-pane layout, list compression to 4 essentials, URL-state mechanics, "Back to list" affordance.
- `docs/features/session-view.md` — NEW. Document the four tabs, the four block kinds, parser approach (per-tool), 5 MB cap behavior, oversize threshold, expansion semantics.
- `docs/features/session-store.md` — minor update; replace any "drawer" references with "right pane".
- `docs/playbooks/modify-frontend-page.md` — update file paths; add a new "How per-tool parsers fit" section.
- `apps/frontend/README.md` — refresh Entry Points to add SessionView/Skim/Transcript/parsers/ subdirectory + Tabs primitive; remove deleted Drawer.
- `progress/phase-5.progress.md` — created at Chunk A; updated per chunk.

## Milestones

Each milestone is reviewable on its own and leaves `main` green. Two-commit pattern per chunk (impl + log update) per Phase 4 precedent. Three-reviewer rule (backend-protection Claude + normal Claude + Codex external) applies per chunk.

### Milestone 1: Layout shell + URL sync + compact list

- Split-pane CSS Grid in `App.tsx` and `global.css`; sub-900px stacked layout via media query + `narrowMode` toggle.
- `useSelectedSession.ts` + tests; `?session=<rowKey>` syncing via `window.history.replaceState`; `popstate` listener; missing-row recoverable state.
- `SessionsTable.tsx` compressed to 4 columns (Title with inline tool badge + muted rowKey; Status; Project; Updated). Select column preserved (importability rule). Row-click sets `selectedRowKey`. `aria-current="true"` on selected row.
- `SessionView.tsx` placeholder mounted as right pane; renders empty-pane copy when no `selectedRowKey`; renders a single "coming soon" message when a row is selected (tabs land in M2).
- Vestigial drawer link in the empty session pane: a small "Open detail" button reachable when a row is selected, pointing at the existing Phase 4 `<Drawer>` (still mounted). Removed in M2 once Metadata tab is functional.
- `<ActionBar>` and `<Pagination>` move into the list panel footer.
- `<SessionFilters>` stays at top of list panel; below 1100 px wraps in `<details>`.

Definition of done:

- Click row → URL updates → vestigial drawer reachable.
- Browser Back/Forward navigates between sessions; reload restores; deep-link to missing row shows recoverable empty.
- Compact 4-column list renders within the 300–380 px pane on 1280 px+ viewports without horizontal scroll.
- Sub-900 px viewport stacks correctly; "Back to list" works.
- Phase 4 unit + Playwright e2e tests still green (especially the click-time intersection regressions in `App.test.tsx`).
- `cargo` gates / `bun test src` / `bun run build` / `bun run test:e2e` all green.

### Milestone 2: Tabs primitive + SessionView shell + Metadata tab

- `apps/frontend/src/components/Tabs.tsx` + `.css` + `.test.tsx`: ARIA `tablist` / `tab` / `tabpanel` + arrow-key nav (Left/Right/Home/End); selection follows focus.
- `SessionView.tsx` rewires to a four-tab shell using the Tabs primitive. Default active tab: **Skim** (placeholder until M5).
- `SessionMetadata.tsx` + `.css` + `.test.tsx`: extracted from `SessionDetail.tsx`'s `<dl>` body verbatim. All 18 SessionRow fields preserved.
- `RawTab.tsx` + `.test.tsx`: extracted from `SessionDetail.tsx`'s `RawPreviewBlock`. Byte-equivalent behavior to Phase 4 (20-line OR 256 KB cap, AbortController on tab unmount). The existing `rawPreview.ts` consumer is reused unchanged.
- Vestigial M1 drawer link removed; clicking a row now opens SessionView with **Skim** tab active (Skim renders "coming soon" copy until M5; Transcript also "coming soon" until M4; Raw + Metadata fully functional).

Definition of done:

- Metadata tab renders all 18 fields exactly as Phase 4 drawer.
- Tab strip keyboard-navigable (Left/Right/Home/End, focus follows selection).
- Raw tab byte-equivalent to Phase 4 drawer raw preview (same caption strings, same cancel-on-unmount).
- Skim/Transcript tabs render "Coming in Phase 5 Milestone 4/5" copy.
- All previous tests still green.
- `Drawer.tsx` + `SessionDetail.tsx` still on disk but no longer reachable from the UI.

### Milestone 3: Per-tool parsers + buildSkim + truth tables

- `parsers/types.ts` (Message, MessageKind, SkimBlock, BlockKind, ParseWarning, ParsedSession).
- `parsers/claude_code.ts` + `parsers/codex.ts` + `parsers/buildSkim.ts` + tests.
- `dispatchParser(tool, rawText): ParsedSession` entry.
- `streamRawText.ts` + `.test.ts`: full-document fetch with 5 MB cap, AbortSignal, truncation flag.
- `useParsedSession.ts` + `.test.ts`: lazy fetch + parser dispatch + per-`(rowKey, tool)` cache + abort on rowKey change.

Definition of done:

- Both parsers produce `ParsedSession` for every truth-table fixture (see §Per-tool Message Parsers → Truth tables).
- `buildSkim` 100% branch coverage on the algorithm above.
- `useParsedSession` correctly aborts in-flight fetches on rowKey change.
- Tab switching does NOT re-fetch raw bytes (cache hit serves all three parsed-content tabs).
- `streamRawText` mirrors `rawPreview.test.ts` patterns: hand-built ReadableStreams, abort-mid-loop, byte-cap fires (`reader.cancel()` proven by spy), body-less response.
- No new dependencies; no backend or contract changes.
- All gates green.

### Milestone 4: TranscriptView

- `TranscriptView.tsx` + `.css` + `.test.tsx`: chronological message list with per-kind rendering (user / assistant / tool_use / tool_result / system / unknown), absolute + relative timestamps via `relativeTimeFrom`, monospace for code-fenced segments, collapsible long tool_result body (>2 KB), truncation banner when `parsed.truncated`, parse-warnings dismissible banner.
- Wire into `SessionView`; **Transcript** tab now functional (Skim still placeholder until M5).
- Long-corpus measurement step: synthetic 5k-message fixture; Playwright frame-timing capture or manual perf measurement on real Chromium. If > 16 ms per frame for scroll → escape-hatch slot 2 fires (`@tanstack/react-virtual` lands per documented spec policy). Otherwise virtualization stays deferred and the measurement is recorded in the progress log.

Definition of done:

- Every `MessageKind` renders with correct visual distinction; user-vs-assistant tint passes WCAG AA.
- Truncation banner renders when `parsed.truncated`.
- Parser warnings surface as a small dismissible banner without blocking the message stream.
- Long-corpus measurement recorded in progress log; if escape-hatch slot 2 fires, the documented Chromium reproducer is captured per spec.
- All gates green; no regression in M3 parser tests.

### Milestone 5: SkimView with four block kinds

- `SkimView.tsx` + `.css` + `.test.tsx`: renders all four block kinds.
- `user_turn`: user message inline + collapsible "Agent reaction" disclosure with the disabled placeholder copy + "Expand to raw messages" affordance reusing TranscriptView scoped to ordinal range.
- `boundary`: divider with "Session resumed" / "Conversation compacted" copy; NEVER merged into a neighbor.
- `agent_only`: collapsed by default; expanding reveals scoped TranscriptView.
- `oversized_user_message`: collapsed by default; expanding reveals verbatim text; NEVER summarized.
- Wire into `SessionView`; **Skim** tab now functional. All four tabs operational.

Definition of done:

- No-user-msg session shows single collapsed `agent_only` block.
- Single-oversize-user-msg session shows single `oversized_user_message` block (no other content).
- Boundary blocks render between turns when present in fixtures.
- Disabled-summary placeholder copy renders verbatim under every `user_turn` (text matches PRD intent).
- "Expand to raw messages" reveals scoped TranscriptView restricted to the turn's ordinal range.
- WCAG AA on every new visible color pair.
- All gates green.

### Milestone 6: Cleanup, retire drawer, doc sweep, WCAG, log

- Delete `apps/frontend/src/features/sessions/SessionDetail.tsx` + `SessionDetail.test.tsx` + `SessionDetail.css`.
- Delete `apps/frontend/src/components/Drawer.tsx` + `Drawer.test.tsx` + `Drawer.css`.
- Decide `focus-trap-react` orphan status: KEEP installed (recommended; future modal needs may revive; cost is negligible). Document the orphan in `docs/dependency-rules.md`.
- Eight-doc sweep per §Documentation.
- Hex audit: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l = 24` (or documented delta if WCAG forced new tokens).
- WCAG AA measurements for every new visible foreground/background pair across light + dark modes; record table in progress log per Phase 4 precedent.
- All gates green: `cargo check --workspace`, `cargo test --workspace`, `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`, `bun test src`, `bun run build`, `bun run test:e2e`.
- Final progress log entry recording the close of Phase 5.

Definition of done:

- Retired files gone from disk and from doc cross-references (verify via `rg`).
- No drawer modal in the running app (Playwright happy path passes; no `<dialog>` opens).
- All gates green; no contract drift.
- Comprehensive WCAG table in progress log.
- Phase 5 progress log records every chunk including the three-reviewer trail per chunk.

## Acceptance Criteria

Phase 5 is complete when all of the following are true:

- Split-pane master-detail layout works on viewports ≥ 900 px; stacked layout below; both modes preserve every Phase 4 invariant.
- Compact list shows 4 essentials per row (Title + tool badge inline; Status; Project; Updated) plus the Select column. Phase 4's dropped columns (Source Path, Stored Copy, Tool as a column) reachable in the Metadata tab.
- Right pane has Skim / Transcript / Raw / Metadata tabs backed by the Tabs accessibility primitive (ARIA tablist + Left/Right/Home/End nav).
- Per-tool parsers cover the truth-table matrix; both `parseClaudeCode` and `parseCodex` are pure / total / synchronous (never throw).
- `buildSkim` produces correct `SkimBlock[]` for every fixture in the truth table.
- TranscriptView renders messages chronologically with per-kind visual distinction; collapsible long tool_result; truncation banner when applicable.
- SkimView renders all four block kinds with the disabled-summary placeholder per PRD line 223; never silently blank; never summarizes oversized user messages or agent-only sequences.
- Raw tab byte-equivalent to Phase 4 drawer raw preview block.
- Metadata tab carries all 18 SessionRow fields + subagent sidecar badge + sourcePathIsStale label + statusConflict badge + copy-to-clipboard.
- URL state survives reload + Back/Forward; deep-link missing-row shows recoverable empty state.
- WCAG AA contrast verified on every new visible foreground/background pair, light + dark.
- No new runtime dependency beyond Phase 4 baseline unless escape-hatch slot 2 fires with documented evidence.
- All Phase 4 invariants preserved (filters / sort / persistence / click-time intersection / importability rule / per-fetch error isolation / four empty states).
- All verification gates pass: `cargo check --workspace`, `cargo test --workspace`, `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`, `bun test src`, `bun run build`, `bun run test:e2e`.
- 8-doc sweep complete; phase-5 progress log records every chunk.

## Testing

Per-chunk test obligations (additive — Phase 4 tests remain green throughout):

- **Per-tool parser unit tests** with truth tables (M3): pattern follows `mergeSessions.test.ts`. Fixture matrix in §Per-tool Message Parsers → Truth tables.
- **`buildSkim.test.ts`** (M3): exhaustive matrix per the algorithm.
- **`streamRawText.test.ts`** (M3): mirrors `rawPreview.test.ts` — hand-built ReadableStreams, abort-mid-loop, byte-cap fires (`reader.cancel()` proven by spy), body-less response, pre-aborted signal.
- **`useParsedSession.test.ts`** (M3): loading / success / error / truncated / abort-on-rowKey-change / cache-hit-on-tab-switch.
- **`useSelectedSession.test.ts`** (M1): initial URL read / `selectRow` updates URL via `replaceState` / `popstate` syncs back / null clears param.
- **`Tabs.test.tsx`** (M2): keyboard nav (Left/Right/Home/End), ARIA roles, panel switching, focus model, automatic activation.
- **`SessionView.test.tsx`** (M2 + M5): empty-pane copy when no selection; tab switching; header rendering with subagent sidecar badge; missing-row recoverable copy.
- **`SkimView.test.tsx`** (M5): render of each block kind; expand/collapse; "Expand to raw messages" reveals scoped TranscriptView; disabled-summary placeholder copy renders.
- **`TranscriptView.test.tsx`** (M4): per-kind rendering; timestamps; collapse-long-tool_result; truncation banner; parse-warnings banner.
- **`SessionMetadata.test.tsx`** + **`RawTab.test.tsx`** (M2): verbatim Phase 4 drawer tests adapted to extracted components.
- **`SessionsTable.test.tsx`** extended (M1): 4-column compression renders correctly; row-click sets URL via `useSelectedSession`; `aria-current` styling on selected row; checkbox-cell propagation guard preserved.
- **`App.test.tsx`** extended (M1): split-pane mounts; URL-on-mount reads `?session=`; `popstate` round trip; click-time intersection still passes (M5 cross-page bulk-select test, M5 pagination-cross-page test).
- **Playwright e2e** extended (M1 + M2 + M5): seeded session opens via row click → URL updates → tab strip navigable → Skim tab renders blocks for the seeded fixture → browser Back/Forward navigates between sessions → deep-link to `?session=` opens session pane on load.
- **Accessibility** (M1 + M2 + M5): keyboard nav through list (Up/Down + Enter selects); tab strip (Left/Right/Home/End); skim disclosures (Tab + Enter to expand); landmarks `<aside>` for list, `<article>` for session pane; `aria-current="true"` on selected row.
- **WCAG AA contrast** (M4 + M5 + M6): script extension to cover transcript message tints, tab strip indicator, skim block boundary divider, "Back to list" button. M6 produces the comprehensive table for the progress log.

## Risks

- **Per-tool message format drift**: tool authors change shape between versions. Mitigation: `MessageKind = "unknown"` fallback + `warnings[]` stream + Raw tab as verifiability hatch. Same risk + mitigation pattern as the Rust adapters in `components/collector-runtime/src/adapters/`.
- **Long transcripts (> 5k messages) cause render jank**: most sessions are short; M4 includes a measurement step on a synthetic fixture; escape-hatch slot 2 fires only on documented evidence. If slot 2 fires, the dep budget reaches 2/2 — Phase 6+ has no further escape-hatch slots without spec amendment.
- **5 MB full-document cap too low**: PRD doesn't specify a corpus ceiling; truncation banner + Raw tab cover larger sessions. Lift in a future configuration phase if real corpora exceed 5 MB.
- **Split-pane on narrow viewports**: below 900 px panes stack; "Back to list" affordance must be discoverable in the session header; URL state contract makes browser Back also return to the list naturally (when the URL `?session=` is cleared).
- **URL state collision with future filter URL state**: Phase 5 owns only `?session=`. `useSelectedSession`'s `buildUrl` mutates only that key (preserves all other query params).
- **`replaceState` vs `pushState` UX regret**: if users frequently want to "go back to the previous session" via browser Back, `replaceState` doesn't support that. Mitigation: revisit if user feedback asks; the History API distinction is a one-line change.
- **Drawer retirement breaks user muscle memory**: M1 ships the layout AND a vestigial "Open detail" link to the still-mounted drawer; M2 removes both once SessionView shell + Metadata tab are functional. Users discover the new shape via the persistent right-pane.
- **Hex isolation regression**: M6 hex audit MUST equal Phase 4 baseline (24) plus any documented WCAG-driven additions. Codex routinely re-runs this check.
- **Parser correctness drift**: truth tables in M3 are exhaustive against documented fixtures; warnings banner surfaces parse failures; Raw tab is the verifiability hatch when a fixture surprises us.
- **Click-time intersection regression**: M1 DoD explicitly requires the Phase 4 regression tests to still pass after the layout move. Selection ownership moves from `SessionsView` to `App.tsx` (or stays in `SessionsView` — M1 planner decides) without changing the importability-derivation point.
- **Codex catches Claude blind spots (precedent confirmed across all M1–M6 chunks of Phase 4)**: every chunk had at least one Codex-driven fix-up round. Expect the same for Phase 5; M6 of Phase 4 needed three Codex rounds. Plan time for ≥ 2 Codex rounds per chunk.

## Resolved Decisions (from planner)

These nine decisions are resolved; future planners/reviewers should treat them as load-bearing assumptions, not as open questions:

1. **`replaceState` over `pushState`** for `?session=` sync (no back-stack pollution; revisit only on user feedback).
2. **`?tab=...` NOT URL-synced** in Phase 5 (deferred; tab state is component-local React state).
3. **No search-within-transcript** in Phase 5 (deferred until annotations land in a future phase).
4. **Oversized-user-message threshold = 64 KB** (constant `USER_MSG_OVERSIZE_THRESHOLD`).
5. **Full-document fetch cap = 5 MB** (constant `STREAM_RAW_TEXT_BYTE_CAP`); truncation banner + Raw tab as escape hatch.
6. **`Drawer.tsx` + `SessionDetail.tsx` DELETED in M6** (no future modal in Phase 5).
7. **`focus-trap-react` left installed** as orphan after drawer retirement (negligible cost; future modal needs may revive).
8. **Subagent sidecar badge in session header only**; row stays at 4 essentials.
9. **Skim "Expand to raw messages" reuses TranscriptView** scoped to ordinal range (typed messages, not raw NDJSON; Raw tab is the verifiability hatch for raw bytes).

## Open Considerations

- **Selection ownership**: M1 planner decides whether `selectedRowKey` lives in `App.tsx` (cleaner; matches existing pageIndex pattern) or in `SessionsView.tsx` (more local; might force prop drilling). Default: `App.tsx`.
- **Default active tab on first selection**: spec recommends Skim (matches PRD intent). M5 may shift to Transcript if user feedback during M4/M5 review suggests Skim's disabled-summary placeholders look unfinished. Document the choice + rationale in M5 evidence pack.
- **Long-corpus measurement methodology**: M4 needs a concrete protocol — synthetic fixture generator? Playwright frame-timing? `performance.now()` markers in the render path? M4 planner picks; document in M4 dispatch brief.
- **Drawer-orphan-installed `focus-trap-react`**: spec recommends keep; future spec author may want to revisit and uninstall to free escape-hatch slot accounting.
