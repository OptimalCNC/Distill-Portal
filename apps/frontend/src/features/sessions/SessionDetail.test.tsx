// Component-level tests for the SessionDetail drawer body.
//
// Coverage map (E1 + E2; tests cover the static drawer body AND the
// streaming raw-preview block):
//
//   1. Every one of the 18 SessionRow fields renders in the metadata
//      list (asserted via the <dt> labels).
//   2. Timestamps render absolute ISO + relative pair via
//      `relativeTimeFrom(now, value)`.
//   3. Source-clock annotation lands on `created_at` AND
//      `source_updated_at`.
//   4. Backend-clock annotation lands on `ingested_at`.
//   5. `statusConflict: true` row renders the "Conflict" badge in the
//      header AND the "(disagreed during load)" muted note in the
//      status row.
//   6. `sourcePathIsStale: true` row labels the source-path block
//      "Last seen source path" instead of "Source path".
//   7. Copy-to-clipboard button calls
//      `navigator.clipboard.writeText(row.sourcePath)` on click; the
//      "Copied" hint appears.
//   8. Copy-to-clipboard fallback: when `navigator.clipboard` is
//      undefined, clicking does NOT throw and the fallback hint
//      "Selected — press Ctrl/Cmd + C to copy" appears.
//   9. "View raw" anchor renders only when `storedSessionUid !== null`
//      (i.e. stored sessions only).
//  10. Raw preview block renders only for stored sessions and shows
//      "Loading raw preview…" while the fetch is in flight (E2).
//  11. Raw preview success: the fetched lines render + the "Showing
//      first N lines" caption is visible (E2).
//  12. Raw preview byte cap: when the streamed body exceeds the cap,
//      the caption reads "Stopped at byte cap — full payload not
//      downloaded." (E2)
//  13. Raw preview error: a non-2xx ApiError surfaces error copy +
//      a Retry button; clicking Retry refires the fetch (E2).
//  14. Drawer-close before cap: aborts the in-flight fetch via the
//      AbortController in the useEffect cleanup; no follow-on state
//      mutation reaches the test (E2).
//  15. Drawer-close after cap: unmount post-cap is a no-op (E2).
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { SessionDetail } from "./SessionDetail";
import { RAW_PREVIEW_BYTE_CAP } from "./rawPreview";
import type { SessionRow } from "./types";

// Pinned `now` so relative-time renderings stay deterministic. Chosen
// 5 minutes after the fixture rows' source_updated_at so the relative
// form reads "5m ago".
const NOW = "2026-04-25T12:00:00Z";

// Reusable fixture builder — every test starts from a populated stored
// row and mutates only what it cares about.
function buildRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    rowKey: "claude_code:fixture-1",
    sourceSessionKey: "claude_code:fixture-1",
    tool: "claude_code",
    sourceSessionId: "fixture-1",
    title: "Fixture title",
    projectPath: "/projects/fixture",
    sourcePath: "/srv/sessions/fixture-1.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-fixture-1",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-25T11:55:00Z",
    ingestedAt: "2026-04-25T11:50:00Z",
    storedSessionUid: "uid-fixture-1",
    storedRawRef: "raw/uid-fixture-1.ndjson",
    hasSubagentSidecars: true,
    status: "up_to_date",
    statusConflict: false,
    presence: "both",
    ...overrides,
  };
}

// Save / restore the navigator mocks across tests so a fallback test
// does not leak into subsequent ones. happy-dom marks
// `navigator.clipboard` as a non-writable property by default, so we
// have to use `Object.defineProperty` (with `configurable: true`) to
// override it.
type ClipboardLike = { writeText?: (s: string) => Promise<void> };
let originalClipboardDescriptor: PropertyDescriptor | undefined;
function setNavigatorClipboard(value: ClipboardLike | undefined) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

// Save / restore globalThis.fetch so the raw-preview integration
// tests can stub fetch deterministically without leaking state into
// other test files.
let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
    globalThis.navigator,
    "clipboard",
  );
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  // Restore the original clipboard descriptor (happy-dom's getter or
  // undefined). Using `defineProperty` here matches the way we set it
  // above so the property always exists in a mutable form between
  // tests.
  if (originalClipboardDescriptor !== undefined) {
    Object.defineProperty(
      globalThis.navigator,
      "clipboard",
      originalClipboardDescriptor,
    );
  } else {
    setNavigatorClipboard(undefined);
  }
  globalThis.fetch = originalFetch;
});

