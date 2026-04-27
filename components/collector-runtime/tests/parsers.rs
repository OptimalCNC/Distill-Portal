use std::path::PathBuf;

use distill_portal_collector_runtime::{
    safe_read_jsonl_bytes, ClaudeCodeAdapter, CodexAdapter, SessionAdapter,
};
use distill_portal_ui_api_contracts::Tool;
use tempfile::TempDir;
use time::format_description::well_known::Rfc3339;

const CLAUDE_FIXTURE: &[u8] =
    include_bytes!("../../../tests/fixtures/claude_code/sample_session.jsonl");
const CODEX_FIXTURE: &[u8] = include_bytes!("../../../tests/fixtures/codex/sample_session.jsonl");
const CLAUDE_SESSION_ID: &str = "546104ba-031c-46f2-9b24-36b147c6b2f6";
const CODEX_SESSION_ID: &str = "019d7c37-119c-7740-96b0-84f86262cf05";
const CODEX_FORKED_SESSION_ID: &str = "019dbe16-c54e-7b61-8b77-5163aa931556";
const CODEX_FORKED_FIXTURE: &[u8] = br#"{"timestamp":"2026-04-24T06:04:16.612Z","type":"session_meta","payload":{"id":"019dbe16-c54e-7b61-8b77-5163aa931556","forked_from_id":"019dbe11-a05d-7702-b4cd-2d7aab76eb8e","timestamp":"2026-04-24T06:04:16.605Z","cwd":"/child/project","source":{"subagent":{"thread_spawn":{"parent_thread_id":"019dbe11-a05d-7702-b4cd-2d7aab76eb8e"}}}}}
{"timestamp":"2026-04-24T06:04:16.615Z","type":"session_meta","payload":{"id":"019dbe11-a05d-7702-b4cd-2d7aab76eb8e","timestamp":"2026-04-24T05:58:39.481Z","cwd":"/parent/project"}}
{"timestamp":"2026-04-24T06:04:16.615Z","type":"event_msg","payload":{"type":"task_started","turn_id":"parent-turn","started_at":1777010547}}
{"timestamp":"2026-04-24T06:04:16.616Z","type":"event_msg","payload":{"type":"user_message","message":"parent prompt should not win"}}
{"timestamp":"2026-04-24T06:04:18.762Z","type":"event_msg","payload":{"type":"task_started","turn_id":"child-turn","started_at":1777010656}}
{"timestamp":"2026-04-24T06:04:18.763Z","type":"event_msg","payload":{"type":"user_message","message":"child prompt should win"}}
{"timestamp":"2026-04-24T06:04:18.764Z","type":"turn_context","payload":{"cwd":"/child/context"}}
"#;
const CODEX_UNRELATED_LATER_META_FIXTURE: &[u8] = br#"{"timestamp":"2026-04-24T06:04:16.612Z","type":"session_meta","payload":{"id":"019dbe16-c54e-7b61-8b77-5163aa931556","forked_from_id":"019dbe11-a05d-7702-b4cd-2d7aab76eb8e","timestamp":"2026-04-24T06:04:16.605Z","cwd":"/child/project"}}
{"timestamp":"2026-04-24T06:04:16.615Z","type":"session_meta","payload":{"id":"11111111-1111-4111-8111-111111111111","timestamp":"2026-04-24T05:58:39.481Z","cwd":"/unrelated/project"}}
"#;

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

#[test]
fn codex_parser_accepts_forked_session_parent_metadata() {
    let tempdir = TempDir::new().unwrap();
    let codex_path = tempdir
        .path()
        .join("codex/sessions/2026/04/24")
        .join(format!(
            "rollout-2026-04-24T14-04-16-{CODEX_FORKED_SESSION_ID}.jsonl"
        ));
    write_file(&codex_path, CODEX_FORKED_FIXTURE);

    let codex = CodexAdapter;
    let codex_safe = safe_read_jsonl_bytes(CODEX_FORKED_FIXTURE).unwrap();
    let codex_parsed = codex.parse(&codex_path, &codex_safe).unwrap();

    assert_eq!(codex_parsed.tool, Tool::Codex);
    assert_eq!(codex_parsed.source_session_id, CODEX_FORKED_SESSION_ID);
    assert_eq!(
        codex_parsed.project_path,
        Some(PathBuf::from("/child/project"))
    );
    assert_eq!(
        codex_parsed.title.as_deref(),
        Some("child prompt should win")
    );
    assert_eq!(
        codex_parsed.created_at.unwrap().format(&Rfc3339).unwrap(),
        "2026-04-24T06:04:16.605Z"
    );
    assert_eq!(
        codex_parsed
            .source_updated_at
            .unwrap()
            .format(&Rfc3339)
            .unwrap(),
        "2026-04-24T06:04:18.764Z"
    );
}

#[test]
fn codex_parser_rejects_unrelated_later_session_meta() {
    let tempdir = TempDir::new().unwrap();
    let codex_path = tempdir
        .path()
        .join("codex/sessions/2026/04/24")
        .join(format!(
            "rollout-2026-04-24T14-04-16-{CODEX_FORKED_SESSION_ID}.jsonl"
        ));
    write_file(&codex_path, CODEX_UNRELATED_LATER_META_FIXTURE);

    let codex = CodexAdapter;
    let codex_safe = safe_read_jsonl_bytes(CODEX_UNRELATED_LATER_META_FIXTURE).unwrap();
    let error = codex.parse(&codex_path, &codex_safe).unwrap_err();

    assert!(error.to_string().contains("not a known parent session id"));
}

fn write_file(path: &std::path::Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, bytes).unwrap();
}
