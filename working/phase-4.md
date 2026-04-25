# Distill Portal Phase 4: Inspection Surface UX Refresh

## Objective

Phase 4 reworks the browser inspection surface so a user with hundreds of
discovered and stored sessions can scan, filter, and act on them quickly,
without expanding the backend beyond the session-store functions already
implemented in Phases 1–3.

The main outcomes are:

- replace the three stacked tables with a unified, filterable, scannable
  session list
- give each session a detail view that exposes existing metadata and a
  raw-payload preview without leaving the page
- apply a cohesive visual design through a thin design-token layer, with
  no new UI framework or CSS framework
- keep rescan and import flows but make their feedback non-blocking and
  self-describing
- scale the list to a few hundred sessions without scroll fatigue

Phase 4 is a frontend UX phase. It does not add new product capabilities
and does not introduce any new backend routes, contract types, or
component crates.

## Current Problems

The Phase 3 migration produced a working TypeScript + React frontend,
but the inspection page is still optimized around "prove the backend
works" rather than "let a user find a session and act on it."

Current issues:

- three full-width tables (`SourceSessionsTable`, `StoredSessionsTable`,
  `ScanErrorsPanel`) stack vertically, so the page is mostly scroll and
  the user cannot see import selection and stored-copy status at once
- the source and stored lists duplicate most of their columns for the
  same underlying session, so a single session often appears in both
  tables with subtly different information
- there is no filter, sort, or search — the only way to find a session
  is to scroll or browser-`Ctrl+F` against the DOM
- the header-row "Select all" checkbox is the only bulk selection
  affordance; there is no way to select "all Claude sessions in project X"
- clicking a session's raw link navigates away from the page; there is
  no inline detail inspection or raw-payload preview
- the scan-errors panel is always rendered even when empty, adding noise
- the palette is a fixed peach/beige and does not respond to
  `prefers-color-scheme`
- the action bar is stacked at the top of the source panel, so after
  scrolling a long list the user cannot reach Import without scrolling
  back up
- rescan and import report lines are a single long string of numeric
  counts concatenated by hand; they do not explain what changed

## Phase 4 Goals

### 1. Unified session list

- Present discovered sessions and stored sessions as a single browsing
  list keyed on `(tool, source_session_id)`, with status and stored-copy
  columns rather than a separate stored table.
- Preserve all information currently visible in the two tables, without
  requiring the user to reconcile two rows for the same session.

### 2. Client-side filter, sort, and search

- Offer filter chips for `tool`, `status`, and `storage` (stored vs
  not stored) — small enumerated sets.
- For `project_path` (dynamic, potentially dozens of long absolute
  paths), use a single `<input list="...">` bound to a
  browser-native `<datalist>` populated from the distinct
  project_paths in the current data. This gives type-ahead
  completion and a scrollable dropdown with zero new dependencies
  and no per-project chip noise. Long paths are truncated in the
  input with the full path shown on hover via `title`. A small
  "clear" button inside the input resets the filter.
- Offer a sort control over `source_updated_at`, `created_at`,
  `ingested_at`, `title`, and `project_path`.
- Offer a substring search box that matches against `title`,
  `source_session_id`, `source_path`, and `project_path`.
- All filtering, sorting, and searching happen in the browser over data
  the backend already returns; no backend changes.
- Persist the active filter/sort/search selection across reloads via
  `localStorage`.

### 3. Session detail drawer

- Clicking a row opens a right-hand drawer that shows every field from
  the existing `SourceSessionView` / `StoredSessionView` contracts, with
  absolute + relative timestamps, a copy-to-clipboard source path, and a
  lazy raw-payload preview (first ~20 NDJSON lines, pretty-printed).
- The drawer replaces the current "View Raw" deep link as the primary
  way to inspect a session. The raw anchor remains available inside the
  drawer for the full download.

### 4. Cohesive visual design via tokens

- Replace the ad-hoc hex colors and spacing in `src/styles/app.css` with
  a single `tokens.css` layer that defines color, spacing, radius, and
  typography variables.
- Respect `prefers-color-scheme` so the page does not glow at night.
- Keep the design calm: no gradients, no decorative flourishes, no
  animation beyond simple transitions.

### 5. Non-blocking mutation feedback

- Rescan and import report back through a toast-style status message
  that describes what changed in plain language, with the structured
  counts still available for debugging.
- The action bar sticks to the bottom of the viewport once it would
  otherwise scroll off-screen, so bulk import is reachable after the
  user filters or scrolls.
- Show a "last rescan from this browser X ago" indicator next to
  the Rescan button (explicitly scoped — the backend runs its own
  scans that the browser cannot observe).

### 6. Collapse what is rarely non-empty

- The scan-errors table becomes a collapsible callout that shows a
  one-line summary when non-empty and nothing when the list is empty.

### 7. Scale to a few hundred sessions

- Paginate the list client-side (page sizes 50 / 100 / 200, default
  50).
- Virtualization is explicitly deferred — pagination is a smaller
  surface area and is sufficient for the realistic session counts a
  single-user v1 generates.

## Non-Goals

Phase 4 is scoped to UX on top of today's backend. It does not include:

- skim view, summary blocks, or LLM calls of any kind
- search over raw session content (FTS backend work)
- distill runs, analyzer output, or skill-draft curation
- tags, notes, bookmarks, highlights, quality marks, archive, or purge
- timeline / histogram views aggregating sessions by day/week/month
- multi-page routing
- authentication, permissioning, or the local credential work in PRD
- a Tailwind migration, a component library (MUI, AntD, Chakra, Radix,
  Mantine), a CSS-in-JS runtime, or a dedicated state manager
