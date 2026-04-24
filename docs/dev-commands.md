# Dev Commands

## Run The Backend

```bash
cargo run -p distill-portal-backend
```

Useful backend env vars:

- `DISTILL_PORTAL_BACKEND_BIND` or `DISTILL_PORTAL_BIND`
- `DISTILL_PORTAL_DATA_DIR`
- `DISTILL_PORTAL_POLL_INTERVAL_SECS`
- `DISTILL_PORTAL_CLAUDE_ROOTS`
- `DISTILL_PORTAL_CODEX_ROOTS`

## Run The Frontend

The frontend lives under `apps/frontend/` as a Bun-managed package (`package.json`, `bun.lock`, `vite.config.ts`, `index.html`, `src/*.tsx`).

Commands (run from `apps/frontend/`):

```bash
bun install
bun run dev
bun run build
bun run test
```

- `bun run dev` starts the Vite dev server on `http://127.0.0.1:4100` with `strictPort: true` so a port collision fails fast.
- `bun run build` writes static assets to `apps/frontend/dist/`.
- `bun run test` runs `bun test src` (the unit suite; browser e2e is `bun run test:e2e`, documented below). After Milestone 4's Chunk G1, the unit suite is 17 tests across three files: a mounted-`App` suite in `apps/frontend/src/App.test.tsx` covering the read-only three-panel render, the rescan + import mutation flows (including an explicit race-window reproducer for the stale-selection bug), and one per-panel independent-error branch; a variant-matrix suite in `apps/frontend/src/components/StatusBadge.test.tsx` covering all four `SessionSyncStatus` values; and a disabled-state truth-table suite in `apps/frontend/src/components/ActionBar.test.tsx` covering the full `pending × selectedCount × lastReport` matrix plus the dispatch-path callback.

## Dev Topology

```
browser
   |
   v
http://127.0.0.1:4100  <-- Vite dev server (bun run dev)
   |
   |  /api/v1/**  and  /health   proxied by Vite
   v
http://127.0.0.1:4000  <-- Rust backend (cargo run -p distill-portal-backend)
```

- Backend: `127.0.0.1:4000` (Rust, `cargo run -p distill-portal-backend`).
- Frontend dev server: `127.0.0.1:4100` (Bun + Vite, `bun run dev` under `apps/frontend/`).
- Vite proxies `/api/v1/**` and `/health` to the backend so browser code can use same-origin paths without ad hoc CORS setup. Dev-time proxy config lives in `apps/frontend/vite.config.ts`, not in application code.

## Run Both Together

Terminal 1:

```bash
cargo run -p distill-portal-backend
```

Terminal 2 (from `apps/frontend/`):

```bash
bun run dev
```

Then open `http://127.0.0.1:4100/` in the browser. The Rust backend must be running for `/health` and `/api/v1/**` to resolve through the Vite proxy.

## Browser E2E (Phase 3, Playwright)

The inspection-surface browser e2e lives under `apps/frontend/e2e/` and
drives Chromium against the Bun + Vite dev server, which proxies to a
real Rust backend spawned inside the harness (`e2e/harness/backend.ts`).
The harness uses `Bun.spawn` per the Bun-first rule, so the suite must
be run with Bun as the runtime (`bun --bun x playwright test`, wired
into the `test:e2e` script below).

Commands (run from `apps/frontend/`):

```bash
bun run test:e2e:install   # one-time: install Chromium via Playwright
bun run test:e2e           # spawns the backend, starts Vite, runs Chromium
```

The harness binds the backend to `127.0.0.1:4000` because
`vite.config.ts` proxies `/api/v1/**` and `/health` to that address;
tests run serially (`workers: 1`) so the port is never double-bound.
See `playwright.config.ts` for the full configuration.

## Targeted Tests

```bash
cargo test -p distill-portal-collector-runtime --test parsers
cargo test -p distill-portal-backend --test http_api
cargo test -p distill-portal-e2e --test inspection_surface
```

## TypeScript Contract Bindings

The Rust contract types in `components/ui-api-contracts/src/lib.rs` are the source of truth. TypeScript declarations under `components/ui-api-contracts/bindings/` are generated from them via the `ts-bindings` cargo feature (off by default) and must be regenerated whenever the Rust contract changes.

Verify the checked-in TS files match the current Rust source (fails on drift):

```bash
cargo test -p distill-portal-ui-api-contracts --features ts-bindings
```

Regenerate the checked-in TS files after a contract change:

```bash
cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings
```

See `components/ui-api-contracts/README.md` for the tool-choice rationale and the full list of generated files.

## Workspace Verification

```bash
cargo check --workspace
cargo test --workspace
```
