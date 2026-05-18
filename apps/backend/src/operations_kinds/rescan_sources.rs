//! `rescan_sources` handler — `OperationHandler` impl bound to `AppState`.
//!
//! The kind-shaped helpers (KIND_NAME, idempotency_key_for) live in
//! `components/operations/kinds/rescan_sources.rs` and are shared between the
//! submit path in `app.rs::submit_rescan_operation` and this handler's
//! `idempotency_key()` method so the two paths cannot drift.

use distill_portal_collector_runtime::SCANNER_CONFIG_VERSION;
use distill_portal_operations::{
    kinds::rescan_sources, CheckpointGuard, HandlerError, HandlerFuture, IdempotencyKey,
    OperationHandler,
};
use serde_json::Value;

use crate::app::{is_cancelled, AppState};

pub(crate) struct RescanSourcesHandler {
    state: AppState,
}

impl RescanSourcesHandler {
    pub(crate) fn new(state: AppState) -> Self {
        Self { state }
    }
}

impl OperationHandler for RescanSourcesHandler {
    fn kind(&self) -> &'static str {
        rescan_sources::KIND_NAME
    }

    fn idempotency_key(&self, raw_params: &Value) -> Result<IdempotencyKey, HandlerError> {
        let roots = self.state.scanner_roots_display();
        rescan_sources::idempotency_key_for(raw_params, SCANNER_CONFIG_VERSION, roots)
    }

    fn run(&self, _params: Value, checkpoint: CheckpointGuard) -> HandlerFuture {
        // Clone owned state INTO the async block so the future is `'static`.
        let state = self.state.clone();
        Box::pin(async move {
            match state.run_rescan_operation(checkpoint).await {
                Ok(report) => serde_json::to_value(report)
                    .map_err(|error| HandlerError::Internal(error.to_string())),
                Err(error) if is_cancelled(&error) => Err(HandlerError::Cancelled),
                Err(error) => Err(HandlerError::Internal(error.to_string())),
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use std::{net::SocketAddr, path::Path, time::Duration};

    use distill_portal_configuration::BackendConfig;
    use distill_portal_operations::OperationHandler;
    use serde_json::json;
    use tempfile::TempDir;

    use super::RescanSourcesHandler;
    use crate::app::App;

    fn test_config(
        data_dir: std::path::PathBuf,
        claude_roots: Vec<std::path::PathBuf>,
        codex_roots: Vec<std::path::PathBuf>,
    ) -> BackendConfig {
        BackendConfig::new(
            data_dir,
            "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
            Duration::from_secs(3_600),
            claude_roots,
            codex_roots,
        )
    }

    fn write_file(path: &Path, bytes: &[u8]) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, bytes).unwrap();
    }

    #[tokio::test]
    async fn rescan_sources_handler_idempotency_key_matches_submit_operation() {
        let tempdir = TempDir::new().unwrap();
        let claude_root = tempdir.path().join("sources/claude/projects");
        write_file(
            &claude_root.join("project").join("session.jsonl"),
            b"{\"type\":\"noop\"}\n",
        );
        let app = App::bootstrap(test_config(
            tempdir.path().join("data"),
            vec![claude_root],
            vec![],
        ))
        .await
        .unwrap();

        let params = json!({});

        // Path 1: submit_rescan_operation persists the operation row.
        let response = app
            .state()
            .submit_rescan_operation(params.clone())
            .await
            .unwrap();
        let stored = app
            .state()
            .get_operation(response.operation_id.clone())
            .await
            .unwrap()
            .unwrap();

        // Path 2: RescanSourcesHandler::idempotency_key recomputes from raw params.
        let handler = RescanSourcesHandler::new(app.state());
        let key = handler.idempotency_key(&params).unwrap();

        assert_eq!(key.canonical_params_hash, stored.canonical_params_hash);
        assert_eq!(key.input_version, stored.input_version);
    }
}
