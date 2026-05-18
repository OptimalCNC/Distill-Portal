use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    time::Duration,
};

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use distill_portal_backend::App;
use distill_portal_configuration::BackendConfig;
use distill_portal_operations::{NewOperation, OperationKind, OperationStatus, OperationsStore};
use distill_portal_ui_api_contracts::{
    source_key, ImportReport, Operation, OperationTransitionEvent, OperationsListResponse,
    RescanReport, SessionSyncStatus, SourceSessionView, StoredSessionView, SubmitOperationResponse,
    TitleSource, Tool,
};
use serde_json::json;
use tempfile::TempDir;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::oneshot,
};
use tower::util::ServiceExt;

const CLAUDE_FIXTURE: &[u8] =
    include_bytes!("../../../tests/fixtures/claude_code/sample_session.jsonl");
const CODEX_FIXTURE: &[u8] = include_bytes!("../../../tests/fixtures/codex/sample_session.jsonl");
const CLAUDE_SESSION_ID: &str = "546104ba-031c-46f2-9b24-36b147c6b2f6";
const CODEX_SESSION_ID: &str = "019d7c37-119c-7740-96b0-84f86262cf05";

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
    // Phase 6: contract symmetry — the parser-direct source view carries
    // `title_source` for both tool fixtures. Claude's sample has a
    // `custom-title` record (Custom); Codex's sample has only a first
    // user_message (FirstUserMessage).
    let claude_source = source_sessions
        .iter()
        .find(|session| session.tool == Tool::ClaudeCode)
        .expect("claude source row");
    assert_eq!(claude_source.title_source, Some(TitleSource::Custom));
    let codex_source = source_sessions
        .iter()
        .find(|session| session.tool == Tool::Codex)
        .expect("codex source row");
    assert_eq!(
        codex_source.title_source,
        Some(TitleSource::FirstUserMessage)
    );

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
    let import_response = submit_import_operation(&app, vec![key]).await;
    assert_eq!(import_response.kind, OperationKind::ImportSessions);
    let import_report: ImportReport =
        wait_http_operation_success(&app, &import_response.operation_id).await;
    assert_eq!(import_report.requested_sessions, 1);
    assert_eq!(import_report.inserted_sessions, 1);

    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    assert_eq!(stored_sessions.len(), 1);
    let stored = &stored_sessions[0];
    assert_eq!(stored.status, SessionSyncStatus::UpToDate);
    // Phase 6: after import, the stored view round-trips through SQLite
    // and surfaces the same `title_source` the parser emitted.
    assert_eq!(stored.session.title_source, Some(TitleSource::Custom));

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
    let import_response = submit_import_operation(&app, vec![key.clone()]).await;
    let _: ImportReport = wait_http_operation_success(&app, &import_response.operation_id).await;
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

    let rescan_response = submit_rescan_operation(&app).await;
    let rescan: RescanReport =
        wait_http_operation_success(&app, &rescan_response.operation_id).await;
    assert_eq!(rescan.outdated_sessions, 1);
    assert_eq!(rescan.up_to_date_sessions, 0);

    let source_sessions: Vec<SourceSessionView> = get_json(&app, "/api/v1/source-sessions").await;
    let source = session_by_source_key(&source_sessions, &key);
    assert_eq!(source.status, SessionSyncStatus::Outdated);

    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    let stored = &stored_sessions[0];
    assert_eq!(stored.status, SessionSyncStatus::Outdated);

    let import_response = submit_import_operation(&app, vec![key]).await;
    let import_report: ImportReport =
        wait_http_operation_success(&app, &import_response.operation_id).await;
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
    let import_response = submit_import_operation(&app, vec![key.clone()]).await;
    let _: ImportReport = wait_http_operation_success(&app, &import_response.operation_id).await;
    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    let stored = &stored_sessions[0];
    let raw_before = get_raw(&app, &stored.session.session_uid).await;
    assert_eq!(raw_before.as_slice(), CLAUDE_FIXTURE);

    let source_path = claude_root
        .join("-home-huwei-ai-codings-distill-portal")
        .join(format!("{CLAUDE_SESSION_ID}.jsonl"));
    append_to_file(&source_path, b"\"}\n");
    let rescan_response = submit_rescan_operation(&app).await;
    let rescan: RescanReport =
        wait_http_operation_success(&app, &rescan_response.operation_id).await;
    assert_eq!(rescan.outdated_sessions, 1);

    let import_response = submit_import_operation(&app, vec![key]).await;
    let _: ImportReport = wait_http_operation_success(&app, &import_response.operation_id).await;
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
    let import_response = submit_import_operation(&first_app, vec![key]).await;
    let _: ImportReport =
        wait_http_operation_success(&first_app, &import_response.operation_id).await;
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

