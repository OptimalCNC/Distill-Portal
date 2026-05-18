import { useCallback, useEffect, useRef } from "react";
import { getOperation } from "../../lib/api";
import type { Operation, OperationStatus } from "../../lib/contracts";

export const OPERATION_POLL_INITIAL_MS = 500;
export const OPERATION_POLL_AFTER_10S_MS = 2_000;
export const OPERATION_POLL_AFTER_60S_MS = 5_000;

export function isOperationTerminal(status: OperationStatus): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  );
}

export function nextOperationPollDelay(elapsedMs: number): number {
  if (elapsedMs >= 60_000) return OPERATION_POLL_AFTER_60S_MS;
  if (elapsedMs >= 10_000) return OPERATION_POLL_AFTER_10S_MS;
  return OPERATION_POLL_INITIAL_MS;
}

/**
 * Single-shot operation read. Issues ONE `GET /api/v1/operations/:id` and
 * returns the row — no loop, no terminal-state polling. The optional
 * `signal` is forwarded straight to `getOperation()` so callers can abort
 * an in-flight read (e.g. when an SSE event arrives first and renders the
 * pending fetch obsolete).
 *
 * Consumed by `useOperationsFeed` during its polling-fallback window. The
 * fallback's outer cadence (5 s `setInterval`) lives at the call site;
 * this helper stays pure and unaware of timers.
 */
export function pollOperationOnce(
  operationId: string,
  signal?: AbortSignal,
): Promise<Operation> {
  return getOperation(operationId, signal);
}

export function useOperationPoll(): {
  pollOperation: (operationId: string) => Promise<Operation>;
  abortAll: () => void;
} {
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  const abortAll = useCallback(() => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
  }, []);

  const pollOperation = useCallback(async (operationId: string) => {
    controllersRef.current.get(operationId)?.abort();
    const controller = new AbortController();
    controllersRef.current.set(operationId, controller);
    const startedAt = Date.now();

    try {
      for (;;) {
        const operation = await getOperation(operationId, controller.signal);
        if (isOperationTerminal(operation.status)) {
          return operation;
        }
        await sleep(
          nextOperationPollDelay(Date.now() - startedAt),
          controller.signal,
        );
      }
    } finally {
      if (controllersRef.current.get(operationId) === controller) {
        controllersRef.current.delete(operationId);
      }
    }
  }, []);

  useEffect(() => abortAll, [abortAll]);

  return { pollOperation, abortAll };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
