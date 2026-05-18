use std::{
    collections::{HashMap, HashSet},
    future::Future,
    io,
    sync::{Arc, RwLock},
};

use ::time::{format_description::well_known::Rfc3339, OffsetDateTime};
use axum::Router;
use distill_portal_collector_runtime::{
    ParsedSession, ScanCheckpoint, ScanCheckpointError, ScanFailure, ScanReport, Scanner,
    SCANNER_CONFIG_VERSION,
};
use distill_portal_configuration::{BackendConfig, ConfigurationError};
use distill_portal_ingest_service::{
    service::IngestManyError, IngestDisposition, IngestError, IngestService,
};
use distill_portal_operations::{
    idempotency::IdempotencyError, CancelRequestOutcome, CancellationToken, CheckpointError,
    Dispatcher, HandlerError, IdempotencyKey, NewOperation, NoopCheckpoint, Operation,
    OperationCheckpoint, OperationKind, OperationOutcome, OperationStatus,
    OperationTransitionEvent, OperationWorker, OperationsBroadcaster, OperationsError,
    OperationsListQuery, OperationsListResponse, OperationsStore, SubmitOperationResponse,
};
use distill_portal_raw_session_store::{
    BlobStore, LocalFsBlobStore, ScanErrorInput, SqliteStore, StoreError,
};
use distill_portal_ui_api_contracts::{
    source_key, ImportReport, ImportSourceSessionsRequest, PersistedScanError, RescanReport,
    SessionSyncStatus, SourceSessionView, StoredSessionView,
};
use serde_json::Value;
use tokio::{net::TcpListener, sync::Mutex, task::JoinError, time as tokio_time};
use tracing::{info, warn};