#[tokio::test]
async fn import_submit_is_idempotent_and_exposes_operation_endpoints() {
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
    let first = submit_import_operation(&app, vec![key.clone()]).await;
    let second = submit_import_operation(&app, vec![key]).await;
    assert_eq!(second.operation_id, first.operation_id);
    assert_eq!(second.kind, OperationKind::ImportSessions);

    let report: ImportReport = wait_http_operation_success(&app, &first.operation_id).await;
    assert_eq!(report.inserted_sessions, 1);

    let operation: Operation =
        get_json(&app, &format!("/api/v1/operations/{}", first.operation_id)).await;
    assert_eq!(operation.status, OperationStatus::Succeeded);
    assert_eq!(operation.kind, OperationKind::ImportSessions);

    let list: OperationsListResponse =
        get_json(&app, "/api/v1/operations?kind=import_sessions&limit=10").await;
    assert_eq!(list.operations.len(), 1);
    assert_eq!(list.operations[0].id, first.operation_id);
}

#[tokio::test]
async fn delete_operation_requests_cancel_and_worker_completes_queued_cancel() {
    let tempdir = TempDir::new().unwrap();
    let app = App::bootstrap(test_config(tempdir.path().join("data"), vec![], vec![]))
        .await
        .unwrap();
    let store = app.state().operations_store();
    let operation = store
        .insert(new_operation(
            OperationKind::RescanSources,
            "delete-queued",
            json!({}),
        ))
        .unwrap();

    let cancel_requested = delete_operation(&app, &operation.id, StatusCode::OK).await;
    assert_eq!(cancel_requested.status, OperationStatus::CancelRequested);
    assert_eq!(cancel_requested.kind, OperationKind::RescanSources);

    let cancelled =
        wait_http_operation_status(&app, &operation.id, OperationStatus::Cancelled).await;
    assert_eq!(cancelled.status, OperationStatus::Cancelled);

    assert_eq!(
        delete_operation_status(&app, &operation.id).await,
        StatusCode::CONFLICT
    );
}

#[tokio::test]
async fn startup_reconciles_in_flight_operations_as_interrupted() {
    let tempdir = TempDir::new().unwrap();
    let data_dir = tempdir.path().join("data");
    let operations_store = OperationsStore::open(data_dir.join("distill.db")).unwrap();
    let running = operations_store
        .insert(new_operation(
            OperationKind::ImportSessions,
            "boot-running",
            json!({}),
        ))
        .unwrap();
    let cancel_requested = operations_store
        .insert(new_operation(
            OperationKind::RescanSources,
            "boot-cancel",
            json!({}),
        ))
        .unwrap();
    operations_store
        .update_status(&running.id, OperationStatus::Running)
        .unwrap()
        .unwrap();
    operations_store
        .request_cancel(&cancel_requested.id)
        .unwrap();
    drop(operations_store);

    let app = App::bootstrap(test_config(data_dir, vec![], vec![]))
        .await
        .unwrap();
    let operations_store = app.state().operations_store();

    assert_eq!(
        operations_store
            .get_by_id(&running.id)
            .unwrap()
            .unwrap()
            .status,
        OperationStatus::Interrupted
    );
    assert_eq!(
        operations_store
            .get_by_id(&cancel_requested.id)
            .unwrap()
            .unwrap()
            .status,
        OperationStatus::Interrupted
    );
}

