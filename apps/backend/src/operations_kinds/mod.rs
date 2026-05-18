//! Per-kind [`OperationHandler`] implementations.
//!
//! The handler impls live here (not in `components/operations/`) because they
//! need access to `AppState` and the backend's owned services (scanner,
//! ingest, inventory). The pure kind-shaped helpers (KIND_NAME, decode_params,
//! idempotency_key_for) live in `components/operations/kinds/` and are
//! consumed by both the submit path in `app.rs` AND these handler impls.

pub(crate) mod import_sessions;
pub(crate) mod rescan_sources;

use std::sync::Arc;

use distill_portal_operations::Dispatcher;

use crate::app::AppState;

/// Build the operations dispatcher with all backend-owned handlers registered.
///
/// Called at startup from `App::bootstrap`. Adding a new kind = a new handler
/// module + one `register()` call here.
pub(crate) fn build_dispatcher(state: AppState) -> Arc<Dispatcher> {
    let mut dispatcher = Dispatcher::new();
    dispatcher
        .register(import_sessions::ImportSessionsHandler::new(state.clone()))
        .register(rescan_sources::RescanSourcesHandler::new(state));
    Arc::new(dispatcher)
}
