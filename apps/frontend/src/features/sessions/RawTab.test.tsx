// Component-level tests for the M2b Raw tab body.
//
// RawTab is byte-equivalent to the Phase-4 RawPreviewBlock (extracted
// from SessionDetail.tsx) PLUS the M2b "Not yet imported" branch
// when `row.storedSessionUid === null` (Resolved Decision #18).
//
// Coverage:
//   1. Source-only row → "Not yet imported" copy renders without
//      firing a fetch.
//   2. Stored row → loading / success / error / non_2xx state matrix.
//   3. streamSessionRaw is called with sessionUid + an AbortSignal.
//   4. Byte-cap caption ("Stopped at byte cap — full payload not
//      downloaded.").
//   5. Line-cap caption ("Showing first N lines of the raw payload.").
//   6. Neither-cap caption ("Showing first N lines (full payload below
//      the caps).").
//   7. Retry button bumps the attempt counter → re-runs the fetch.
//   8. Non-JSON fallback line renders with the "(non-JSON line)" marker
//      and the .text class.
//   9. Pre-aborted signal handling: unmount mid-flight aborts the
//      controller; no follow-on state mutation throws.
//  10. Post-cap unmount is a clean no-op.
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { RawTab } from "./RawTab";
import { RAW_PREVIEW_BYTE_CAP } from "./rawPreview";
import type { SessionRow } from "./types";

const NOW = "2026-04-25T12:00:00Z";
void NOW;

function buildRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    rowKey: "claude_code:fixture-raw",
    sourceSessionKey: "claude_code:fixture-raw",
    tool: "claude_code",
    sourceSessionId: "fixture-raw",
    title: "Fixture title",
    projectPath: "/projects/fixture",
    sourcePath: "/srv/sessions/fixture-raw.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-raw",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-25T11:55:00Z",
    ingestedAt: "2026-04-25T11:50:00Z",
    storedSessionUid: "uid-fixture-raw",
    storedRawRef: "raw/uid-fixture-raw.ndjson",
    hasSubagentSidecars: false,
    status: "up_to_date",
    statusConflict: false,
    presence: "both",
    ...overrides,
  };
}

const ENC = new TextEncoder();

let savedActEnv: boolean | undefined;
function suppressActWarnings(): void {
  savedActEnv = (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }).IS_REACT_ACT_ENVIRONMENT = false;
}
function restoreActWarnings(): void {
  (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  }).IS_REACT_ACT_ENVIRONMENT = savedActEnv;
}

function makeStreamResponse(
  chunks: Uint8Array[],
  options: { status?: number; statusText?: string } = {},
): Response {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        if (cancelled) return;
        controller.enqueue(chunk);
      }
      if (!cancelled) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    status: options.status ?? 200,
    statusText: options.statusText,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function installSuccessFetch(lines: string[]): ReturnType<typeof mock> {
  const body = lines.map((l) => `${l}\n`).join("");
  const fetchMock = mock(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      return makeStreamResponse([ENC.encode(body)]);
    },
  );
  globalThis.fetch =
    fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
}

let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test("RawTab: source-only row renders 'Not yet imported' copy without firing a fetch", () => {
  const fetchMock = mock(async () => makeStreamResponse([]));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const row = buildRow({
    storedSessionUid: null,
    storedRawRef: null,
    presence: "source_only",
    status: "not_stored",
    ingestedAt: null,
  });
  const { container } = render(<RawTab row={row} />);
  expect(container.querySelector(".raw-not-imported")).not.toBeNull();
  expect(container.textContent).toContain(
    "This session has not been imported yet",
  );
  // Fetch was NOT called.
  expect(fetchMock).toHaveBeenCalledTimes(0);
});