#[tokio::test]
async fn queued_import_operation_runs_after_backend_boot() {
    let tempdir = TempDir::new().unwrap();
    let claude_root = seed_claude_source(tempdir.path(), CLAUDE_FIXTURE);
    let data_dir = tempdir.path().join("data");
    let key = source_key(Tool::ClaudeCode, CLAUDE_SESSION_ID);
    let operations_store = OperationsStore::open(data_dir.join("distill.db")).unwrap();
    let operation = operations_store
        .insert(new_operation(
            OperationKind::ImportSessions,
            "boot-import",
            json!({ "session_keys": [key] }),
        ))
        .unwrap();
    drop(operations_store);

    let app = App::bootstrap(test_config(data_dir, vec![claude_root], vec![]))
        .await
        .unwrap();
    let operations_store = app.state().operations_store();
    let finished =
        wait_operation_status(&operations_store, &operation.id, OperationStatus::Succeeded).await;
    let report: ImportReport = serde_json::from_value(finished.result_json.unwrap()).unwrap();

    assert_eq!(report.inserted_sessions, 1);
    let stored_sessions: Vec<StoredSessionView> = get_json(&app, "/api/v1/sessions").await;
    assert_eq!(stored_sessions.len(), 1);
    assert_eq!(stored_sessions[0].status, SessionSyncStatus::UpToDate);
}

