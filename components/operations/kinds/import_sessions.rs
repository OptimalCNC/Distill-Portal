//! `import_sessions` kind helpers.
//!
//! Lives under `components/operations/kinds/` (spec-literal location per Phase
//! 9b §"Acceptance Criteria" AC-4). The handler `impl OperationHandler` lives
//! one layer up in `apps/backend/src/operations_kinds/import_sessions.rs`
//! because executing an import requires the backend's owned state. The
//! kind-shaped helpers below are pure data and are shared by BOTH the submit
//! path and the handler.

use serde_json::Value;

use distill_portal_ui_api_contracts::ImportSourceSessionsRequest;

use crate::{
    dispatcher::{HandlerError, IdempotencyKey},
    idempotency::{canonical_params_hash, import_sessions_input_version},
};

/// Stable snake_case identifier for this kind. Matches
/// `OperationKind::ImportSessions.as_str()`.
pub const KIND_NAME: &str = "import_sessions";

/// Decode raw operation params into the typed request shape.
///
/// Validation errors are surfaced as [`HandlerError::InvalidParams`].
pub fn decode_params(raw: &Value) -> Result<ImportSourceSessionsRequest, HandlerError> {
    serde_json::from_value(raw.clone())
        .map_err(|error| HandlerError::InvalidParams(error.to_string()))
}

/// Compute the idempotency key for an `import_sessions` operation given a
/// fingerprint-lookup closure (the backend supplies this from its inventory).
///
/// This is the SINGLE SOURCE OF TRUTH for the `import_sessions` idempotency
/// computation. Both `apps/backend/src/app.rs::submit_import_operation` AND
/// `apps/backend/src/operations_kinds/import_sessions.rs::ImportSessionsHandler::idempotency_key`
/// MUST call this function so the two paths cannot drift.
pub fn idempotency_key_for<F>(
    request: &ImportSourceSessionsRequest,
    fingerprint_lookup: F,
) -> Result<IdempotencyKey, HandlerError>
where
    F: FnOnce(&[String]) -> Result<Vec<(String, String)>, HandlerError>,
{
    let canonical_params_hash = canonical_params_hash(request)
        .map_err(|error| HandlerError::Internal(error.to_string()))?;
    let fingerprints = fingerprint_lookup(&request.session_keys)?;
    let input_version = import_sessions_input_version(fingerprints);
    Ok(IdempotencyKey {
        canonical_params_hash,
        input_version,
    })
}
