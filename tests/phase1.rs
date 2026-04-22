use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    time::Duration,
};

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use distill_portal::{
    app::{
        App, ImportReport, RescanReport, SessionSyncStatus, SourceSessionView, StoredSessionView,
    },
    collect::{safe_read_jsonl_bytes, ClaudeCodeAdapter, CodexAdapter, SessionAdapter},
    config::Config,
    ingest::Tool,
};
use serde_json::json;
use tempfile::TempDir;
use tower::util::ServiceExt;

const CLAUDE_FIXTURE: &[u8] = include_bytes!("fixtures/claude_code/sample_session.jsonl");
const CODEX_FIXTURE: &[u8] = include_bytes!("fixtures/codex/sample_session.jsonl");
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

#[tokio::test]
async fn home_page_renders_minimal_http_surface() {
    let tempdir = TempDir::new().unwrap();
    let (claude_root, codex_root, _, _) = seed_both_sources(tempdir.path());
    let app = App::bootstrap(test_config(
        tempdir.path().join("data"),
        vec![claude_root],
        vec![codex_root],
    ))
    .await
    .unwrap();

    let response = app
        .router()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = String::from_utf8(
        to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    assert!(body.contains("Source Sessions"));
    assert!(body.contains("Stored Sessions"));
    assert!(body.contains("Save Selected Sessions"));
}

#[tokio::test]
async fn startup_discovers_source_sessions_without_auto_importing() {
    let tempdir = TempDir::new().unwrap();
    let (claude_root, codex_root, _, _) = seed_both_sources(tempdir.path());
    let app = App::bootstrap(test_config(
        tempdir.path().join("data"),
        vec![claude_root],
        vec![codex_root],
    ))
    .await
    .unwrap();

    let source_sessions: Vec<SourceSessionView> = get_json(&app, "/api/v1/source-sessions").await;
    assert_eq!(source_sessions.len(), 2);
    assert!(source_sessions
        .iter()
        .all(|session| session.status == SessionSyncStatus::NotStored));

    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    assert!(stored_sessions.is_empty());
}

#[tokio::test]
async fn importing_selected_session_saves_it_and_marks_it_up_to_date() {
    let tempdir = TempDir::new().unwrap();
    let claude_root = seed_claude_source(tempdir.path(), CLAUDE_FIXTURE);
    let app = App::bootstrap(test_config(
        tempdir.path().join("data"),
        vec![claude_root],
        vec![],
    ))
    .await
    .unwrap();

    let key = source_key(Tool::ClaudeCode, CLAUDE_SESSION_ID);
    let import_report: ImportReport = post_json_with_body(
        &app,
        "/api/v1/source-sessions/import",
        json!({ "session_keys": [key] }),
    )
    .await;
    assert_eq!(import_report.requested_sessions, 1);
    assert_eq!(import_report.inserted_sessions, 1);

    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    assert_eq!(stored_sessions.len(), 1);
    let stored = &stored_sessions[0];
    assert_eq!(stored.status, SessionSyncStatus::UpToDate);

    let raw = get_raw(&app, &stored.session.session_uid).await;
    assert_eq!(raw.as_slice(), CLAUDE_FIXTURE);
}

#[tokio::test]
async fn rescan_marks_saved_session_outdated_until_reimported() {
    let tempdir = TempDir::new().unwrap();
    let claude_root = seed_claude_source(tempdir.path(), CLAUDE_FIXTURE);
    let app = App::bootstrap(test_config(
        tempdir.path().join("data"),
        vec![claude_root.clone()],
        vec![],
    ))
    .await
    .unwrap();

    let key = source_key(Tool::ClaudeCode, CLAUDE_SESSION_ID);
    let _: ImportReport = post_json_with_body(
        &app,
        "/api/v1/source-sessions/import",
        json!({ "session_keys": [key.clone()] }),
    )
    .await;
    let before: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    let before_uid = before[0].session.session_uid.clone();

    let source_path = claude_root
        .join("-home-huwei-ai-codings-distill-portal")
        .join(format!("{CLAUDE_SESSION_ID}.jsonl"));
    append_to_file(
        &source_path,
        format!(
            "{{\"type\":\"last-prompt\",\"lastPrompt\":\"phase 1 updated\",\"sessionId\":\"{CLAUDE_SESSION_ID}\"}}\n"
        )
        .as_bytes(),
    );

    let rescan: RescanReport = post_empty_json(&app, "/api/v1/admin/rescan").await;
    assert_eq!(rescan.outdated_sessions, 1);
    assert_eq!(rescan.up_to_date_sessions, 0);

    let source_sessions: Vec<SourceSessionView> = get_json(&app, "/api/v1/source-sessions").await;
    let source = session_by_source_key(&source_sessions, &key);
    assert_eq!(source.status, SessionSyncStatus::Outdated);

    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    let stored = &stored_sessions[0];
    assert_eq!(stored.status, SessionSyncStatus::Outdated);

    let import_report: ImportReport = post_json_with_body(
        &app,
        "/api/v1/source-sessions/import",
        json!({ "session_keys": [key] }),
    )
    .await;
    assert_eq!(import_report.updated_sessions, 1);

    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    let stored = &stored_sessions[0];
    assert_eq!(stored.status, SessionSyncStatus::UpToDate);
    assert_eq!(stored.session.session_uid, before_uid);

    let raw = get_raw(&app, &stored.session.session_uid).await;
    assert!(std::str::from_utf8(&raw)
        .unwrap()
        .contains("\"lastPrompt\":\"phase 1 updated\""));
}

#[tokio::test]
async fn incomplete_trailing_line_is_ignored_until_completed_and_reimported() {
    let tempdir = TempDir::new().unwrap();
    let partial = format!(
        "{{\"type\":\"last-prompt\",\"lastPrompt\":\"phase 1 partial\",\"sessionId\":\"{CLAUDE_SESSION_ID}"
    );
    let mut bytes = CLAUDE_FIXTURE.to_vec();
    bytes.extend_from_slice(partial.as_bytes());
    let claude_root = seed_claude_source(tempdir.path(), &bytes);
    let app = App::bootstrap(test_config(
        tempdir.path().join("data"),
        vec![claude_root.clone()],
        vec![],
    ))
    .await
    .unwrap();

    let key = source_key(Tool::ClaudeCode, CLAUDE_SESSION_ID);
    let _: ImportReport = post_json_with_body(
        &app,
        "/api/v1/source-sessions/import",
        json!({ "session_keys": [key.clone()] }),
    )
    .await;
    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    let stored = &stored_sessions[0];
    let raw_before = get_raw(&app, &stored.session.session_uid).await;
    assert_eq!(raw_before.as_slice(), CLAUDE_FIXTURE);

    let source_path = claude_root
        .join("-home-huwei-ai-codings-distill-portal")
        .join(format!("{CLAUDE_SESSION_ID}.jsonl"));
    append_to_file(&source_path, b"\"}\n");
    let rescan: RescanReport = post_empty_json(&app, "/api/v1/admin/rescan").await;
    assert_eq!(rescan.outdated_sessions, 1);

    let _: ImportReport = post_json_with_body(
        &app,
        "/api/v1/source-sessions/import",
        json!({ "session_keys": [key] }),
    )
    .await;
    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    let stored = &stored_sessions[0];
    let raw_after = get_raw(&app, &stored.session.session_uid).await;
    assert!(std::str::from_utf8(&raw_after)
        .unwrap()
        .contains("\"lastPrompt\":\"phase 1 partial\""));
}

#[tokio::test]
async fn startup_sweep_removes_orphan_and_temp_blobs() {
    let tempdir = TempDir::new().unwrap();
    let data_dir = tempdir.path().join("data");
    let orphan_addr = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let orphan_path = data_dir
        .join("blobs")
        .join("aa")
        .join("aa")
        .join(orphan_addr);
    let temp_blob = data_dir
        .join("blobs")
        .join("aa")
        .join("aa")
        .join(".tmp-startup.blob");
    write_file(&orphan_path, b"orphan");
    write_file(&temp_blob, b"temp");

    let _app = App::bootstrap(test_config(data_dir.clone(), vec![], vec![]))
        .await
        .unwrap();

    assert!(!orphan_path.exists());
    assert!(!temp_blob.exists());
}

#[tokio::test]
async fn data_survives_backend_restart() {
    let tempdir = TempDir::new().unwrap();
    let claude_root = seed_claude_source(tempdir.path(), CLAUDE_FIXTURE);
    let config = test_config(tempdir.path().join("data"), vec![claude_root], vec![]);

    let first_app = App::bootstrap(config.clone()).await.unwrap();
    let key = source_key(Tool::ClaudeCode, CLAUDE_SESSION_ID);
    let _: ImportReport = post_json_with_body(
        &first_app,
        "/api/v1/source-sessions/import",
        json!({ "session_keys": [key] }),
    )
    .await;
    let first_sessions: Vec<StoredSessionView> = get_json(&first_app, "/api/v1/sessions").await;
    assert_eq!(first_sessions.len(), 1);
    let first = first_sessions[0].session.clone();
    drop(first_app);

    let second_app = App::bootstrap(config).await.unwrap();
    let second_sessions: Vec<StoredSessionView> = get_json(&second_app, "/api/v1/sessions").await;
    assert_eq!(second_sessions.len(), 1);
    let second = &second_sessions[0];
    assert_eq!(second.session.session_uid, first.session_uid);
    assert_eq!(second.status, SessionSyncStatus::UpToDate);

    let raw = get_raw(&second_app, &second.session.session_uid).await;
    assert_eq!(raw.as_slice(), CLAUDE_FIXTURE);
}

fn seed_both_sources(base: &Path) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    let claude_root = seed_claude_source(base, CLAUDE_FIXTURE);
    let codex_root = base.join("sources/codex/sessions");
    let codex_path = codex_root.join("2026/04/11").join(format!(
        "rollout-2026-04-11T19-04-37-{CODEX_SESSION_ID}.jsonl"
    ));
    write_file(&codex_path, CODEX_FIXTURE);
    let claude_path = claude_root
        .join("-home-huwei-ai-codings-distill-portal")
        .join(format!("{CLAUDE_SESSION_ID}.jsonl"));
    (claude_root, codex_root, claude_path, codex_path)
}

