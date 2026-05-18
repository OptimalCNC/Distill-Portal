//! Trait-based dispatcher that routes claimed operation rows to a registered
//! [`OperationHandler`] for that kind.
//!
//! The dispatcher is intentionally a thin in-process router. Workers and the
//! on-disk operations schema are unchanged from Phase 9a; this module adds the
//! extension contract that future operation kinds plug into in Phase 10+.
//!
//! See `docs/playbooks/modify-backend-api.md` (Phase 9b) for the new-kind
//! recipe, and `components/operations/README.md` for the architectural shape.

use std::{collections::HashMap, future::Future, pin::Pin, sync::Arc};

use serde_json::Value;

use crate::cancel::CheckpointGuard;

/// Object-safe boxed-future return type for [`OperationHandler::run`].
///
/// Bounded `'static` so the future composes cleanly with
/// [`crate::OperationWorker::spawn`], which requires `Fut: Send + 'static`.
/// Implementations typically clone any owned state INTO the async block and
/// `Box::pin(async move { ... })`.
pub type HandlerFuture =
    Pin<Box<dyn Future<Output = Result<Value, HandlerError>> + Send + 'static>>;

/// Idempotency identity for an operation. Mirrors the
/// `(canonical_params_hash, input_version)` pair stored in the `operations`
/// table at submit time.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdempotencyKey {
    pub canonical_params_hash: String,
    pub input_version: String,
}

/// Errors returned from an [`OperationHandler`] implementation.
///
/// The variants map onto the worker's terminal-status taxonomy:
/// `InvalidParams` and `Internal` become `failed` rows; `Cancelled` becomes a
/// `cancelled` row.
#[derive(Debug, thiserror::Error)]
pub enum HandlerError {
    #[error("invalid params: {0}")]
    InvalidParams(String),
    #[error("operation cancelled")]
    Cancelled,
    #[error("internal handler error: {0}")]
    Internal(String),
}

/// Per-kind extension contract for the operations dispatcher.
///
/// One implementation per `operations.kind` row. The dispatcher's registry
/// maps the kind's stable snake_case name to a single `Arc<dyn OperationHandler>`.
pub trait OperationHandler: Send + Sync + 'static {
    /// Stable snake_case identifier for this kind.
    ///
    /// Must match the value persisted in the `operations.kind` column AND the
    /// `OperationKind` enum's `as_str()` value for the corresponding variant.
    fn kind(&self) -> &'static str;

    /// Schema-validate the raw params and compute the idempotency identity.
    fn idempotency_key(&self, raw_params: &Value) -> Result<IdempotencyKey, HandlerError>;

    /// Execute the operation. Returns a `'static` future so it composes
    /// cleanly with [`crate::OperationWorker::spawn`]'s `Send + 'static`
    /// bound. Impls typically clone owned state and `Box::pin(async move { ... })`.
    fn run(&self, params: Value, checkpoint: CheckpointGuard) -> HandlerFuture;
}

/// In-process handler registry. Routes a claimed [`crate::Operation`]'s kind
/// to its registered [`OperationHandler`] impl.
pub struct Dispatcher {
    handlers: HashMap<&'static str, Arc<dyn OperationHandler>>,
}

impl Dispatcher {
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }

    /// Register a handler. Panics on duplicate kind (programmer error — two
    /// handlers cannot claim the same kind).
    pub fn register<H: OperationHandler>(&mut self, handler: H) -> &mut Self {
        self.register_arc(Arc::new(handler))
    }

    /// Register a handler that is already wrapped in `Arc`. Panics on
    /// duplicate kind.
    pub fn register_arc(&mut self, handler: Arc<dyn OperationHandler>) -> &mut Self {
        let kind = handler.kind();
        assert!(
            !self.handlers.contains_key(kind),
            "duplicate operation handler kind: {kind}",
        );
        self.handlers.insert(kind, handler);
        self
    }

    /// Look up the registered handler for a kind name, if any.
    pub fn get(&self, kind: &str) -> Option<&Arc<dyn OperationHandler>> {
        self.handlers.get(kind)
    }

    /// Iterate the registered kind names. Order is unspecified.
    pub fn kinds(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.handlers.keys().copied()
    }

    /// Iterate `(kind_name, handler)` pairs. Order is unspecified.
    pub fn handlers(
        &self,
    ) -> impl Iterator<Item = (&'static str, &Arc<dyn OperationHandler>)> + '_ {
        self.handlers.iter().map(|(k, v)| (*k, v))
    }
}

