use std::{
    collections::{HashMap, HashSet},
    io,
    sync::{Arc, RwLock},
};

use ::time::{format_description::well_known::Rfc3339, OffsetDateTime};
use axum::Router;
use tokio::{net::TcpListener, sync::Mutex, task::JoinError, time};
use tracing::{info, warn};

use crate::{
    api,
    collect::{ScanFailure, ScanReport, Scanner},
    config::Config,
    ingest::{IngestDisposition, IngestError, IngestService, ParsedSession, Tool},
    store::{
        BlobStore, LocalFsBlobStore, PersistedScanError, SessionRecord, SqliteStore, StoreError,
    },
};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Config(#[from] crate::config::ConfigError),
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Ingest(#[from] IngestError),
    #[error(transparent)]
    Scan(#[from] ScanFailure),
    #[error(transparent)]
    Join(#[from] JoinError),
}

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppInner>,
}

struct AppInner {
    config: Config,
    scanner: Scanner,
    store: Arc<SqliteStore>,
    blob_store: Arc<LocalFsBlobStore>,
    ingest_service: Arc<IngestService>,
    source_inventory: RwLock<SourceInventory>,
    scan_lock: Mutex<()>,
}

#[derive(Clone)]
pub struct App {
    state: AppState,
    router: Router,
}

#[derive(Clone, Copy, Debug, serde::Deserialize, serde::Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionSyncStatus {
    NotStored,
    UpToDate,
    Outdated,
    SourceMissing,
}

impl SessionSyncStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotStored => "not_stored",
            Self::UpToDate => "up_to_date",
            Self::Outdated => "outdated",
            Self::SourceMissing => "source_missing",
        }
    }
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub struct SourceSessionView {
    pub session_key: String,
    pub tool: Tool,
    pub source_session_id: String,
    pub source_path: String,
    pub source_fingerprint: String,
    pub created_at: Option<String>,
    pub source_updated_at: Option<String>,
    pub project_path: Option<String>,
    pub title: Option<String>,
    pub has_subagent_sidecars: bool,
    pub status: SessionSyncStatus,
    pub session_uid: Option<String>,
    pub stored_ingested_at: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub struct StoredSessionView {
    #[serde(flatten)]
    pub session: SessionRecord,
    pub status: SessionSyncStatus,
}

#[derive(Clone, Debug, Default, serde::Deserialize, serde::Serialize)]
pub struct RescanReport {
    pub discovered_files: usize,
    pub skipped_files: usize,
    pub parsed_sessions: usize,
    pub not_stored_sessions: usize,
    pub outdated_sessions: usize,
    pub up_to_date_sessions: usize,
    pub scan_errors: usize,
}

#[derive(Clone, Debug, Default, serde::Deserialize, serde::Serialize)]
pub struct ImportReport {
    pub requested_sessions: usize,
    pub inserted_sessions: usize,
    pub updated_sessions: usize,
    pub unchanged_sessions: usize,
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

impl App {
    pub async fn bootstrap(config: Config) -> Result<Self, AppError> {
        std::fs::create_dir_all(&config.data_dir)?;
        let store = Arc::new(SqliteStore::open(config.data_dir.join("distill.db"))?);
        let blob_store = Arc::new(LocalFsBlobStore::new(config.data_dir.join("blobs"))?);
        let ingest_service = Arc::new(IngestService::new(store.clone(), blob_store.clone()));
        let state = AppState {
            inner: Arc::new(AppInner {
                scanner: Scanner::new(config.claude_roots.clone(), config.codex_roots.clone()),
                config,
                store,
                blob_store,
                ingest_service,
                source_inventory: RwLock::new(SourceInventory::default()),
                scan_lock: Mutex::new(()),
            }),
        };
        state.startup_maintenance().await?;
        state.rescan().await?;
        let router = api::router(state.clone());
        Ok(Self { state, router })
    }

    pub fn router(&self) -> Router {
        self.router.clone()
    }

    pub fn state(&self) -> AppState {
        self.state.clone()
    }

    pub async fn run(self) -> Result<(), AppError> {
        let listener = TcpListener::bind(self.state.inner.config.bind_addr).await?;
        info!(
            addr = %self.state.inner.config.bind_addr,
            data_dir = %self.state.inner.config.data_dir.display(),
            "starting distill portal server"
        );
        let poller = self.state.spawn_poll_loop();
        let server = axum::serve(listener, self.router())
            .with_graceful_shutdown(shutdown_signal())
            .await;
        poller.abort();
        server?;
        Ok(())
    }
}

impl AppState {
    pub async fn rescan(&self) -> Result<RescanReport, AppError> {
        let _guard = self.inner.scan_lock.lock().await;
        let state = self.clone();
        tokio::task::spawn_blocking(move || state.rescan_blocking()).await?
    }

    pub async fn import_source_sessions(
        &self,
        session_keys: Vec<String>,
    ) -> Result<ImportReport, AppError> {
        let _guard = self.inner.scan_lock.lock().await;
        let selected = self.select_inventory_sessions(&session_keys)?;
        let state = self.clone();
        tokio::task::spawn_blocking(move || state.import_source_sessions_blocking(selected)).await?
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
            let mut interval = time::interval(state.inner.config.poll_interval);
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

    fn rescan_blocking(&self) -> Result<RescanReport, AppError> {
        let batch = self.inner.scanner.scan()?;
        for scan_error in &batch.scan_errors {
            self.inner.store.record_scan_error(scan_error)?;
        }

        let mut report = scan_batch_report(&batch.report);
        let mut entries = Vec::with_capacity(batch.sessions.len());
        for session in batch.sessions {
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

    fn import_source_sessions_blocking(
        &self,
        selected_sessions: Vec<ParsedSession>,
    ) -> Result<ImportReport, AppError> {
        let mut report = ImportReport {
            requested_sessions: selected_sessions.len(),
            ..ImportReport::default()
        };

        for session in selected_sessions {
            match self.inner.ingest_service.ingest(session)?.disposition {
                IngestDisposition::Inserted => report.inserted_sessions += 1,
                IngestDisposition::Replaced => report.updated_sessions += 1,
                IngestDisposition::Unchanged => report.unchanged_sessions += 1,
            }
        }

        self.rescan_blocking()?;
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

fn scan_batch_report(scan_report: &ScanReport) -> RescanReport {
    RescanReport {
        discovered_files: scan_report.discovered_files,
        skipped_files: scan_report.skipped_files,
        parsed_sessions: scan_report.parsed_sessions,
        scan_errors: scan_report.scan_errors,
        ..RescanReport::default()
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
        has_subagent_sidecars: session.has_subagent_sidecars,
        status,
        session_uid,
        stored_ingested_at,
    }
}

fn format_optional_time(value: Option<OffsetDateTime>) -> Option<String> {
    value.map(|timestamp| timestamp.format(&Rfc3339).expect("valid RFC3339 timestamp"))
}

fn source_key(tool: Tool, source_session_id: &str) -> String {
    format!("{}:{}", tool.as_str(), source_session_id)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

pub async fn run() -> Result<(), AppError> {
    let config = Config::load()?;
    App::bootstrap(config).await?.run().await
}
