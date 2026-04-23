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

```bash
cargo run -p distill-portal-frontend
```

Useful frontend env vars:

- `DISTILL_PORTAL_FRONTEND_BIND`
- `DISTILL_PORTAL_BACKEND_URL`

The frontend defaults to `127.0.0.1:4100` and expects the backend at `http://127.0.0.1:4000`.

## Run Both Together

Terminal 1:

```bash
cargo run -p distill-portal-backend
```

Terminal 2:

```bash
cargo run -p distill-portal-frontend
```

Then open the frontend address, not the backend address.

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