use crate::http_api;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Config(#[from] ConfigurationError),
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Ingest(#[from] IngestError),
    #[error(transparent)]
    Scan(#[from] ScanFailure),
    #[error(transparent)]
    Operations(#[from] OperationsError),
    #[error(transparent)]
    Idempotency(#[from] IdempotencyError),
    #[error(transparent)]
    Checkpoint(#[from] CheckpointError),
    #[error(transparent)]
    Join(#[from] JoinError),
    #[error("operation handler error: {0}")]
    Handler(String),
}

/// Lifts a `HandlerError` into `AppError` on the **submit path**. Reached
/// only via the `?` operator in `submit_rescan_operation` and
/// `submit_import_operation` when the kinds-helper idempotency-key
/// computation fails (e.g. invalid params, or a poisoned inventory lock
/// in `import_sessions_fingerprints`). The worker spawn closure does NOT
/// use this impl — it matches `HandlerError` variants directly into
/// `OperationOutcome`. See `dispatcher.rs` for the trait surface.
impl From<HandlerError> for AppError {
    fn from(error: HandlerError) -> Self {
        match error {
            HandlerError::InvalidParams(message) => Self::Handler(message),
            HandlerError::Cancelled => Self::Checkpoint(CheckpointError::CancelRequested(
                distill_portal_operations::CancelRequested::new("handler"),
            )),
            HandlerError::Internal(message) => Self::Handler(message),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppInner>,
}

struct AppInner {
    config: BackendConfig,
    scanner: Scanner,
    store: Arc<SqliteStore>,
    blob_store: Arc<LocalFsBlobStore>,
    ingest_service: Arc<IngestService>,
    operations_store: Arc<OperationsStore>,
    operations_broadcaster: Arc<OperationsBroadcaster>,
    operation_cancellations: OperationCancellationSignals,
    source_inventory: RwLock<SourceInventory>,
    scan_lock: Mutex<()>,
}

pub struct App {
    state: AppState,
    router: Router,
    operation_workers: Vec<tokio::task::JoinHandle<()>>,
}

#[derive(Clone, Debug, Default)]
struct SourceInventory {
    sessions: Vec<InventoryEntry>,
}

#[derive(Clone, Debug)]
struct InventoryEntry {
    parsed: ParsedSession,
    view: SourceSessionView,
}

#[derive(Clone, Debug, Default)]
struct OperationCancellationSignals {
    import_sessions: CancellationToken,
    rescan_sources: CancellationToken,
}

struct AppScanCheckpoint<C> {
    checkpoint: C,
}

impl<C: OperationCheckpoint> ScanCheckpoint for AppScanCheckpoint<C> {
    fn check(&mut self) -> Result<(), ScanCheckpointError> {
        self.checkpoint
            .check_blocking()
            .map_err(|error| match error {
                CheckpointError::CancelRequested(_) => ScanCheckpointError::Cancelled,
                other => ScanCheckpointError::Failed(other.to_string()),
            })
    }
}

impl App {
    pub async fn bootstrap(config: BackendConfig) -> Result<Self, AppError> {
        std::fs::create_dir_all(&config.data_dir)?;
        let db_path = config.data_dir.join("distill.db");
        let store = Arc::new(SqliteStore::open(db_path.clone())?);
        let operations_store = Arc::new(OperationsStore::open(db_path)?);
        // Bootstrap reconciliation runs BEFORE the broadcaster is exposed to
        // clients (no SSE subscribers can exist yet — the router is built
        // below). Per Phase 9b dispatch: "no publish needed — reconciliation
        // runs BEFORE the HTTP server starts serving."
        operations_store.reconcile_interrupted()?;
        let blob_store = Arc::new(LocalFsBlobStore::new(config.data_dir.join("blobs"))?);
        let ingest_service = Arc::new(IngestService::new(store.clone(), blob_store.clone()));
        let operation_cancellations = OperationCancellationSignals::default();
        let operations_broadcaster = OperationsBroadcaster::new();
        let state = AppState {
            inner: Arc::new(AppInner {
                scanner: Scanner::new(config.claude_roots.clone(), config.codex_roots.clone()),
                config,
                store,
                blob_store,
                ingest_service,
                operations_store,
                operations_broadcaster,
                operation_cancellations,
                source_inventory: RwLock::new(SourceInventory::default()),
                scan_lock: Mutex::new(()),
            }),
        };
        state.startup_maintenance().await?;
        state.rescan().await?;
        let dispatcher = crate::operations_kinds::build_dispatcher(state.clone());
        let operation_workers = state.spawn_operation_workers(&dispatcher);
        let router = http_api::router(state.clone());
        Ok(Self {
            state,
            router,
            operation_workers,
        })
    }

    pub fn router(&self) -> Router {
        self.router.clone()
    }

    pub fn state(&self) -> AppState {
        self.state.clone()
    }

    pub async fn run(self) -> Result<(), AppError> {
        let listener = TcpListener::bind(self.state.inner.config.bind_addr).await?;
        self.serve_with_shutdown(listener, shutdown_signal()).await
    }

    pub async fn serve_with_shutdown<F>(
        self,
        listener: TcpListener,
        shutdown: F,
    ) -> Result<(), AppError>
    where
        F: Future<Output = ()> + Send + 'static,
    {
        let addr = listener.local_addr()?;
        info!(
            addr = %addr,
            data_dir = %self.state.inner.config.data_dir.display(),
            "starting distill portal backend"
        );
        let poller = self.state.spawn_poll_loop();
        let server = axum::serve(listener, self.router())
            .with_graceful_shutdown(shutdown)
            .await;
        poller.abort();
        server?;
        Ok(())
    }
}

impl Drop for App {
    fn drop(&mut self) {
        for worker in &self.operation_workers {
            worker.abort();
        }
    }
}

impl AppState {
    pub async fn rescan(&self) -> Result<RescanReport, AppError> {
        self.run_rescan_operation(NoopCheckpoint).await
    }

    pub async fn import_source_sessions(
        &self,
        session_keys: Vec<String>,
    ) -> Result<ImportReport, AppError> {
        self.run_import_operation(session_keys, NoopCheckpoint)
            .await
    }

    pub fn operations_store(&self) -> Arc<OperationsStore> {
        self.inner.operations_store.clone()
    }

    /// Shared `OperationsBroadcaster` instance — the SSE handler subscribes
    /// here, and `submit_operation` + `request_operation_cancel` publish
    /// directly into it after their store transactions commit. Workers
    /// publish via the broadcaster they receive at spawn time.
    pub fn operations_broadcaster(&self) -> Arc<OperationsBroadcaster> {
        self.inner.operations_broadcaster.clone()
    }

    /// Snapshot of operations to emit on initial SSE connect. Returns
    /// non-terminal ops first (ordered by submission time ASC), then the
    /// most recent 50 terminal ops in submission-time ASC order so the
    /// client sees oldest-first within each section. Each row is wrapped
    /// as a synthetic `OperationTransitionEvent` with `seq = 0` — snapshot
    /// rows are emitted as `event: snapshot` SSE frames without an `id:`
    /// line, so the `seq` is never read by the client's `Last-Event-ID`
    /// tracker. See the SSE handler doc comment for the wire shape.
    pub async fn operations_snapshot_for_sse(
        &self,
    ) -> Result<Vec<OperationTransitionEvent>, AppError> {
        let store = self.inner.operations_store.clone();
        tokio::task::spawn_blocking(move || {
            let non_terminal = store.list(OperationsListQuery {
                status: Some(vec![
                    OperationStatus::Queued,
                    OperationStatus::Running,
                    OperationStatus::CancelRequested,
                ]),
                kind: None,
                limit: Some(200),
            })?;
            let terminal = store.list(OperationsListQuery {
                status: Some(vec![
                    OperationStatus::Succeeded,
                    OperationStatus::Failed,
                    OperationStatus::Cancelled,
                    OperationStatus::Interrupted,
                ]),
                kind: None,
                limit: Some(50),
            })?;
            // `store.list` orders DESC by submitted_at. Reverse each slice
            // so the SSE client receives oldest-first within each section;
            // non-terminal section is emitted first, then terminal.
            let mut snapshot = Vec::with_capacity(non_terminal.len() + terminal.len());
            for operation in non_terminal.into_iter().rev() {
                snapshot.push(OperationTransitionEvent { operation, seq: 0 });
            }
            for operation in terminal.into_iter().rev() {
                snapshot.push(OperationTransitionEvent { operation, seq: 0 });
            }
            Ok::<_, AppError>(snapshot)
        })
        .await?
    }

    pub async fn submit_rescan_operation(
        &self,
        params_json: Value,
    ) -> Result<SubmitOperationResponse, AppError> {
        let key = distill_portal_operations::kinds::rescan_sources::idempotency_key_for(
            &params_json,
            SCANNER_CONFIG_VERSION,
            self.scanner_roots_display(),
        )?;
        let operation = self.submit_operation(OperationKind::RescanSources, params_json, key)?;
        Ok(submit_operation_response(&operation))
    }

    pub async fn submit_import_operation(
        &self,
        session_keys: Vec<String>,
    ) -> Result<SubmitOperationResponse, AppError> {
        let request = ImportSourceSessionsRequest { session_keys };
        let params_json = serde_json::to_value(&request).map_err(OperationsError::from)?;
        let key = distill_portal_operations::kinds::import_sessions::idempotency_key_for(
            &request,
            |keys| self.import_sessions_fingerprints(keys),
        )?;
        let operation = self.submit_operation(OperationKind::ImportSessions, params_json, key)?;
        Ok(submit_operation_response(&operation))
    }

    pub async fn get_operation(&self, id: String) -> Result<Option<Operation>, AppError> {
        Ok(self.inner.operations_store.get_by_id(&id)?)
    }

    pub async fn list_operations(
        &self,
        query: OperationsListQuery,
    ) -> Result<OperationsListResponse, AppError> {
        Ok(OperationsListResponse {
            operations: self.inner.operations_store.list(query)?,
        })
    }

    pub async fn request_operation_cancel(
        &self,
        id: String,
    ) -> Result<CancelRequestOutcome, AppError> {
        let outcome = self.inner.operations_store.request_cancel(&id)?;
        if let CancelRequestOutcome::Requested(operation) = &outcome {
            // Publish the `cancel_requested` transition BEFORE notifying
            // the worker. Codex pre-consult refinement: the worker can
            // race ahead and publish `cancelled` first if we notify first.
            self.inner
                .operations_broadcaster
                .publish(operation.clone());
            self.notify_operation_worker(operation.kind);
        }
        Ok(outcome)
    }

    pub(crate) async fn run_rescan_operation<C>(
        &self,
        checkpoint: C,
    ) -> Result<RescanReport, AppError>
    where
        C: OperationCheckpoint,
    {
        let _guard = self.inner.scan_lock.lock().await;
        let state = self.clone();
        tokio::task::spawn_blocking(move || state.rescan_blocking_with_checkpoint(checkpoint))
            .await?
    }

    pub(crate) async fn run_import_operation<C>(
        &self,
        session_keys: Vec<String>,
        checkpoint: C,
    ) -> Result<ImportReport, AppError>
    where
        C: OperationCheckpoint,
    {
        let _guard = self.inner.scan_lock.lock().await;
        let selected = self.select_inventory_sessions(&session_keys)?;
        let state = self.clone();
        tokio::task::spawn_blocking(move || {
            state.import_source_sessions_blocking_with_checkpoint(selected, checkpoint)
        })
        .await?
    }

    fn submit_operation(
        &self,
        kind: OperationKind,
        params_json: Value,
        key: IdempotencyKey,
    ) -> Result<Operation, AppError> {
        let IdempotencyKey {
            canonical_params_hash,
            input_version,
        } = key;
        let store = &self.inner.operations_store;
        if let Some(existing) =
            store.find_by_idempotency_key(kind, &canonical_params_hash, &input_version)?
        {
            // Idempotent dedupe — the client already saw this operation;
            // do NOT republish.
            return Ok(existing);
        }

        let input = NewOperation {
            kind,
            canonical_params_hash: canonical_params_hash.clone(),
            input_version: input_version.clone(),
            params_json,
        };
        match store.insert(input) {
            Ok(operation) => {
                // Newly-inserted queued row: publish the `queued`
                // transition AFTER the insert transaction commits.
                self.inner
                    .operations_broadcaster
                    .publish(operation.clone());
                Ok(operation)
            }
            Err(error) => {
                if let Some(existing) =
                    store.find_by_idempotency_key(kind, &canonical_params_hash, &input_version)?
                {
                    // Race with a concurrent insert won by another caller;
                    // do NOT publish here — that caller's path already did.
                    return Ok(existing);
                }
                Err(error.into())
            }
        }
    }

    /// Look up `(session_key, source_fingerprint)` pairs for the requested
    /// keys from the live source inventory. Shared by `submit_import_operation`
    /// and the `ImportSessionsHandler::idempotency_key` impl via the kinds
    /// helper closure — single source of truth.
    pub(crate) fn import_sessions_fingerprints(
        &self,
        session_keys: &[String],
    ) -> Result<Vec<(String, String)>, HandlerError> {
        let inventory = self
            .inner
            .source_inventory
            .read()
            .map_err(|_| HandlerError::Internal(StoreError::LockPoisoned.to_string()))?;
        let requested = session_keys
            .iter()
            .map(String::as_str)
            .collect::<HashSet<_>>();
        Ok(inventory
            .sessions
            .iter()
            .filter_map(|entry| {
                if requested.contains(entry.view.session_key.as_str()) {
                    Some((
                        entry.view.session_key.clone(),
                        entry.view.source_fingerprint.clone(),
                    ))
                } else {
                    None
                }
            })
            .collect())
    }

    /// Configured Claude + Codex source-root display strings, used to compute
    /// the `rescan_sources` input version. Shared by `submit_rescan_operation`
    /// and the `RescanSourcesHandler::idempotency_key` impl.
    pub(crate) fn scanner_roots_display(&self) -> Vec<String> {
        self.inner
            .config
            .claude_roots
            .iter()
            .chain(self.inner.config.codex_roots.iter())
            .map(|path| path.display().to_string())
            .collect()
    }

    fn notify_operation_worker(&self, kind: OperationKind) {
        match kind {
            OperationKind::ImportSessions => {
                self.inner.operation_cancellations.import_sessions.notify()
            }
            OperationKind::RescanSources => {
                self.inner.operation_cancellations.rescan_sources.notify()
            }
        }
    }

    fn spawn_operation_workers(
        &self,
        dispatcher: &Arc<Dispatcher>,
    ) -> Vec<tokio::task::JoinHandle<()>> {
        spawn_operation_workers(
            dispatcher,
            self.inner.operations_store.clone(),
            self.inner.operations_broadcaster.clone(),
            &self.inner.operation_cancellations,
        )
    }

    pub async fn list_source_sessions(&self) -> Result<Vec<SourceSessionView>, AppError> {
        let inventory = self
            .inner
            .source_inventory
            .read()
            .map_err(|_| AppError::Store(StoreError::LockPoisoned))?;
        Ok(inventory
            .sessions
            .iter()
            .map(|entry| entry.view.clone())
            .collect())
    }

    pub async fn list_sessions(&self) -> Result<Vec<StoredSessionView>, AppError> {
        let source_statuses = self.source_status_map()?;
        let store = self.inner.store.clone();
        tokio::task::spawn_blocking(move || {
            let sessions = store.list_sessions()?;
            Ok(sessions
                .into_iter()
                .map(|session| StoredSessionView {
                    status: source_statuses
                        .get(&source_key(session.tool, &session.source_session_id))
                        .copied()
                        .unwrap_or(SessionSyncStatus::SourceMissing),
                    session,
                })
                .collect())
        })
        .await?
    }

    pub async fn get_session(
        &self,
        session_uid: String,
    ) -> Result<Option<StoredSessionView>, AppError> {
        let source_statuses = self.source_status_map()?;
        let store = self.inner.store.clone();
        tokio::task::spawn_blocking(move || {
            let session = match store.get_session(&session_uid)? {
                Some(session) => session,
                None => return Ok(None),
            };
            Ok(Some(StoredSessionView {
                status: source_statuses
                    .get(&source_key(session.tool, &session.source_session_id))
                    .copied()
                    .unwrap_or(SessionSyncStatus::SourceMissing),
                session,
            }))
        })
        .await?
    }

    pub async fn get_raw(&self, session_uid: String) -> Result<Option<Vec<u8>>, AppError> {
        let store = self.inner.store.clone();
        let blob_store = self.inner.blob_store.clone();
        tokio::task::spawn_blocking(move || {
            let session = match store.get_session(&session_uid)? {
                Some(session) => session,
                None => return Ok(None),
            };
            Ok(Some(blob_store.get(&session.raw_ref)?))
        })
        .await?
    }

    pub async fn list_scan_errors(&self) -> Result<Vec<PersistedScanError>, AppError> {
        let store = self.inner.store.clone();
        Ok(tokio::task::spawn_blocking(move || store.list_scan_errors()).await??)
    }

    async fn startup_maintenance(&self) -> Result<(), AppError> {
        let blob_store = self.inner.blob_store.clone();
        let store = self.inner.store.clone();
        tokio::task::spawn_blocking(move || {
            blob_store.sweep_temp_files()?;
            let referenced = store.referenced_blobs()?;
            blob_store.delete_orphan_blobs(&referenced)?;
            Ok::<(), AppError>(())
        })
        .await??;
        Ok(())
    }

    fn spawn_poll_loop(&self) -> tokio::task::JoinHandle<()> {
        let state = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio_time::interval(state.inner.config.poll_interval);
            interval.tick().await;
            loop {
                interval.tick().await;
                match state.rescan().await {
                    Ok(report) => info!(
                        discovered_files = report.discovered_files,
                        not_stored_sessions = report.not_stored_sessions,
                        outdated_sessions = report.outdated_sessions,
                        up_to_date_sessions = report.up_to_date_sessions,
                        scan_errors = report.scan_errors,
                        "completed periodic source inventory refresh"
                    ),
                    Err(error) => warn!(?error, "periodic source inventory refresh failed"),
                }
            }
        })
    }

    fn rescan_blocking_with_checkpoint<C: OperationCheckpoint>(
        &self,
        checkpoint: C,
    ) -> Result<RescanReport, AppError> {
        let mut scan_checkpoint = AppScanCheckpoint { checkpoint };
        let batch = self
            .inner
            .scanner
            .scan_with_checkpoint(&mut scan_checkpoint)?;
        for scan_error in &batch.scan_errors {
            self.inner
                .store
                .record_scan_error(&map_scan_error_input(scan_error))?;
        }

        let mut report = scan_batch_report(&batch.report);
        let mut entries = Vec::with_capacity(batch.sessions.len());
        for session in batch.sessions {
            scan_checkpoint.checkpoint.check_blocking()?;
            self.inner
                .store
                .clear_scan_error(session.tool, &session.source_path)?;
            let existing = self
                .inner
                .store
                .get_session_by_source_key(session.tool, &session.source_session_id)?;
            let (status, session_uid, stored_ingested_at) = match existing {
                Some(record) if record.source_fingerprint == session.source_fingerprint => {
                    report.up_to_date_sessions += 1;
                    (
                        SessionSyncStatus::UpToDate,
                        Some(record.session_uid),
                        Some(record.ingested_at),
                    )
                }
                Some(record) => {
                    report.outdated_sessions += 1;
                    (
                        SessionSyncStatus::Outdated,
                        Some(record.session_uid),
                        Some(record.ingested_at),
                    )
                }
                None => {
                    report.not_stored_sessions += 1;
                    (SessionSyncStatus::NotStored, None, None)
                }
            };
            entries.push(InventoryEntry {
                view: source_session_view(&session, status, session_uid, stored_ingested_at),
                parsed: session,
            });
        }

        entries.sort_by(|left, right| {
            right
                .view
                .source_updated_at
                .cmp(&left.view.source_updated_at)
                .then_with(|| left.view.source_path.cmp(&right.view.source_path))
        });

        let mut inventory = self
            .inner
            .source_inventory
            .write()
            .map_err(|_| AppError::Store(StoreError::LockPoisoned))?;
        *inventory = SourceInventory { sessions: entries };

        Ok(report)
    }

    fn import_source_sessions_blocking_with_checkpoint<C: OperationCheckpoint>(
        &self,
        selected_sessions: Vec<ParsedSession>,
        checkpoint: C,
    ) -> Result<ImportReport, AppError> {
        let mut report = ImportReport {
            requested_sessions: selected_sessions.len(),
            ..ImportReport::default()
        };

        let outcomes = self
            .inner
            .ingest_service
            .ingest_many_with_checkpoint(selected_sessions, || checkpoint.check_blocking())
            .map_err(|error| match error {
                IngestManyError::Ingest(error) => AppError::Ingest(error),
                IngestManyError::Checkpoint(error) => AppError::Checkpoint(error),
            })?;
        for outcome in outcomes {
            match outcome.disposition {
                IngestDisposition::Inserted => report.inserted_sessions += 1,
                IngestDisposition::Replaced => report.updated_sessions += 1,
                IngestDisposition::Unchanged => report.unchanged_sessions += 1,
            }
        }

        checkpoint.check_blocking()?;
        self.rescan_blocking_with_checkpoint(checkpoint)?;
        Ok(report)
    }

    fn select_inventory_sessions(
        &self,
        session_keys: &[String],
    ) -> Result<Vec<ParsedSession>, AppError> {
        let inventory = self
            .inner
            .source_inventory
            .read()
            .map_err(|_| AppError::Store(StoreError::LockPoisoned))?;
        let requested = session_keys
            .iter()
            .map(String::as_str)
            .collect::<HashSet<_>>();
        Ok(inventory
            .sessions
            .iter()
            .filter(|entry| requested.contains(entry.view.session_key.as_str()))
            .map(|entry| entry.parsed.clone())
            .collect())
    }

    fn source_status_map(&self) -> Result<HashMap<String, SessionSyncStatus>, AppError> {
        let inventory = self
            .inner
            .source_inventory
            .read()
            .map_err(|_| AppError::Store(StoreError::LockPoisoned))?;
        Ok(inventory
            .sessions
            .iter()
            .map(|entry| (entry.view.session_key.clone(), entry.view.status))
            .collect())
    }
}

fn map_scan_error_input(
    scan_error: &distill_portal_collector_runtime::ScanErrorRecord,
) -> ScanErrorInput {
    ScanErrorInput {
        tool: scan_error.tool,
        source_path: scan_error.source_path.clone(),
        fingerprint: scan_error.fingerprint.clone(),
        message: scan_error.message.clone(),
    }
}

fn scan_batch_report(scan_report: &ScanReport) -> RescanReport {
    RescanReport {
        discovered_files: scan_report.discovered_files,
        skipped_files: scan_report.skipped_files,
        parsed_sessions: scan_report.parsed_sessions,
        scan_errors: scan_report.scan_errors,
        ..RescanReport::default()
    }
}

pub(crate) fn is_cancelled(error: &AppError) -> bool {
    matches!(
        error,
        AppError::Checkpoint(CheckpointError::CancelRequested(_))
            | AppError::Scan(ScanFailure::Checkpoint(ScanCheckpointError::Cancelled))
    )
}

fn spawn_operation_workers(
    dispatcher: &Arc<Dispatcher>,
    store: Arc<OperationsStore>,
    broadcaster: Arc<OperationsBroadcaster>,
    cancellations: &OperationCancellationSignals,
) -> Vec<tokio::task::JoinHandle<()>> {
    use std::str::FromStr;

    dispatcher
        .handlers()
        .map(|(kind_name, handler)| {
            let handler = handler.clone();
            let kind = OperationKind::from_str(kind_name)
                .expect("dispatcher kind must parse to OperationKind enum");
            // Typed signals (per Phase 9b M2-A locked decision); a hashmap
            // refactor was scope creep.
            let cancellation = match kind {
                OperationKind::ImportSessions => cancellations.import_sessions.clone(),
                OperationKind::RescanSources => cancellations.rescan_sources.clone(),
            };
            let worker = OperationWorker::new_with_cancellation(kind, store.clone(), cancellation)
                .with_broadcaster(broadcaster.clone());
            worker.spawn(move |operation, checkpoint| {
                let handler = handler.clone();
                async move {
                    let params = operation.params_json.clone();
                    match handler.run(params, checkpoint).await {
                        Ok(value) => OperationOutcome::Succeeded(value),
                        Err(HandlerError::Cancelled) => OperationOutcome::cancelled(),
                        Err(error) => OperationOutcome::failed_message(error.to_string()),
                    }
                }
            })
        })
        .collect()
}

fn submit_operation_response(operation: &Operation) -> SubmitOperationResponse {
    SubmitOperationResponse {
        operation_id: operation.id.clone(),
        status: operation.status,
        kind: operation.kind,
    }
}

fn source_session_view(
    session: &ParsedSession,
    status: SessionSyncStatus,
    session_uid: Option<String>,
    stored_ingested_at: Option<String>,
) -> SourceSessionView {
    SourceSessionView {
        session_key: source_key(session.tool, &session.source_session_id),
        tool: session.tool,
        source_session_id: session.source_session_id.clone(),
        source_path: session.source_path.display().to_string(),
        source_fingerprint: session.source_fingerprint.clone(),
        created_at: format_optional_time(session.created_at),
        source_updated_at: format_optional_time(session.source_updated_at),
        project_path: session
            .project_path
            .as_ref()
            .map(|path| path.display().to_string()),
        title: session.title.clone(),
        // Phase 6: provenance carried alongside `title` on the source view.
        // Symmetric with the stored view, which round-trips through the
        // SQLite `sessions.title_source` column.
        title_source: session.title_source,
        has_subagent_sidecars: session.has_subagent_sidecars,
        status,
        session_uid,
        stored_ingested_at,
    }
}

fn format_optional_time(value: Option<OffsetDateTime>) -> Option<String> {
    value.map(|timestamp| timestamp.format(&Rfc3339).expect("valid RFC3339 timestamp"))
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

pub async fn run(config: BackendConfig) -> Result<(), AppError> {
    App::bootstrap(config).await?.run().await
}

#[cfg(test)]
mod tests {
    use std::{net::SocketAddr, path::Path, time::Duration};

    use distill_portal_operations::{CancelRequested, CheckpointError, OperationCheckpoint};
    use tempfile::TempDir;

    use super::{is_cancelled, App, BackendConfig};

    #[derive(Clone)]
    struct CancelImmediately;

    impl OperationCheckpoint for CancelImmediately {
        fn check_blocking(&self) -> Result<(), CheckpointError> {
            Err(CancelRequested::new("test-operation").into())
        }
    }

    #[tokio::test]
    async fn rescan_operation_checkpoint_cancel_returns_cancelled_outcome() {
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

        // The handler maps an AppError-with-cancellation onto HandlerError::Cancelled,
        // which the worker translates into OperationOutcome::cancelled(). The
        // underlying invariant (a cancelled checkpoint yields the cancellation
        // path) is asserted via `is_cancelled` here without spinning the worker.
        let error = app
            .state()
            .run_rescan_operation(CancelImmediately)
            .await
            .expect_err("cancelled checkpoint produces AppError::Checkpoint");
        assert!(is_cancelled(&error));
    }

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
}