- a dedicated data-fetching library (TanStack Query, SWR) — the
  existing `Promise.allSettled` + `refetchAll` pattern is sufficient
- any new backend endpoints, contract types, or Rust component crates
- accessibility certification; Phase 4 keeps baseline semantics but
  does not run a formal WCAG audit

## Target Repository Shape

No new apps or component crates. Existing Rust code is untouched.
`apps/frontend/src` is reorganized so session-related code clusters by
feature and shared primitives live alongside it:

```text
apps/frontend/
├── package.json                    # at most two new runtime deps (see Dependency Policy)
├── src/
│   ├── main.tsx
│   ├── App.tsx                      # app shell + data orchestration
│   ├── features/
│   │   └── sessions/
│   │       ├── SessionsView.tsx     # unified list + filter + drawer wiring
│   │       ├── SessionsTable.tsx    # presentational
│   │       ├── SessionFilters.tsx   # filter chips + sort + search
│   │       ├── SessionDetail.tsx    # drawer body
│   │       ├── mergeSessions.ts     # client-side source ⊕ stored join
│   │       ├── useSessionFilters.ts # state + localStorage persistence
│   │       └── types.ts             # UI-local row type
│   ├── components/
│   │   ├── ActionBar.tsx             # sticky bottom bar
│   │   ├── Badge.tsx                 # replaces StatusBadge
│   │   ├── Button.tsx
│   │   ├── Checkbox.tsx
│   │   ├── Drawer.tsx                # right-hand slide-over
│   │   ├── FilterChip.tsx
│   │   ├── Pagination.tsx
│   │   ├── ScanErrorsCallout.tsx
│   │   └── Toast.tsx
│   ├── lib/
│   │   ├── api.ts                    # unchanged
│   │   ├── config.ts                 # unchanged
│   │   └── contracts.ts              # unchanged
│   └── styles/
│       ├── tokens.css                # design tokens (new)
│       ├── reset.css                 # minimal CSS reset (new)
│       └── global.css                # slimmed down
└── e2e/                              # extended specs
```

Files removed: `src/components/SourceSessionsTable.tsx`,
`src/components/StoredSessionsTable.tsx`,
`src/components/ScanErrorsPanel.tsx`, `src/components/StatusBadge.tsx`,
`src/styles/app.css` (tokens + feature styles take over).

## Data Model in the Browser

The unified list is derived, not stored on the backend. Given the two
existing contracts:

- `SourceSessionView` (fields: `session_key`, `tool`,
  `source_session_id`, `source_path`, `source_fingerprint`, timestamps,
  `project_path`, `title`, `has_subagent_sidecars`, `status`,
  `session_uid`, `stored_ingested_at`)
- `StoredSessionView` (fields: `status`, `session_uid`, `tool`,
  `source_session_id`, `source_path`, `source_fingerprint`, `raw_ref`,
  timestamps, `project_path`, `title`, `has_subagent_sidecars`,
  `ingested_at`)

`mergeSessions.ts` produces a single `SessionRow`. Identity rules:

- **Import identity** is always `SourceSessionView.session_key` as
  returned by the backend (`${tool}:${source_session_id}` — single
  colon, produced by the Rust `source_key` helper). The UI never
  invents its own format for this value. Rows without a source-side
  `session_key` (`presence = "stored_only"`) are not selectable and
  cannot enter the import payload.
- **React row identity** is the same `session_key` when present, or a
  stable `stored:${session_uid}` fallback for `stored_only` rows. Row
  identity is used for React keys and for tracking selection; only
  the source-backed `session_key` is ever sent to the import
  endpoint.

```ts
type SessionRow = {
  rowKey: string;               // `${tool}:${source_session_id}` or `stored:${session_uid}`
  sourceSessionKey: string | null; // SourceSessionView.session_key; null for stored_only
  tool: Tool;
  sourceSessionId: string;
  title: string | null;
  projectPath: string | null;
  sourcePath: string;           // always non-null — see sourcePath rule below
  sourcePathIsStale: boolean;   // true when presence=stored_only+source_missing
  sourceFingerprint: string;
  createdAt: string | null;
  sourceUpdatedAt: string | null;
  ingestedAt: string | null;
  storedSessionUid: string | null;
  storedRawRef: string | null;
  hasSubagentSidecars: boolean;
  status: SessionSyncStatus;    // authoritative, per precedence rule below
  statusConflict: boolean;      // true if source and stored disagreed
  presence: "source_only" | "stored_only" | "both";
};
```

Join rules:

- A row appears if the session exists in either list.
- `sourcePath` is always populated: from `SourceSessionView.source_path`
  when the session is discoverable, or from
  `StoredSessionView.source_path` as a last-known path when
  `presence = "stored_only"`. The backend's stored row keeps the
  source path exactly because a user who discovers a `source_missing`
  session still needs to know where it used to live (for search,
  copy-to-clipboard in the drawer, and later troubleshooting).
  `sourcePathIsStale` is set when the path came from the stored row
  and the row is `source_missing`; the UI labels the field "last
  seen source path" in that case.
- `source_only` rows have null `storedSessionUid` /
  `storedRawRef` / `ingestedAt`.
- `stored_only` rows use the stored payload for everything and set
  `presence` accordingly. A common example is a session whose source
  file has been removed (`status = source_missing`); `sourcePath`
  still carries the last-known path with `sourcePathIsStale = true`.
