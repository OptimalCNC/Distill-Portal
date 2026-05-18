//! `import_sessions` handler — `OperationHandler` impl bound to `AppState`.
//!
//! The kind-shaped helpers (KIND_NAME, decode_params, idempotency_key_for)
//! live in `components/operations/kinds/import_sessions.rs` and are shared
//! between the submit path in `app.rs::submit_import_operation` and this
//! handler's `idempotency_key()` method so the two paths cannot drift.

use distill_portal_operations::{
    kinds::import_sessions, CheckpointGuard, HandlerError, HandlerFuture, IdempotencyKey,
    OperationHandler,
};
use serde_json::Value;

use crate::app::{is_cancelled, AppState};

pub(crate) struct ImportSessionsHandler {
    state: AppState,
}

impl ImportSessionsHandler {
    pub(crate) fn new(state: AppState) -> Self {
        Self { state }
    }
}

impl OperationHandler for ImportSessionsHandler {
    fn kind(&self) -> &'static str {
        import_sessions::KIND_NAME
    }

    fn idempotency_key(&self, raw_params: &Value) -> Result<IdempotencyKey, HandlerError> {
        let request = import_sessions::decode_params(raw_params)?;
        import_sessions::idempotency_key_for(&request, |session_keys| {
            self.state.import_sessions_fingerprints(session_keys)
        })
    }

    fn run(&self, params: Value, checkpoint: CheckpointGuard) -> HandlerFuture {
        // Clone owned state INTO the async block so the future is `'static`.
        let state = self.state.clone();
        Box::pin(async move {
            let request = import_sessions::decode_params(&params)?;
            match state
                .run_import_operation(request.session_keys, checkpoint)
                .await
            {
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
    use distill_portal_ui_api_contracts::ImportSourceSessionsRequest;
    use serde_json::json;
    use tempfile::TempDir;

    use super::ImportSessionsHandler;
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
    async fn import_sessions_handler_idempotency_key_matches_submit_operation() {
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

        // Bootstrap runs a rescan which populates the source inventory.
        let inventory = app.state().list_source_sessions().await.unwrap();
        assert!(
            !inventory.is_empty(),
            "expected inventory to have a session"
        );

        let session_keys: Vec<String> = inventory
            .iter()
            .map(|entry| entry.session_key.clone())
            .collect();
        let request = ImportSourceSessionsRequest {
            session_keys: session_keys.clone(),
        };
        let params = serde_json::to_value(&request).unwrap();

        // Path 1: submit_import_operation persists the operation row using its
        // own idempotency-key computation.
        let response = app
            .state()
            .submit_import_operation(session_keys)
            .await
            .unwrap();
        let stored = app
            .state()
            .get_operation(response.operation_id.clone())
            .await
            .unwrap()
            .unwrap();

        // Path 2: ImportSessionsHandler::idempotency_key recomputes from raw params.
        let handler = ImportSessionsHandler::new(app.state());
        let key = handler.idempotency_key(&params).unwrap();

        assert_eq!(key.canonical_params_hash, stored.canonical_params_hash);
        assert_eq!(key.input_version, stored.input_version);

        // Sanity: empty params produce a deterministic key, not a panic.
        let empty_key = handler
            .idempotency_key(&json!({"session_keys": []}))
            .unwrap();
        assert!(!empty_key.canonical_params_hash.is_empty());
        assert!(!empty_key.input_version.is_empty());
    }
}
