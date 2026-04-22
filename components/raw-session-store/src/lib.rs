pub mod blob_store;
pub mod local_fs_blob_store;
pub mod migrations;
pub mod sqlite;

pub use blob_store::{BlobStat, BlobStore, StoreError};
pub use local_fs_blob_store::LocalFsBlobStore;
pub use sqlite::{ReplaceResult, SqliteStore};

use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct StoredSessionInput {
    pub tool: distill_portal_ui_api_contracts::Tool,
    pub source_session_id: String,
    pub source_path: PathBuf,
    pub source_fingerprint: String,
    pub created_at: Option<time::OffsetDateTime>,
    pub source_updated_at: Option<time::OffsetDateTime>,
    pub project_path: Option<PathBuf>,
    pub title: Option<String>,
    pub has_subagent_sidecars: bool,
    pub raw_size_bytes: usize,
}

#[derive(Clone, Debug)]
pub struct ScanErrorInput {
    pub tool: distill_portal_ui_api_contracts::Tool,
    pub source_path: PathBuf,
    pub fingerprint: Option<String>,
    pub message: String,
}