- When both lists carry the session, the row merges them. Status
  precedence: the backend computes both statuses from the same
  `(source_fingerprint, stored_fingerprint)` comparison in a single
  request handler, but the UI fetches the two lists with two separate
  requests, so a rescan can land between them. Rule: the
  `SourceSessionView.status` is the authoritative display value
  (because it also encodes `not_stored`, which the stored list
  cannot express). If the stored-side status disagrees,
  `statusConflict` is set to `true` and the UI surfaces a small
  visible "fetched state changed during load — refresh" affordance
  next to the row (not a silent console warning). Refreshing
  refetches both lists.

The join function is pure and unit-tested for every combination of
(source_only, stored_only, both) × (up_to_date, outdated, not_stored,
source_missing) × (status agreement, status disagreement). The rest of
the UI depends only on `SessionRow`, not on the two raw contracts, so
the table and filter code does not have to branch on which API the
row originated from.

## Filter, Sort, Search — Contract with the Backend

All operations happen client-side on the joined `SessionRow[]`. The
backend still returns the full source and stored lists in one shot per
panel. No pagination or filtering happens over HTTP.

This is acceptable for the v1 session volume a single-user store
produces. If a future user materially exceeds a few thousand sessions,
the backend will need a dedicated list-with-filters endpoint; that work
is scoped to a later phase and is not a Phase 4 goal.

### Sort semantics

- Sort fields are `source_updated_at`, `created_at`, `ingested_at`,
  `title`, `project_path`. Many of these are nullable on a
  `SessionRow` (e.g. a source-only row has null `ingestedAt`; a
  `stored_only + source_missing` row has null `source_updated_at`).
- Null handling: null values sort after non-null values in descending
  sorts and before non-null in ascending sorts. The UI shows a
  muted em-dash rather than a literal "null" marker.
- Tiebreaker chain when the chosen sort field ties or is null:
  apply the remaining timestamp fields in the fixed order
  `sourceUpdatedAt → ingestedAt → createdAt`, skipping whichever
  one was the chosen sort field; then `title` (case-insensitive
  ASCII), then `rowKey`. This produces a deterministic order
  across renders regardless of which primary field the user
  picked.
- Source clocks (`created_at`, `source_updated_at`) come from the
  source machine and may be skewed relative to the backend clock;
  `ingested_at` is backend-stamped and monotonic. The UI shows both
  when relevant (see drawer) rather than picking one.
- Timestamps are stored as RFC 3339 UTC and rendered in the browser's
  local timezone. The absolute form is shown on hover; the
  list uses a relative form ("3d ago"). Relative time is computed
  against a single `now` captured at render time and refreshed on
  each refetch, so the page does not ticker-update; tests pin `now`
  to a fixture value.

### localStorage robustness

- `localStorage` key: `distill-portal:inspection-filters:v1` for
  filter state, `distill-portal:last-manual-rescan:v1` for the
  last-manual-rescan timestamp (separate key so a filter-schema
  bump does not invalidate the rescan clock).
- Filter shape:
  `{ tool, status, storage, importableOnly, project, search, sort, pageSize }`.
  - `tool`, `storage`, `sort` are single-value enums.
  - `status` is an array of `SessionSyncStatus` values (multi-select)
    so the filter can naturally express "not_stored or outdated";
    the UI renders one chip per active value with an "All" reset.
  - `importableOnly` is a boolean shortcut equivalent to selecting
    exactly `["not_stored", "outdated"]`. The "Show importable
    only" toggle and the "No importable rows" empty-state
    affordance both flip this flag, so the affordance maps to a
    single filter mutation rather than to an ambiguous compound
    state. Setting `importableOnly = true` overrides any
    incompatible status array on apply (and clears it on toggle
    off).
  - `project` is a single string (or null).
- Parse failures, missing keys, unknown enum values (`tool`,
  `storage`, `sort`, individual entries in the `status` array),
  non-array `status`, non-boolean `importableOnly`, and
  out-of-range `pageSize` are silently replaced with defaults by
  a small decoder; the stored blob is then rewritten. The UI
  never throws on bad persisted state.
- `project` is dynamic data (derived from the current session set)
  and therefore validated only structurally — any string is
  accepted on decode, because the decoder runs before the API data
  has loaded and because a genuinely valid saved project may be
  absent during a partial source-fetch failure. If the saved
  project does not match any row after data loads, the list
  renders the normal empty-filter state with a "clear filter"
  affordance (see §Empty States below).
- If `localStorage` is unavailable (private mode, quota, disabled),
  the UI falls back to in-memory state without surfacing an error.
- Changing any filter or the sort resets the page to 1. Changing
  the page size recomputes the current page so the first visible
  row stays visible if possible.
- Versioning: the `:v1` suffix is part of the key so a schema bump
  in a later phase does not have to read legacy shapes — unknown
  versions are treated as missing.

### Empty States

The unified list exposes four distinct empty/degraded states and
renders each with its own copy and affordances:

- **No sessions at all** — the backend returned empty lists for
  both `/source-sessions` and `/sessions`. Copy: "No sessions have
  been discovered or stored yet." Affordance: a primary Rescan
  button (the user has nothing yet).
- **No matches after filter/search** — some sessions exist but
  none match the current filter. Copy: "No sessions match the
  current filter." Affordance: "Clear filters" (drops every
  filter/search but leaves sort).
- **No importable rows in the current filter** — matching rows
  exist but all are `up_to_date` or `source_missing`. Copy:
  "Nothing to import in the current filter." Affordance: a
  single-click "Show importable only" link that flips the
  `importableOnly` boolean (equivalent to setting `status` to
  `["not_stored", "outdated"]`).
