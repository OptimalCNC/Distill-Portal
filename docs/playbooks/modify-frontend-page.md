# Modify Frontend Page

1. Start in `apps/frontend/src/App.tsx` (or the relevant component under `apps/frontend/src/components/`) to change page layout, forms, or rendering.
2. If the frontend needs different data, update `components/ui-api-contracts/src/lib.rs` first, then regenerate the TypeScript bindings with `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings`.
3. Update the typed API layer in `apps/frontend/src/lib/` (`api.ts`, `contracts.ts`) and the matching backend route in `apps/backend/src/http_api.rs`.
4. From `apps/frontend/`, run `bun run test` for the unit suite and `bun run test:e2e` for the Playwright browser suite.
5. Run `cargo test -p distill-portal-e2e --test inspection_surface` for the typed-Rust-client HTTP smoke.
6. Run `cargo test --workspace` and `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` before finishing if the contract changed.
