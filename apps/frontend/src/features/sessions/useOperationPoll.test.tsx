import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import type { Operation } from "../../lib/contracts";
import {
  isOperationTerminal,
  nextOperationPollDelay,
  useOperationPoll,
} from "./useOperationPoll";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  mock.restore();
});

test("nextOperationPollDelay follows the M3 cadence", () => {
  expect(nextOperationPollDelay(0)).toBe(500);
  expect(nextOperationPollDelay(9_999)).toBe(500);
  expect(nextOperationPollDelay(10_000)).toBe(2_000);
  expect(nextOperationPollDelay(59_999)).toBe(2_000);
  expect(nextOperationPollDelay(60_000)).toBe(5_000);
});

test("isOperationTerminal matches the terminal status set", () => {
  expect(isOperationTerminal("queued")).toBe(false);
  expect(isOperationTerminal("running")).toBe(false);
  expect(isOperationTerminal("cancel_requested")).toBe(false);
  expect(isOperationTerminal("succeeded")).toBe(true);
  expect(isOperationTerminal("failed")).toBe(true);
  expect(isOperationTerminal("cancelled")).toBe(true);
  expect(isOperationTerminal("interrupted")).toBe(true);
});

test("useOperationPoll stops immediately on terminal state", async () => {
  const fetchMock = mock(async () => jsonResponse(operationFixture("succeeded")));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { result } = renderHook(() => useOperationPoll());
  const operation = await result.current.pollOperation("op-1");

  expect(operation.status).toBe("succeeded");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("useOperationPoll aborts in-flight polling on unmount", async () => {
  const observed: { signal: AbortSignal | null } = { signal: null };
  const fetchMock = mock(
    async (_input: Request | string | URL, init?: RequestInit) => {
      observed.signal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        observed.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { result, unmount } = renderHook(() => useOperationPoll());
  const poll = result.current.pollOperation("op-1").catch((error) => error);
  unmount();
  const error = await poll;

  expect(observed.signal?.aborted).toBe(true);
  expect(error).toBeInstanceOf(DOMException);
  expect((error as DOMException).name).toBe("AbortError");
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function operationFixture(status: Operation["status"]): Operation {
  return {
    id: "op-1",
    kind: "import_sessions",
    status,
    canonical_params_hash: "hash",
    input_version: "input",
    params_json: {},
    result_json: {},
    error_json: null,
    submitted_at: "2026-04-22T00:00:00Z",
    started_at: "2026-04-22T00:00:00Z",
    finished_at: status === "succeeded" ? "2026-04-22T00:00:01Z" : null,
    cancel_requested_at: null,
  };
}
