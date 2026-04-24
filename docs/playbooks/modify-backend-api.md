# Modify Backend API

1. Change the contract shape in `components/ui-api-contracts/src/lib.rs` first.
2. Regenerate the TypeScript bindings so `components/ui-api-contracts/bindings/` stays in sync: `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings`.
3. Update the backend implementation in `apps/backend/src/http_api.rs` and any state wiring in `apps/backend/src/app.rs`.
4. Update the frontend consumer in the typed API layer under `apps/frontend/src/lib/` (`api.ts`, `contracts.ts`).
5. Adjust page rendering in `apps/frontend/src/App.tsx` (or the relevant component under `apps/frontend/src/components/`) if the API output is shown there.
6. Run `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` to confirm the TS bindings are fresh.
7. Run `cargo test -p distill-portal-backend --test http_api`.
8. Run `cargo test -p distill-portal-e2e --test inspection_surface`.
9. From `apps/frontend/`, run `bun run test` and `bun run test:e2e`.
