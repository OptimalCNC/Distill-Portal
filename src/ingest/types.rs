use std::{fmt, path::PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
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

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
