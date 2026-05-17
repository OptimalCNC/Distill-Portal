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
#[cfg_attr(feature = "ts-bindings", ts(export_to = "SessionSyncStatus.ts"))]
#[serde(rename_all = "snake_case")]
pub enum SessionSyncStatus {
    NotStored,
    UpToDate,
    Outdated,
    SourceMissing,
}

/// Provenance of a session's resolved [`title`](SourceSessionView::title).
///
/// Captured at parse time and round-tripped through the persisted sessions
/// table. `None` (NULL in SQL) means the value is unknown — either because
/// the title itself was missing (no usable source produced one) or because
/// the row was ingested before Phase 6 introduced this field.
///
/// Invariant maintained by the ingest layer: `title.is_some()` iff
/// `title_source.is_some()`. The reverse direction (consumer code) treats
/// `None` as "unknown source; render no caption".
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "TitleSource.ts"))]
#[serde(rename_all = "snake_case")]
pub enum TitleSource {
    /// Title brought in from the original coding session (e.g. Claude Code's
    /// `custom-title` record).
    Custom,
    /// Extracted from the first user message in the session.
    FirstUserMessage,
    /// Derived from the session's source path as a final fallback when no
    /// usable message text was found (Claude Code only).
    Slug,
    /// AI-generated title. Reserved enum value: never emitted by Phase 6
    /// parsers, but accepted by the serde/SQL boundary so a later phase can
    /// populate it without a second migration.
    Generated,
}

impl TitleSource {
    /// Stable snake_case representation used both by serde and by the SQLite
    /// column. Keeping this method co-located with the variants makes the
    /// round-trip mapping unambiguous: write `as_str()` into the DB, read
    /// `from_str()` back out.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Custom => "custom",
            Self::FirstUserMessage => "first_user_message",
            Self::Slug => "slug",
            Self::Generated => "generated",
        }
    }
}

impl fmt::Display for TitleSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ParseTitleSourceError;

impl fmt::Display for ParseTitleSourceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("unknown title source")
    }
}

impl std::error::Error for ParseTitleSourceError {}

impl FromStr for TitleSource {
    type Err = ParseTitleSourceError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "custom" => Ok(Self::Custom),
            "first_user_message" => Ok(Self::FirstUserMessage),
            "slug" => Ok(Self::Slug),
            "generated" => Ok(Self::Generated),
            _ => Err(ParseTitleSourceError),
        }
    }
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
#[cfg_attr(feature = "ts-bindings", ts(export_to = "SourceSessionView.ts"))]
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
    pub title_source: Option<TitleSource>,
    pub has_subagent_sidecars: bool,
    pub status: SessionSyncStatus,
    pub session_uid: Option<String>,
    pub stored_ingested_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "StoredSessionRecord.ts"))]
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
    pub title_source: Option<TitleSource>,
    pub has_subagent_sidecars: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "StoredSessionView.ts"))]
pub struct StoredSessionView {
    #[serde(flatten)]
    #[cfg_attr(feature = "ts-bindings", ts(flatten))]
    pub session: StoredSessionRecord,
    pub status: SessionSyncStatus,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "PersistedScanError.ts"))]
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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "OperationKind.ts"))]
#[serde(rename_all = "snake_case")]
pub enum OperationKind {
    ImportSessions,
    RescanSources,
}

impl OperationKind {
    pub const ALL: [Self; 2] = [Self::ImportSessions, Self::RescanSources];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::ImportSessions => "import_sessions",
            Self::RescanSources => "rescan_sources",
        }
    }
}

impl fmt::Display for OperationKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ParseOperationKindError;

impl fmt::Display for ParseOperationKindError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("unknown operation kind")
    }
}

impl std::error::Error for ParseOperationKindError {}

impl FromStr for OperationKind {
    type Err = ParseOperationKindError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "import_sessions" => Ok(Self::ImportSessions),
            "rescan_sources" => Ok(Self::RescanSources),
            _ => Err(ParseOperationKindError),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "OperationStatus.ts"))]
#[serde(rename_all = "snake_case")]
pub enum OperationStatus {
    Queued,
    Running,
    CancelRequested,
    Succeeded,
    Failed,
    Cancelled,
    Interrupted,
}

impl OperationStatus {
    pub const ALL: [Self; 7] = [
        Self::Queued,
        Self::Running,
        Self::CancelRequested,
        Self::Succeeded,
        Self::Failed,
        Self::Cancelled,
        Self::Interrupted,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::CancelRequested => "cancel_requested",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Succeeded | Self::Failed | Self::Cancelled | Self::Interrupted
        )
    }

    pub fn blocks_idempotency(self) -> bool {
        matches!(
            self,
            Self::Queued | Self::Running | Self::CancelRequested | Self::Succeeded
        )
    }
}

impl fmt::Display for OperationStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ParseOperationStatusError;

impl fmt::Display for ParseOperationStatusError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("unknown operation status")
    }
}

impl std::error::Error for ParseOperationStatusError {}

impl FromStr for OperationStatus {
    type Err = ParseOperationStatusError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "cancel_requested" => Ok(Self::CancelRequested),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            "interrupted" => Ok(Self::Interrupted),
            _ => Err(ParseOperationStatusError),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "Operation.ts"))]
pub struct Operation {
    pub id: String,
    pub kind: OperationKind,
    pub status: OperationStatus,
    pub canonical_params_hash: String,
    pub input_version: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "unknown"))]
    pub params_json: serde_json::Value,
    #[cfg_attr(feature = "ts-bindings", ts(type = "unknown | null"))]
    pub result_json: Option<serde_json::Value>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "unknown | null"))]
    pub error_json: Option<serde_json::Value>,
    pub submitted_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub cancel_requested_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "SubmitOperationResponse.ts"))]
pub struct SubmitOperationResponse {
    pub operation_id: String,
    pub status: OperationStatus,
    pub kind: OperationKind,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "OperationsListResponse.ts"))]
pub struct OperationsListResponse {
    pub operations: Vec<Operation>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "OperationsListQuery.ts"))]
pub struct OperationsListQuery {
    pub status: Option<Vec<OperationStatus>>,
    pub kind: Option<Vec<OperationKind>>,
    pub limit: Option<usize>,
}

pub fn source_key(tool: Tool, source_session_id: &str) -> String {
    format!("{}:{}", tool.as_str(), source_session_id)
}
