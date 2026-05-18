//! `rescan_sources` kind helpers.
//!
//! Lives under `components/operations/kinds/` (spec-literal location per Phase
//! 9b §"Acceptance Criteria" AC-4). The handler `impl OperationHandler` lives
//! one layer up in `apps/backend/src/operations_kinds/rescan_sources.rs`
//! because executing a rescan requires the backend's owned state and the
//! scanner. The kind-shaped helpers below are pure data and are shared by
//! BOTH the submit path and the handler.

use serde_json::Value;

use crate::{
    dispatcher::{HandlerError, IdempotencyKey},
    idempotency::{canonical_params_hash, rescan_sources_input_version},
};

/// Stable snake_case identifier for this kind. Matches
/// `OperationKind::RescanSources.as_str()`.
pub const KIND_NAME: &str = "rescan_sources";

/// Compute the idempotency key for a `rescan_sources` operation.
///
/// SINGLE SOURCE OF TRUTH — both `apps/backend/src/app.rs::submit_rescan_operation`
/// AND `apps/backend/src/operations_kinds/rescan_sources.rs::RescanSourcesHandler::idempotency_key`
/// MUST call this function so the two paths cannot drift.
pub fn idempotency_key_for<I, R>(
    raw_params: &Value,
    scanner_config_version: &str,
    roots: I,
) -> Result<IdempotencyKey, HandlerError>
where
    I: IntoIterator<Item = R>,
    R: Into<String>,
{
    let canonical_params_hash = canonical_params_hash(raw_params)
        .map_err(|error| HandlerError::Internal(error.to_string()))?;
    let input_version = rescan_sources_input_version(scanner_config_version, roots);
    Ok(IdempotencyKey {
        canonical_params_hash,
        input_version,
    })
}