- **Partial fetch failure** — one of (source, stored, scan-errors)
  failed while another succeeded. The unified list still renders
  the rows from the succeeding fetch (with a per-section banner
  explaining what failed and a "Retry" action), so a source-side
  500 never blanks the stored rows, and vice versa.

## Session Detail Drawer

The drawer is rendered as a native HTML `<dialog>` element opened with
`showModal()`. This gives focus-trap, Esc-close, and backdrop
semantics from the platform for free and avoids a hand-rolled trap
(which is easy to get wrong and is a common source of a11y bugs).
If a concrete browser compatibility issue forces the native route to
fail, the dependency policy below explicitly allows one small focus-
management package as an escape hatch; the plan does not adopt one
up front.

One drawer at a time. Opened by clicking a row or pressing Enter on a
focused row. Closed by Esc, the close button, or clicking the
backdrop.

Contents:

- Title header with tool badge and status pill (plus a conflict
  badge if `statusConflict` is true)
- Metadata list: `session_key`, `session_uid`, `source_path`,
  `project_path`, `source_fingerprint`, `has_subagent_sidecars`,
  timestamps (absolute + relative, labeled `created_at`,
  `source_updated_at`, `ingested_at` — source-clock fields are
  annotated as "source clock" to match §Sort semantics)
- Copy-to-clipboard affordance on the source path
- "View raw" link that opens the existing
  `/api/v1/sessions/:session_uid/raw` endpoint in a new tab for
  stored sessions
- Raw preview block (stored sessions only): lazy-fetches the raw
  endpoint on drawer open. Important: `/api/v1/sessions/:uid/raw`
  has no range support, but blocking on a full-body `.text()` of a
  potentially tens-of-MB session would freeze the drawer. The
  client therefore consumes the response via the streaming
  `ReadableStream` API (`response.body.getReader()` +
  `TextDecoder`), feeds bytes through an incremental line buffer,
  and **short-circuits after either 20 complete NDJSON lines or a
  fixed byte cap (default 256 KB), whichever comes first**. Once
  the cap fires, the client calls `reader.cancel()` so the
  connection is released without draining the rest of the body.
  Each preview line is parsed as JSON with a plain-text fallback
  for lines that fail to parse. The caption always reports
  "showing first N lines" and, when the cap triggered, explicitly
  notes "stopped at byte cap — full payload not downloaded." The
  fetch is also `AbortController`-cancelable on drawer close
  (either before the cap or after) and renders explicit loading,
  error (failed fetch, non-2xx, network), and empty states. A
  backend preview/range endpoint is a later concern and out of
  Phase 4 scope.
- No action buttons beyond close + view-raw. Tagging, notes, archive,
  and other annotations belong to later phases.

## Action Bar and Mutation UX

- The Rescan button carries a short relative-time caption scoped
  explicitly to this browser — "last rescan from this browser 3m
  ago" — computed from the timestamp persisted in `localStorage`
  on each successful manual rescan. This caption deliberately does
  *not* claim to represent backend scan freshness: the backend also
  scans on startup and on its own poll interval, and this browser
  cannot observe those. A future phase that exposes a
  backend-authoritative "last scan" timestamp through the contract
  can replace the caption; until then, the scoped phrasing avoids
  misleading the user.
- Selection semantics — one invariant governs action-bar count,
  Import-disabled state, and the POST payload so the three cannot
  drift apart:
  - The **effective selection** is the intersection of the user's
    raw selection set with the current **filtered importable
    rows** (all pages of the current filter, not just the visible
    page). A row is *importable* when `sourceSessionKey` is
    non-null (`presence` ∈ `{source_only, both}`) AND `status` is
    `not_stored` or `outdated`. `up_to_date` and `source_missing`
    rows render without a checkbox and are skipped by bulk
    actions.
  - The action-bar count, the Import-disabled state, and the POST
    body all read from this same effective selection. "Import
    selected (N)" always describes the exact set that would be
    POSTed if the user clicked now.
  - Changing any filter, the search string, or the sort does
    **not** clear selection; rows that fall out of the filter
    remain in the raw selection set but do not appear in the
    effective selection. The action bar then shows `"Import
    selected (N)"` with a secondary `"+K hidden by filters"`
    caption when K > 0. Clicking the secondary caption opens a
    small disclosure that lists hidden-by-filter selections and
    offers "Clear hidden" to drop them.
  - "Clear selection" drops everything, including
    hidden-by-filter.
  - Bulk-select affordances (visible-count is always for the
    current filter, not the raw selection): "Select all
    importable on this page" and "Select all importable in
    current filter."
  - Error/retry: if Import fails and the user retries, the retry
    re-derives the effective selection at click time — if a
    rescan fired between attempts, the payload reflects the new
    state, never the pre-error cache.
  - This is the click-time intersection rule proven necessary in
    Phase 3 F2, generalized for filters and pagination.
- The Import button is disabled when the effective selection is
  empty or a mutation is pending.
- The action bar becomes position-sticky at the bottom of the viewport
  only when the natural-layout bar would scroll out of view, so short
  session lists still see it in-flow.
- Rescan and import outcomes surface as toasts that describe the
  change in plain language — "Imported 4 new sessions, 1 updated" —
  with the structured counts available as a tooltip or expanded line
  for debugging. Errors surface as error toasts with a Retry action.

Toast behavior is small enough that a handwritten component is
justified; adding a toast library is not.

## Design Tokens

