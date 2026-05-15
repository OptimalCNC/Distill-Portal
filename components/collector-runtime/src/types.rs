use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use distill_portal_ui_api_contracts::{TitleSource, Tool};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ParsedSession {
    pub tool: Tool,
    pub source_session_id: String,
    pub source_path: PathBuf,
    pub source_fingerprint: String,
    pub raw_bytes: Vec<u8>,
    pub created_at: Option<OffsetDateTime>,
    pub source_updated_at: Option<OffsetDateTime>,
    pub project_path: Option<PathBuf>,
    pub title: Option<String>,
    /// Phase 6: provenance of the resolved [`title`]. Invariant maintained at
    /// the ingest boundary: `title.is_some() == title_source.is_some()`.
    pub title_source: Option<TitleSource>,
    pub has_subagent_sidecars: bool,
}