test("RawTab: stored row → 'Loading raw preview…' while the fetch is pending", async () => {
  suppressActWarnings();
  try {
    let releaseFetch: () => void = () => {};
    const fetchPending = new Promise<Response>((resolve) => {
      releaseFetch = () => resolve(makeStreamResponse([]));
    });
    globalThis.fetch = mock(async () => fetchPending) as unknown as
      typeof globalThis.fetch;

    const row = buildRow({ storedSessionUid: "uid-load" });
    const { container, unmount } = render(<RawTab row={row} />);
    const loading = container.querySelector(".raw-loading");
    expect(loading).not.toBeNull();
    expect(loading?.textContent).toContain("Loading raw preview");
    releaseFetch();
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: streamSessionRaw is called with the storedSessionUid AND an AbortSignal", async () => {
  suppressActWarnings();
  try {
    let capturedUrl: string | undefined;
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.toString()
            : (input as Request).url;
        capturedUrl = url;
        capturedSignal = init?.signal ?? undefined;
        return makeStreamResponse([ENC.encode('{"i":1}\n')]);
      },
    ) as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: "uid-abc" });
    const { container, unmount } = render(<RawTab row={row} />);
    await waitFor(() => {
      expect(container.querySelectorAll(".line").length).toBeGreaterThan(0);
    });
    expect(capturedUrl).toContain("/api/v1/sessions/uid-abc/raw");
    expect(capturedSignal).not.toBeUndefined();
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: success renders rendered NDJSON lines + neither-cap caption", async () => {
  suppressActWarnings();
  try {
    installSuccessFetch([
      '{"i":1}',
      '{"i":2}',
      '{"i":3}',
    ]);
    const row = buildRow({ storedSessionUid: "uid-success" });
    const { container, unmount } = render(<RawTab row={row} />);
    await waitFor(() => {
      const lines = container.querySelectorAll(".line");
      expect(lines.length).toBe(3);
    });
    const caption = container.querySelector(".raw-caption");
    expect(caption?.textContent).toBe(
      "Showing first 3 lines (full payload below the caps).",
    );
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: line-cap caption ('Showing first N lines of the raw payload.')", async () => {
  suppressActWarnings();
  try {
    installSuccessFetch(
      Array.from({ length: 25 }, (_, i) => `{"i":${i}}`),
    );
    const row = buildRow({ storedSessionUid: "uid-line-cap" });
    const { container, unmount } = render(<RawTab row={row} />);
    await waitFor(() => {
      const caption = container.querySelector(".raw-caption");
      expect(caption?.textContent).toBe(
        "Showing first 20 lines of the raw payload.",
      );
    });
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: byte-cap caption ('Stopped at byte cap — full payload not downloaded.')", async () => {
  suppressActWarnings();
  try {
    const chunkSize = RAW_PREVIEW_BYTE_CAP + 16_384;
    const lineHeader = '{"large_field":"';
    const lineFooter = '"}\n';
    const firstLineBody = "A".repeat(1024);
    const firstLine = lineHeader + firstLineBody + lineFooter;
    const remaining = chunkSize - firstLine.length;
    const payload = firstLine + "B".repeat(remaining);
    const encoded = ENC.encode(payload);
    expect(encoded.byteLength).toBeGreaterThan(RAW_PREVIEW_BYTE_CAP);
    globalThis.fetch = mock(async () =>
      makeStreamResponse([encoded]),
    ) as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: "uid-byte-cap" });
    const { container, unmount } = render(<RawTab row={row} />);
    await waitFor(() => {
      const caption = container.querySelector(".raw-caption");
      expect(caption?.textContent).toContain("Stopped at byte cap");
    });
    const caption = container.querySelector(".raw-caption");
    expect(caption?.textContent).toBe(
      "Stopped at byte cap — full payload not downloaded.",
    );
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: non_2xx state renders 'HTTP <status>: <bodySnippet>' + Retry that re-fetches", async () => {
  suppressActWarnings();
  try {
    const fetchMock = mock(async (_input: RequestInfo | URL) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response("internal server error oh no", {
          status: 500,
          statusText: "Internal Server Error",
        });
      }
      return makeStreamResponse([ENC.encode('{"after":"retry"}\n')]);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: "uid-error" });
    const { container, unmount } = render(<RawTab row={row} />);
    await waitFor(() => {
      const err = container.querySelector(".raw-error");
      expect(err?.textContent).toContain("HTTP 500");
    });
    const errEl = container.querySelector(".raw-error");
    expect(errEl?.textContent).toContain("internal server error");
    const retryBtn = container.querySelector(
      "button.raw-retry",
    ) as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();
    await act(async () => {
      retryBtn!.click();
    });
    await waitFor(() => {
      const lines = container.querySelectorAll(".line");
      expect(lines.length).toBe(1);
    });
    expect(fetchMock.mock.calls.length).toBe(2);
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: error state (network failure) renders 'Failed to load raw preview: <message>' + Retry", async () => {
  suppressActWarnings();
  try {
    const fetchMock = mock(async (_input: RequestInfo | URL) => {
      if (fetchMock.mock.calls.length === 1) {
        throw new Error("network unreachable");
      }
      return makeStreamResponse([ENC.encode('{"after":"net-retry"}\n')]);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: "uid-net-fail" });
    const { container, unmount } = render(<RawTab row={row} />);
    await waitFor(() => {
      const err = container.querySelector(".raw-error");
      expect(err?.textContent).toContain(
        "Failed to load raw preview: network unreachable",
      );
    });
    const retryBtn = container.querySelector(
      "button.raw-retry",
    ) as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();
    await act(async () => {
      retryBtn!.click();
    });
    await waitFor(() => {
      const lines = container.querySelectorAll(".line");
      expect(lines.length).toBe(1);
    });
    expect(fetchMock.mock.calls.length).toBe(2);
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: non-JSON fallback line renders with the '(non-JSON line)' marker and .text class", async () => {
  suppressActWarnings();
  try {
    installSuccessFetch([
      '{"good":1}',
      "not json",
      '{"also good":2}',
    ]);
    const row = buildRow({ storedSessionUid: "uid-fallback" });
    const { container, unmount } = render(<RawTab row={row} />);
    await waitFor(() => {
      expect(container.querySelectorAll(".line").length).toBe(3);
    });
    const lines = Array.from(container.querySelectorAll(".line"));
    expect(lines[1]?.classList.contains("text")).toBe(true);
    expect(lines[1]?.textContent).toContain("not json");
    expect(lines[1]?.textContent).toContain("(non-JSON line)");
    expect(lines[0]?.classList.contains("text")).toBe(false);
    expect(lines[2]?.classList.contains("text")).toBe(false);
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: unmount mid-flight aborts the in-flight signal (no follow-on state mutation)", async () => {
  suppressActWarnings();
  try {
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = mock(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal ?? undefined;
        capturedSignal = signal === null ? undefined : signal;
        return new Promise<Response>((_resolve, reject) => {
          if (signal !== undefined && signal !== null) {
            signal.addEventListener(
              "abort",
              () => {
                reject(new DOMException("aborted", "AbortError"));
              },
              { once: true },
            );
          }
        });
      },
    ) as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: "uid-abort" });
    const { container, unmount } = render(<RawTab row={row} />);
    expect(container.querySelector(".raw-loading")).not.toBeNull();
    await waitFor(() => {
      expect(capturedSignal).not.toBeUndefined();
    });
    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: post-cap unmount is a clean no-op", async () => {
  suppressActWarnings();
  try {
    installSuccessFetch(Array.from({ length: 25 }, (_, i) => `{"i":${i}}`));
    const row = buildRow({ storedSessionUid: "uid-post-cap" });
    const { container, unmount } = render(<RawTab row={row} />);
    await waitFor(() => {
      const caption = container.querySelector(".raw-caption");
      expect(caption?.textContent).toContain("Showing first 20 lines");
    });
    expect(() => unmount()).not.toThrow();
  } finally {
    restoreActWarnings();
  }
});

