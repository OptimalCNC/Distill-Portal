// Single typed frontend API layer.
//
// Every browser -> backend HTTP call in the app MUST go through this module.
// Response shapes are typed via the generated TypeScript contracts in
// components/ui-api-contracts/bindings/* (re-exported from ./contracts);
// handwritten response types are not allowed.
import { API_BASE } from "./config";
import type {
  PersistedScanError,
  SourceSessionView,
  StoredSessionView,
} from "./contracts";

export const SOURCE_SESSIONS_PATH = "/api/v1/source-sessions";
export const STORED_SESSIONS_PATH = "/api/v1/sessions";
export const SCAN_ERRORS_PATH = "/api/v1/admin/scan-errors";

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

async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
