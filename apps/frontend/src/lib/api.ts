// Single typed frontend API layer.
//
// Every browser -> backend HTTP call in the app MUST go through this module.
// Response shapes are typed via the generated TypeScript contracts in
// components/ui-api-contracts/bindings/* (re-exported from ./contracts);
// handwritten response types are not allowed.
import { API_BASE } from "./config";
import type {
  ImportSourceSessionsRequest,
  Operation,
  OperationsListQuery,
  OperationsListResponse,
  PersistedScanError,
  SourceSessionView,
  StoredSessionView,
  SubmitOperationResponse,
} from "./contracts";

export const SOURCE_SESSIONS_PATH = "/api/v1/source-sessions";
export const STORED_SESSIONS_PATH = "/api/v1/sessions";
export const SCAN_ERRORS_PATH = "/api/v1/admin/scan-errors";
export const RESCAN_PATH = "/api/v1/rescan";
export const IMPORT_PATH = "/api/v1/import";
export const OPERATIONS_PATH = "/api/v1/operations";
export const OPERATIONS_EVENTS_PATH = "/api/v1/operations/events";
export type OperationsListRequest = Partial<OperationsListQuery>;

/**
 * Absolute URL for the operations SSE stream
 * (`GET /api/v1/operations/events`).
 *
 * Returned as a string so the consumer can pass it directly into the
 * native `EventSource` constructor. The `API_BASE` prefix mirrors the
 * other endpoints in this module; the dev Vite proxy and same-origin
 * production deployments both fall through to a relative URL.
 */
export function apiOperationsEventsUrl(): string {
  return `${API_BASE}${OPERATIONS_EVENTS_PATH}`;
}
/**
 * Path constructor for the streaming raw NDJSON endpoint.
 *
 * Always pre-encodes the session UID so callers cannot accidentally inject
 * path segments. Constructed inline so `streamSessionRaw` (and any future
 * streaming consumer) routes through one literal.
 */
export const RAW_SESSION_PATH = (sessionUid: string): string =>
  `/api/v1/sessions/${encodeURIComponent(sessionUid)}/raw`;

/**
 * Thrown by this module on any non-2xx response. Carries the HTTP status
 * and a short body snippet so callers can render a useful error.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`backend returned ${status}: ${body}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * GET /api/v1/source-sessions -> Vec<SourceSessionView>.
 *
 * Returns the discovered source sessions as reported by the backend.
 * Rejects with an `ApiError` on non-2xx status, or with the underlying
 * error on network / parse failures.
 *
 * The optional `signal` argument is an `AbortSignal` so React effects can
 * cancel the request on unmount.
 */
export async function listSourceSessions(
  signal?: AbortSignal,
): Promise<SourceSessionView[]> {
  return getJson<SourceSessionView[]>(SOURCE_SESSIONS_PATH, signal);
}

/**
 * GET /api/v1/sessions -> Vec<StoredSessionView>.
 *
 * Returns metadata for every session already persisted in the local store.
 * Same error model as `listSourceSessions`.
 */
export async function listStoredSessions(
  signal?: AbortSignal,
): Promise<StoredSessionView[]> {
  return getJson<StoredSessionView[]>(STORED_SESSIONS_PATH, signal);
}

/**
 * GET /api/v1/admin/scan-errors -> Vec<PersistedScanError>.
 *
 * Returns persisted scan errors observed during source scanning.
 * Same error model as `listSourceSessions`.
 */
export async function listScanErrors(
  signal?: AbortSignal,
): Promise<PersistedScanError[]> {
  return getJson<PersistedScanError[]>(SCAN_ERRORS_PATH, signal);
}

/**
 * POST /api/v1/rescan -> SubmitOperationResponse.
 *
 * Enqueues a source rescan operation on the backend. The terminal report is
 * read later from `GET /api/v1/operations/:id`.
 */
export async function triggerRescan(
  signal?: AbortSignal,
): Promise<SubmitOperationResponse> {
  return postJson<SubmitOperationResponse>(RESCAN_PATH, {}, signal);
}

/**
 * POST /api/v1/import -> SubmitOperationResponse.
 *
 * Requests backend import of the provided source session keys.
 * Body conforms to `ImportSourceSessionsRequest` (`{ session_keys: [...] }`).
 * Backend requires the `session_keys` field to be present (no serde default),
 * so an empty list is permitted but the field must be supplied. The terminal
 * import report is read later from `GET /api/v1/operations/:id`.
 */
export async function importSourceSessions(
  sessionKeys: string[],
  signal?: AbortSignal,
): Promise<SubmitOperationResponse> {
  const payload: ImportSourceSessionsRequest = { session_keys: sessionKeys };
  return postJson<SubmitOperationResponse>(IMPORT_PATH, payload, signal);
}

export async function getOperation(
  operationId: string,
  signal?: AbortSignal,
): Promise<Operation> {
  return getJson<Operation>(operationPath(operationId), signal);
}

export async function listOperations(
  query: OperationsListRequest = {},
  signal?: AbortSignal,
): Promise<OperationsListResponse> {
  return getJson<OperationsListResponse>(
    `${OPERATIONS_PATH}${operationsQuery(query)}`,
    signal,
  );
}

export async function cancelOperation(
  operationId: string,
  signal?: AbortSignal,
): Promise<Operation> {
  return deleteJson<Operation>(operationPath(operationId), signal);
}

/**
 * GET /api/v1/sessions/:uid/raw — streaming raw NDJSON.
 *
 * Returns the raw `Response` object so the streaming consumer in
 * `apps/frontend/src/features/sessions/rawPreview.ts` can own the read
 * loop with `getReader()` + `TextDecoder` + line buffer + caps. The
 * full-body `.text()` shortcut is explicitly forbidden for this path
 * because raw payloads can be tens of MB and would freeze the drawer
 * while the body drains (working/phase-4.md §Session Detail Drawer).
 *
 * The optional `signal` argument is an `AbortSignal` so React effects
 * can cancel the in-flight read on drawer close (covers both the
 * pre-cap and post-cap windows per Milestone 4 DoD bullet 2).
 *
 * Throws `ApiError` on non-2xx; the error body is read via the bounded
 * `safeReadText` helper used elsewhere in this module — error bodies
 * are not the streaming raw body, so reading them in full is safe.
 */
export async function streamSessionRaw(
  sessionUid: string,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(`${API_BASE}${RAW_SESSION_PATH(sessionUid)}`, {
    method: "GET",
    headers: { Accept: "application/x-ndjson" },
    signal,
  });
  if (!response.ok) {
    const body = await safeReadText(response);
    throw new ApiError(response.status, body);
  }
  return response;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    const body = await safeReadText(response);
    throw new ApiError(response.status, body);
  }
  return (await response.json()) as T;
}

async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await safeReadText(response);
    throw new ApiError(response.status, text);
  }
  return (await response.json()) as T;
}

async function deleteJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    const text = await safeReadText(response);
    throw new ApiError(response.status, text);
  }
  return (await response.json()) as T;
}

function operationPath(operationId: string): string {
  return `${OPERATIONS_PATH}/${encodeURIComponent(operationId)}`;
}

function operationsQuery(query: OperationsListRequest): string {
  const params = new URLSearchParams();
  if (query.status !== null && query.status !== undefined && query.status.length > 0) {
    params.set("status", query.status.join(","));
  }
  if (query.kind !== null && query.kind !== undefined && query.kind.length > 0) {
    params.set("kind", query.kind.join(","));
  }
  if (query.limit !== null && query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  const value = params.toString();
  return value.length > 0 ? `?${value}` : "";
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