New file `styles/tokens.css`. The palette is deliberately neutral
grayscale with a single restrained accent — the current peach/beige
was one of the specific visual complaints, so Phase 4 does not simply
re-shade it:

```css
:root {
  --color-bg: #ffffff;
  --color-surface: #f8f9fb;
  --color-surface-raised: #ffffff;
  --color-border: #e3e5ea;
  --color-border-strong: #c8ccd4;
  --color-text: #14161a;
  --color-text-muted: #5a606b;
  --color-accent: #2864d4;
  --color-accent-hover: #1d4fa8;
  --color-success: #1f7a4a;
  --color-warn: #b86b07;
  --color-error: #b13838;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 12px;

  --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --text-xs: 0.72rem;
  --text-sm: 0.85rem;
  --text-base: 0.95rem;
  --text-lg: 1.15rem;
  --text-xl: 1.35rem;

  --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
  --shadow-md: 0 6px 24px rgba(0,0,0,.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f1115;
    --color-surface: #151821;
    --color-surface-raised: #1b1f2a;
    --color-border: #262b36;
    --color-border-strong: #3a404d;
    --color-text: #e8eaef;
    --color-text-muted: #9098a6;
    --color-accent: #6da5ff;
    --color-accent-hover: #8bbbff;
    --color-success: #5fb68a;
    --color-warn: #e0a75a;
    --color-error: #e57d7d;
  }
}
```

Contrast check (recorded in Milestone 6): every foreground/background
pair used on text (text-on-bg, text-on-surface, muted-on-bg,
muted-on-surface, accent-on-bg, success/warn/error-on-bg) must meet
WCAG AA (4.5:1 for body, 3:1 for large) in both light and dark modes.

All component CSS consumes tokens. No duplicate hex literals. One
palette decision up front; per-component overrides are disallowed
unless the token itself is missing a variant.

## Dependency Policy

Default: add nothing. The plan above can be implemented with
`react`, `react-dom`, and the current devDeps, relying on the native
`<dialog>` element for the drawer.

**Phase 4 browser support target: Chromium only.** Playwright e2e
already runs Chromium headless (`apps/frontend/playwright.config.ts`)
and Phase 4 does not expand that. Cross-browser verification is
explicitly out of scope; if the user later wants Firefox/WebKit
coverage, that is a separate phase and its own dependency call.

Two narrow exceptions to the "no new deps" default are allowed, each
only if the default route fails against concrete evidence recorded
in the progress log:

- If measured user behavior shows > 2k session rows post-filter on
  realistic machines after Milestone 5, add
  `@tanstack/react-virtual`. Do not add it speculatively.
- If the native `<dialog>` focus trap, Esc-close, or focus
  restoration fails a documented Chromium reproducer, add a
  single, tiny focus-management package (for example
  `focus-trap-react`). The escape hatch exists because a
  hand-rolled trap is a recurring source of a11y bugs and is not
  worth re-implementing in Phase 4. Playwright coverage (Milestone
  4 DoD) is the reproducer gate — if those specs all pass, the
  escape hatch is not taken.

In total the frontend runtime dependency count grows by at most two,
and only with documented justification.

Explicitly rejected for Phase 4:

- Tailwind or any utility CSS framework
- Component libraries (MUI, AntD, Chakra, Radix, Mantine, shadcn)
- CSS-in-JS runtimes (emotion, styled-components, vanilla-extract)
- State managers (Zustand, Redux, Jotai)
- Data layers (TanStack Query, SWR)
- Icon libraries (lucide, heroicons) — use inline SVGs for the handful
  of icons needed
- Any Bun → Node shim; the project standardized on Bun (see memory
  `feedback_bun_not_node.md`)

## Testing

- Unit-test `mergeSessions.ts` for every combination of
  (source_only, stored_only, both) × (up_to_date, outdated,
  not_stored, source_missing), plus the status-disagreement branch
  (covers `statusConflict`).
- Unit-test `useSessionFilters.ts` for filter combinations, the
  localStorage round-trip, parse failures, unknown enum values,
  unavailable storage, and page-reset-on-filter-change.
- Unit-test sort semantics: null-value ordering in both directions,
  tiebreaker chain, stable order across renders.
- Component-test `SessionsTable`, `SessionFilters`, and
  `SessionDetail` with `happy-dom + @testing-library/react` for the
  key interactions (toggle row, open drawer, apply filter, change
  sort, paginate, bulk-select filtered importable, bulk-select on
  page, clear selection).
- Component-test the drawer: `<dialog>` opens via `showModal`, Esc
  closes, backdrop closes, focus returns to the originating row
  (component-level DOM wiring — does not prove native focus trap;
  that is covered by Playwright below).
- Playwright-test the drawer in real Chromium: Enter-open from a
  focused row, Esc-close, close-button close, backdrop-close,
  focus restoration, and focus trap (Tab cycles inside the
  dialog). This is the real browser gate; if it fails, the
  dependency escape hatch adds a focus-management package.
- Component-test raw-preview states: loading, success (N-lines
  caption), oversized-body byte-cap short-circuit (fake stream of
  >256 KB proving the reader is canceled before draining),
  network failure, non-2xx, non-JSON lines fall back to plain
  text, abort on drawer close before and after the cap.
- Component-test the click-time intersection rule: a rescan that
  prunes a filtered row mid-selection must not ship stale keys in
  the import payload (direct regression test for the Phase 3 F2
  class, landing at Milestone 3).
