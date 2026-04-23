# Dependency Rules

## Allowed Directions

- `apps/backend` may depend on:
  - `components/collector-runtime`
  - `components/configuration`
  - `components/ingest-service`
  - `components/observability`
  - `components/raw-session-store`
  - `components/ui-api-contracts`
- `apps/frontend` may depend on:
  - `components/configuration`
  - `components/observability`
  - `components/ui-api-contracts`
  - external HTTP client crates only for backend communication
- `components/ingest-service` may depend on:
  - `components/collector-runtime`
  - `components/raw-session-store`
- `components/raw-session-store` may depend on:
  - `components/ui-api-contracts`
- `components/collector-runtime` may depend on:
  - `components/ui-api-contracts`
- `components/configuration`, `components/observability`, and `components/ui-api-contracts` should not depend on app crates

## Forbidden Directions

- `apps/frontend` must not depend on:
  - `components/collector-runtime`
  - `components/ingest-service`
  - `components/raw-session-store`
- No component crate may depend on `apps/backend` or `apps/frontend`
- `apps/backend` must not render end-user HTML
- `apps/frontend` must not reach into storage or ingest internals directly

## Contract Handling

- Shared page and JSON payloads live in `components/ui-api-contracts`
- `components/ui-api-contracts/src/lib.rs` is the single source of truth for the contract. The TypeScript declarations under `components/ui-api-contracts/bindings/` are checked-in generated artifacts derived from `src/lib.rs` by the `ts-bindings` cargo feature — they are the canonical downstream output and must stay in sync with the Rust source: regenerate and commit them together with any Rust contract change, never hand-edited
- If a backend JSON shape changes, update:
  - `components/ui-api-contracts/src/lib.rs`
  - `components/ui-api-contracts/bindings/*.ts` (regenerate via `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings`; see `docs/dev-commands.md`)
  - `apps/backend/src/http_api.rs`
  - `apps/frontend/src/backend_client.rs`
  - any impacted frontend page rendering in `apps/frontend/src/app.rs`
  - the relevant tests in `apps/backend/tests/http_api.rs` and `tests/e2e/tests/inspection_surface.rs`

## Layer Ownership

- Storage writes and reads belong to `components/raw-session-store`
- Replace-on-sync ingest rules belong to `components/ingest-service`
- Source discovery and parsing belong to `components/collector-runtime`
- Environment variable mapping belongs to `components/configuration`
- HTTP routes belong to the app crates only
