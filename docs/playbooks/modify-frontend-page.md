# Modify Frontend Page

1. Start in `apps/frontend/src/app.rs` to change page layout, forms, or route ownership.
2. If the frontend needs different data, update `components/ui-api-contracts/src/lib.rs` first, then regenerate the TypeScript bindings with `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings`.
3. Then update `apps/frontend/src/backend_client.rs` and the matching backend route in `apps/backend/src/http_api.rs`.
4. Run `cargo test -p distill-portal-e2e --test inspection_surface`.
5. Run `cargo test --workspace` and `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` before finishing if the contract changed.