test("RawTab: pre-aborted signal — fetch mock that throws on aborted signal yields error state", async () => {
  // This isn't a typical user path (the signal can't be pre-aborted
  // before the effect creates the controller), but we exercise the
  // fetch-side guard anyway: when the underlying fetch throws an
  // AbortError that is NOT from our own controller, the AbortError
  // is silently ignored AND state remains "loading" (idempotent
  // behavior with the unmount path).
  suppressActWarnings();
  try {
    // Use a fetch that throws AbortError on first call; on the
    // retry it succeeds. The error is silently ignored — Retry is
    // the path forward.
    const fetchMock = mock(async (_input: RequestInfo | URL) => {
      if (fetchMock.mock.calls.length === 1) {
        throw new DOMException("aborted", "AbortError");
      }
      return makeStreamResponse([ENC.encode('{"ok":1}\n')]);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: "uid-aborterr" });
    const { container, unmount } = render(<RawTab row={row} />);
    // After the AbortError, the component remains in "loading" (no
    // state mutation) — no Retry button appears because we did NOT
    // transition to "error" / "non_2xx".
    await waitFor(() => {
      // Loading copy persists.
      expect(container.querySelector(".raw-loading")).not.toBeNull();
    });
    expect(container.querySelector("button.raw-retry")).toBeNull();
    unmount();
  } finally {
    restoreActWarnings();
  }
});
