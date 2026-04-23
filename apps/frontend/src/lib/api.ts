// Single typed frontend API layer.
//
// Every browser -> backend HTTP call in the app MUST go through this module.
// Response shapes are typed via the generated TypeScript contracts in
// components/ui-api-contracts/bindings/* (re-exported from ./contracts);
// handwritten response types are not allowed.
import { API_BASE } from "./config";
import type { SourceSessionView } from "./contracts";

export const SOURCE_SESSIONS_PATH = "/api/v1/source-sessions";

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
  const response = await fetch(`${API_BASE}${SOURCE_SESSIONS_PATH}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    const body = await safeReadText(response);
    throw new ApiError(response.status, body);
  }
  const payload = (await response.json()) as SourceSessionView[];
  return payload;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
