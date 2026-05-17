use std::str::FromStr;

use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use distill_portal_operations::CancelRequestOutcome;
use distill_portal_ui_api_contracts::{
    ImportSourceSessionsRequest, Operation, OperationKind, OperationStatus, OperationsListQuery,
    OperationsListResponse, PersistedScanError, SourceSessionView, StoredSessionView,
    SubmitOperationResponse,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::app::{AppError, AppState};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/rescan", post(submit_rescan))
        .route("/api/v1/import", post(import_source_sessions))
        .route("/api/v1/operations", get(list_operations))
        .route(
            "/api/v1/operations/{operation_id}",
            get(get_operation).delete(cancel_operation),
        )
        .route("/api/v1/admin/scan-errors", get(list_scan_errors))
        .route("/api/v1/source-sessions", get(list_source_sessions))
        .route("/api/v1/sessions", get(list_sessions))
        .route("/api/v1/sessions/{session_uid}", get(get_session))
        .route("/api/v1/sessions/{session_uid}/raw", get(get_raw))
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

async fn submit_rescan(
    State(state): State<AppState>,
    body: Option<Json<Value>>,
) -> Result<(StatusCode, Json<SubmitOperationResponse>), ApiError> {
    let params_json = body.map(|Json(value)| value).unwrap_or_else(|| json!({}));
    Ok((
        StatusCode::ACCEPTED,
        Json(state.submit_rescan_operation(params_json).await?),
    ))
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
) -> Result<(StatusCode, Json<SubmitOperationResponse>), ApiError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(state.submit_import_operation(request.session_keys).await?),
    ))
}

async fn get_operation(
    State(state): State<AppState>,
    Path(operation_id): Path<String>,
) -> Result<Json<Operation>, ApiError> {
    match state.get_operation(operation_id).await? {
        Some(operation) => Ok(Json(operation)),
        None => Err(ApiError::NotFound),
    }
}

async fn list_operations(
    State(state): State<AppState>,
    Query(raw_query): Query<RawOperationsListQuery>,
) -> Result<Json<OperationsListResponse>, ApiError> {
    Ok(Json(state.list_operations(raw_query.into_query()?).await?))
}

async fn cancel_operation(
    State(state): State<AppState>,
    Path(operation_id): Path<String>,
) -> Result<Json<Operation>, ApiError> {
    match state.request_operation_cancel(operation_id).await? {
        CancelRequestOutcome::Requested(operation) => Ok(Json(operation)),
        CancelRequestOutcome::Conflict(operation) => Err(ApiError::Conflict(format!(
            "operation {} cannot be cancelled from status {}",
            operation.id, operation.status
        ))),
        CancelRequestOutcome::NotFound => Err(ApiError::NotFound),
    }
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
    BadRequest(String),
    Conflict(String),
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
            Self::BadRequest(message) => (StatusCode::BAD_REQUEST, message).into_response(),
            Self::Conflict(message) => (StatusCode::CONFLICT, message).into_response(),
            Self::App(error) => {
                (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response()
            }
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct RawOperationsListQuery {
    status: Option<String>,
    kind: Option<String>,
    limit: Option<usize>,
}

impl RawOperationsListQuery {
    fn into_query(self) -> Result<OperationsListQuery, ApiError> {
        Ok(OperationsListQuery {
            status: parse_csv::<OperationStatus>(self.status, "status")?,
            kind: parse_csv::<OperationKind>(self.kind, "kind")?,
            limit: self.limit,
        })
    }
}

fn parse_csv<T>(raw: Option<String>, label: &str) -> Result<Option<Vec<T>>, ApiError>
where
    T: FromStr,
{
    let Some(raw) = raw else {
        return Ok(None);
    };
    let values = raw
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .parse::<T>()
                .map_err(|_| ApiError::BadRequest(format!("invalid operation {label}: {value}")))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if values.is_empty() {
        Ok(None)
    } else {
        Ok(Some(values))
    }
}
