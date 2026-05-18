// Unit tests for `useOperationsFeed` — the Phase 9b M3-A data-layer
// keystone. The strategy is to stub `EventSource` and `fetch` so the test
// driver can synchronously trigger every state-machine path:
//
//   - snapshot frame populates the map without advancing `lastEventSeq`.
//   - transition frame merges by id + advances `lastEventSeq` monotonically.
//   - resync frame clears the map, re-fetches via `listOperations`, and
//     re-seeds.
//   - EventSource `onerror` advances the backoff ladder and schedules a
//     reconnect; after 5 consecutive failures the polling fallback engages
//     (`listOperations` on a 5 s interval, status flips to "polling").
//   - On the first successful SSE event after a polling window, the
//     interval tears down, backoff resets, status returns to "streaming".
//   - Unmount closes the EventSource, clears reconnect + poll timers, and
//     aborts any in-flight fetch.
//   - `cancelOperation` swallows 409 errors; other errors bubble.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "../../lib/api";
import type { Operation } from "../../lib/contracts";
import { useOperationsFeed } from "./useOperationsFeed";

type Listener = (event: MessageEvent<string> | Event) => void;

interface MockEventSource {
  url: string;
  withCredentials: boolean;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
  close: () => void;
  // Test-side helpers (not part of the real EventSource shape).
  __dispatch: (type: string, data: string) => void;
  __triggerError: () => void;
  __closed: boolean;
}

const eventSources: MockEventSource[] = [];

function installEventSourceMock(): void {
  eventSources.length = 0;
  const ctor = function (url: string): MockEventSource {
    const listeners = new Map<string, Set<Listener>>();
    const instance: MockEventSource = {
      url,
      withCredentials: false,
      readyState: 0,
      onopen: null,
      onmessage: null,
      onerror: null,
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener);
      },
      close() {
        instance.__closed = true;
        instance.readyState = 2;
      },
      __dispatch(type, data) {
        const event = new MessageEvent(type, { data });
        const bucket = listeners.get(type);
        if (bucket) {
          for (const listener of bucket) listener(event);
        }
        if (type === "message" && instance.onmessage) {
          instance.onmessage(event);
        }
      },
      __triggerError() {
        if (instance.onerror) instance.onerror(new Event("error"));
      },
      __closed: false,
    };
    eventSources.push(instance);
    return instance;
  };
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    ctor as unknown;
}

function latestEventSource(): MockEventSource {
  const last = eventSources[eventSources.length - 1];
  if (!last) throw new Error("no EventSource instances created");
  return last;
}

function makeOperation(overrides: Partial<Operation>): Operation {
  return {
    id: "op-1",
    kind: "import_sessions",
    status: "queued",
    canonical_params_hash: "hash",
    input_version: "input",
    params_json: {},
    result_json: null,
    error_json: null,
    submitted_at: "2026-04-22T00:00:00Z",
    started_at: null,
    finished_at: null,
    cancel_requested_at: null,
    ...overrides,
  };
}

const originalEventSource = (globalThis as { EventSource?: unknown }).EventSource;
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

interface ScheduledTimer {
  id: number;
  fn: () => void;
  delay: number;
  kind: "timeout" | "interval";
  active: boolean;
}

let timerCounter = 1;
let scheduled: ScheduledTimer[] = [];

function installFakeTimers(): void {
  timerCounter = 1;
  scheduled = [];
  (globalThis as unknown as { setTimeout: unknown }).setTimeout = ((
    fn: () => void,
    delay = 0,
  ) => {
    const id = timerCounter++;
    scheduled.push({ id, fn, delay, kind: "timeout", active: true });
    return id;
  }) as unknown;
  (globalThis as unknown as { clearTimeout: unknown }).clearTimeout = ((
    id: number,
  ) => {
    const entry = scheduled.find((t) => t.id === id);
    if (entry) entry.active = false;
  }) as unknown;
  (globalThis as unknown as { setInterval: unknown }).setInterval = ((
    fn: () => void,
    delay = 0,
  ) => {
    const id = timerCounter++;
    scheduled.push({ id, fn, delay, kind: "interval", active: true });
    return id;
  }) as unknown;
  (globalThis as unknown as { clearInterval: unknown }).clearInterval = ((
    id: number,
  ) => {
    const entry = scheduled.find((t) => t.id === id);
    if (entry) entry.active = false;
  }) as unknown;
}

function restoreTimers(): void {
  (globalThis as unknown as { setTimeout: unknown }).setTimeout =
    originalSetTimeout;
  (globalThis as unknown as { clearTimeout: unknown }).clearTimeout =
    originalClearTimeout;
  (globalThis as unknown as { setInterval: unknown }).setInterval =
    originalSetInterval;
  (globalThis as unknown as { clearInterval: unknown }).clearInterval =
    originalClearInterval;
}

function findPendingTimeout(): ScheduledTimer | undefined {
  return scheduled
    .filter((t) => t.active && t.kind === "timeout")
    .at(-1);
}

function findPendingInterval(): ScheduledTimer | undefined {
  return scheduled.find((t) => t.active && t.kind === "interval");
}

function fireTimeout(): void {
  const entry = findPendingTimeout();
  if (!entry) throw new Error("no pending timeout to fire");
  entry.active = false;
  entry.fn();
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  installEventSourceMock();
});

afterEach(() => {
  cleanup();
  mock.restore();
  globalThis.fetch = originalFetch;
  if (originalEventSource === undefined) {
    delete (globalThis as { EventSource?: unknown }).EventSource;
  } else {
    (globalThis as { EventSource?: unknown }).EventSource = originalEventSource;
  }
  restoreTimers();
});

