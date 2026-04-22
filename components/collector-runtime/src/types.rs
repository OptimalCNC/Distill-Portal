use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use distill_portal_ui_api_contracts::Tool;

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
    pub has_subagent_sidecars: bool,
}
