use std::{future::Future, sync::Arc, time::Duration};

use serde::Serialize;
use serde_json::Value;
use tokio::{task::JoinHandle, time};
use tracing::warn;

use crate::{
    cancel::{CancellationToken, CheckpointError, CheckpointGuard},
    error_json, result_json, Operation, OperationKind, OperationsStore,
};

#[derive(Clone, Debug)]
pub struct OperationWorker {
    kind: OperationKind,
    store: Arc<OperationsStore>,
    cancellation: CancellationToken,
    idle_interval: Duration,
}

#[derive(Clone, Debug)]
pub enum OperationOutcome {
    Succeeded(Value),
    Failed(Value),
    Cancelled(Option<Value>),
}

impl OperationWorker {
    pub fn new(kind: OperationKind, store: Arc<OperationsStore>) -> Self {
        Self::new_with_cancellation(kind, store, CancellationToken::new())
    }

    pub fn new_with_cancellation(
        kind: OperationKind,
        store: Arc<OperationsStore>,
        cancellation: CancellationToken,
    ) -> Self {
        Self {
            kind,
            store,
            cancellation,
            idle_interval: Duration::from_millis(250),
        }
    }

    pub fn with_idle_interval(mut self, idle_interval: Duration) -> Self {
        self.idle_interval = idle_interval;
        self
    }

    pub fn cancellation_token(&self) -> CancellationToken {
        self.cancellation.clone()
    }

    pub fn spawn<F, Fut>(&self, handler: F) -> JoinHandle<()>
    where
        F: Fn(Operation, CheckpointGuard) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = OperationOutcome> + Send + 'static,
    {
        let worker = self.clone();
        tokio::spawn(async move { worker.run(handler).await })
    }

    async fn run<F, Fut>(self, handler: F)
    where
        F: Fn(Operation, CheckpointGuard) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = OperationOutcome> + Send + 'static,
    {
        loop {
            if self.complete_queued_cancellation() {
                continue;
            }

            let operation = match self.store.claim_next_queued(self.kind) {
                Ok(Some(operation)) => operation,
                Ok(None) => {
                    tokio::select! {
                        _ = self.cancellation.notified() => {}
                        _ = time::sleep(self.idle_interval) => {}
                    }
                    continue;
                }
                Err(error) => {
                    warn!(?error, kind = %self.kind, "operation worker failed to claim queued operation");
                    time::sleep(self.idle_interval).await;
                    continue;
                }
            };

            let guard = self
                .cancellation
                .guard(operation.id.clone(), self.store.clone());
            if self
                .handle_checkpoint_before_execution(&operation, &guard)
                .await
            {
                continue;
            }

            let outcome = handler(operation.clone(), guard.clone()).await;
            self.complete_operation(operation, guard, outcome).await;
        }
    }

    fn complete_queued_cancellation(&self) -> bool {
        match self.store.complete_next_queued_cancellation(self.kind) {
            Ok(Some(_)) => true,
            Ok(None) => false,
            Err(error) => {
                warn!(?error, kind = %self.kind, "operation worker failed to complete queued cancellation");
                false
            }
        }
    }

    async fn handle_checkpoint_before_execution(
        &self,
        operation: &Operation,
        guard: &CheckpointGuard,
    ) -> bool {
        match guard.check().await {
            Ok(()) => false,
            Err(CheckpointError::CancelRequested(_)) => {
                if let Err(error) = self.store.complete_cancelled(&operation.id, None) {
                    warn!(?error, operation_id = %operation.id, "operation worker failed to complete cancellation");
                }
                true
            }
            Err(error) => {
                if let Err(finish_error) = self.store.complete_failure(
                    &operation.id,
                    error_json(format!("checkpoint failed before execution: {error}")),
                ) {
                    warn!(?finish_error, operation_id = %operation.id, "operation worker failed to record checkpoint failure");
                }
                true
            }
        }
    }

    async fn complete_operation(
        &self,
        operation: Operation,
        guard: CheckpointGuard,
        outcome: OperationOutcome,
    ) {
        match outcome {
            OperationOutcome::Succeeded(result) => match guard.check().await {
                Ok(()) => {
                    if let Err(error) = self.store.complete_success(&operation.id, result) {
                        warn!(?error, operation_id = %operation.id, "operation worker failed to record success");
                    }
                }
                Err(CheckpointError::CancelRequested(_)) => {
                    if let Err(error) = self.store.complete_cancelled(&operation.id, None) {
                        warn!(?error, operation_id = %operation.id, "operation worker failed to record cancellation after success checkpoint");
                    }
                }
                Err(error) => {
                    if let Err(finish_error) = self.store.complete_failure(
                        &operation.id,
                        error_json(format!("checkpoint failed after execution: {error}")),
                    ) {
                        warn!(?finish_error, operation_id = %operation.id, "operation worker failed to record checkpoint failure");
                    }
                }
            },
            OperationOutcome::Failed(error) => {
                if let Err(finish_error) = self.store.complete_failure(&operation.id, error) {
                    warn!(?finish_error, operation_id = %operation.id, "operation worker failed to record failure");
                }
            }
            OperationOutcome::Cancelled(result) => {
                if let Err(error) = self.store.complete_cancelled(&operation.id, result) {
                    warn!(?error, operation_id = %operation.id, "operation worker failed to record cancellation");
                }
            }
        }
    }
}

