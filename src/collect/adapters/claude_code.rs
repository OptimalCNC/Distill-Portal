use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

use serde_json::Value;
use time::OffsetDateTime;

use crate::{
    collect::safe_read::SafeRead,
    ingest::types::{ParsedSession, Tool},
};

use super::{
    file_mtime, fingerprint_bytes, normalize_title, parse_jsonl, parse_rfc3339_timestamp,
    string_field, string_pointer, AdapterError, SessionAdapter,
};

#[derive(Clone, Debug, Default)]
pub struct ClaudeCodeAdapter;

impl SessionAdapter for ClaudeCodeAdapter {
    fn tool(&self) -> Tool {
        Tool::ClaudeCode
    }

    fn discover(&self, roots: &[PathBuf]) -> Result<Vec<PathBuf>, AdapterError> {
        let mut discovered = Vec::new();

        for root in roots {
            if !root.exists() {
                continue;
            }
            if !root.is_dir() {
                return Err(AdapterError::invalid(
                    root,
                    "configured Claude root is not a directory",
                ));
            }

            let project_dirs =
                fs::read_dir(root).map_err(|source| AdapterError::io(root, source))?;
            for project_dir in project_dirs {
                let project_dir = project_dir.map_err(|source| AdapterError::io(root, source))?;
                let file_type = project_dir
                    .file_type()
                    .map_err(|source| AdapterError::io(project_dir.path(), source))?;
                if !file_type.is_dir() {
                    continue;
                }

                let session_entries = fs::read_dir(project_dir.path())
                    .map_err(|source| AdapterError::io(project_dir.path(), source))?;
                for session_entry in session_entries {
                    let session_entry = session_entry
                        .map_err(|source| AdapterError::io(project_dir.path(), source))?;
                    let file_type = session_entry
                        .file_type()
                        .map_err(|source| AdapterError::io(session_entry.path(), source))?;
                    if !file_type.is_file()
                        || session_entry.path().extension() != Some(OsStr::new("jsonl"))
                    {
                        continue;
                    }
                    discovered.push(session_entry.path());
                }
            }
        }

        discovered.sort();
        discovered.dedup();
        Ok(discovered)
    }

    fn parse(&self, path: &Path, safe_read: &SafeRead) -> Result<ParsedSession, AdapterError> {
        let source_session_id = filename_stem(path)?;
        let records = parse_jsonl(path, &safe_read.bytes)?;
        let file_timestamp = file_mtime(path)?;

        let mut created_at = None;
        let mut source_updated_at = None;
        let mut project_path = None;
        let mut title = None;
        let mut custom_title_value = None;
        let mut slug = None;

        for (line_number, record) in records.iter().enumerate() {
            let line_number = line_number + 1;

            if let Some(session_id) = string_field(record, "sessionId") {
                if session_id != source_session_id {
                    return Err(AdapterError::invalid(
                        path,
                        format!(
                            "line {line_number} has sessionId {session_id} but filename id is {source_session_id}"
                        ),
                    ));
                }
            }

            if let Some(timestamp) = string_field(record, "timestamp") {
                let timestamp = parse_rfc3339_timestamp(path, line_number, timestamp)?;
                created_at = Some(min_timestamp(created_at, timestamp));
                source_updated_at = Some(max_timestamp(source_updated_at, timestamp));
            }

            if project_path.is_none() {
                project_path = string_field(record, "cwd").map(PathBuf::from);
            }

            if slug.is_none() {
                slug = string_field(record, "slug").and_then(normalize_title);
            }

            if custom_title_value.is_none() {
                custom_title_value = custom_title(record);
            }

            if title.is_none() {
                title = first_human_prompt(record);
            }
        }

        let title = custom_title_value.or(title).or(slug);
        let created_at = created_at.or(file_timestamp);
        let source_updated_at = source_updated_at.or(file_timestamp);
        let project_path = project_path.or_else(|| fallback_project_path(path));

        Ok(ParsedSession {
            tool: Tool::ClaudeCode,
            source_session_id,
            source_path: path.to_path_buf(),
            source_fingerprint: fingerprint_bytes(&safe_read.bytes),
            raw_bytes: safe_read.bytes.clone(),
            created_at,
            source_updated_at,
            project_path,
            title,
            has_subagent_sidecars: sidecar_dir(path).is_dir(),
        })
    }
}

fn filename_stem(path: &Path) -> Result<String, AdapterError> {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .ok_or_else(|| AdapterError::invalid(path, "session filename is missing a UTF-8 stem"))
}

fn custom_title(record: &Value) -> Option<String> {
    if string_field(record, "type") != Some("custom-title") {
        return None;
    }

    string_field(record, "customTitle")
        .or_else(|| string_pointer(record, "/message/customTitle"))
        .and_then(normalize_title)
}

fn first_human_prompt(record: &Value) -> Option<String> {
    if string_field(record, "type") != Some("user") {
        return None;
    }

    extract_user_content(record.pointer("/message/content")?)
}

fn extract_user_content(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => normalize_title(text),
        Value::Array(items) => {
            if items.iter().all(is_tool_result_item) {
                return None;
            }

            let pieces = items
                .iter()
                .filter_map(content_item_text)
                .collect::<Vec<_>>();
            if pieces.is_empty() {
                None
            } else {
                normalize_title(&pieces.join(" "))
            }
        }
        Value::Object(_) => {
            if is_tool_result_item(value) {
                None
            } else {
                content_item_text(value)
            }
        }
        _ => None,
    }
}

fn content_item_text(value: &Value) -> Option<String> {
    if is_tool_result_item(value) {
        return None;
    }

    value
        .get("text")
        .and_then(Value::as_str)
        .or_else(|| value.get("content").and_then(Value::as_str))
        .and_then(normalize_title)
}

fn is_tool_result_item(value: &Value) -> bool {
    value.get("type").and_then(Value::as_str) == Some("tool_result")
}

fn sidecar_dir(path: &Path) -> PathBuf {
    path.with_extension("").join("subagents")
}

fn fallback_project_path(path: &Path) -> Option<PathBuf> {
    let project_key = path.parent()?.file_name()?.to_str()?;
    if !project_key.starts_with('-') {
        return None;
    }

    let decoded = project_key.trim_start_matches('-').replace('-', "/");
    normalize_title(&decoded).map(|decoded| PathBuf::from(format!("/{decoded}")))
}

fn max_timestamp(current: Option<OffsetDateTime>, candidate: OffsetDateTime) -> OffsetDateTime {
    match current {
        Some(current) if current > candidate => current,
        _ => candidate,
    }
}

fn min_timestamp(current: Option<OffsetDateTime>, candidate: OffsetDateTime) -> OffsetDateTime {
    match current {
        Some(current) if current < candidate => current,
        _ => candidate,
    }
}
