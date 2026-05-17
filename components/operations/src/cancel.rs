use std::sync::Arc;

use tokio::sync::Notify;

use crate::{OperationsError, OperationsStore};

#[derive(Clone, Debug)]
pub struct CancellationToken {
    notify: Arc<Notify>,
}

#[derive(Clone, Debug)]
pub struct CheckpointGuard {
    op_id: String,
    store: Arc<OperationsStore>,
    notify: Arc<Notify>,
}

#[derive(Clone, Debug, Default)]
pub struct NoopCheckpoint;

pub trait OperationCheckpoint: Clone + Send + Sync + 'static {
    fn check_blocking(&self) -> Result<(), CheckpointError>;
}

#[derive(Clone, Debug, thiserror::Error)]
#[error("operation cancellation requested: {operation_id}")]
pub struct CancelRequested {
    operation_id: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CheckpointError {
    #[error(transparent)]
    CancelRequested(#[from] CancelRequested),
    #[error(transparent)]
    Store(#[from] OperationsError),
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            notify: Arc::new(Notify::new()),
        }
    }

    pub fn guard(&self, op_id: impl Into<String>, store: Arc<OperationsStore>) -> CheckpointGuard {
        CheckpointGuard {
            op_id: op_id.into(),
            store,
            notify: self.notify.clone(),
        }
    }

    pub fn notify(&self) {
        self.notify.notify_waiters();
    }

    pub async fn notified(&self) {
        self.notify.notified().await;
    }
}

impl Default for CancellationToken {
    fn default() -> Self {
        Self::new()
    }
}

impl CheckpointGuard {
    pub fn operation_id(&self) -> &str {
        &self.op_id
    }

    pub async fn check(&self) -> Result<(), CheckpointError> {
        self.check_blocking()
    }

    pub fn notify_cancelled(&self) {
        self.notify.notify_waiters();
    }
}

impl OperationCheckpoint for CheckpointGuard {
    fn check_blocking(&self) -> Result<(), CheckpointError> {
        if self.store.is_cancel_requested(&self.op_id)? {
            return Err(CancelRequested::new(self.op_id.clone()).into());
        }
        Ok(())
    }
}

impl OperationCheckpoint for NoopCheckpoint {
    fn check_blocking(&self) -> Result<(), CheckpointError> {
        Ok(())
    }
}

impl CancelRequested {
    pub fn new(operation_id: impl Into<String>) -> Self {
        Self {
            operation_id: operation_id.into(),
        }
    }

    pub fn operation_id(&self) -> &str {
        &self.operation_id
    }
}