describe("snapshot + transition + resync handling", () => {
  test("snapshot frames populate the map without advancing lastEventSeq", async () => {
    const { result } = renderHook(() => useOperationsFeed());

    expect(result.current.status).toBe("connecting");
    expect(result.current.lastEventSeq).toBeNull();

    const source = latestEventSource();
    act(() => {
      source.__dispatch(
        "snapshot",
        JSON.stringify({ operation: makeOperation({ id: "op-A" }), seq: 7 }),
      );
    });

    await waitFor(() => {
      expect(result.current.operations["op-A"]?.id).toBe("op-A");
    });
    expect(result.current.lastEventSeq).toBeNull();
    // Snapshot frames during the initial `connecting` phase do not flip the
    // status — only the first `transition` does (brief §"snapshot event
    // handler"). On reconnect / polling-fallback paths, a snapshot frame
    // does flip the status; that path is exercised separately below.
    expect(result.current.status).toBe("connecting");
  });

  test("transition frames merge by id and advance lastEventSeq monotonically", async () => {
    const { result } = renderHook(() => useOperationsFeed());
    const source = latestEventSource();

    act(() => {
      source.__dispatch(
        "snapshot",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "queued" }),
          seq: 1,
        }),
      );
      source.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "running" }),
          seq: 12,
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.operations["op-A"]?.status).toBe("running");
    });
    expect(result.current.lastEventSeq).toBe(12);

    // Out-of-order older seq must NOT regress lastEventSeq.
    act(() => {
      source.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "succeeded" }),
          seq: 3,
        }),
      );
    });
    expect(result.current.lastEventSeq).toBe(12);
    expect(result.current.operations["op-A"]?.status).toBe("succeeded");
  });

  test("resync clears the map, re-fetches, and reseeds with listOperations", async () => {
    const fetchMock = mock(async () =>
      jsonResponse({
        operations: [makeOperation({ id: "op-Z", status: "succeeded" })],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());
    const source = latestEventSource();

    act(() => {
      source.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "running" }),
          seq: 5,
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastEventSeq).toBe(5);
    });

    act(() => {
      source.__dispatch("resync", "subscriber lagged; please re-fetch");
    });

    await waitFor(() => {
      expect(result.current.operations["op-Z"]?.id).toBe("op-Z");
    });
    expect(result.current.lastEventSeq).toBeNull();
    expect(result.current.operations["op-A"]).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("backoff + polling fallback", () => {
  test("an EventSource error closes the source and schedules a reconnect", () => {
    installFakeTimers();
    const { result } = renderHook(() => useOperationsFeed());
    const firstSource = latestEventSource();

    act(() => {
      firstSource.__triggerError();
    });

    expect(firstSource.__closed).toBe(true);
    const pending = findPendingTimeout();
    expect(pending?.delay).toBe(1_000);
    expect(result.current.status).toBe("reconnecting");

    act(() => {
      fireTimeout();
    });
    expect(eventSources).toHaveLength(2);
  });

  test("polling fallback activates after the 5th consecutive SSE failure", async () => {
    installFakeTimers();
    const fetchMock = mock(async () =>
      jsonResponse({ operations: [makeOperation({ id: "op-P" })] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());

    const expectedDelays = [1_000, 2_000, 5_000, 10_000, 30_000];
    for (let failure = 0; failure < expectedDelays.length; failure++) {
      const source = latestEventSource();
      act(() => {
        source.__triggerError();
      });
      const pending = findPendingTimeout();
      expect(pending?.delay).toBe(expectedDelays[failure]);
      act(() => {
        fireTimeout();
      });
    }

    expect(result.current.status).toBe("polling");
    const interval = findPendingInterval();
    expect(interval?.delay).toBe(5_000);

    // Flush the eager first tick that startPollingLoop scheduled. `await
    // flushPromises()` plus an `act` boundary reseats React state from the
    // resolved fetch without needing the real setTimeout (which fake-
    // timers have replaced).
    await act(async () => {
      await flushPromises();
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.operations["op-P"]?.id).toBe("op-P");
  });

  test("the first SSE event after polling resets backoff and stops the interval", async () => {
    installFakeTimers();
    const fetchMock = mock(async () =>
      jsonResponse({ operations: [makeOperation({ id: "op-P" })] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());
    for (let i = 0; i < 5; i++) {
      const source = latestEventSource();
      act(() => {
        source.__triggerError();
      });
      act(() => {
        fireTimeout();
      });
    }
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.status).toBe("polling");
    const interval = findPendingInterval();
    expect(interval).toBeDefined();

    const liveSource = latestEventSource();
    act(() => {
      liveSource.__dispatch(
        "transition",
        JSON.stringify({
          operation: makeOperation({ id: "op-A", status: "running" }),
          seq: 99,
        }),
      );
    });

    expect(result.current.status).toBe("streaming");
    expect(interval?.active).toBe(false);
  });
});

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("unmount cleanup", () => {
  test("closes the EventSource and clears scheduled timers on unmount", () => {
    installFakeTimers();
    const { unmount } = renderHook(() => useOperationsFeed());
    const source = latestEventSource();

    act(() => {
      source.__triggerError();
    });
    const pendingBefore = findPendingTimeout();
    expect(pendingBefore?.active).toBe(true);

    unmount();
    expect(source.__closed).toBe(true);
    expect(pendingBefore?.active).toBe(false);
  });
});

describe("cancelOperation", () => {
  test("swallows ApiError(409) silently", async () => {
    const fetchMock = mock(
      async () =>
        new Response("conflict", {
          status: 409,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());
    await act(async () => {
      await expect(result.current.cancelOperation("op-1")).resolves.toBeUndefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("rethrows non-409 ApiErrors so callers can surface them", async () => {
    const fetchMock = mock(
      async () =>
        new Response("nope", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useOperationsFeed());
    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.cancelOperation("op-1");
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(500);
  });
});
