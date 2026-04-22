# Modify Backend API

1. Change the contract shape in `components/ui-api-contracts/src/lib.rs` first.
2. Update the backend implementation in `apps/backend/src/http_api.rs` and any state wiring in `apps/backend/src/app.rs`.
3. Update the frontend consumer in `apps/frontend/src/backend_client.rs`.
4. Adjust page rendering in `apps/frontend/src/app.rs` if the API output is shown there.
5. Run `cargo test -p distill-portal-backend --test http_api`.
6. Run `cargo test -p distill-portal-e2e --test inspection_surface`.
