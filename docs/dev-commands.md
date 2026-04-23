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

## Run The Frontend (Rust binary, being phased out)

```bash
cargo run -p distill-portal-frontend
```

Useful frontend env vars:

- `DISTILL_PORTAL_FRONTEND_BIND`
- `DISTILL_PORTAL_BACKEND_URL`

The frontend defaults to `127.0.0.1:4100` and expects the backend at `http://127.0.0.1:4000`.

During the Phase 3 migration, the Rust frontend crate coexists with the new Bun app under `apps/frontend/`. The Rust binary and the Bun dev server below both bind `127.0.0.1:4100` — run one OR the other, not both.

## Run The Frontend (Bun + Vite + React, Phase 3)

The new frontend lives alongside the Rust crate under `apps/frontend/` as a Bun-managed package (`package.json`, `bun.lock`, `vite.config.ts`, `index.html`, `src/*.tsx`).

Commands (run from `apps/frontend/`):

```bash
bun install
bun run dev
bun run build
bun run test
```

- `bun run dev` starts the Vite dev server on `http://127.0.0.1:4100` with `strictPort: true` so a port collision fails fast.
- `bun run build` writes static assets to `apps/frontend/dist/`.
- `bun run test` is a stub in D1 (echoes a placeholder and exits 0); a real test harness lands in D2.

## Dev Topology (Phase 3)

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
- The Rust frontend binary (`cargo run -p distill-portal-frontend`) also listens on `127.0.0.1:4100`. Run the Bun dev server OR the Rust frontend, never both at once.

## Run Both Together (Phase 3, Bun frontend)

Terminal 1:

```bash
cargo run -p distill-portal-backend
```

Terminal 2 (from `apps/frontend/`):

```bash
bun run dev
```

Then open `http://127.0.0.1:4100/` in the browser. The Rust backend must be running for `/health` and `/api/v1/**` to resolve through the Vite proxy.

## Run Both Together (legacy Rust frontend)

Terminal 1:

```bash
cargo run -p distill-portal-backend
```

Terminal 2:

```bash
cargo run -p distill-portal-frontend
```

Then open the frontend address, not the backend address. This path is retained during the Phase 3 transition and will be removed in Milestone 5.

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
