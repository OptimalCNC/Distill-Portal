# Inspection Surface

## What This Feature Does

The inspection surface lists discovered source sessions, shows what is already stored, lets the user save selected sessions, and links to stored raw payloads. The Bun + Vite + React frontend owns the page and talks to the backend only through HTTP, consuming typed TypeScript bindings generated from the shared contracts crate.

As of Phase 4 Milestone 3 the unified session list is filterable, sortable, and searchable client-side. The filter bar sits above the table and offers chip groups for `tool`, `storage`, and the multi-select status set (with a "Show importable only" boolean shortcut equivalent to selecting `[not_stored, outdated]`); a `<datalist>`-backed `<input>` for the dynamic project-path filter; a substring search box; and a sort field + direction selector. State persists to `localStorage` under the versioned key `distill-portal:inspection-filters:v1`; corrupt or missing persisted values silently fall back to defaults via a small total decoder. Sort honors a strict null-handling rule (ascending puts nulls first, descending puts nulls last) plus a deterministic tiebreaker chain (`source_updated_at → ingested_at → created_at → title → rowKey`). Relative-time rendering in the "Updated" column reads against a single `now` captured at refetch time so the page does not ticker-update; the absolute ISO timestamp stays available via the cell's `title=` hover hint. The list exposes four distinct empty/degraded states: **No sessions at all** (Rescan affordance), **No matches after filter/search** (Clear filters affordance — calls `resetAll`), **Nothing to import in the current filter** (Show importable only affordance — flips the `importableOnly` boolean), and **Partial fetch failure** (per-section banner + Retry, preserved from M2). The click-time intersection rule that landed in Phase 3 F2 + Phase 4 M2 (importability) is extended in M3 so the import POST body is derived at click time from the intersection of the user's raw `selected` set with the current filter window's importable rows. A row a user selected and then hid via a filter mutation cannot leak into the POST; the action bar surfaces the gap as a `+K hidden by filters` caption alongside `Clear hidden` and `Clear selection` affordances.

As of Phase 4 Milestone 4 (Chunk E1) clicking a row OR pressing Enter while a row is focused opens a session detail drawer backed by the native HTML `<dialog>` element (opened with `showModal()`). One drawer at a time. The drawer header carries the title, the tool badge, the status pill, and — when `statusConflict` is true — a small "Conflict" badge alongside the M2 row-side `(refresh)` affordance (the row hint stays even after the drawer is closed). The drawer body lists every `SessionRow` field in a `<dl>`: `session_key`, `session_uid`, `row_key`, `tool`, `source_session_id`, `presence`, `status`, `status_conflict`, `title`, `project_path`, the source path (labeled "Last seen source path" when `sourcePathIsStale` is true), `source_path_is_stale`, `source_fingerprint`, `has_subagent_sidecars`, `stored_raw_ref`, and three timestamps annotated as either source-clock (`created_at`, `source_updated_at`) or backend-clock (`ingested_at`) — the source-clock fields come from the source machine and may be skewed; backend-stamped fields are monotonic. Each timestamp renders the absolute ISO value plus a relative form via `relativeTimeFrom(now, value)`. A copy-to-clipboard button next to the source path calls `navigator.clipboard.writeText(row.sourcePath)` and shows a small "Copied" hint that clears after a couple of seconds; in environments without `navigator.clipboard` (older Chromium variants, locked-down test runners) the fallback path programmatically selects the path text so the user can copy it manually with Ctrl/Cmd + C. For stored sessions (those with a non-null `storedSessionUid`) the drawer also shows a "View raw" anchor pointing at `/api/v1/sessions/:uid/raw` (target=_blank). Clicking the checkbox cell never opens the drawer (a11y guard via `event.stopPropagation()` plus a `closest("td.select-col")` walk in the row's onClick handler). The drawer closes on Esc, the close button, or a backdrop click; focus is restored to the row that opened it (the row trigger element is captured via `event.currentTarget` and stashed in a ref). The native `<dialog>` focus-trap escapes after a few Tabs in real Chromium (a documented HTML quirk; reproducer captured in `progress/phase-4.progress.md`), so M4 lands the documented `focus-trap-react` escape hatch from `working/phase-4.md` §Dependency Policy. This is the only new runtime dependency added in Phase 4 to date.

As of Phase 4 Milestone 4 (Chunk E2) the stored-session drawer also renders a streaming "Raw preview" block under the metadata list. The block calls `streamSessionRaw(sessionUid, signal)` (`apps/frontend/src/lib/api.ts` — preserves the chokepoint rule that every browser → backend HTTP call goes through that module) and feeds the resulting `Response` to `consumeRawPreview` (`apps/frontend/src/features/sessions/rawPreview.ts`). The consumer reads the response via `getReader()` + `TextDecoder` + an incremental line buffer and short-circuits at **20 complete NDJSON lines OR 256 KB of read body, whichever fires first**, by calling `reader.cancel()` so the rest of the body is not drained — the `/api/v1/sessions/:uid/raw` endpoint has no range support, and a blocking `.text()` on a tens-of-MB raw payload would freeze the drawer. Each line is parsed as JSON; lines that fail to parse render with a muted `(non-JSON line)` marker and a different CSS class so the user can visually distinguish corrupt rows from valid NDJSON without the parser silently swallowing them. The block surfaces six explicit states: **idle/loading** ("Loading raw preview…"), **success below caps** ("Showing first N lines (full payload below the caps)."), **success at line cap** ("Showing first 20 lines of the raw payload."), **success at byte cap** ("Stopped at byte cap — full payload not downloaded."), **non-2xx** ("HTTP {status}: {bodySnippet}" with a Retry button), and **network failure** ("Failed to load raw preview: {message}" with a Retry button). The fetch is `AbortController`-cancellable on drawer close — the `useEffect` cleanup aborts the controller, which cancels the in-flight reader if the cap has not yet fired and is a no-op if the cap has already fired. The `.text()` shortcut on the streaming path is explicitly forbidden (the `safeReadText` helper in `lib/api.ts` is only used to bound non-2xx error bodies, which is a different code path).

## Frontend Files To Modify

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/features/sessions/` (unified session list — `SessionsView`, `SessionsTable`, `SessionFilters`, `mergeSessions`, `filterSessions`, `relativeTime`, `useSessionFilters`, `types`, plus per-feature tests)
- `apps/frontend/src/components/` (shared primitives — `ActionBar`, `StatusBadge`, `ScanErrorsCallout`, plus per-component tests)
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
- `apps/frontend/src/features/sessions/` test files: `*.test.tsx` for the table + filter UI components, `*.test.ts` for the pure helpers (`mergeSessions`, `filterSessions`, `relativeTime`, `useSessionFilters`)
- `apps/frontend/src/components/*.test.tsx` (shared-primitive tests)
- `apps/frontend/e2e/` (Playwright)