impl OperationOutcome {
    pub fn succeeded<T: Serialize>(value: T) -> Self {
        Self::Succeeded(result_json(value))
    }

    pub fn failed_message(message: impl Into<String>) -> Self {
        Self::Failed(error_json(message))
    }

    pub fn cancelled() -> Self {
        Self::Cancelled(None)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        time::Duration,
    };

    use serde_json::json;
    use tempfile::TempDir;
    use tokio::time::{sleep, timeout};

    use super::{OperationOutcome, OperationWorker};
    use crate::{NewOperation, OperationKind, OperationStatus, OperationsStore};

    fn fresh_store(tempdir: &TempDir) -> Arc<OperationsStore> {
        Arc::new(
            OperationsStore::open(tempdir.path().join("operations.db"))
                .expect("open operations store"),
        )
    }

    fn new_operation(kind: OperationKind, suffix: &str) -> NewOperation {
        NewOperation {
            kind,
            canonical_params_hash: format!("{suffix:0<64}"),
            input_version: format!("input-{suffix}"),
            params_json: json!({ "suffix": suffix }),
        }
    }

    async fn wait_for_status(
        store: &OperationsStore,
        id: &str,
        status: OperationStatus,
    ) -> crate::Operation {
        timeout(Duration::from_secs(2), async {
            loop {
                let operation = store.get_by_id(id).unwrap().unwrap();
                if operation.status == status {
                    return operation;
                }
                sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("operation reached expected status")
    }

    #[tokio::test]
    async fn worker_writes_success_result_json() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let operation = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "worker-success",
            ))
            .unwrap();
        let worker = OperationWorker::new(OperationKind::ImportSessions, store.clone())
            .with_idle_interval(Duration::from_millis(5));
        let handle =
            worker.spawn(|_, _| async { OperationOutcome::succeeded(json!({ "ok": true })) });

        let finished = wait_for_status(&store, &operation.id, OperationStatus::Succeeded).await;
        assert_eq!(finished.result_json, Some(json!({ "ok": true })));
        handle.abort();
    }

    #[tokio::test]
    async fn worker_writes_failure_error_json() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let operation = store
            .insert(new_operation(
                OperationKind::RescanSources,
                "worker-failure",
            ))
            .unwrap();
        let worker = OperationWorker::new(OperationKind::RescanSources, store.clone())
            .with_idle_interval(Duration::from_millis(5));
        let handle =
            worker.spawn(|_, _| async { OperationOutcome::failed_message("synthetic failure") });

        let finished = wait_for_status(&store, &operation.id, OperationStatus::Failed).await;
        assert_eq!(
            finished.error_json,
            Some(json!({ "message": "synthetic failure" }))
        );
        handle.abort();
    }

    #[tokio::test]
    async fn worker_observes_cancel_requested_at_checkpoint() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let operation = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "worker-cancel",
            ))
            .unwrap();
        let cancel_store = store.clone();
        let worker = OperationWorker::new(OperationKind::ImportSessions, store.clone())
            .with_idle_interval(Duration::from_millis(5));
        let handle = worker.spawn(move |operation, guard| {
            let cancel_store = cancel_store.clone();
            async move {
                cancel_store.request_cancel(&operation.id).unwrap();
                match guard.check().await {
                    Ok(()) => OperationOutcome::failed_message("cancel was not observed"),
                    Err(crate::CheckpointError::CancelRequested(_)) => {
                        OperationOutcome::cancelled()
                    }
                    Err(error) => OperationOutcome::failed_message(error.to_string()),
                }
            }
        });

        wait_for_status(&store, &operation.id, OperationStatus::Cancelled).await;
        handle.abort();
    }

    #[tokio::test]
    async fn worker_completes_queued_cancel_without_running_handler() {
        let tempdir = TempDir::new().unwrap();
        let store = fresh_store(&tempdir);
        let operation = store
            .insert(new_operation(
                OperationKind::ImportSessions,
                "queued-cancel",
            ))
            .unwrap();
        store.request_cancel(&operation.id).unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let worker = OperationWorker::new(OperationKind::ImportSessions, store.clone())
            .with_idle_interval(Duration::from_millis(5));
        let handler_calls = calls.clone();
        let handle = worker.spawn(move |_, _| {
            let handler_calls = handler_calls.clone();
            async move {
                handler_calls.fetch_add(1, Ordering::SeqCst);
                OperationOutcome::succeeded(json!({ "unexpected": true }))
            }
        });

        wait_for_status(&store, &operation.id, OperationStatus::Cancelled).await;
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        handle.abort();
    }
}
