pub mod cancel;
pub mod dispatcher;
pub mod idempotency;
pub mod migrations;
pub mod store;
pub mod types;
pub mod worker;

/// Per-kind helpers shared by the submit path and the per-kind handler impls
/// that live in `apps/backend/src/operations_kinds/`.
///
/// Each module under `kinds/` is a thin layer of constants + decode helpers
/// + an idempotency-key builder that is the single source of truth for the
/// kind's `canonical_params_hash` + `input_version` pair. The handler
/// `impl OperationHandler` lives in the backend crate (it needs owned
/// backend state), not here.
///
/// The on-disk layout (`components/operations/kinds/*.rs`, NOT
/// `components/operations/src/kinds/*.rs`) is locked by Phase 9b AC-4. We
/// reach into the sibling `kinds/` directory via `#[path]`.
#[path = "../kinds/mod.rs"]
pub mod kinds;

pub use cancel::{
    CancelRequested, CancellationToken, CheckpointError, CheckpointGuard, NoopCheckpoint,
    OperationCheckpoint,
};
pub use dispatcher::{Dispatcher, HandlerError, HandlerFuture, IdempotencyKey, OperationHandler};
pub use distill_portal_ui_api_contracts::{
    Operation, OperationKind, OperationStatus, OperationsListQuery, OperationsListResponse,
    SubmitOperationResponse,
};
pub use store::{
    decode_operation_params, error_json, result_json, CancelRequestOutcome, NewOperation,
    OperationsError, OperationsStore,
};
pub use worker::{OperationOutcome, OperationWorker};