#[tokio::test]
async fn queued_rescan_operation_runs_after_backend_boot() {
    let tempdir = TempDir::new().unwrap();
    let (claude_root, codex_root, _, _) = seed_both_sources(tempdir.path());
    let data_dir = tempdir.path().join("data");
    let operations_store = OperationsStore::open(data_dir.join("distill.db")).unwrap();
    let operation = operations_store
        .insert(new_operation(
            OperationKind::RescanSources,
            "boot-rescan",
            json!({}),
        ))
        .unwrap();
    drop(operations_store);

    let app = App::bootstrap(test_config(data_dir, vec![claude_root], vec![codex_root]))
        .await
        .unwrap();
    let operations_store = app.state().operations_store();
    let finished =
        wait_operation_status(&operations_store, &operation.id, OperationStatus::Succeeded).await;
    let report: RescanReport = serde_json::from_value(finished.result_json.unwrap()).unwrap();

    assert_eq!(report.parsed_sessions, 2);
    let source_sessions: Vec<SourceSessionView> = get_json(&app, "/api/v1/source-sessions").await;
    assert_eq!(source_sessions.len(), 2);
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

fn test_config(
    data_dir: PathBuf,
    claude_roots: Vec<PathBuf>,
    codex_roots: Vec<PathBuf>,
) -> BackendConfig {
    BackendConfig::new(
        data_dir,
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        Duration::from_secs(3_600),
        claude_roots,
        codex_roots,
    )
}

fn new_operation(
    kind: OperationKind,
    suffix: &str,
    params_json: serde_json::Value,
) -> NewOperation {
    NewOperation {
        kind,
        canonical_params_hash: format!("{suffix:0<64}"),
        input_version: format!("input-{suffix}"),
        params_json,
    }
}

async fn wait_operation_status(
    operations_store: &OperationsStore,
    id: &str,
    status: OperationStatus,
) -> distill_portal_operations::Operation {
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let operation = operations_store.get_by_id(id).unwrap().unwrap();
            if operation.status == status {
                return operation;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("operation reached expected status")
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

async fn submit_import_operation(app: &App, session_keys: Vec<String>) -> SubmitOperationResponse {
    post_json_with_body(
        app,
        "/api/v1/import",
        json!({ "session_keys": session_keys }),
        StatusCode::ACCEPTED,
    )
    .await
}

async fn submit_rescan_operation(app: &App) -> SubmitOperationResponse {
    post_json_with_body(app, "/api/v1/rescan", json!({}), StatusCode::ACCEPTED).await
}

async fn wait_http_operation_success<T: serde::de::DeserializeOwned>(
    app: &App,
    operation_id: &str,
) -> T {
    let operation = wait_http_operation_status(app, operation_id, OperationStatus::Succeeded).await;
    serde_json::from_value(operation.result_json.expect("terminal result json")).unwrap()
}

async fn wait_http_operation_status(
    app: &App,
    operation_id: &str,
    status: OperationStatus,
) -> Operation {
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let operation: Operation =
                get_json(app, &format!("/api/v1/operations/{operation_id}")).await;
            if operation.status == status {
                return operation;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("HTTP operation reached expected status")
}

async fn delete_operation(app: &App, operation_id: &str, expected_status: StatusCode) -> Operation {
    let response = app
        .router()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/v1/operations/{operation_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), expected_status);
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

async fn delete_operation_status(app: &App, operation_id: &str) -> StatusCode {
    app.router()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/v1/operations/{operation_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
        .status()
}

async fn post_json_with_body<T: serde::de::DeserializeOwned>(
    app: &App,
    uri: &str,
    body: serde_json::Value,
    expected_status: StatusCode,
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
    assert_eq!(response.status(), expected_status);
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

// --- Phase 9b M2-B SSE integration tests --------------------------------
//
// The SSE response is a streaming body, so the existing `oneshot` +
// `to_bytes` helpers cannot be reused — `to_bytes` would block waiting for
// the stream to close, and we don't want to close it until we've read the
// events we care about. Instead, each test binds a real `TcpListener` on
// 127.0.0.1:0, spawns `App::serve_with_shutdown` on it, and opens a raw
// TCP connection to issue the GET and parse the SSE wire format.

/// Single SSE event parsed from the wire. `id` is the optional `id:` line
/// value, `event` is the optional `event:` line value (defaults to
/// "message" per SSE spec but we treat the absent case as None), and
/// `data` is the concatenated `data:` lines.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct SseEvent {
    id: Option<String>,
    event: Option<String>,
    data: String,
}

/// Spin up `App` on a real localhost TCP port; returns the bound port and
/// a shutdown sender. The caller drops the shutdown sender to terminate
/// the server.
async fn spawn_app_on_port(app: App) -> (u16, oneshot::Sender<()>, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let handle = tokio::spawn(async move {
        let _ = app
            .serve_with_shutdown(listener, async move {
                let _ = shutdown_rx.await;
            })
            .await;
    });
    (port, shutdown_tx, handle)
}

/// Open a raw TCP connection to the bound port and send the SSE request.
async fn open_sse_stream(port: u16, last_event_id: Option<u64>) -> TcpStream {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let mut request = String::new();
    request.push_str("GET /api/v1/operations/events HTTP/1.1\r\n");
    request.push_str("Host: localhost\r\n");
    request.push_str("Accept: text/event-stream\r\n");
    request.push_str("Connection: keep-alive\r\n");
    if let Some(id) = last_event_id {
        request.push_str(&format!("Last-Event-ID: {id}\r\n"));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes()).await.unwrap();
    // Discard the HTTP/1.1 status + headers (terminated by an empty line).
    skip_http_headers(&mut stream).await;
    stream
}

async fn skip_http_headers(stream: &mut TcpStream) {
    let mut prev_was_cr = false;
    let mut prev_was_lf = false;
    let mut prev2_was_cr = false;
    let mut buf = [0u8; 1];
    loop {
        let read = stream.read(&mut buf).await.unwrap();
        if read == 0 {
            panic!("connection closed while reading SSE headers");
        }
        let byte = buf[0];
        // Look for the terminating \r\n\r\n sequence.
        match byte {
            b'\r' => {
                prev2_was_cr = prev_was_lf && prev_was_cr;
                prev_was_cr = true;
                prev_was_lf = false;
            }
            b'\n' => {
                if prev2_was_cr && prev_was_lf {
                    // already at terminator on previous iteration
                }
                if prev_was_cr && prev_was_lf {
                    // \r\n\n? Treat as end too.
                    return;
                }
                if prev_was_cr && prev2_was_cr {
                    return;
                }
                prev2_was_cr = prev_was_cr;
                prev_was_cr = false;
                prev_was_lf = true;
                if prev2_was_cr && prev_was_lf {
                    return;
                }
            }
            _ => {
                prev_was_cr = false;
                prev_was_lf = false;
                prev2_was_cr = false;
            }
        }
    }
}

/// Read `count` SSE events from the stream within `timeout`. Returns the
/// events in arrival order.
async fn read_sse_events(stream: &mut TcpStream, count: usize, timeout: Duration) -> Vec<SseEvent> {
    let mut events: Vec<SseEvent> = Vec::with_capacity(count);
    let mut leftover = String::new();
    let read_result = tokio::time::timeout(timeout, async {
        let mut buf = [0u8; 1024];
        loop {
            let read = stream.read(&mut buf).await.unwrap();
            if read == 0 {
                return;
            }
            leftover.push_str(std::str::from_utf8(&buf[..read]).expect("UTF-8 SSE bytes"));
            // Parse complete events delimited by a blank line ("\n\n" per
            // the SSE spec; axum emits "\n\n" between events).
            while let Some(event_end) = leftover.find("\n\n") {
                let raw_event = leftover[..event_end].to_string();
                leftover.drain(..event_end + 2);
                let mut parsed = SseEvent::default();
                for line in raw_event.lines() {
                    if let Some(value) = line.strip_prefix("id:") {
                        parsed.id = Some(value.trim().to_string());
                    } else if let Some(value) = line.strip_prefix("event:") {
                        parsed.event = Some(value.trim().to_string());
                    } else if let Some(value) = line.strip_prefix("data:") {
                        if !parsed.data.is_empty() {
                            parsed.data.push('\n');
                        }
                        parsed.data.push_str(value.trim_start());
                    }
                    // Ignore comment lines like ": keep-alive" and any
                    // other field we don't care about.
                }
                if parsed.event.is_some() || parsed.id.is_some() || !parsed.data.is_empty() {
                    events.push(parsed);
                    if events.len() >= count {
                        return;
                    }
                }
            }
        }
    })
    .await;
    if read_result.is_err() {
        // Timeout — surface what we have so the assertion failure is informative.
    }
    events
}

#[tokio::test]
async fn sse_endpoint_emits_snapshot_on_connect() {
    let tempdir = TempDir::new().unwrap();
    let claude_root = seed_claude_source(tempdir.path(), CLAUDE_FIXTURE);
    let app = App::bootstrap(test_config(
        tempdir.path().join("data"),
        vec![claude_root],
        vec![],
    ))
    .await
    .unwrap();

    // Submit + complete an import so we have a terminal op in the snapshot.
    let key = source_key(Tool::ClaudeCode, CLAUDE_SESSION_ID);
    let import_response = submit_import_operation(&app, vec![key]).await;
    let _: ImportReport = wait_http_operation_success(&app, &import_response.operation_id).await;

    // Insert one queued op directly into the store so the snapshot has a
    // non-terminal row too.
    let store = app.state().operations_store();
    let queued = store
        .insert(new_operation(
            OperationKind::RescanSources,
            "snapshot-queued",
            json!({}),
        ))
        .unwrap();

    let (port, shutdown_tx, server_handle) = spawn_app_on_port(app).await;
    let mut stream = open_sse_stream(port, None).await;
    // We expect at minimum: 1 snapshot for the queued op + 1 snapshot for
    // the terminal import op. Both go out as `event: snapshot`.
    let events = read_sse_events(&mut stream, 2, Duration::from_secs(3)).await;
    drop(stream);
    let _ = shutdown_tx.send(());
    let _ = server_handle.await;

    assert!(
        events.len() >= 2,
        "expected at least 2 snapshot events, got {}: {:?}",
        events.len(),
        events
    );
    for event in &events {
        assert_eq!(
            event.event.as_deref(),
            Some("snapshot"),
            "snapshot events must use event: snapshot, got {:?}",
            event,
        );
        assert!(
            event.id.is_none(),
            "snapshot events must not carry an id: line, got {:?}",
            event.id,
        );
    }
    let parsed_ids: Vec<String> = events
        .iter()
        .map(|e| {
            let transition: OperationTransitionEvent =
                serde_json::from_str(&e.data).expect("snapshot data parses as transition event");
            // Snapshot rows carry seq = 0 (synthetic).
            assert_eq!(transition.seq, 0, "snapshot seq must be 0");
            transition.operation.id
        })
        .collect();
    assert!(
        parsed_ids.contains(&queued.id),
        "snapshot should include queued op {} (got {:?})",
        queued.id,
        parsed_ids,
    );
    assert!(
        parsed_ids.contains(&import_response.operation_id),
        "snapshot should include completed import op {} (got {:?})",
        import_response.operation_id,
        parsed_ids,
    );
}

#[tokio::test]
async fn sse_endpoint_emits_live_transition_event() {
    let tempdir = TempDir::new().unwrap();
    let claude_root = seed_claude_source(tempdir.path(), CLAUDE_FIXTURE);
    let app = App::bootstrap(test_config(
        tempdir.path().join("data"),
        vec![claude_root],
        vec![],
    ))
    .await
    .unwrap();

    let (port, shutdown_tx, server_handle) = spawn_app_on_port(app).await;
    let mut stream = open_sse_stream(port, None).await;

    // Drain the initial snapshot (it may be empty since no ops exist yet).
    // We'll read a few bytes worth and then keep going.
    // Submit an import via a separate raw HTTP request.
    let key = source_key(Tool::ClaudeCode, CLAUDE_SESSION_ID);
    submit_import_via_http(port, vec![key]).await;

    // Expect transitions: queued (from submit_operation publish),
    // running (worker claim), succeeded (worker complete). Each goes out
    // as `event: transition` with an `id:` line.
    let events = read_sse_events(&mut stream, 3, Duration::from_secs(5)).await;
    drop(stream);
    let _ = shutdown_tx.send(());
    let _ = server_handle.await;

    let transitions: Vec<&SseEvent> = events
        .iter()
        .filter(|e| e.event.as_deref() == Some("transition"))
        .collect();
    assert!(
        transitions.len() >= 3,
        "expected at least 3 live transitions, got {}: {:?}",
        transitions.len(),
        events,
    );
    let statuses: Vec<OperationStatus> = transitions
        .iter()
        .map(|e| {
            assert!(e.id.is_some(), "transition events must carry id: line");
            let transition: OperationTransitionEvent = serde_json::from_str(&e.data).unwrap();
            assert!(transition.seq > 0, "live seq must be > 0");
            transition.operation.status
        })
        .collect();
    assert!(
        statuses.contains(&OperationStatus::Queued),
        "expected a queued transition in {:?}",
        statuses,
    );
    assert!(
        statuses.contains(&OperationStatus::Running),
        "expected a running transition in {:?}",
        statuses,
    );
    assert!(
        statuses.contains(&OperationStatus::Succeeded),
        "expected a succeeded transition in {:?}",
        statuses,
    );
}

#[tokio::test]
async fn sse_endpoint_replays_from_last_event_id() {
    let tempdir = TempDir::new().unwrap();
    let claude_root = seed_claude_source(tempdir.path(), CLAUDE_FIXTURE);
    let app = App::bootstrap(test_config(
        tempdir.path().join("data"),
        vec![claude_root],
        vec![],
    ))
    .await
    .unwrap();
    let (port, shutdown_tx, server_handle) = spawn_app_on_port(app).await;

    // First connection: submit one rescan op so the broadcaster has a few
    // events to replay, capture a seq, then disconnect.
    let mut stream = open_sse_stream(port, None).await;
    submit_rescan_via_http(port).await;
    let first_events = read_sse_events(&mut stream, 3, Duration::from_secs(5)).await;
    drop(stream);

    let highest_seq = first_events
        .iter()
        .filter(|e| e.event.as_deref() == Some("transition"))
        .filter_map(|e| e.id.as_ref())
        .filter_map(|id| id.parse::<u64>().ok())
        .max()
        .expect("at least one transition with an id");

    // Second connection with Last-Event-ID at the captured seq: replay
    // any events newer than that seq. There should be NONE for the same
    // run we just observed; submit a new op to force one.
    let mut stream2 = open_sse_stream(port, Some(highest_seq)).await;
    // Submit a *new* op that is idempotency-distinct from the first.
    submit_rescan_with_marker_via_http(port, "second").await;
    let second_events = read_sse_events(&mut stream2, 3, Duration::from_secs(5)).await;
    drop(stream2);
    let _ = shutdown_tx.send(());
    let _ = server_handle.await;

    // No `event: resync` (seq still within ring buffer).
    let has_resync = second_events
        .iter()
        .any(|e| e.event.as_deref() == Some("resync"));
    assert!(
        !has_resync,
        "expected no resync after recent Last-Event-ID; got {:?}",
        second_events,
    );
    // At least one transition with a seq > highest_seq must have arrived.
    let saw_new_transition = second_events.iter().any(|e| {
        if e.event.as_deref() != Some("transition") {
            return false;
        }
        e.id.as_ref()
            .and_then(|id| id.parse::<u64>().ok())
            .map(|seq| seq > highest_seq)
            .unwrap_or(false)
    });
    assert!(
        saw_new_transition,
        "expected at least one transition with seq > {highest_seq}; got {:?}",
        second_events,
    );
}

#[tokio::test]
async fn sse_endpoint_emits_resync_when_last_event_id_too_old() {
    let tempdir = TempDir::new().unwrap();
    let app = App::bootstrap(test_config(tempdir.path().join("data"), vec![], vec![]))
        .await
        .unwrap();
    let broadcaster = app.state().operations_broadcaster();
    // Push enough events through the broadcaster to evict seq 1 (ring
    // buffer capacity is 200). Using the broadcaster directly is allowed
    // because this test runs in-process with App; we synthesize a
    // sufficient burst of `Operation` rows.
    for index in 0..260 {
        broadcaster.publish(synthetic_operation(index));
    }
    let (port, shutdown_tx, server_handle) = spawn_app_on_port(app).await;
    let mut stream = open_sse_stream(port, Some(1)).await;
    let events = read_sse_events(&mut stream, 1, Duration::from_secs(3)).await;
    drop(stream);
    let _ = shutdown_tx.send(());
    let _ = server_handle.await;

    assert!(!events.is_empty(), "expected at least one event");
    assert_eq!(
        events[0].event.as_deref(),
        Some("resync"),
        "first event after stale Last-Event-ID must be resync; got {:?}",
        events,
    );
    assert!(events[0].id.is_none(), "resync events must not carry id:");
}

fn synthetic_operation(index: usize) -> distill_portal_operations::Operation {
    use distill_portal_ui_api_contracts::{Operation, OperationKind, OperationStatus};
    Operation {
        id: format!("synthetic-{index}"),
        kind: OperationKind::ImportSessions,
        status: OperationStatus::Queued,
        canonical_params_hash: format!("{index:0>64}"),
        input_version: format!("input-{index}"),
        params_json: json!({"index": index}),
        result_json: None,
        error_json: None,
        submitted_at: "2026-05-18T00:00:00Z".to_string(),
        started_at: None,
        finished_at: None,
        cancel_requested_at: None,
    }
}

async fn submit_import_via_http(port: u16, session_keys: Vec<String>) {
    let body = json!({ "session_keys": session_keys }).to_string();
    raw_http_post(port, "/api/v1/import", &body).await;
}

async fn submit_rescan_via_http(port: u16) {
    raw_http_post(port, "/api/v1/rescan", "{}").await;
}

async fn submit_rescan_with_marker_via_http(port: u16, marker: &str) {
    let body = json!({ "marker": marker }).to_string();
    raw_http_post(port, "/api/v1/rescan", &body).await;
}

async fn raw_http_post(port: u16, path: &str, body: &str) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    // Drain to EOF so the server completes the response.
    let mut sink = Vec::new();
    let _ = stream.read_to_end(&mut sink).await;
}