// ---- Helpers for the raw-preview integration tests (E2) ----
//
// The async useEffect inside RawPreviewBlock commits state outside of
// the test's outer act() boundary (the fetch + consumeRawPreview
// promises resolve as microtasks while React's render lifecycle is
// idle). Toggling IS_REACT_ACT_ENVIRONMENT off for the duration of
// each raw-preview test silences the "not wrapped in act" warnings
// that would otherwise flood stderr; we restore the flag afterward.
// Pattern carried over from App.test.tsx where the click-time
// intersection test does the same thing for the same reason.

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

/**
 * Build a Response whose body streams the supplied chunks. Mirrors
 * the helper in `rawPreview.test.ts` but produces a fetch-shaped
 * Response rather than driving the consumer directly.
 */
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

/**
 * Install a fetch mock that returns a streaming success Response
 * built from a set of NDJSON lines. Returns the mock so tests can
 * inspect call counts / abort propagation.
 */
function installSuccessFetch(lines: string[]): ReturnType<typeof mock> {
  const body = lines.map((l) => `${l}\n`).join("");
  const fetchMock = mock(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      // Honor pre-aborted signals (matches real fetch).
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

test("SessionDetail: renders every one of the 18 SessionRow fields in the metadata list", () => {
  const row = buildRow();
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  // The 18 fields in the order rendered by the component. session_uid,
  // session_key, row_key, tool, source_session_id, presence, status,
  // status_conflict, title, project_path, source_path, source_path_is_stale,
  // source_fingerprint, has_subagent_sidecars, stored_raw_ref,
  // created_at, source_updated_at, ingested_at.
  const expectedLabels = [
    "session_key",
    "session_uid",
    "row_key",
    "tool",
    "source_session_id",
    "presence",
    "status",
    "status_conflict",
    "title",
    "project_path",
    "Source path", // becomes "Last seen source path" when sourcePathIsStale=true
    "source_path_is_stale",
    "source_fingerprint",
    "has_subagent_sidecars",
    "stored_raw_ref",
    "created_at (source clock)",
    "source_updated_at (source clock)",
    "ingested_at (backend clock)",
  ];
  expect(dtTexts.length).toBe(expectedLabels.length);
  for (const label of expectedLabels) {
    expect(dtTexts).toContain(label);
  }
});

test("SessionDetail: timestamps render absolute ISO + relative pair", () => {
  const row = buildRow();
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  // source_updated_at = 11:55Z, now = 12:00Z -> "5m ago".
  const text = container.textContent ?? "";
  expect(text).toContain("2026-04-25T11:55:00Z");
  expect(text).toContain("(5m ago)");
  expect(text).toContain("2026-04-25T11:50:00Z"); // ingested_at
  expect(text).toContain("(10m ago)");
  expect(text).toContain("2026-04-22T00:00:00Z"); // created_at
  expect(text).toContain("(3d ago)");
});

test("SessionDetail: source-clock annotation lands on created_at and source_updated_at", () => {
  const row = buildRow();
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("created_at (source clock)");
  expect(dtTexts).toContain("source_updated_at (source clock)");
});

test("SessionDetail: backend-clock annotation lands on ingested_at", () => {
  const row = buildRow();
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("ingested_at (backend clock)");
});

test("SessionDetail: statusConflict=true renders the Conflict badge in the header", () => {
  const row = buildRow({ statusConflict: true });
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const badge = container.querySelector(".drawer-conflict-badge");
  expect(badge).not.toBeNull();
  expect(badge?.textContent).toBe("Conflict");
  expect(badge?.getAttribute("title")).toContain("disagreed during load");
});

test("SessionDetail: statusConflict=false does NOT render the Conflict badge", () => {
  const row = buildRow({ statusConflict: false });
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  expect(container.querySelector(".drawer-conflict-badge")).toBeNull();
});

test("SessionDetail: sourcePathIsStale=true labels the source-path block 'Last seen source path'", () => {
  const row = buildRow({
    sourcePathIsStale: true,
    sourcePath: "/last/known/stale.jsonl",
    presence: "stored_only",
    sourceSessionKey: null,
    rowKey: "stored:uid-stale",
    status: "source_missing",
  });
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("Last seen source path");
  expect(dtTexts).not.toContain("Source path");
  // The actual path still renders.
  expect(container.textContent).toContain("/last/known/stale.jsonl");
});

test("SessionDetail: sourcePathIsStale=false labels the source-path block 'Source path'", () => {
  const row = buildRow({ sourcePathIsStale: false });
  const { container } = render(<SessionDetail row={row} now={NOW} />);
  const dtTexts = Array.from(container.querySelectorAll("dl.drawer-meta dt"))
    .map((el) => el.textContent ?? "");
  expect(dtTexts).toContain("Source path");
  expect(dtTexts).not.toContain("Last seen source path");
});

test("SessionDetail: copy-to-clipboard button calls navigator.clipboard.writeText with row.sourcePath", async () => {
  const writeText = mock(async (_s: string) => {});
  setNavigatorClipboard({ writeText });
  const row = buildRow({ sourcePath: "/copy/test/path.jsonl" });
  const { container, findByText } = render(
    <SessionDetail row={row} now={NOW} />,
  );
  const copyBtn = container.querySelector(
    "button.drawer-copy-btn",
  ) as HTMLButtonElement;
  expect(copyBtn).not.toBeNull();
  await act(async () => {
    copyBtn.click();
    // Allow the async copy promise to resolve so `setCopyHint("copied")`
    // commits.
    await Promise.resolve();
  });
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0]?.[0]).toBe("/copy/test/path.jsonl");
  // The "Copied" hint should appear after the click resolves.
  const hint = await findByText("Copied");
  expect(hint).not.toBeNull();
});