- Component-test selection invariants: action-bar count equals
  the effective selection size; "+K hidden by filters" caption
  matches the raw-minus-effective count; changing filter does
  not clear raw selection but does update effective count/POST
  body; changing page does not touch selection at all; Import
  retry after error re-derives the effective selection at click
  time.
- Component-test the four empty states (no sessions at all, no
  matches after filter, no importable in filter, partial fetch
  failure) each render the documented copy and affordance.
- Component-test partial-fetch failures: source, stored, and
  scan-errors fetches each fail independently; the surface
  continues to render rows from the succeeding calls with a
  per-section error notice for the failing one.
- Playwright e2e covers the happy path end to end: load → apply
  `tool=claude_code` filter → bulk-select importable in filter →
  Import → verify the toast describes the result → open a stored
  session's drawer → see the raw preview → close.
- Retire the parts of the existing e2e that exercise the old
  dual-table layout.
- Keep `bun test src`, `bun run test:e2e`, `bun run build`,
  `cargo check --workspace`, `cargo test --workspace`, and
  `cargo test -p distill-portal-ui-api-contracts --features
  ts-bindings` (the TS bindings drift check) green throughout.

## Documentation

Update the docs that describe layout and user-facing behavior. The
sweep is intentionally broader than Phase 3 because the frontend's
file layout moves and multiple docs cite the old shape:

- `docs/README.md` — refresh the frontend-section bullet and the
  "where code lives" map to reflect the `src/features/sessions/`
  layout.
- `docs/dependency-rules.md` — no rule changes expected, but verify
  the frontend-to-contracts paragraph still matches after the
  refactor; add a note if any new dep lands under the escape-hatch
  clause.
- `docs/dev-commands.md` — the current file describes the old unit
  test surfaces (`App.test.tsx` three-panel render, `ActionBar.test`,
  `StatusBadge.test`) in detail; rewrite that paragraph against the
  new suites from the Testing section.
- `docs/features/inspection-surface.md` — describe the unified list,
  filter/sort/search, drawer, raw-preview behavior, and pagination.
  Retire references to the two separate tables.
- `docs/features/session-store.md` — update any cross-references to
  the inspection surface that mention the old dual-table layout.
- `docs/playbooks/modify-frontend-page.md` — update file paths and
  note that session-feature code now lives under `src/features/`.
- `apps/frontend/README.md` — refresh the "Entry Points" and
  "Commands" sections to reflect the new shape and the `<dialog>`
  drawer.
- `components/ui-api-contracts/README.md` — update the paragraph
  that currently describes how the frontend constructs a
  `source_key` inline. The new rule is: **import identity is
  always the backend-provided `SourceSessionView.session_key`;
  the UI must never construct or mutate that value**. React-only
  row identity is a separate UI concern and is allowed to add
  fallback prefixes (`stored:${session_uid}`) for non-source
  rows. The README paragraph must distinguish these two cases.
- `progress/phase-4.progress.md` — create a Phase 4 progress log
  following the Phase 3 pattern (chunk-level entries, dispatch
  briefs, review rounds, final dispositions) so the coordinator
  process remains auditable.

Docs updates land with the chunk that introduces the change, not in a
trailing pass, so the repo does not drift phase-internally. The final
cleanup milestone verifies no stale dual-table references remain via
`rg` checks captured in the progress log.

## Milestones

Each milestone is reviewable on its own and leaves `main` green.

### Milestone 1: Design tokens and visual reset

- Introduce `styles/tokens.css` and a minimal `styles/reset.css`.
- Rewire existing components to consume tokens without restructuring
  markup (still two tables, still the old action bar).
- Add `prefers-color-scheme` dark handling.

Definition of done:

- No hex literal outside `tokens.css`.
- Light and dark themes both render correctly.
- No regression in current e2e suite.

### Milestone 2: Unified session list

- Add `mergeSessions.ts` with unit tests covering every combination
  of presence × status and both the agreement and disagreement
  branches of the join.
- Add `SessionsView` and `SessionsTable`.
- Replace `SourceSessionsTable` + `StoredSessionsTable` with the
  unified list.
- Preserve the existing `Promise.allSettled` per-fetch error
  isolation — source, stored, and scan-errors fetches each fail
  independently and surface their own per-section error notice
  without blanking the rest of the surface.
- Collapse scan errors into `ScanErrorsCallout`.

Definition of done:

- Every row previously shown in either table is reachable in the
  unified list.
- `presence` rendering covers `stored_only` (including
  `source_missing`) without branching in consuming code.
- `sourcePath` populates from either API with `sourcePathIsStale`
  correctly set; a `stored_only + source_missing` row remains
  searchable by its last-known path.
- **Importability rules land with the unified list**: checkboxes
  render only on rows with a non-null `sourceSessionKey` AND status
  `not_stored` or `outdated`; `up_to_date`, `source_missing`, and
  `stored_only` rows render no checkbox. Bulk-select excludes all
  non-importable rows. This prevents the intermediate state where
  the unified list is live but selection rules are wrong.
- A failing source fetch still lets the stored rows render (and the
  converse), verified by a regression test carried over from the
  existing per-panel error-isolation test.
- Existing import/rescan flows still work.
- Updated e2e happy path passes.

### Milestone 3: Filters, sort, search, persistence

- Add `SessionFilters` and `useSessionFilters`.
- Persist state in `localStorage` with versioned keys per the
  robustness rules in §Filter, Sort, Search — Contract with the
  Backend.
