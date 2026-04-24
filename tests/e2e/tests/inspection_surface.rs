// Typed Rust client against the real backend HTTP stack.
//
// Proves that a typed client posting to `/api/v1/source-sessions/import`
// walks through the full
// `collector-runtime -> raw-session-store -> ingest-service` pipeline and
// gets back the expected `ImportReport`. Browser-level coverage of the
// inspection workflow (render, interact, proxy) lives in the Playwright
// suite under `apps/frontend/e2e/inspection.spec.ts`.
use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    time::Duration,
};

use bytes::Bytes;
use distill_portal_backend::App as BackendApp;
use distill_portal_configuration::BackendConfig;
use distill_portal_ui_api_contracts::{
    source_key, ImportReport, ImportSourceSessionsRequest, SessionSyncStatus, SourceSessionView,
    StoredSessionView, Tool,
};
use http_body_util::{BodyExt, Full};
use hyper::{header::CONTENT_TYPE, Method, Request, StatusCode, Uri};
use hyper_util::{
    client::legacy::{connect::HttpConnector, Client},
    rt::TokioExecutor,
};
use tempfile::TempDir;
use tokio::{net::TcpListener, sync::oneshot};

const CLAUDE_FIXTURE: &[u8] =
    include_bytes!("../../../tests/fixtures/claude_code/sample_session.jsonl");
const CLAUDE_SESSION_ID: &str = "546104ba-031c-46f2-9b24-36b147c6b2f6";

#[tokio::test]
async fn inspection_surface_works_through_frontend_backend_http_boundary() {
    let tempdir = TempDir::new().unwrap();
    let claude_root = seed_claude_source(tempdir.path(), CLAUDE_FIXTURE);
    let data_dir = tempdir.path().join("data");

    let backend_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let backend_addr = backend_listener.local_addr().unwrap();
    let backend = BackendApp::bootstrap(BackendConfig::new(
        data_dir,
        backend_addr,
        Duration::from_secs(3_600),
        vec![claude_root],
        vec![],
    ))
    .await
    .unwrap();
    let (backend_shutdown_tx, backend_shutdown_rx) = oneshot::channel::<()>();
    let backend_task = tokio::spawn(async move {
        backend
            .serve_with_shutdown(backend_listener, async move {
                let _ = backend_shutdown_rx.await;
            })
            .await
            .unwrap();
    });

    wait_for_ok(backend_addr, "/health").await;

    let backend_root = get_status(backend_addr, "/").await;
    assert_eq!(backend_root, StatusCode::NOT_FOUND);

    let source_sessions: Vec<SourceSessionView> =
        get_json(backend_addr, "/api/v1/source-sessions").await;
    assert_eq!(source_sessions.len(), 1);
    assert_eq!(source_sessions[0].status, SessionSyncStatus::NotStored);

    let key = source_key(Tool::ClaudeCode, CLAUDE_SESSION_ID);
    let import_report: ImportReport = post_json(
        backend_addr,
        "/api/v1/source-sessions/import",
        &ImportSourceSessionsRequest {
            session_keys: vec![key.clone()],
        },
    )
    .await;
    assert_eq!(import_report.requested_sessions, 1);
    assert_eq!(import_report.inserted_sessions, 1);

    let stored_sessions: Vec<StoredSessionView> =
        get_json(backend_addr, "/api/v1/sessions").await;
    assert_eq!(stored_sessions.len(), 1);
    let stored = &stored_sessions[0];
    assert_eq!(stored.status, SessionSyncStatus::UpToDate);

    let raw = get_bytes(
        backend_addr,
        &format!("/api/v1/sessions/{}/raw", stored.session.session_uid),
    )
    .await;
    assert_eq!(raw.as_slice(), CLAUDE_FIXTURE);

    let _ = backend_shutdown_tx.send(());
    backend_task.await.unwrap();
}

async fn wait_for_ok(addr: SocketAddr, path: &str) {
    for _ in 0..20 {
        if get_status(addr, path).await == StatusCode::OK {
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("server did not become ready at {addr}{path}");
}

async fn get_status(addr: SocketAddr, path: &str) -> StatusCode {
    let response = request(addr, Method::GET, path, None, None).await;
    response.0
}

async fn get_bytes(addr: SocketAddr, path: &str) -> Vec<u8> {
    let (status, body) = request(addr, Method::GET, path, None, None).await;
    assert_eq!(status, StatusCode::OK);
    body
}

async fn get_json<T: serde::de::DeserializeOwned>(addr: SocketAddr, path: &str) -> T {
    let (status, body) = request(addr, Method::GET, path, None, None).await;
    assert_eq!(status, StatusCode::OK);
    serde_json::from_slice(&body).unwrap()
}

async fn post_json<Req, Res>(addr: SocketAddr, path: &str, body: &Req) -> Res
where
    Req: serde::Serialize,
    Res: serde::de::DeserializeOwned,
{
    let payload = serde_json::to_vec(body).unwrap();
    let (status, body) = request(
        addr,
        Method::POST,
        path,
        Some(("application/json", payload)),
        Some(StatusCode::OK),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    serde_json::from_slice(&body).unwrap()
}

async fn request(
    addr: SocketAddr,
    method: Method,
    path: &str,
    body: Option<(&'static str, Vec<u8>)>,
    expected_status: Option<StatusCode>,
) -> (StatusCode, Vec<u8>) {
    let connector = HttpConnector::new();
    let client = Client::builder(TokioExecutor::new()).build(connector);
    let uri: Uri = format!("http://{addr}{path}").parse().unwrap();
    let mut builder = Request::builder().method(method).uri(uri);
    let request_body = match body {
        Some((content_type, body)) => {
            builder = builder.header(CONTENT_TYPE, content_type);
            Bytes::from(body)
        }
        None => Bytes::new(),
    };
    let response = client
        .request(builder.body(Full::new(request_body)).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let body = response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec();
    if let Some(expected_status) = expected_status {
        assert_eq!(status, expected_status);
    }
    (status, body)
}

fn seed_claude_source(base: &Path, bytes: &[u8]) -> PathBuf {
    let claude_root = base.join("sources/claude/projects");
    let claude_path = claude_root
        .join("-home-huwei-ai-codings-distill-portal")
        .join(format!("{CLAUDE_SESSION_ID}.jsonl"));
    if let Some(parent) = claude_path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(&claude_path, bytes).unwrap();
    claude_root
}