test("SessionDetail: copy fallback when navigator.clipboard is undefined does NOT throw", async () => {
  // Wipe the clipboard so the hot path falls through to the manual
  // selection branch.
  setNavigatorClipboard(undefined);
  const row = buildRow({ sourcePath: "/fallback/test/path.jsonl" });
  const { container, findByText } = render(
    <SessionDetail row={row} now={NOW} />,
  );
  const copyBtn = container.querySelector(
    "button.drawer-copy-btn",
  ) as HTMLButtonElement;
  expect(copyBtn).not.toBeNull();
  // The click must not throw.
  await act(async () => {
    copyBtn.click();
    await Promise.resolve();
  });
  // The fallback hint should render.
  const hint = await findByText(/Selected/);
  expect(hint).not.toBeNull();
});

test("SessionDetail: 'View raw' anchor renders only when storedSessionUid !== null", () => {
  const sourceOnly = buildRow({
    storedSessionUid: null,
    storedRawRef: null,
    presence: "source_only",
    status: "not_stored",
    ingestedAt: null,
  });
  const { container, rerender } = render(
    <SessionDetail row={sourceOnly} now={NOW} />,
  );
  expect(container.querySelector("a.raw-link")).toBeNull();

  const stored = buildRow({ storedSessionUid: "uid-view-raw" });
  rerender(<SessionDetail row={stored} now={NOW} />);
  const link = container.querySelector("a.raw-link") as HTMLAnchorElement;
  expect(link).not.toBeNull();
  expect(link.getAttribute("href")).toBe(
    "/api/v1/sessions/uid-view-raw/raw",
  );
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});