impl Default for Dispatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };

    use serde_json::{json, Value};
    use tempfile::TempDir;

    use super::{Dispatcher, HandlerError, HandlerFuture, IdempotencyKey, OperationHandler};
    use crate::{cancel::CancellationToken, OperationsStore};

    struct RecordingHandler {
        kind_name: &'static str,
        key: IdempotencyKey,
        run_calls: Arc<AtomicUsize>,
        captured_params: Arc<Mutex<Option<Value>>>,
        result: Value,
    }

    impl RecordingHandler {
        fn new(kind_name: &'static str, key: IdempotencyKey, result: Value) -> Self {
            Self {
                kind_name,
                key,
                run_calls: Arc::new(AtomicUsize::new(0)),
                captured_params: Arc::new(Mutex::new(None)),
                result,
            }
        }
    }

    impl OperationHandler for RecordingHandler {
        fn kind(&self) -> &'static str {
            self.kind_name
        }

        fn idempotency_key(&self, _raw_params: &Value) -> Result<IdempotencyKey, HandlerError> {
            Ok(self.key.clone())
        }

        fn run(&self, params: Value, _checkpoint: crate::CheckpointGuard) -> HandlerFuture {
            self.run_calls.fetch_add(1, Ordering::SeqCst);
            *self.captured_params.lock().unwrap() = Some(params);
            let result = self.result.clone();
            Box::pin(async move { Ok(result) })
        }
    }

    fn empty_key(suffix: &str) -> IdempotencyKey {
        IdempotencyKey {
            canonical_params_hash: format!("hash-{suffix}"),
            input_version: format!("input-{suffix}"),
        }
    }

    #[test]
    fn register_and_get_routes_by_kind_name() {
        let mut dispatcher = Dispatcher::new();
        dispatcher
            .register(RecordingHandler::new(
                "kind_a",
                empty_key("a"),
                json!({"kind": "a"}),
            ))
            .register(RecordingHandler::new(
                "kind_b",
                empty_key("b"),
                json!({"kind": "b"}),
            ));

        assert!(dispatcher.get("kind_a").is_some());
        assert!(dispatcher.get("kind_b").is_some());
        assert!(dispatcher.get("kind_c").is_none());
    }

    #[test]
    #[should_panic(expected = "duplicate operation handler kind")]
    fn register_panics_on_duplicate_kind() {
        let mut dispatcher = Dispatcher::new();
        dispatcher
            .register(RecordingHandler::new(
                "kind_a",
                empty_key("a"),
                json!({}),
            ))
            .register(RecordingHandler::new(
                "kind_a",
                empty_key("a2"),
                json!({}),
            ));
    }

    #[test]
    fn kinds_iterator_returns_all_registered() {
        let mut dispatcher = Dispatcher::new();
        dispatcher
            .register(RecordingHandler::new(
                "kind_a",
                empty_key("a"),
                json!({}),
            ))
            .register(RecordingHandler::new(
                "kind_b",
                empty_key("b"),
                json!({}),
            ));

        let mut kinds = dispatcher.kinds().collect::<Vec<_>>();
        kinds.sort();
        assert_eq!(kinds, vec!["kind_a", "kind_b"]);
    }

    #[tokio::test]
    async fn handler_run_returns_static_future_with_owned_state() {
        let tempdir = TempDir::new().unwrap();
        let store = Arc::new(
            OperationsStore::open(tempdir.path().join("operations.db"))
                .expect("open operations store"),
        );
        let recording = RecordingHandler::new(
            "kind_a",
            empty_key("a"),
            json!({"ok": true, "tag": "recorded"}),
        );
        let captured = recording.captured_params.clone();
        let run_calls = recording.run_calls.clone();

        let mut dispatcher = Dispatcher::new();
        dispatcher.register(recording);

        // Clone the Arc out of the dispatcher so the future is independent of
        // the dispatcher's lifetime; the future must be `'static`.
        let handler = dispatcher.get("kind_a").unwrap().clone();
        let token = CancellationToken::new();
        let guard = token.guard("op-1".to_string(), store);
        let params = json!({"hello": "world"});

        let future = handler.run(params.clone(), guard);
        // Drop our handle on the dispatcher to confirm the future does not
        // borrow from it (would not compile if the future captured `&self`).
        drop(handler);
        drop(dispatcher);
        let result = future.await.unwrap();

        assert_eq!(result, json!({"ok": true, "tag": "recorded"}));
        assert_eq!(run_calls.load(Ordering::SeqCst), 1);
        assert_eq!(captured.lock().unwrap().as_ref(), Some(&params));
    }

    #[test]
    fn handler_idempotency_key_returns_typed_struct() {
        let handler = RecordingHandler::new(
            "kind_a",
            IdempotencyKey {
                canonical_params_hash: "deadbeef".into(),
                input_version: "v42".into(),
            },
            json!({}),
        );
        let key = handler.idempotency_key(&json!({})).unwrap();
        assert_eq!(key.canonical_params_hash, "deadbeef");
        assert_eq!(key.input_version, "v42");
    }
}
