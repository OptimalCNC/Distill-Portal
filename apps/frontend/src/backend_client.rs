use bytes::Bytes;
use distill_portal_ui_api_contracts::{
    ImportReport, ImportSourceSessionsRequest, PersistedScanError, RescanReport, SourceSessionView,
    StoredSessionView,
};
use http_body_util::{BodyExt, Full};
use hyper::{
    header::{ACCEPT, CONTENT_TYPE},
    Method, Request, StatusCode, Uri,
};
use hyper_util::{
    client::legacy::{connect::HttpConnector, Client},
    rt::TokioExecutor,
};

#[derive(Clone)]
pub struct BackendClient {
    base_url: String,
    client: Client<HttpConnector, Full<Bytes>>,
}

impl BackendClient {
    pub fn new(base_url: String) -> Self {
        let connector = HttpConnector::new();
        let client = Client::builder(TokioExecutor::new()).build(connector);
        Self { base_url, client }
    }

    pub async fn rescan(&self) -> Result<RescanReport, BackendClientError> {
        self.send_json(Method::POST, "/api/v1/admin/rescan", None)
            .await
    }

    pub async fn list_scan_errors(&self) -> Result<Vec<PersistedScanError>, BackendClientError> {
        self.send_json(Method::GET, "/api/v1/admin/scan-errors", None)
            .await
    }

    pub async fn list_source_sessions(&self) -> Result<Vec<SourceSessionView>, BackendClientError> {
        self.send_json(Method::GET, "/api/v1/source-sessions", None)
            .await
    }

    pub async fn import_source_sessions(
        &self,
        request: &ImportSourceSessionsRequest,
    ) -> Result<ImportReport, BackendClientError> {
        self.send_json(
            Method::POST,
            "/api/v1/source-sessions/import",
            Some(serde_json::to_vec(request)?),
        )
        .await
    }

    pub async fn list_sessions(&self) -> Result<Vec<StoredSessionView>, BackendClientError> {
        self.send_json(Method::GET, "/api/v1/sessions", None).await
    }

    pub async fn get_session(
        &self,
        session_uid: &str,
    ) -> Result<StoredSessionView, BackendClientError> {
        self.send_json(
            Method::GET,
            &format!("/api/v1/sessions/{session_uid}"),
            None,
        )
        .await
    }

    pub async fn get_raw(&self, session_uid: &str) -> Result<Vec<u8>, BackendClientError> {
        let response = self
            .client
            .request(self.request(
                Method::GET,
                &format!("/api/v1/sessions/{session_uid}/raw"),
                None,
                false,
            )?)
            .await?;
        let status = response.status();
        let body = response.into_body().collect().await?.to_bytes().to_vec();
        ensure_success(status, &body)?;
        Ok(body)
    }

    async fn send_json<T>(
        &self,
        method: Method,
        path: &str,
        body: Option<Vec<u8>>,
    ) -> Result<T, BackendClientError>
    where
        T: serde::de::DeserializeOwned,
    {
        let response = self
            .client
            .request(self.request(method, path, body, true)?)
            .await?;
        let status = response.status();
        let body = response.into_body().collect().await?.to_bytes().to_vec();
        ensure_success(status, &body)?;
        Ok(serde_json::from_slice(&body)?)
    }

    fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<Vec<u8>>,
        json: bool,
    ) -> Result<Request<Full<Bytes>>, BackendClientError> {
        let uri = self.uri(path)?;
        let mut builder = Request::builder().method(method).uri(uri);
        if json {
            builder = builder.header(ACCEPT, "application/json");
        }
        let request_body = match body {
            Some(body) => {
                builder = builder.header(CONTENT_TYPE, "application/json");
                Bytes::from(body)
            }
            None => Bytes::new(),
        };
        Ok(builder.body(Full::new(request_body))?)
    }

    fn uri(&self, path: &str) -> Result<Uri, BackendClientError> {
        format!("{}{}", self.base_url, path)
            .parse()
            .map_err(BackendClientError::InvalidUri)
    }
}

fn ensure_success(status: StatusCode, body: &[u8]) -> Result<(), BackendClientError> {
    if status.is_success() {
        Ok(())
    } else {
        Err(BackendClientError::UnexpectedStatus {
            status,
            body: String::from_utf8_lossy(body).into_owned(),
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum BackendClientError {
    #[error(transparent)]
    InvalidRequest(#[from] hyper::http::Error),
    #[error(transparent)]
    InvalidUri(#[from] hyper::http::uri::InvalidUri),
    #[error(transparent)]
    Http(#[from] hyper_util::client::legacy::Error),
    #[error(transparent)]
    ReadBody(#[from] hyper::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("backend returned {status}: {body}")]
    UnexpectedStatus { status: StatusCode, body: String },
}
