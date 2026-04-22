use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use distill_portal_ui_api_contracts::{
    ImportReport, ImportSourceSessionsRequest, PersistedScanError, RescanReport, SourceSessionView,
    StoredSessionView,
};

use crate::app::{AppError, AppState};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
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

async fn health() -> &'static str {
    "ok"
}

async fn rescan(State(state): State<AppState>) -> Result<Json<RescanReport>, ApiError> {
    Ok(Json(state.rescan().await?))
}

async fn list_scan_errors(
    State(state): State<AppState>,
) -> Result<Json<Vec<PersistedScanError>>, ApiError> {
    Ok(Json(state.list_scan_errors().await?))
}

async fn list_source_sessions(
    State(state): State<AppState>,
) -> Result<Json<Vec<SourceSessionView>>, ApiError> {
    Ok(Json(state.list_source_sessions().await?))
}

async fn import_source_sessions(
    State(state): State<AppState>,
    Json(request): Json<ImportSourceSessionsRequest>,
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
