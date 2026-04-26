# Frontend

## Purpose

Bun + Vite + React + TypeScript inspection UI. Surfaces source sessions, stored sessions, and scan errors, and drives the import and rescan flows against the Rust backend over HTTP.

## Entry Points

- `package.json`, `bun.lock`, `bunfig.toml` — Bun package manifest and lockfile
- `vite.config.ts` — dev server + `/api/v1/**` and `/health` proxy to the backend
- `index.html` — Vite HTML shell
- `src/main.tsx` — React root bootstrap
- `src/App.tsx` — inspection-page orchestration (data fetching, import/rescan mutations, selection state)
- `src/features/sessions/` — unified session list (view, table, merge, types) + session detail drawer body (`SessionDetail.tsx`)
- `src/components/` — shared React primitives (action bar, status badge, scan-errors callout, native-`<dialog>`-backed drawer shell `Drawer.tsx`)
- `src/lib/api.ts` — typed HTTP client
- `src/lib/config.ts` — frontend runtime config (`VITE_API_BASE` override)
- `src/lib/contracts.ts` — re-export barrel for generated contract types
- `src/styles/tokens.css` — design tokens (color, spacing, radius, typography); only file allowed to define hex literals; redefines colors under `prefers-color-scheme: dark`
- `src/styles/reset.css` — minimal CSS reset (box-sizing, body margin, `color-scheme`)
- `src/styles/global.css` — token-driven body and code font rules
- `src/styles/app.css` — structural CSS for panels, tables, badges, action bar; consumes tokens via `var(--…)`
- `e2e/` — Playwright browser e2e harness and specs

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
