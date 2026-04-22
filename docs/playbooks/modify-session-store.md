# Modify Session Store

1. Start in `components/raw-session-store/src/sqlite.rs` for metadata persistence and `components/raw-session-store/src/local_fs_blob_store.rs` for blob behavior.
2. Keep `components/ingest-service/src/service.rs` aligned if stored-session inputs or replace-on-sync rules change.
3. Update `components/ui-api-contracts/src/lib.rs` if the stored-session API shape changes.
4. Verify backend wiring in `apps/backend/src/app.rs`.
5. Run `cargo test -p distill-portal-backend --test http_api`.
6. Run `cargo test --workspace` if the contract or persistence behavior changed.
