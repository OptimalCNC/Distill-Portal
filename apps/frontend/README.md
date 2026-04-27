# Frontend

## Purpose

Bun + Vite + React + TypeScript inspection UI. Surfaces source sessions, stored sessions, and scan errors, and drives the import and rescan flows against the Rust backend over HTTP.

## Entry Points

- `package.json`, `bun.lock`, `bunfig.toml` — Bun package manifest and lockfile
- `vite.config.ts` — dev server + `/api/v1/**` and `/health` proxy to the backend
- `index.html` — Vite HTML shell
- `src/main.tsx` — React root bootstrap; imports `reset.css` → `tokens.css` → `global.css` BEFORE `App` so the three global sheets land first in the dist bundle and feature-local sibling sheets land after them (see CSS layout convention below)
- `src/App.tsx` — inspection-page orchestration (data fetching, import/rescan mutations, selection state, pagination index, toast queue, last-rescan persistence)
- `src/features/sessions/` — unified session feature surface (one folder for the whole list workflow):
  - `SessionsView.tsx` (+ `SessionsView.css`) — section wrapper that owns drawer state and renders the filter bar, table, pagination strip, and Drawer
  - `SessionsTable.tsx` (+ `SessionsTable.css`) — the table chrome, the inlined status-badge JSX (M6 retired the dedicated `StatusBadge` component), the per-row drawer-open wiring
  - `SessionFilters.tsx` (+ `SessionFilters.css`) — chip groups, project autocomplete, search, sort selectors
  - `SessionDetail.tsx` (+ `SessionDetail.css`) — drawer body and the streaming raw-preview block
  - Pure helpers: `mergeSessions.ts`, `filterSessions.ts`, `applyPagination.ts`, `relativeTime.ts`, `rawPreview.ts`, `lastRescan.ts`
  - Hooks: `useSessionFilters.ts` (+ persisted filter blob), `useToastQueue.ts`
  - `types.ts` — `SessionRow` UI-local join type + `isImportable` helper
- `src/components/` — shared React primitives (each with a sibling `.css`):
  - `ActionBar.tsx` (+ `ActionBar.css`) — Rescan + Import buttons, last-rescan caption, hidden-by-filter caption, sticky modifier
  - `Drawer.tsx` (+ `Drawer.css`) — native-`<dialog>`-backed shell with `focus-trap-react` (the documented escape-hatch package added in M4)
  - `Pagination.tsx` (+ `Pagination.css`) — page-size selector + Prev/Next + caption
  - `Toast.tsx` (+ `Toast.css`) — success / error / info kinds, Retry + Dismiss actions
  - `ScanErrorsCallout.tsx` — collapsed-when-empty scan-error surface
- `src/lib/api.ts` — typed HTTP client (every browser → backend HTTP call goes through this module)
- `src/lib/config.ts` — frontend runtime config (`VITE_API_BASE` override)
- `src/lib/contracts.ts` — re-export barrel for generated contract types
- `src/styles/tokens.css` — design tokens (color, spacing, radius, typography, shadow); only file allowed to define hex literals; redefines colors under `prefers-color-scheme: dark`
- `src/styles/reset.css` — minimal CSS reset (box-sizing, body margin, `color-scheme`)
- `src/styles/global.css` — token-driven body / `<main>` shell rules + four global utility classes (`.muted`, `.mono`, `.stack`, `.empty`)
- `e2e/` — Playwright browser e2e harness and specs

CSS layout convention (Phase 4 Milestone 6 onward): every component imports its sibling `.css` file (e.g. `SessionsTable.tsx` does `import "./SessionsTable.css";`). Vite supports this out of the box and concatenates all sibling sheets into the dist bundle in module-graph order. `main.tsx` imports `reset.css` → `tokens.css` → `global.css` BEFORE `App`, so the three global sheets land first in the dist bundle and feature-local sibling sheets land after them via `App`'s transitive imports — feature CSS rules can therefore override globals where needed without playing source-order games. There are no CSS Modules, no CSS-in-JS, no Tailwind. The retired `apps/frontend/src/styles/app.css` monolith has been migrated selector-by-selector into the per-component sibling files (see `progress/phase-4.progress.md` for the full migration map).

## Backend Access

The dev server proxies same-origin `/api/v1/**` and `/health` to the Rust backend on `127.0.0.1:4000`. Override the base URL at build time via `VITE_API_BASE` if needed. All backend traffic goes through these paths — no direct imports from backend crates.

## Contract Types

TypeScript types for the HTTP payloads are generated from `components/ui-api-contracts/src/lib.rs` and checked in at `components/ui-api-contracts/bindings/*.ts`. Import through the local barrel `src/lib/contracts.ts`. Never hand-edit the generated `.ts` files; regenerate via the `ts-bindings` cargo feature. See `../../components/ui-api-contracts/README.md`.

## Commands

From `apps/frontend/`:

```bash
bun install
bun run dev             # Vite dev server on http://127.0.0.1:4100
bun run build           # production build → dist/
bun run test            # unit suite (bun test src)
bun run test:e2e        # Playwright browser e2e
bun run test:e2e:install  # one-time: install Chromium for Playwright
```

Full commands and env details: `../../docs/dev-commands.md`.

## Boundaries

- No imports from `components/collector-runtime`, `components/ingest-service`, or `components/raw-session-store`.
- All backend communication over HTTP; use `src/lib/api.ts`.
- No hand-rolled duplicates of contract types; use `src/lib/contracts.ts`.

## Change Checklist

- UI change → `../../docs/playbooks/modify-frontend-page.md`.
- API payload change → `../../docs/playbooks/modify-backend-api.md`.
- Crossing a component boundary → `../../docs/dependency-rules.md`.
