use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "Tool.ts"))]
#[serde(rename_all = "snake_case")]
pub enum Tool {
    ClaudeCode,
    Codex,
}

impl Tool {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude_code",
            Self::Codex => "codex",
        }
    }
}

impl fmt::Display for Tool {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ParseToolError;

impl fmt::Display for ParseToolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("unknown tool")
    }
}

impl std::error::Error for ParseToolError {}

impl FromStr for Tool {
    type Err = ParseToolError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "claude_code" => Ok(Self::ClaudeCode),
            "codex" => Ok(Self::Codex),
            _ => Err(ParseToolError),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts-bindings",
    ts(export_to = "SessionSyncStatus.ts")
)]
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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts-bindings",
    ts(export_to = "SourceSessionView.ts")
)]
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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts-bindings",
    ts(export_to = "StoredSessionRecord.ts")
)]
pub struct StoredSessionRecord {
    pub session_uid: String,
    pub tool: Tool,
    pub source_session_id: String,
    pub source_path: String,
    pub source_fingerprint: String,
    pub raw_ref: String,
    pub created_at: Option<String>,
    pub source_updated_at: Option<String>,
    pub ingested_at: String,
    pub project_path: Option<String>,
    pub title: Option<String>,
    pub has_subagent_sidecars: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts-bindings",
    ts(export_to = "StoredSessionView.ts")
)]
pub struct StoredSessionView {
    #[serde(flatten)]
    #[cfg_attr(feature = "ts-bindings", ts(flatten))]
    pub session: StoredSessionRecord,
    pub status: SessionSyncStatus,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts-bindings",
    ts(export_to = "PersistedScanError.ts")
)]
pub struct PersistedScanError {
    pub error_id: String,
    pub tool: Tool,
    pub source_path: String,
    pub fingerprint: Option<String>,
    pub message: String,
    pub first_seen_at: String,
    pub last_seen_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "RescanReport.ts"))]
pub struct RescanReport {
    pub discovered_files: usize,
    pub skipped_files: usize,
    pub parsed_sessions: usize,
    pub not_stored_sessions: usize,
    pub outdated_sessions: usize,
    pub up_to_date_sessions: usize,
    pub scan_errors: usize,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "ImportReport.ts"))]
pub struct ImportReport {
    pub requested_sessions: usize,
    pub inserted_sessions: usize,
    pub updated_sessions: usize,
    pub unchanged_sessions: usize,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts-bindings",
    ts(export_to = "ImportSourceSessionsRequest.ts")
)]
pub struct ImportSourceSessionsRequest {
    pub session_keys: Vec<String>,
}

pub fn source_key(tool: Tool, source_session_id: &str) -> String {
    format!("{}:{}", tool.as_str(), source_session_id)
}
