# Inspection Surface

## What This Feature Does

The inspection surface lists discovered source sessions, shows what is already stored, lets the user save selected sessions, and links to stored raw payloads. The Bun + Vite + React frontend owns the page and talks to the backend only through HTTP, consuming typed TypeScript bindings generated from the shared contracts crate.

### Phase 5 layout — split-pane master-detail

As of Phase 5 (closed at M6 on 2026-05-11) the inspection page is a **split-pane master-detail layout**:

- **List panel** (left, 300–380 px on viewports ≥ 900 px): the unified session table, the filter strip, and a sticky footer carrying `<Pagination>` above `<ActionBar>`. The list panel is the master.
- **Session pane** (right, persistent, `<article class="session-pane">`): a four-tab shell rendering the selected session's content. The session pane is the detail.
- On viewports below 900 px the panes stack vertically; a `narrowMode` toggle (set on `<main>` via `data-narrow-mode="list" | "session"`) tracks which pane is in front, and a "Back to list" affordance appears in the session pane header.
- The split is separated by a hairline gutter (`border-right: 1px solid var(--color-border)` on the list panel) — no drop shadow.
- The session pane is selected via `?session=<rowKey>` in the URL. The hook `useSelectedSession` reads the URL on mount, writes via `window.history.replaceState` on selection (no back-stack pollution — Resolved Decision #1), and listens to `popstate` to sync external history navigations. Browser Back/Forward intentionally does NOT navigate between session selections. `Esc` clears the selection unless focus is inside an editable control (a `[contenteditable]` or `<input>` / `<textarea>` / `<select>` is the negative scope; the positive scope is `article.session-pane` and `tr[aria-current="true"]`).
- Deep-link arrival animates a 600 ms pulse on the targeted row (data-deep-link attribute + `@keyframes deep-link-pulse` animating `background-color` only at 22% peak; cleanup via `onAnimationEnd` + a 2 s safety timer).

### List panel — compact four-essential rows

Per Phase 5 §Compact list rows the table is compressed to **4 essentials plus Select**: Title (with inline tool badge + muted mono rowKey on a second line + optional `(refresh)` marker), Status, Project, Updated. The dropped Phase-4 columns (Tool / Stored Copy / Source Path) are surfaced by the Metadata tab inside the session pane. `aria-current="true"` is set on the selected row. Row clicks call `onSelectRow(rowKey)`, which updates the URL via `useSelectedSession`. Clicking the checkbox cell never opens the session pane (`event.stopPropagation()` + a `closest("td.select-col")` guard in the row's `onClick` handler).

Filters / sort / search / pagination / persistence / click-time intersection / four empty-state branches are all preserved verbatim from Phase 4 (`<SessionFilters>` chip groups + project autocomplete + search + sort selectors; `useSessionFilters` persisted under `distill-portal:inspection-filters:v1`; sort with strict null-handling + tiebreaker chain; relative-time rendering against a single `now`; `applyPagination` with self-healing clamp; click-time intersection of selected set with current filter window's importable rows). Below 1100 px viewport width the filter strip wraps into a `<details>` disclosure (`<summary>Filters</summary>` with active-filter-count chip when nonzero); above 1100 px it renders inline. `<ActionBar>` and `<Pagination>` relocated to a single `.list-pane-footer` strip — `position: sticky; bottom: 0` so it's always visible regardless of scroll — with Pagination rendered ABOVE ActionBar per spec line 555.

### Session pane — four-tab shell

The persistent right pane (`<article class="session-pane">` — a landmark, with `aria-live="polite"` for status messaging on the four-state machine `empty | loading | ready | session_not_found`) hosts the four-tab shell when a row is selected:

- **Transcript** (default on first selection — `DEFAULT_TAB_ON_SELECTION = "transcript"` shifted from `"metadata"` at M4 per Resolved Decision #11): chronological per-kind message timeline rendering all 7 `MessageKind` values (user / assistant / tool_use / tool_result / system / boundary / unknown), absolute + relative timestamps via `relativeTimeFrom`, monospace for code-fenced segments, collapsible long tool_result body (>2 KB) via UTF-8-codepoint-safe split, truncation banner with `role="status"` and `--motion-base` opacity entrance when `parsed.truncated`, parse-warnings dismissible `<details>` banner. Boundary chapter-break shared with Skim via `BoundaryRow`.
- **Skim**: four block kinds (`user_turn` inline body + nested Agent reaction `<details>` + Expand-to-raw scoped TranscriptView; `boundary` chapter break via shared BoundaryRow; `agent_only` collapsed by default + scoped TranscriptView; `oversized_user_message` collapsed by default + verbatim `<pre>` body + `--color-warn` 4 px left border). Empty-stream sentinel renders as a single collapsed `agent_only` block with "Agent-only session (0 messages)" summary.
- **Raw**: byte-equivalent to the retired Phase 4 drawer raw preview (256 KB / 20-line cap via `consumeRawPreview`; `AbortController` cleanup on selectedRowKey change / row identity change / Retry counter bump / SessionView unmount — tab switches are NOT a cleanup trigger).
- **Metadata**: 18 `SessionRow` fields verbatim from Phase 4's drawer body — `session_key`, `session_uid`, `row_key`, `tool`, `source_session_id`, `presence`, `status`, `status_conflict`, `title`, `project_path`, `source_path` (labeled "Last seen source path" when `sourcePathIsStale` is true), `source_path_is_stale`, `source_fingerprint`, `has_subagent_sidecars` (with inline subagent sidecar badge per Resolved Decision #8), `stored_raw_ref`, and three timestamps annotated as either source-clock or backend-clock. Copy path button (Clipboard API + manual-select fallback). "View raw" anchor when `storedSessionUid !== null`.

The Tabs primitive at `apps/frontend/src/components/Tabs.tsx` provides ARIA `tablist` / `tab` / `tabpanel` with Left/Right/Home/End keyboard nav, selection-follows-focus, and a 1 px ink-stroke active-tab indicator that slides via `transform: translateX($x) scaleX($width)` (unitless `scaleX`). Tab panels are keep-mounted across tab switches (no `key={activeTab}` remount); panel entrance is a 120 ms cross-fade-in via inline `style={{ animation: isActive ? "tab-fade-in 120ms var(--ease-out) both" : "none" }}`. The session pane root carries an outer `key={selectedRowKey ?? "__empty__"}` to drive the page-turn fade signature detail on row change.

### Per-tool parsers + lazy fetch

The Transcript and Skim tabs are driven by `useParsedSession(row)` (`apps/frontend/src/features/sessions/useParsedSession.ts`) which dispatches to per-tool parsers under `apps/frontend/src/features/sessions/parsers/` (currently `claude_code.ts` and `codex.ts`). The hook owns a module-scoped LRU(5) cache + in-flight coalescing + `bumpCacheEpoch()` invalidation on Rescan / Import success (success path only, never `finally`, never on error path). The full-document fetch (`streamRawText`) is capped at 5 MB; the Raw tab uses its own separate 256 KB / 20-line consumer.

### Phase 4 legacy

The Phase 4 drawer (`Drawer.tsx` + `SessionDetail.tsx` + sibling CSS / tests) was retired in Phase 5 M2b and deleted from disk in Phase 5 M6 per Resolved Decision #6. The Phase 4 `focus-trap-react@^11` escape-hatch package stays installed as an orphan (1 of 2 escape-hatch slots consumed; the package is unimported in `apps/frontend/src/`). Slot 2 (`@tanstack/react-virtual`) was reserved + UNUSED at Phase 5 close — the M4 5k-message long-corpus measurement on real Chromium posted median 16.7 ms / 0 dropped frames (>25 ms), so the slot did not fire. The Phase 4 `StatusBadge.tsx` was retired in Phase 4 M6 (Chunk G); its JSX is inlined at `SessionsTable.tsx` and at the Metadata tab's status `<dd>`. The `apps/frontend/src/styles/app.css` monolith was retired in Phase 4 M6; selectors live in feature-local sibling sheets.

## Frontend Files To Modify

- `apps/frontend/src/App.tsx` (split-pane shell, URL-driven selection, narrowMode, deep-link pulse, Esc handler, fetch + mutation orchestration, toast queue, `bumpCacheEpoch` wire-up)
- `apps/frontend/src/features/sessions/` (unified session feature surface):
  - List + filters: `SessionsView`, `SessionsTable`, `SessionFilters`
  - Right pane: `SessionView`, `SessionMetadata`, `RawTab`, `TranscriptView`, `SkimView`, `BoundaryRow`
  - URL hook: `useSelectedSession`
  - Parser + cache layer: `parsers/{types, claude_code, codex, buildSkim, index}.ts`, `streamRawText.ts`, `useParsedSession.ts`
  - Pure helpers: `mergeSessions.ts`, `filterSessions.ts`, `applyPagination.ts`, `relativeTime.ts`, `rawPreview.ts`, `lastRescan.ts`
  - Filter + toast hooks: `useSessionFilters.ts`, `useToastQueue.ts`
  - `types.ts` (UI-local `SessionRow` join + `isImportable` helper)
- `apps/frontend/src/components/` (shared React primitives):
  - `ActionBar`, `Tabs`, `Pagination`, `Toast`, `ScanErrorsCallout` — each with sibling `.css` + tests
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/contracts.ts`

## Backend Files To Modify

- `apps/backend/src/http_api.rs`
- `apps/backend/src/app.rs`

## Component Files That Must Stay Aligned

- `components/ui-api-contracts/src/lib.rs`
- `components/collector-runtime/src/scanner.rs`
- `components/ingest-service/src/service.rs`
- `components/raw-session-store/src/sqlite.rs`

## API Endpoints Involved

- `GET /api/v1/source-sessions`
- `POST /api/v1/source-sessions/import`
- `GET /api/v1/sessions`
- `GET /api/v1/sessions/{session_uid}`
- `GET /api/v1/sessions/{session_uid}/raw`
- `POST /api/v1/admin/rescan`
- `GET /api/v1/admin/scan-errors`

## Tests

- `apps/backend/tests/http_api.rs`
- `tests/e2e/tests/inspection_surface.rs`
- `apps/frontend/src/App.test.tsx`
- `apps/frontend/src/features/sessions/` test files (see `docs/dev-commands.md` for the full per-milestone enumeration)
- `apps/frontend/src/components/*.test.tsx` (shared-primitive tests)
- `apps/frontend/e2e/` (Playwright — inspection + transcript-perf specs)
