use std::path::PathBuf;

use distill_portal_collector_runtime::{
    safe_read_jsonl_bytes, ClaudeCodeAdapter, CodexAdapter, SessionAdapter,
};
use distill_portal_ui_api_contracts::Tool;
use tempfile::TempDir;

const CLAUDE_FIXTURE: &[u8] =
    include_bytes!("../../../tests/fixtures/claude_code/sample_session.jsonl");
const CODEX_FIXTURE: &[u8] = include_bytes!("../../../tests/fixtures/codex/sample_session.jsonl");
const CLAUDE_SESSION_ID: &str = "546104ba-031c-46f2-9b24-36b147c6b2f6";
const CODEX_SESSION_ID: &str = "019d7c37-119c-7740-96b0-84f86262cf05";

#[test]
fn safe_read_truncates_incomplete_trailing_line() {
    let safe =
        safe_read_jsonl_bytes(b"{\"ok\":1}\n{\"pending\":").expect("should keep complete lines");
    assert_eq!(safe.bytes, b"{\"ok\":1}\n");
    assert_eq!(safe.line_count(), 1);
}

#[test]
fn adapter_parsers_extract_expected_ids_and_metadata() {
    let tempdir = TempDir::new().unwrap();
    let claude_path = tempdir
        .path()
        .join("claude/projects/-home-huwei-ai-codings-distill-portal")
        .join(format!("{CLAUDE_SESSION_ID}.jsonl"));
    write_file(&claude_path, CLAUDE_FIXTURE);
    std::fs::create_dir_all(claude_path.with_extension("").join("subagents")).unwrap();
    let codex_path = tempdir
        .path()
        .join("codex/sessions/2026/04/11")
        .join(format!(
            "rollout-2026-04-11T19-04-37-{CODEX_SESSION_ID}.jsonl"
        ));
    write_file(&codex_path, CODEX_FIXTURE);

    let claude = ClaudeCodeAdapter;
    let claude_safe = safe_read_jsonl_bytes(CLAUDE_FIXTURE).unwrap();
    let claude_parsed = claude.parse(&claude_path, &claude_safe).unwrap();
    assert_eq!(claude_parsed.tool, Tool::ClaudeCode);
    assert_eq!(claude_parsed.source_session_id, CLAUDE_SESSION_ID);
    assert_eq!(
        claude_parsed.project_path,
        Some(PathBuf::from("/home/huwei/ai_codings/distill-portal"))
    );
    assert_eq!(
        claude_parsed.title.as_deref(),
        Some("phase-1-backend-foundation")
    );
    assert!(claude_parsed.has_subagent_sidecars);

    let codex = CodexAdapter;
    let codex_safe = safe_read_jsonl_bytes(CODEX_FIXTURE).unwrap();
    let codex_parsed = codex.parse(&codex_path, &codex_safe).unwrap();
    assert_eq!(codex_parsed.tool, Tool::Codex);
    assert_eq!(codex_parsed.source_session_id, CODEX_SESSION_ID);
    assert_eq!(
        codex_parsed.project_path,
        Some(PathBuf::from("/home/huwei/ai_codings/oh-my-codex"))
    );
    assert_eq!(
        codex_parsed.title.as_deref(),
        Some("Introduce omx and its subcommands.")
    );
    assert!(!codex_parsed.has_subagent_sidecars);
}

fn write_file(path: &std::path::Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, bytes).unwrap();
}
