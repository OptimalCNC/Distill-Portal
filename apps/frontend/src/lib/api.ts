// Single typed frontend API layer.
//
// Every browser -> backend HTTP call in the app MUST go through this module.
// Response shapes are typed via the generated TypeScript contracts in
// components/ui-api-contracts/bindings/* (re-exported from ./contracts);
// handwritten response types are not allowed.
import { API_BASE } from "./config";
import type {
  ImportReport,
  ImportSourceSessionsRequest,
  PersistedScanError,
  RescanReport,
  SourceSessionView,
  StoredSessionView,
} from "./contracts";

export const SOURCE_SESSIONS_PATH = "/api/v1/source-sessions";
export const STORED_SESSIONS_PATH = "/api/v1/sessions";
export const SCAN_ERRORS_PATH = "/api/v1/admin/scan-errors";
export const RESCAN_PATH = "/api/v1/admin/rescan";
export const IMPORT_PATH = "/api/v1/source-sessions/import";

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
 * POST /api/v1/admin/rescan -> RescanReport.
 *
 * Triggers a source rescan on the backend and returns the typed report.
 * The backend handler takes no body; we send `Content-Type: application/json`
 * with an empty `{}` body so the request is unambiguous across proxies.
 * Same error model as the GETs.
 */
export async function triggerRescan(): Promise<RescanReport> {
  return postJson<RescanReport>(RESCAN_PATH, {});
}

/**
 * POST /api/v1/source-sessions/import -> ImportReport.
 *
 * Requests backend import of the provided source session keys.
 * Body conforms to `ImportSourceSessionsRequest` (`{ session_keys: [...] }`).
 * Backend requires the `session_keys` field to be present (no serde default),
 * so an empty list is permitted but the field must be supplied.
 */
export async function importSourceSessions(
  sessionKeys: string[],
): Promise<ImportReport> {
  const payload: ImportSourceSessionsRequest = { session_keys: sessionKeys };
  return postJson<ImportReport>(IMPORT_PATH, payload);
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

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await safeReadText(response);
    throw new ApiError(response.status, text);
  }
  return (await response.json()) as T;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