test("SessionDetail: raw preview block renders only for stored sessions and shows loading copy", async () => {
  suppressActWarnings();
  try {
    // For the source-only branch, the section must NOT render at all.
    const sourceOnly = buildRow({
      storedSessionUid: null,
      storedRawRef: null,
      presence: "source_only",
      status: "not_stored",
      ingestedAt: null,
    });
    const { container, rerender, unmount } = render(
      <SessionDetail row={sourceOnly} now={NOW} />,
    );
    expect(container.querySelector(".drawer-raw-preview")).toBeNull();

    // Stored row → section renders, and (since fetch is unmocked) the
    // initial state is "loading". Use a never-resolving fetch so the
    // assertion is deterministic.
    let releaseFetch: () => void = () => {};
    const fetchPending = new Promise<Response>((resolve) => {
      releaseFetch = () => resolve(makeStreamResponse([]));
    });
    globalThis.fetch = mock(async (_input: RequestInfo | URL) => {
      return fetchPending;
    }) as unknown as typeof globalThis.fetch;

    const stored = buildRow({ storedSessionUid: "uid-preview" });
    rerender(<SessionDetail row={stored} now={NOW} />);
    const section = container.querySelector(".drawer-raw-preview");
    expect(section).not.toBeNull();
    expect(section?.querySelector("h3")?.textContent).toBe("Raw preview");
    // Loading copy is visible while the fetch is still pending.
    const loading = container.querySelector(".raw-preview-loading");
    expect(loading).not.toBeNull();
    expect(loading?.textContent).toContain("Loading raw preview");

    // Clean teardown: release the fetch so the unmount cleanup can
    // resolve cleanly without leaking a pending promise into the next
    // test.
    releaseFetch();
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("SessionDetail: raw preview success renders fetched lines + 'Showing first N lines' caption", async () => {
  suppressActWarnings();
  try {
    installSuccessFetch([
      '{"i":1,"t":"msg-1"}',
      '{"i":2,"t":"msg-2"}',
      '{"i":3,"t":"msg-3"}',
    ]);
    const stored = buildRow({ storedSessionUid: "uid-success" });
    const { container, unmount } = render(
      <SessionDetail row={stored} now={NOW} />,
    );

    await waitFor(() => {
      const lines = container.querySelectorAll(".raw-preview-line");
      expect(lines.length).toBe(3);
    });

    const lineTexts = Array.from(
      container.querySelectorAll(".raw-preview-line"),
    ).map((el) => el.textContent ?? "");
    expect(lineTexts[0]).toContain('{"i":1,"t":"msg-1"}');
    expect(lineTexts[2]).toContain('{"i":3,"t":"msg-3"}');

    // Caption matches the unbounded form.
    const caption = container.querySelector(".raw-preview-caption");
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toContain("Showing first 3 lines");
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("SessionDetail: raw preview byte cap renders the 'Stopped at byte cap' caption", async () => {
  suppressActWarnings();
  try {
    // Build a single chunk that exceeds RAW_PREVIEW_BYTE_CAP. One
    // complete line at the head + 'B' padding to drive bytesRead
    // past the cap. Same shape as the rawPreview.test.ts byte-cap
    // test.
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

    const stored = buildRow({ storedSessionUid: "uid-byte-cap" });
    const { container, unmount } = render(
      <SessionDetail row={stored} now={NOW} />,
    );

    // Wait for the byte-cap caption to appear.
    await waitFor(() => {
      const caption = container.querySelector(".raw-preview-caption");
      expect(caption?.textContent).toContain("Stopped at byte cap");
    });
    const caption = container.querySelector(".raw-preview-caption");
    expect(caption?.textContent).toBe(
      "Stopped at byte cap — full payload not downloaded.",
    );
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("SessionDetail: raw preview error renders error copy + a Retry button that re-fetches", async () => {
  suppressActWarnings();
  try {
    // First call: 500 with HTML body. Second call (retry): success
    // with one line so we can prove the click refired the fetch.
    const fetchMock = mock(async (_input: RequestInfo | URL) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response("internal server error oh no", {
          status: 500,
          statusText: "Internal Server Error",
        });
      }
      return makeStreamResponse([
        ENC.encode('{"after":"retry"}\n'),
      ]);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const stored = buildRow({ storedSessionUid: "uid-error" });
    const { container, unmount } = render(
      <SessionDetail row={stored} now={NOW} />,
    );

    // Wait for the non-2xx state to render its copy + Retry.
    await waitFor(() => {
      const err = container.querySelector(".raw-preview-error");
      expect(err?.textContent).toContain("HTTP 500");
    });
    // The body snippet is included.
    const errorEl = container.querySelector(".raw-preview-error");
    expect(errorEl?.textContent).toContain("internal server error");

    // Find the Retry button — there's only one button inside the
    // raw-preview block.
    const retryBtn = Array.from(
      container.querySelectorAll(".drawer-raw-preview button"),
    ).find((b) => b.textContent === "Retry") as HTMLButtonElement | undefined;
    expect(retryBtn).not.toBeUndefined();

    // Click → re-fetch. The mock returns a success on the second
    // call.
    await act(async () => {
      retryBtn!.click();
    });

    await waitFor(() => {
      const lines = container.querySelectorAll(".raw-preview-line");
      expect(lines.length).toBe(1);
    });
    expect(fetchMock.mock.calls.length).toBe(2);
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("SessionDetail: raw preview network-failure renders 'Failed to load raw preview' copy distinct from non-2xx", async () => {
  suppressActWarnings();
  try {
    // First call: fetch itself REJECTS with a generic Error (NOT an
    // ApiError). This is the network-failure path — DNS fail, server
    // unreachable, browser offline — where no Response ever lands. It
    // exercises the catch branch in SessionDetail.tsx (the
    // `err instanceof Error ? err.message : String(err)` line) and is
    // distinct from the non-2xx case (which throws ApiError after a
    // Response is received).
    //
    // Second call (after Retry): success with one line so we can prove
    // the click refired the fetch and the recovery path works.
    const fetchMock = mock(async (_input: RequestInfo | URL) => {
      if (fetchMock.mock.calls.length === 1) {
        throw new Error("network unreachable");
      }
      return makeStreamResponse([
        ENC.encode('{"after":"network-retry"}\n'),
      ]);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const stored = buildRow({ storedSessionUid: "uid-network-fail" });
    const { container, unmount } = render(
      <SessionDetail row={stored} now={NOW} />,
    );

    // Wait for the network-failure state to render its copy + Retry.
    await waitFor(() => {
      const err = container.querySelector(".raw-preview-error");
      expect(err?.textContent).toContain(
        "Failed to load raw preview: network unreachable",
      );
    });
    // Confirm the rendered copy is distinct from the non-2xx pattern.
    const errorEl = container.querySelector(".raw-preview-error");
    expect(errorEl?.textContent).not.toContain("HTTP ");

    // Find the Retry button — there's only one button inside the
    // raw-preview block.
    const retryBtn = Array.from(
      container.querySelectorAll(".drawer-raw-preview button"),
    ).find((b) => b.textContent === "Retry") as HTMLButtonElement | undefined;
    expect(retryBtn).not.toBeUndefined();

    // Click → re-fetch. The mock returns a streaming success on the
    // second call, so the success state replaces the error state.
    await act(async () => {
      retryBtn!.click();
    });

    await waitFor(() => {
      const lines = container.querySelectorAll(".raw-preview-line");
      expect(lines.length).toBe(1);
    });
    expect(fetchMock.mock.calls.length).toBe(2);
    unmount();
  } finally {
    restoreActWarnings();
  }
});

test("SessionDetail: drawer-close before cap aborts the in-flight fetch (no follow-on state mutation)", async () => {
  suppressActWarnings();
  try {
    // The fetch never resolves — we want to prove that unmounting
    // mid-flight (a) calls .abort() on the in-flight signal and (b)
    // does not crash on a late state setter call. Capture the abort
    // signal so we can verify it actually fires.
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = mock(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal ?? undefined;
        capturedSignal = signal === null ? undefined : signal;
        // Return a promise that only resolves when the signal
        // aborts.
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

    const stored = buildRow({ storedSessionUid: "uid-abort-pre" });
    const { container, unmount } = render(
      <SessionDetail row={stored} now={NOW} />,
    );
    // Loading state is up.
    expect(container.querySelector(".raw-preview-loading")).not.toBeNull();
    // Confirm the fetch was issued with an AbortSignal.
    await waitFor(() => {
      expect(capturedSignal).not.toBeUndefined();
    });
    expect(capturedSignal?.aborted).toBe(false);

    // Drawer close == unmount. The cleanup must abort the
    // controller.
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
    // Give any pending microtasks a chance to flush; React must
    // not throw a "set state after unmount" warning here. The
    // test passes simply by not throwing.
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    restoreActWarnings();
  }
});

test("SessionDetail: drawer-close AFTER cap is a no-op (post-cap unmount does not throw)", async () => {
  suppressActWarnings();
  try {
    // 25 lines fits the line cap. We let the success state land,
    // confirm it rendered, then unmount. The test passes simply
    // by not throwing.
    installSuccessFetch(
      Array.from({ length: 25 }, (_, i) => `{"i":${i}}`),
    );
    const stored = buildRow({ storedSessionUid: "uid-abort-post" });
    const { container, unmount } = render(
      <SessionDetail row={stored} now={NOW} />,
    );
    await waitFor(() => {
      const caption = container.querySelector(".raw-preview-caption");
      expect(caption?.textContent).toContain("Showing first 20 lines");
    });
    // Now unmount — must be a clean no-op.
    expect(() => unmount()).not.toThrow();
  } finally {
    restoreActWarnings();
  }
});

test("SessionDetail: raw preview non-JSON line renders the fallback marker", async () => {
  suppressActWarnings();
  try {
    installSuccessFetch([
      '{"good":1}',
      "not json",
      '{"also good":2}',
    ]);
    const stored = buildRow({ storedSessionUid: "uid-fallback" });
    const { container, unmount } = render(
      <SessionDetail row={stored} now={NOW} />,
    );
    await waitFor(() => {
      const lines = container.querySelectorAll(".raw-preview-line");
      expect(lines.length).toBe(3);
    });
    const lines = Array.from(
      container.querySelectorAll(".raw-preview-line"),
    );
    // The middle line carries the .text fallback class AND the
    // marker span, so the user can both visually distinguish
    // (color) and textually identify (marker) the non-JSON row.
    expect(lines[1]?.classList.contains("text")).toBe(true);
    expect(lines[1]?.textContent).toContain("not json");
    expect(lines[1]?.textContent).toContain("(non-JSON line)");
    // The JSON rows do NOT carry the .text class.
    expect(lines[0]?.classList.contains("text")).toBe(false);
    expect(lines[2]?.classList.contains("text")).toBe(false);
    unmount();
  } finally {
    restoreActWarnings();
  }
});
