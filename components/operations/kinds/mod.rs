//! Per-kind helpers shared by the submit path and the per-kind handler impls
//! that live in `apps/backend/src/operations_kinds/`.
//!
//! Each kind module here is intentionally a thin layer of:
//! - the stable snake_case `KIND_NAME` constant,
//! - a `decode_params` helper that maps raw JSON onto the typed request,
//! - and an `idempotency_key_for` builder that is the SINGLE SOURCE OF TRUTH
//!   for the kind's `canonical_params_hash` + `input_version` pair.
//!
//! The handler `impl OperationHandler` lives in the backend crate (it needs
//! owned backend state), not here.

pub mod import_sessions;
pub mod rescan_sources;
