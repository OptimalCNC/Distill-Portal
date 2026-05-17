# Modify Backend API

1. Change the contract shape in `components/ui-api-contracts/src/lib.rs` first.
2. Regenerate the TypeScript bindings so `components/ui-api-contracts/bindings/` stays in sync: `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings`.
3. Update the backend implementation in `apps/backend/src/http_api.rs` and any state wiring in `apps/backend/src/app.rs`.
4. Update the frontend consumer in the typed API layer under `apps/frontend/src/lib/` (`api.ts`, `contracts.ts`).
5. Adjust page rendering in `apps/frontend/src/App.tsx` (or the relevant component under `apps/frontend/src/components/`) if the API output is shown there.
6. For long-running operations, remember that `POST /api/v1/import` and `POST /api/v1/rescan` return `202 Accepted` plus an operation id; clients poll `GET /api/v1/operations/{operation_id}` for the terminal report.
7. Run `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` to confirm the TS bindings are fresh.
8. Run `cargo test -p distill-portal-backend --test http_api`.
9. Run `cargo test -p distill-portal-e2e --test inspection_surface`.
10. From `apps/frontend/`, run `bun run test` and `bun run test:e2e`.

## Worked Example: Adding an Enum + Field (Phase 6 `title_source`)

When the new shape is a small enum and a nullable field on an existing
record, the change threads through the contract → parser → ingest → store
chain in five mechanical steps. The Phase 6 `title_source` plumbing is the
canonical example.

1. **Declare the enum and add the field on every relevant contract type.**
   In `components/ui-api-contracts/src/lib.rs` define the enum with
   `#[serde(rename_all = "snake_case")]` and the ts-rs derive gated under
   the `ts-bindings` feature. Add `pub title_source: Option<TitleSource>`
   to both `SourceSessionView` (parser-direct) and `StoredSessionRecord`
   (SQL round-trip) so the wire shape is symmetric across the two paths.
2. **Regenerate and commit the TS binding.** Run the regenerator (step 2
   above). Confirm `components/ui-api-contracts/bindings/TitleSource.ts`
   appeared and that the imports inside the existing view bindings now
   reference it. The staleness test in
   `components/ui-api-contracts/tests/ts_bindings.rs` will gate this on
   every CI run; update its `EXPECTED_BINDING_FILES` list when adding a
   new contract type.
3. **Emit the new field from the parsers and carry it through the
   intermediate record.** For each adapter under
   `components/collector-runtime/src/adapters/`, return the enum value
   from the same code that resolves the existing field (preserve any
   existing priority order byte-for-byte — pin it with a fixture test).
   Add the field to `ParsedSession` in
   `components/collector-runtime/src/types.rs`.
4. **Plumb through ingest and storage.** Add the field to
   `StoredSessionInput` in `components/raw-session-store/src/lib.rs`. Add
   it to every SELECT, INSERT, UPDATE statement and to `map_session_row`
   in `components/raw-session-store/src/sqlite.rs`. Add a forward
   migration tuple in `components/raw-session-store/src/migrations.rs`
   and bump `CURRENT_VERSION` (use `ALTER TABLE` with a `NULL`-able
   column — never edit the v1 `CREATE TABLE`, which would diverge the
   fresh-DB and migrated-DB layouts). In
   `components/ingest-service/src/service.rs::map_stored_session_input`,
   copy the field from `ParsedSession` and add a `debug_assert_eq!`
   invariant that nails any future asymmetry between the value and a
   sibling field (e.g. `title.is_some() == title_source.is_some()`).
5. **Plumb through the HTTP view assembly.** Add the field to the
   `SourceSessionView` constructor in `apps/backend/src/app.rs` (no
   route changes required — serde flows the new field automatically
   once the contract and the constructor agree).

Verification ladder for a change of this shape:

- `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`
- `cargo test -p distill-portal-collector-runtime --test parsers` (truth
  table for every enum value + the absent case)
- `cargo test -p distill-portal-raw-session-store --test
  title_source_roundtrip` (or your equivalent round-trip test — every
  enum value plus NULL plus a legacy v1 → v2 migration test)
- `cargo test -p distill-portal-ingest-service` (invariant + variant
  propagation unit tests)
- `cargo test -p distill-portal-backend --test http_api` (JSON response
  contains the new field on both list routes)
- `cargo test -p distill-portal-e2e --test inspection_surface` (typed
  client deserializes the field through the real HTTP boundary)

## Adding A Long-Running Operation Kind

Phase 9a keeps operation kinds concrete. To add one, extend
`OperationKind` in `components/ui-api-contracts/src/lib.rs`, regenerate
bindings, add the backend worker handler in `apps/backend/src/app.rs`, and
route submission through the operations store with a server-computed
`canonical_params_hash` and kind-specific `input_version`. Do not make
feature crates depend on `components/operations`; keep checkpoint traits
generic at the component boundary and let `apps/backend` adapt them.
