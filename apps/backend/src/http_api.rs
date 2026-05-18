use std::{
    convert::Infallible,
    pin::Pin,
    str::FromStr,
    task::{Context, Poll},
};

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use distill_portal_operations::{CancelRequestOutcome, OperationTransitionEvent, Subscription};
use distill_portal_ui_api_contracts::{
    ImportSourceSessionsRequest, Operation, OperationKind, OperationStatus, OperationsListQuery,
    OperationsListResponse, PersistedScanError, SourceSessionView, StoredSessionView,
    SubmitOperationResponse,
};
use futures_core::Stream;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::{broadcast::error::RecvError, mpsc};

use crate::app::{AppError, AppState};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/rescan", post(submit_rescan))
        .route("/api/v1/import", post(import_source_sessions))
        .route("/api/v1/operations", get(list_operations))
        .route("/api/v1/operations/events", get(operations_events))
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

/// SSE channel for live operation state transitions.
///
/// Wire shape (codex pre-consult refinement: snapshot vs transition vs
/// resync clearly separated so the client's `Last-Event-ID` tracker only
/// updates on real `id:` lines):
///
/// - `event: snapshot` (no `id:`) — initial replay of non-terminal ops +
///   last 50 terminal ops, emitted first on every connect.
/// - `event: transition` with `id: <seq>` — backlog replay (from the
///   broadcaster's ring buffer when `Last-Event-ID` was supplied) and live
///   transitions. Client updates `Last-Event-ID` from these.
/// - `event: resync` (no `id:`) — emitted once when `Last-Event-ID` falls
///   outside the ring buffer OR when the live `broadcast::Receiver` lags
///   beyond the channel capacity. Client must discard local state and
///   re-fetch via `GET /api/v1/operations`.
///
/// Codex pre-consult refinement A: subscribe to the broadcaster BEFORE
/// reading the database snapshot so the live channel does not drop events
/// that fire between the snapshot read and the live tail. The bridge task
/// emits backlog entries before tailing live and dedupes any live event
/// whose `seq <= last_backlog_seq` (already delivered as backlog).
///
/// Codex pre-consult refinement B: a per-connection bridge task owns the
/// `broadcast::Receiver` and pushes `Event` values into an `mpsc::channel`
/// that the SSE response streams from. On `RecvError::Lagged`, emit one
/// `event: resync` and close — continuing after data loss confuses the
/// client.
///
/// Last-Event-ID resolution (Phase 9b M3-A codex review fix #1): the
/// browser's native `EventSource` constructor cannot attach the
/// `Last-Event-ID` header on `new EventSource(url)` — it only sends the
/// header on the implicit *automatic* reconnect path, and only if the
/// previous connection had emitted an `id:` line. Manual reconnects (the
/// frontend's backoff ladder constructs a fresh `EventSource` after closing
/// the prior one) therefore have no way to resume via the header. To make
/// the manual reconnect path correct, this handler accepts a
/// `?last_event_id=<seq>` query parameter as a fallback channel. The
/// `Last-Event-ID` header takes precedence so native automatic reconnects
/// remain canonical; the query parameter only applies when the header is
/// absent.
async fn operations_events(
    State(state): State<AppState>,
    Query(query): Query<OperationsEventsQuery>,
    headers: HeaderMap,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let last_event_id = headers
        .get("last-event-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .or(query.last_event_id);

    // Subscribe to the broadcaster BEFORE reading the database snapshot.
    // If we read the snapshot first, an operation that commits + publishes
    // between the snapshot read and the subscribe call is LOST (not in the
    // snapshot, not on the live channel — the receiver wasn't connected
    // yet). Subscribing first means every event lands somewhere: snapshot
    // OR backlog OR live tail. Duplicates between snapshot and live are
    // expected and deduped by the M3 client via operation.id.
    let subscription = state.operations_broadcaster().subscribe(last_event_id);
    let Subscription {
        backlog,
        last_backlog_seq,
        mut receiver,
        resync_reason,
    } = subscription;

    let snapshot = state
        .operations_snapshot_for_sse()
        .await
        .unwrap_or_default();

    // mpsc capacity is generous; the bridge task drains it as fast as the
    // SSE response can flush bytes to the client. If a client wedges hard
    // enough to fill 64 buffered events, the bridge task awaits on
    // `tx.send` which naturally backpressures into the broadcast receiver
    // (and eventually trips `RecvError::Lagged`, closing the stream).
    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(64);

    tokio::spawn(async move {
        // Emit resync (if any) BEFORE snapshot/backlog so the client knows
        // its local state was stale before it processes any rows.
        if let Some(reason) = resync_reason {
            let event = Event::default().event("resync").data(reason);
            if tx.send(Ok(event)).await.is_err() {
                return;
            }
        }

        for transition in &snapshot {
            let event = build_snapshot_event(transition);
            if tx.send(Ok(event)).await.is_err() {
                return;
            }
        }

        for transition in &backlog {
            let event = build_transition_event(transition);
            if tx.send(Ok(event)).await.is_err() {
                return;
            }
        }

        loop {
            match receiver.recv().await {
                Ok(transition) => {
                    if let Some(last) = last_backlog_seq {
                        if transition.seq <= last {
                            // Already delivered as backlog; skip.
                            continue;
                        }
                    }
                    let event = build_transition_event(&transition);
                    if tx.send(Ok(event)).await.is_err() {
                        break;
                    }
                }
                Err(RecvError::Lagged(_)) => {
                    let event = Event::default()
                        .event("resync")
                        .data("subscriber lagged; please re-fetch via GET /api/v1/operations");
                    let _ = tx.send(Ok(event)).await;
                    break;
                }
                Err(RecvError::Closed) => break,
            }
        }
    });

    let stream = SseEventStream { rx };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

fn build_snapshot_event(transition: &OperationTransitionEvent) -> Event {
    // Snapshot events carry the operation row but NOT an `id:` field, so
    // the client never advances `Last-Event-ID` from a snapshot row.
    let json = serde_json::to_string(transition).unwrap_or_else(|_| "{}".to_string());
    Event::default().event("snapshot").data(json)
}

fn build_transition_event(transition: &OperationTransitionEvent) -> Event {
    let json = serde_json::to_string(transition).unwrap_or_else(|_| "{}".to_string());
    Event::default()
        .id(transition.seq.to_string())
        .event("transition")
        .data(json)
}

/// Hand-rolled `Stream` over `mpsc::Receiver` so the SSE handler does not
/// pull `tokio-stream` (the closest existing helper) into the workspace.
/// `axum::response::sse::Sse::new` consumes any `Stream<Item = Result<Event,
/// E>>`; using `mpsc::Receiver::poll_recv` from tokio (already a workspace
/// dep) keeps the surface area minimal.
struct SseEventStream {
    rx: mpsc::Receiver<Result<Event, Infallible>>,
}

impl Stream for SseEventStream {
    type Item = Result<Event, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.rx.poll_recv(cx)
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

/// Query parameters accepted by `GET /api/v1/operations/events`.
///
/// `last_event_id` is the manual-reconnect fallback for the `Last-Event-ID`
/// header. See the doc comment on `operations_events` for the precedence
/// rule (header > query).
#[derive(Debug, Default, Deserialize)]
struct OperationsEventsQuery {
    last_event_id: Option<u64>,
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