- Wire filter state into `SessionsView`.
- Add the click-time intersection filter inside the Import handler:
  the payload is derived from the currently-visible filtered rows
  that are still importable by status, not from the raw `selected`
  set. Land the regression test for this now — before pagination —
  because filters alone already open the race window the Phase 3
  F2 bug exploited. Do not wait for Milestone 5.
- Implement sort-semantics null ordering, tiebreaker chain, and
  relative-time rendering with a pinnable `now`.

Definition of done:

- User can narrow a hundreds-long list to a handful of rows without
  scrolling.
- Reloading the page restores filter/sort/search.
- Corrupt or missing `localStorage` falls back to defaults without
  error.
- Tests cover at least one multi-filter combination, the
  persistence round-trip, corrupt-persistence recovery, and the
  click-time intersection regression (rescan prunes a filtered
  selected row mid-click; the import POST body must not contain
  the pruned key).

### Milestone 4: Session detail drawer

- Add `Drawer` backed by native `<dialog>` + `showModal()`,
  `SessionDetail`, and raw-preview fetch logic.
- Wire row click + keyboard (Enter) to open drawer; Esc and
  backdrop to close.
- Raw preview consumes the response via `ReadableStream` +
  `getReader()` + `TextDecoder` with an incremental line buffer,
  short-circuits at 20 complete NDJSON lines OR a 256 KB byte cap
  (whichever comes first) by calling `reader.cancel()` so the
  rest of the body is not drained, parses each line as JSON with
  a plain-text fallback, and is `AbortController`-cancelable on
  drawer close (covering both the pre-cap and post-cap windows).
  The full-body `.text()` shortcut is explicitly forbidden for
  this path because raw blobs can be tens of MB. See
  §Session Detail Drawer for the full spec.

Definition of done:

- Drawer surfaces every field from the existing contracts, labels
  source-clock vs backend-clock timestamps, surfaces "last seen
  source path" for `sourcePathIsStale` rows, and shows the
  status-conflict badge when `statusConflict` is true.
- Raw preview renders loading, success (with N-lines caption),
  oversized-body byte-cap (caption explicitly notes "stopped at
  byte cap"), network-failure, non-2xx, and non-JSON-fallback
  states in component tests. Abort on drawer close covered
  (cancel both before and after the byte cap fires).
- Drawer focus-trap (native `<dialog>`), Esc-close, backdrop-close,
  and focus-restoration to the originating row are covered in
  **both** component tests (happy-dom, which can assert the DOM
  structure and event wiring) AND Playwright (real Chromium, which
  is the only place native `<dialog>` focus semantics actually
  run). If any Playwright assertion fails, the dependency-policy
  escape hatch triggers and a focus-management package is added
  before Milestone 4 closes.

### Milestone 5: Pagination and sticky action bar

- Add `Pagination` (50/100/200, default 50).
- Make the action bar sticky at the bottom when out of natural view.
- Replace the inline `renderReport` text with a toast
  (`Toast` component + small queue).
- Extend the Milestone 3 click-time intersection regression test
  to cover the pagination-specific variant: a selected row on one
  page that is pruned by a rescan must not ship in the import
  POST when the user is viewing a different page.

Definition of done:

- Page of 50 rows renders without layout jitter on a 500-row
  mocked dataset.
- Import after filter-then-paginate uses the correct selection,
  including cross-page selection accumulated through
  "Select all importable in current filter".
- Toasts display rescan/import results and errors, with an error
  toast that exposes a Retry action.

### Milestone 6: Cleanup and documentation

- Remove retired files and CSS.
- Update the full docs sweep listed in §Documentation
  (`docs/README.md`, `docs/dependency-rules.md`,
  `docs/dev-commands.md`, `docs/features/inspection-surface.md`,
  `docs/features/session-store.md`,
  `docs/playbooks/modify-frontend-page.md`,
  `apps/frontend/README.md`, `progress/phase-4.progress.md`).
- Verify contract-drift check still passes (no contract touched, so
  this is a drift-expected-none assertion).
- Record WCAG AA contrast check for every token
  foreground/background pair in light and dark modes in the
  progress log.

Definition of done:

- `cargo check --workspace`, `cargo test --workspace`,
  `cargo test -p distill-portal-ui-api-contracts --features
  ts-bindings`, `bun run test`, `bun run build`, and
  `bun run test:e2e` all green.
- Retired dual-table references and stale paths are gone from
  source and docs (verified by `rg` checks recorded in the
  progress log).
- Phase 4 progress log records the final chunk.

## Acceptance Criteria

Phase 4 is complete when all of the following are true:

- The inspection page renders a single unified session list with
  status and stored-copy columns.
- Filter controls (tool/storage chips, multi-select status chips
  with an `importableOnly` shortcut, project `<datalist>`-backed
  input) + sort + substring search operate client-side on the
  existing API payloads.
- Filter/sort/search persist across reloads; corrupt persisted
  state falls back to defaults without error.
- Sort handles null timestamps deterministically per the rules in
  §Sort semantics.
- Each row opens a detail drawer (native `<dialog>`) showing all
  current contract fields, the status-conflict badge when
  applicable, the "last seen source path" label when
  `sourcePathIsStale` is true, and a streaming raw-payload
  preview for stored sessions that stops at 20 lines or a 256 KB
  byte cap with explicit loading/error/empty/byte-cap states.
- The action bar is reachable after scrolling (sticky) and reports
  outcomes via toasts, including an error toast with a Retry
  action.
- Rescan shows a "last rescan from this browser X ago" caption
  (scoped; does not claim backend-global freshness).
- Selection rules are enforced: only rows with a source-backed
  `session_key` and status `not_stored`/`outdated` are selectable
  and can enter the import payload.
- Bulk-select works for "on this page" and "across the current
  filter" with accurate counts.
- The click-time intersection rule is in force from Milestone 3
  onward; a rescan that prunes a selected row between selection
  and click does not leak stale keys into the import POST. A
  direct regression test for this is in the suite.
- The unified list preserves per-fetch error isolation: a failure
  of one of (source, stored, scan-errors) does not blank the
  other two, verified by a dedicated test.
- The four empty states (no sessions at all, no matches after
  filter, no importable in filter, partial fetch failure) each
  render distinct copy and affordances; tests cover each.
- Selection invariants hold: action-bar count equals the
  effective selection size, "+K hidden by filters" reflects
  raw-minus-effective, filter changes do not clear raw selection
  but update the effective set, retry re-derives at click time.
- Scan errors are collapsed when empty and summarized inline when
  non-empty.
- The page respects `prefers-color-scheme`; every visible
  foreground/background token pair meets WCAG AA in both light and
  dark modes (check recorded in the progress log).
- No new backend endpoint, no new Rust crate, no new contract type.
- Frontend runtime deps grow by at most two packages, each only
  under the documented escape-hatch clauses in §Dependency Policy.
- All verification gates pass: `cargo check --workspace`,
  `cargo test --workspace`, `cargo test -p
  distill-portal-ui-api-contracts --features ts-bindings`,
  `bun run test`, `bun run build`, `bun run test:e2e`.
- New tests cover: the join (including status disagreement,
  stored-only source-path preservation), filter state (including
  corrupt-persistence recovery, page-reset on filter change, and
  dynamic-project-value acceptance), sort null ordering, drawer
  interactions at component level AND at real-browser level via
  Playwright (open/close/focus restore/focus trap), raw preview
  states (loading, success, byte-cap short-circuit,
  network failure, non-2xx, non-JSON fallback, abort on close
  before and after cap), click-time intersection regression,
  selection invariants (count/disabled/POST-body alignment under
  filter changes and retry), per-panel error isolation, bulk
  selection on page and across filter, the four empty states,
  and the happy-path e2e.
- Docs reflect the new layout across the full sweep listed in
  §Documentation.

## Risks and Mitigations

- **Client-side join divergence** — the UI fetches source and
  stored lists in two separate requests; a backend rescan between
  them can produce divergent statuses. Mitigation: the join sets
  `statusConflict` on the merged row, applies a documented
  precedence (source-side wins), surfaces a small "state changed
  during load — refresh" affordance in the UI (not a silent
  console warning), and tests cover both the agreement and the
  divergence branches.
