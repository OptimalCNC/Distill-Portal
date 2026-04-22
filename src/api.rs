use axum::{
    extract::{Form, Path, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::app::{
    AppError, AppState, ImportReport, RescanReport, SessionSyncStatus, SourceSessionView,
    StoredSessionView,
};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/", get(home))
        .route("/health", get(health))
        .route("/rescan", post(rescan_html))
        .route("/import", post(import_html))
        .route("/api/v1/admin/rescan", post(rescan))
        .route("/api/v1/admin/scan-errors", get(list_scan_errors))
        .route("/api/v1/source-sessions", get(list_source_sessions))
        .route(
            "/api/v1/source-sessions/import",
            post(import_source_sessions),
        )
        .route("/api/v1/sessions", get(list_sessions))
        .route("/api/v1/sessions/{session_uid}", get(get_session))
        .route("/api/v1/sessions/{session_uid}/raw", get(get_raw))
        .with_state(state)
}

#[derive(Debug, Deserialize, Default)]
struct ImportForm {
    #[serde(default)]
    session_key: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ImportRequest {
    #[serde(default)]
    session_keys: Vec<String>,
}

async fn home(State(state): State<AppState>) -> Result<Html<String>, ApiError> {
    let source_sessions = state.list_source_sessions().await?;
    let stored_sessions = state.list_sessions().await?;
    let scan_errors = state.list_scan_errors().await?;
    Ok(Html(render_home_page(
        &source_sessions,
        &stored_sessions,
        &scan_errors,
    )))
}

async fn health() -> &'static str {
    "ok"
}

async fn rescan_html(State(state): State<AppState>) -> Result<Redirect, ApiError> {
    state.rescan().await?;
    Ok(Redirect::to("/"))
}

async fn import_html(
    State(state): State<AppState>,
    Form(form): Form<ImportForm>,
) -> Result<Redirect, ApiError> {
    state.import_source_sessions(form.session_key).await?;
    Ok(Redirect::to("/"))
}

async fn rescan(State(state): State<AppState>) -> Result<Json<RescanReport>, ApiError> {
    Ok(Json(state.rescan().await?))
}

async fn list_scan_errors(
    State(state): State<AppState>,
) -> Result<Json<Vec<crate::store::PersistedScanError>>, ApiError> {
    Ok(Json(state.list_scan_errors().await?))
}

async fn list_source_sessions(
    State(state): State<AppState>,
) -> Result<Json<Vec<SourceSessionView>>, ApiError> {
    Ok(Json(state.list_source_sessions().await?))
}

async fn import_source_sessions(
    State(state): State<AppState>,
    Json(request): Json<ImportRequest>,
) -> Result<Json<ImportReport>, ApiError> {
    Ok(Json(
        state.import_source_sessions(request.session_keys).await?,
    ))
}

async fn list_sessions(
    State(state): State<AppState>,
) -> Result<Json<Vec<StoredSessionView>>, ApiError> {
    Ok(Json(state.list_sessions().await?))
}

async fn get_session(
    State(state): State<AppState>,
    Path(session_uid): Path<String>,
) -> Result<Json<StoredSessionView>, ApiError> {
    match state.get_session(session_uid).await? {
        Some(session) => Ok(Json(session)),
        None => Err(ApiError::NotFound),
    }
}

async fn get_raw(
    State(state): State<AppState>,
    Path(session_uid): Path<String>,
) -> Result<Response, ApiError> {
    match state.get_raw(session_uid).await? {
        Some(raw) => Ok((
            [(header::CONTENT_TYPE, "application/x-ndjson; charset=utf-8")],
            raw,
        )
            .into_response()),
        None => Err(ApiError::NotFound),
    }
}

#[derive(Debug)]
enum ApiError {
    App(AppError),
    NotFound,
}

impl From<AppError> for ApiError {
    fn from(value: AppError) -> Self {
        Self::App(value)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            Self::NotFound => (StatusCode::NOT_FOUND, "not found").into_response(),
            Self::App(error) => {
                (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response()
            }
        }
    }
}

fn render_home_page(
    source_sessions: &[SourceSessionView],
    stored_sessions: &[StoredSessionView],
    scan_errors: &[crate::store::PersistedScanError],
) -> String {
    let mut html = String::from(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Distill Portal Phase 1</title>
  <style>
    :root {
      --bg: #f7f0e4;
      --panel: rgba(255, 252, 245, 0.88);
      --panel-strong: #fffaf1;
      --text: #1d1a16;
      --muted: #6f6659;
      --border: #d6c7b3;
      --accent: #9f3b24;
      --accent-soft: #f2d2c8;
      --good: #2a6b4f;
      --warn: #8a5b10;
      --bad: #8e2f2f;
      --shadow: 0 18px 40px rgba(79, 49, 22, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(255,255,255,0.7), transparent 35%),
        linear-gradient(135deg, #efe2cf, var(--bg));
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
    }
    main {
      width: min(1400px, calc(100vw - 32px));
      margin: 24px auto 48px;
    }
    .hero, .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }
    .hero {
      padding: 28px;
      display: grid;
      gap: 12px;
      margin-bottom: 20px;
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(2rem, 4vw, 3.2rem);
      letter-spacing: -0.04em;
    }
    .hero p {
      margin: 0;
      max-width: 70ch;
      color: var(--muted);
      line-height: 1.5;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .actions form { margin: 0; }
    button {
      border: 0;
      border-radius: 999px;
      padding: 10px 18px;
      background: var(--accent);
      color: #fff7f2;
      font: inherit;
      cursor: pointer;
    }
    button.secondary {
      background: var(--panel-strong);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .link-row {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .link-row a {
      color: inherit;
      text-decoration-color: var(--border);
    }
    .grid {
      display: grid;
      gap: 20px;
    }
    .panel {
      padding: 18px;
      overflow: hidden;
    }
    .panel h2 {
      margin: 0 0 10px;
      font-size: 1.4rem;
    }
    .panel p {
      margin: 0 0 14px;
      color: var(--muted);
    }
    .table-wrap {
      overflow-x: auto;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.5);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 980px;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(214, 199, 179, 0.6);
      text-align: left;
      vertical-align: top;
      font-size: 0.96rem;
    }
    th {
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      background: rgba(255,255,255,0.35);
    }
    tr:last-child td { border-bottom: 0; }
    .muted { color: var(--muted); }
    .mono { font-family: "SFMono-Regular", "Cascadia Code", "Fira Code", monospace; font-size: 0.87rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-family: "SFMono-Regular", "Cascadia Code", "Fira Code", monospace;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .badge.up-to-date {
      background: rgba(42, 107, 79, 0.12);
      color: var(--good);
      border-color: rgba(42, 107, 79, 0.2);
    }
    .badge.not-stored {
      background: rgba(159, 59, 36, 0.12);
      color: var(--accent);
      border-color: rgba(159, 59, 36, 0.22);
    }
    .badge.outdated {
      background: rgba(138, 91, 16, 0.14);
      color: var(--warn);
      border-color: rgba(138, 91, 16, 0.22);
    }
    .badge.source-missing {
      background: rgba(142, 47, 47, 0.12);
      color: var(--bad);
      border-color: rgba(142, 47, 47, 0.22);
    }
    .empty {
      padding: 18px;
      border: 1px dashed var(--border);
      border-radius: 16px;
      color: var(--muted);
      background: rgba(255,255,255,0.4);
    }
    .stack {
      display: grid;
      gap: 8px;
    }
    a.raw-link {
      color: var(--accent);
      text-decoration-color: rgba(159, 59, 36, 0.3);
    }
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>Distill Portal Phase 1</h1>
    <p>This inspection surface shows discovered source sessions, what is already saved in the local store, and whether each stored copy is current. Source discovery and saving are separate so you can choose exactly which sessions enter the store.</p>
    <div class="actions">
      <form method="post" action="/rescan">
        <button type="submit">Refresh Source Inventory</button>
      </form>
    </div>
    <div class="link-row">
      <a href="/api/v1/source-sessions">Source Sessions JSON</a>
      <a href="/api/v1/sessions">Stored Sessions JSON</a>
      <a href="/api/v1/admin/scan-errors">Scan Errors JSON</a>
    </div>
  </section>
"#,
    );

    html.push_str(
        r#"<section class="panel">
  <h2>Source Sessions</h2>
  <p>Choose which discovered sessions to save into the backend-owned store.</p>
"#,
    );
    if source_sessions.is_empty() {
        html.push_str(r#"<div class="empty">No source sessions are currently discoverable.</div>"#);
    } else {
        html.push_str(r#"<form method="post" action="/import">"#);
        html.push_str(
            r#"<div class="actions" style="margin-bottom: 14px;">
  <button type="submit">Save Selected Sessions</button>
</div>"#,
        );
        html.push_str(
            r#"<div class="table-wrap"><table><thead><tr>
  <th>Save</th>
  <th>Status</th>
  <th>Tool</th>
  <th>Title</th>
  <th>Project</th>
  <th>Updated</th>
  <th>Stored Copy</th>
  <th>Source Path</th>
</tr></thead><tbody>"#,
        );
        for session in source_sessions {
            html.push_str("<tr>");
            html.push_str(&format!(
                "<td><input type=\"checkbox\" name=\"session_key\" value=\"{}\"></td>",
                escape_html(&session.session_key)
            ));
            html.push_str(&format!("<td>{}</td>", status_badge(session.status)));
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(session.tool.as_str())
            ));
            html.push_str(&format!(
                "<td class=\"stack\"><strong>{}</strong><span class=\"muted mono\">{}</span></td>",
                escape_html(session.title.as_deref().unwrap_or("(untitled)")),
                escape_html(&session.source_session_id)
            ));
            html.push_str(&format!(
                "<td>{}</td>",
                escape_html(session.project_path.as_deref().unwrap_or("—"))
            ));
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(session.source_updated_at.as_deref().unwrap_or("—"))
            ));
            html.push_str(&format!(
                "<td class=\"stack\"><span class=\"mono\">{}</span><span class=\"muted mono\">ingested: {}</span></td>",
                escape_html(session.session_uid.as_deref().unwrap_or("not stored")),
                escape_html(session.stored_ingested_at.as_deref().unwrap_or("—"))
            ));
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(&session.source_path)
            ));
            html.push_str("</tr>");
        }
        html.push_str("</tbody></table></div></form>");
    }
    html.push_str("</section>");

    html.push_str(
        r#"<section class="panel">
  <h2>Stored Sessions</h2>
  <p>Metadata for sessions already saved in the local store, including whether each stored copy matches the latest discovered source file.</p>
"#,
    );
    if stored_sessions.is_empty() {
        html.push_str(r#"<div class="empty">The store is currently empty.</div>"#);
    } else {
        html.push_str(
            r#"<div class="table-wrap"><table><thead><tr>
  <th>Status</th>
  <th>Tool</th>
  <th>Title</th>
  <th>Project</th>
  <th>Ingested</th>
  <th>Source Updated</th>
  <th>Session UID</th>
  <th>Raw</th>
</tr></thead><tbody>"#,
        );
        for stored in stored_sessions {
            let raw_link = format!("/api/v1/sessions/{}/raw", stored.session.session_uid);
            let metadata_link = format!("/api/v1/sessions/{}", stored.session.session_uid);
            html.push_str("<tr>");
            html.push_str(&format!("<td>{}</td>", status_badge(stored.status)));
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(stored.session.tool.as_str())
            ));
            html.push_str(&format!(
                "<td class=\"stack\"><strong>{}</strong><span class=\"muted mono\">{}</span></td>",
                escape_html(stored.session.title.as_deref().unwrap_or("(untitled)")),
                escape_html(&stored.session.source_session_id)
            ));
            html.push_str(&format!(
                "<td>{}</td>",
                escape_html(stored.session.project_path.as_deref().unwrap_or("—"))
            ));
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(&stored.session.ingested_at)
            ));
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(stored.session.source_updated_at.as_deref().unwrap_or("—"))
            ));
            html.push_str(&format!(
                "<td class=\"stack\"><a class=\"raw-link mono\" href=\"{}\">{}</a><span class=\"muted mono\">fingerprint: {}</span></td>",
                escape_html(&metadata_link),
                escape_html(&stored.session.session_uid),
                escape_html(&stored.session.source_fingerprint)
            ));
            html.push_str(&format!(
                "<td><a class=\"raw-link\" href=\"{}\">View Raw</a></td>",
                escape_html(&raw_link)
            ));
            html.push_str("</tr>");
        }
        html.push_str("</tbody></table></div>");
    }
    html.push_str("</section>");

    html.push_str(
        r#"<section class="panel">
  <h2>Scan Errors</h2>
  <p>Malformed or unreadable session files discovered during source scanning.</p>
"#,
    );
    if scan_errors.is_empty() {
        html.push_str(r#"<div class="empty">No scan errors are currently recorded.</div>"#);
    } else {
        html.push_str(
            r#"<div class="table-wrap"><table><thead><tr>
  <th>Tool</th>
  <th>Path</th>
  <th>Message</th>
  <th>Last Seen</th>
</tr></thead><tbody>"#,
        );
        for error in scan_errors {
            html.push_str("<tr>");
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(error.tool.as_str())
            ));
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(&error.source_path)
            ));
            html.push_str(&format!("<td>{}</td>", escape_html(&error.message)));
            html.push_str(&format!(
                "<td class=\"mono\">{}</td>",
                escape_html(&error.last_seen_at)
            ));
            html.push_str("</tr>");
        }
        html.push_str("</tbody></table></div>");
    }
    html.push_str("</section></main></body></html>");

    html
}

fn status_badge(status: SessionSyncStatus) -> String {
    format!(
        "<span class=\"badge {}\">{}</span>",
        status.as_str().replace('_', "-"),
        status.as_str().replace('_', " ")
    )
}

fn escape_html(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}