fn seed_claude_source(base: &Path, bytes: &[u8]) -> PathBuf {
    let claude_root = base.join("sources/claude/projects");
    let claude_path = claude_root
        .join("-home-huwei-ai-codings-distill-portal")
        .join(format!("{CLAUDE_SESSION_ID}.jsonl"));
    write_file(&claude_path, bytes);
    claude_root
}

fn test_config(data_dir: PathBuf, claude_roots: Vec<PathBuf>, codex_roots: Vec<PathBuf>) -> Config {
    Config::new(
        data_dir,
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        Duration::from_secs(3_600),
        claude_roots,
        codex_roots,
    )
}

fn write_file(path: &Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, bytes).unwrap();
}

fn append_to_file(path: &Path, bytes: &[u8]) {
    use std::io::Write;

    let mut file = std::fs::OpenOptions::new().append(true).open(path).unwrap();
    file.write_all(bytes).unwrap();
}

async fn get_json<T: serde::de::DeserializeOwned>(app: &App, uri: &str) -> T {
    let response = app
        .router()
        .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

async fn post_empty_json<T: serde::de::DeserializeOwned>(app: &App, uri: &str) -> T {
    post_json_with_body(app, uri, json!({})).await
}

async fn post_json_with_body<T: serde::de::DeserializeOwned>(
    app: &App,
    uri: &str,
    body: serde_json::Value,
) -> T {
    let response = app
        .router()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

async fn get_raw(app: &App, session_uid: &str) -> Vec<u8> {
    let response = app
        .router()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/sessions/{session_uid}/raw"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec()
}

fn session_by_source_key<'a>(
    sessions: &'a [SourceSessionView],
    session_key: &str,
) -> &'a SourceSessionView {
    sessions
        .iter()
        .find(|session| session.session_key == session_key)
        .unwrap()
}

fn source_key(tool: Tool, source_session_id: &str) -> String {
    format!("{}:{source_session_id}", tool.as_str())
}
