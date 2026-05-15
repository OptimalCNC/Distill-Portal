use std::path::PathBuf;

use distill_portal_collector_runtime::{
    safe_read_jsonl_bytes, ClaudeCodeAdapter, CodexAdapter, SessionAdapter,
};
use distill_portal_ui_api_contracts::{TitleSource, Tool};
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
    // Phase 6: the existing fixture carries a `custom-title` record, so the
    // resolved title source must be `Custom`. This pins the parser priority
    // — if a refactor accidentally promotes the first user message above
    // `customTitle`, the title text would change AND this assertion would
    // flip to `FirstUserMessage`.
    assert_eq!(claude_parsed.title_source, Some(TitleSource::Custom));
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
    // Phase 6: Codex has only one title path (first user_message), so
    // title_source must be FirstUserMessage when the title is present.
    assert_eq!(
        codex_parsed.title_source,
        Some(TitleSource::FirstUserMessage)
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
        codex_parsed.title_source,
        Some(TitleSource::FirstUserMessage)
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

// --- Phase 6 truth-table fixtures ----------------------------------------
//
// One in-line fixture per `TitleSource` outcome that the production fixture
// `tests/fixtures/claude_code/sample_session.jsonl` does NOT already cover.
// The shared sample covers `Custom`; the three additional fixtures below
// cover `FirstUserMessage`, `Slug`, and `None` for Claude Code, plus `None`
// for Codex. Together with the Codex `FirstUserMessage` assertion in the
// `adapter_parsers_extract_expected_ids_and_metadata` test, this satisfies
// spec §Testing line 232 (Claude Code: 3 + 1 None; Codex: 1 + 1 None).

const CLAUDE_FIRST_USER_FIXTURE: &[u8] = br#"{"parentUuid":null,"isSidechain":false,"promptId":"p1","type":"user","message":{"role":"user","content":"open the bug tracker"},"uuid":"u1","timestamp":"2026-04-18T14:19:29.506Z","cwd":"/tmp/example","sessionId":"00000000-0000-4000-8000-000000000001","slug":"unused-slug"}
"#;

const CLAUDE_SLUG_FIXTURE: &[u8] = br#"{"type":"permission-mode","permissionMode":"default","sessionId":"00000000-0000-4000-8000-000000000002","slug":"fallback-slug-title"}
"#;

const CLAUDE_NONE_FIXTURE: &[u8] = br#"{"type":"permission-mode","permissionMode":"default","sessionId":"00000000-0000-4000-8000-000000000003"}
"#;

const CODEX_NONE_FIXTURE: &[u8] = br#"{"timestamp":"2026-04-11T11:05:37.639Z","type":"session_meta","payload":{"id":"00000000-0000-4000-8000-000000000004","timestamp":"2026-04-11T11:04:37.030Z","cwd":"/tmp/codex","originator":"codex-tui","cli_version":"0.120.0","source":"cli","model_provider":"OpenAI"}}
{"timestamp":"2026-04-11T11:05:37.700Z","type":"turn_context","payload":{"turn_id":"t1","cwd":"/tmp/codex","current_date":"2026-04-11","timezone":"Asia/Shanghai"}}
"#;

#[test]
fn claude_parser_emits_first_user_message_source_when_no_custom_title() {
    let tempdir = TempDir::new().unwrap();
    let session_id = "00000000-0000-4000-8000-000000000001";
    let path = tempdir
        .path()
        .join("claude/projects/-tmp-example")
        .join(format!("{session_id}.jsonl"));
    write_file(&path, CLAUDE_FIRST_USER_FIXTURE);

    let safe = safe_read_jsonl_bytes(CLAUDE_FIRST_USER_FIXTURE).unwrap();
    let parsed = ClaudeCodeAdapter.parse(&path, &safe).unwrap();
    assert_eq!(parsed.title.as_deref(), Some("open the bug tracker"));
    assert_eq!(parsed.title_source, Some(TitleSource::FirstUserMessage));
}

#[test]
fn claude_parser_emits_slug_source_when_no_user_message_or_custom_title() {
    let tempdir = TempDir::new().unwrap();
    let session_id = "00000000-0000-4000-8000-000000000002";
    let path = tempdir
        .path()
        .join("claude/projects/-tmp-example")
        .join(format!("{session_id}.jsonl"));
    write_file(&path, CLAUDE_SLUG_FIXTURE);

    let safe = safe_read_jsonl_bytes(CLAUDE_SLUG_FIXTURE).unwrap();
    let parsed = ClaudeCodeAdapter.parse(&path, &safe).unwrap();
    assert_eq!(parsed.title.as_deref(), Some("fallback-slug-title"));
    assert_eq!(parsed.title_source, Some(TitleSource::Slug));
}

#[test]
fn claude_parser_emits_none_when_no_source_resolves() {
    let tempdir = TempDir::new().unwrap();
    let session_id = "00000000-0000-4000-8000-000000000003";
    let path = tempdir
        .path()
        .join("claude/projects/-tmp-example")
        .join(format!("{session_id}.jsonl"));
    write_file(&path, CLAUDE_NONE_FIXTURE);

    let safe = safe_read_jsonl_bytes(CLAUDE_NONE_FIXTURE).unwrap();
    let parsed = ClaudeCodeAdapter.parse(&path, &safe).unwrap();
    assert!(parsed.title.is_none());
    assert!(parsed.title_source.is_none());
}

#[test]
fn codex_parser_emits_none_when_no_user_message_present() {
    let tempdir = TempDir::new().unwrap();
    let session_id = "00000000-0000-4000-8000-000000000004";
    let path = tempdir
        .path()
        .join("codex/sessions/2026/04/11")
        .join(format!("rollout-2026-04-11T19-04-37-{session_id}.jsonl"));
    write_file(&path, CODEX_NONE_FIXTURE);

    let safe = safe_read_jsonl_bytes(CODEX_NONE_FIXTURE).unwrap();
    let parsed = CodexAdapter.parse(&path, &safe).unwrap();
    assert!(parsed.title.is_none());
    assert!(parsed.title_source.is_none());
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