- **Filter-then-select race** — Phase 3 F2 proved a real bug where
  an import POST shipped stale selection keys after a rescan.
  Phase 4 adds more paths into that pattern (filters in M3,
  pagination in M5). Mitigation: the click-time intersection rule
  lands with filters in Milestone 3 (not deferred to M5), and
  regression tests cover both the filter-only and filter-plus-
  pagination variants.
- **Raw preview cost on large sessions** — the raw endpoint has no
  range support, and a blocking `.text()` on a tens-of-MB session
  would freeze the drawer. Mitigation: the preview consumes the
  response via `ReadableStream` + `getReader()` + `TextDecoder`,
  short-circuits after 20 lines or a 256 KB byte cap via
  `reader.cancel()`, caption tells the user when the cap fires,
  and `AbortController` covers both early user-close and the
  normal end-of-preview path. The oversized-body short-circuit
  is proven by a test that feeds a >256 KB mock stream.
- **Design balloon** — a visual refresh invites per-component
  decisions that re-accumulate hex literals and spacing values.
  Mitigation: token layer first, reject raw hex literals in
  component CSS in code review, pick a restrained neutral palette
  rather than re-shading the existing beige.
- **Pagination vs virtualization** — pagination is simpler but
  splits selection across pages. Mitigation: "Select all
  importable in current filter" covers the cross-page case by
  operating on the post-filter set regardless of which page is
  currently displayed, so the user can answer "select all Claude
  sessions in project X" without paginating. Virtualization
  remains a deferred escape hatch.
- **Drawer focus management** — hand-rolled focus traps are a
  recurring a11y bug source. Mitigation: use the native
  `<dialog>` element which delegates focus trap, Esc-close, and
  focus restoration to the platform. The dependency policy
  documents a single focus-management package as an escape hatch
  only if the native route fails a documented reproducer.
- **Dark mode contrast** — swapping palette via
  `prefers-color-scheme` frequently produces WCAG-failing
  combinations. Mitigation: verify AA contrast for every visible
  foreground/background token pair in both modes and record the
  check in the cleanup milestone's progress log.
- **"Last scanned" misleads the user** — the backend has its own
  startup and poll-based scans that the browser cannot observe.
  Mitigation: the caption is explicitly scoped to "this browser"
  and does not claim backend-global freshness. A future phase
  that exposes a backend-authoritative timestamp through the
  contract can replace the caption.
- **Documentation drift** — the frontend's file layout moves,
  so every doc that cites the old components or tests can go
  stale. Mitigation: the Milestone 6 sweep lists every affected
  doc explicitly, and the progress log captures `rg` checks that
  prove no stale references survive.

## Recommended Next Step

Start with Milestone 1 (tokens + reset) alone. The token layer is the
cheapest change to land and the most dangerous to skip — if every
later milestone introduces its own colors and spacings, Phase 4
silently turns into a design-system rewrite. Landing tokens first
forces the rest of the phase to consume a stable palette from day
one.
