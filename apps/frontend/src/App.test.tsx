// Mounted-App Bun smoke tests for the Phase 3 inspection surface.
//
// Three test functions cover the F1 + F2 surface:
//
//   (1) read-only three-panel fetch (F1): three initial GETs settle
//       independently and render their fixtures into the three panels;
//   (2) rescan flow (F2): clicking "Rescan" posts to the backend, renders
//       the typed RescanReport summary, and triggers a three-panel
//       refetch so the inspection view reflects the mutation;
//   (3) import flow (F2): selecting a source session checkbox and
//       clicking "Import selected (1)" posts the typed
//       ImportSourceSessionsRequest body (exact JSON-stringified shape),
//       renders the typed ImportReport summary, clears the selection,
//       and triggers a three-panel refetch.
//
// Fixtures are typed from `@contracts/*` via the `./lib/contracts`
// re-export barrel so contract drift surfaces as a type error. `fetch` is
// mocked on `globalThis.fetch` and restored in `afterEach`. happy-dom is
// installed globally by `./test-setup.ts` (preloaded via `bunfig.toml`).
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import {
  IMPORT_PATH,
  RESCAN_PATH,
  SCAN_ERRORS_PATH,
  SOURCE_SESSIONS_PATH,
  STORED_SESSIONS_PATH,
} from "./lib/api";
import type {
  ImportReport,
  PersistedScanError,
  RescanReport,
  SourceSessionView,
  StoredSessionView,
} from "./lib/contracts";

const SOURCE_FIXTURE: SourceSessionView[] = [
  {
    session_key: "claude_code:fixture-abc",
    tool: "claude_code",
    source_session_id: "fixture-abc",
    source_path: "/tmp/fixture/abc.jsonl",
    source_fingerprint: "fp-abc",
    created_at: "2026-04-22T00:00:00Z",
    source_updated_at: "2026-04-22T00:00:00Z",
    project_path: "/tmp/fixture",
    title: null,
    has_subagent_sidecars: false,
    status: "up_to_date",
    session_uid: "abc-uid-123",
    stored_ingested_at: "2026-04-22T00:00:01Z",
  },
];

const STORED_FIXTURE: StoredSessionView[] = [
  {
    status: "up_to_date",
    session_uid: "abc-uid-123",
    tool: "claude_code",
    source_session_id: "fixture-abc",
    source_path: "/tmp/fixture/abc.jsonl",
    source_fingerprint: "fp-abc",
    raw_ref: "raw/abc-uid-123.ndjson",
    created_at: "2026-04-22T00:00:00Z",
    source_updated_at: "2026-04-22T00:00:00Z",
    ingested_at: "2026-04-22T00:00:01Z",
    project_path: "/tmp/fixture",
    title: "Fixture stored session",
    has_subagent_sidecars: false,
  },
];

const SCAN_ERRORS_FIXTURE: PersistedScanError[] = [
  {
    error_id: "err-1",
    tool: "claude_code",
    source_path: "/tmp/fixture/broken.jsonl",
    fingerprint: "fp-broken",
    message: "Malformed NDJSON on line 3",
    first_seen_at: "2026-04-22T00:00:00Z",
    last_seen_at: "2026-04-22T00:00:05Z",
  },
];

const RESCAN_FIXTURE: RescanReport = {
  discovered_files: 12,
  skipped_files: 1,
  parsed_sessions: 11,
  not_stored_sessions: 2,
  outdated_sessions: 0,
  up_to_date_sessions: 9,
  scan_errors: 0,
};

const IMPORT_FIXTURE: ImportReport = {
  requested_sessions: 1,
  inserted_sessions: 0,
  updated_sessions: 1,
  unchanged_sessions: 0,
};

const IMPORT_SOURCE_FIXTURE: SourceSessionView[] = [
  {
    session_key: "claude_code:selected-key-1",
    tool: "claude_code",
    source_session_id: "selected-1",
    source_path: "/tmp/fixture/one.jsonl",
    source_fingerprint: "fp-one",
    created_at: "2026-04-22T00:00:00Z",
    source_updated_at: "2026-04-22T00:00:00Z",
    project_path: "/tmp/fixture",
    title: "Selected one",
    has_subagent_sidecars: false,
    status: "not_stored",
    session_uid: null,
    stored_ingested_at: null,
  },
  {
    session_key: "claude_code:other-key-2",
    tool: "claude_code",
    source_session_id: "other-2",
    source_path: "/tmp/fixture/two.jsonl",
    source_fingerprint: "fp-two",
    created_at: "2026-04-22T00:00:00Z",
    source_updated_at: "2026-04-22T00:00:00Z",
    project_path: "/tmp/fixture",
    title: "Other two",
    has_subagent_sidecars: false,
    status: "not_stored",
    session_uid: null,
    stored_ingested_at: null,
  },
];

let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

function urlOf(input: Request | string | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("mounted App fetches all three panels and renders them independently", async () => {
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      const payload =
        url === SOURCE_SESSIONS_PATH
          ? SOURCE_FIXTURE
          : url === STORED_SESSIONS_PATH
            ? STORED_FIXTURE
            : url === SCAN_ERRORS_PATH
              ? SCAN_ERRORS_FIXTURE
              : null;
      if (payload === null) {
        return new Response(`unexpected url ${url}`, { status: 404 });
      }
      return jsonResponse(payload);
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // Each panel settles independently; wait for one fixture per panel.
  // `findAllByText` tolerates the stored-session UID appearing both as
  // the anchor text and the source-session row's "Stored Copy" cell.
  await screen.findByText("claude_code:fixture-abc");
  await screen.findAllByText("abc-uid-123");
  await screen.findByText("Malformed NDJSON on line 3");

  // (1) fetch called exactly three times with the three expected paths.
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const requestedUrls = fetchMock.mock.calls
    .map((args) => urlOf(args[0] as Request | string | URL))
    .sort();
  expect(requestedUrls).toEqual(
    [SOURCE_SESSIONS_PATH, STORED_SESSIONS_PATH, SCAN_ERRORS_PATH].sort(),
  );

  // (2) DOM contains the source-session fixture session_key.
  expect(
    container.textContent?.includes("claude_code:fixture-abc"),
  ).toBe(true);

  // (3) DOM contains the stored-session fixture session_uid.
  expect(container.textContent?.includes("abc-uid-123")).toBe(true);

  // (4) DOM contains the scan-error fixture message.
  expect(
    container.textContent?.includes("Malformed NDJSON on line 3"),
  ).toBe(true);

  // (5) StatusBadge renders with the expected class combination for the
  // source session row (status `up_to_date` -> `badge` + `up-to-date`).
  const badges = container.querySelectorAll("span.badge.up-to-date");
  expect(badges.length).toBeGreaterThanOrEqual(1);

  // (6) Raw-download anchor targets the exact backend path.
  const rawAnchor = container.querySelector(
    'a[href="/api/v1/sessions/abc-uid-123/raw"]',
  );
  expect(rawAnchor).not.toBeNull();
  expect(rawAnchor?.textContent).toBe("View Raw");

  // (7) Structural: exactly three panel sections (source / stored / errors).
  expect(container.querySelectorAll("section").length).toBe(3);
});

test("clicking Rescan posts to the backend and refetches the three panels", async () => {
  const fetchMock = mock(
    async (
      input: Request | string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = urlOf(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url === RESCAN_PATH) {
        return jsonResponse(RESCAN_FIXTURE);
      }
      if (method === "GET" && url === SOURCE_SESSIONS_PATH) {
        return jsonResponse(SOURCE_FIXTURE);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse(STORED_FIXTURE);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse(SCAN_ERRORS_FIXTURE);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // Wait for the three initial GETs to settle.
  await screen.findByText("claude_code:fixture-abc");
  expect(fetchMock).toHaveBeenCalledTimes(3);

  // Locate the Rescan button; it should be enabled (no mutation pending).
  const rescanButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(1)",
  );
  expect(rescanButton).not.toBeNull();
  expect(rescanButton?.textContent).toBe("Rescan");
  expect(rescanButton?.disabled).toBe(false);

  // Click Rescan.
  await act(async () => {
    rescanButton?.click();
  });

  // Wait until total fetch count reaches 7 (3 initial + 1 POST + 3 refetch).
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  // Verify exactly one POST to the rescan endpoint.
  const rescanCalls = fetchMock.mock.calls.filter((args) => {
    const init = args[1] as RequestInit | undefined;
    const url = urlOf(args[0] as Request | string | URL);
    return (init?.method ?? "GET") === "POST" && url === RESCAN_PATH;
  });
  expect(rescanCalls.length).toBe(1);

  // The rescan handler takes no body; the frontend still sends an empty
  // JSON object so the request is unambiguous. Assert the exact body
  // string so regressions (e.g. switching to undefined or "") surface.
  const rescanCall = fetchMock.mock.calls.find(
    ([url]) => typeof url === "string" && url === RESCAN_PATH,
  );
  expect(rescanCall).toBeDefined();
  const [, rescanInit] = rescanCall!;
  expect(rescanInit?.body).toBe(JSON.stringify({}));

  // After the refetch, the report summary text should appear in the DOM
  // and include at least one of the typed RescanReport numeric fields.
  await waitFor(() => {
    expect(
      container.textContent?.includes("discovered_files"),
    ).toBe(true);
  });
  expect(container.textContent?.includes("12")).toBe(true);

});

test("selecting a source session and clicking Import posts the typed request", async () => {
  const fetchMock = mock(
    async (
      input: Request | string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = urlOf(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url === IMPORT_PATH) {
        return jsonResponse(IMPORT_FIXTURE);
      }
      if (method === "GET" && url === SOURCE_SESSIONS_PATH) {
        return jsonResponse(IMPORT_SOURCE_FIXTURE);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse(STORED_FIXTURE);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse(SCAN_ERRORS_FIXTURE);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // Wait for initial panels to settle.
  await screen.findByText("claude_code:selected-key-1");
  expect(fetchMock).toHaveBeenCalledTimes(3);

  // Find the per-row checkbox for the first source session and click it.
  const rowCheckbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:selected-key-1"]',
  );
  expect(rowCheckbox).not.toBeNull();
  await act(async () => {
    rowCheckbox?.click();
  });

  // The Import button should now read "Import selected (1)" and be enabled.
  const importButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(2)",
  );
  expect(importButton).not.toBeNull();
  expect(importButton?.textContent).toBe("Import selected (1)");
  expect(importButton?.disabled).toBe(false);

  // Click Import.
  await act(async () => {
    importButton?.click();
  });

  // Wait for the POST + refetch cycle to complete (3 initial + 1 POST + 3 refetch).
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  // Capture the POST call; the body must match exactly the typed request.
  const importCalls = fetchMock.mock.calls.filter((args) => {
    const init = args[1] as RequestInit | undefined;
    const url = urlOf(args[0] as Request | string | URL);
    return (init?.method ?? "GET") === "POST" && url === IMPORT_PATH;
  });
  expect(importCalls.length).toBe(1);
  const importInit = importCalls[0]?.[1] as RequestInit | undefined;
  expect(importInit?.body).toBe(
    JSON.stringify({ session_keys: ["claude_code:selected-key-1"] }),
  );

  // After import resolves, the ImportReport summary must render in the DOM.
  await waitFor(() => {
    expect(
      container.textContent?.includes("requested_sessions"),
    ).toBe(true);
  });
  expect(container.textContent?.includes("Import:")).toBe(true);

  // Selection is cleared: the Import button is back to count 0 and disabled.
  await waitFor(() => {
    expect(importButton?.textContent).toBe("Import selected (0)");
  });
  expect(importButton?.disabled).toBe(true);
});

test("rescan prunes stale selection so the import POST matches the visible rows", async () => {
  // Two source rows initially; after a rescan, the second disappears.
  // The user selects both rows before the rescan. After the rescan the
  // Import button count must drop to 1 and the subsequent POST body must
  // only contain the still-visible key.
  const INITIAL_SOURCE: SourceSessionView[] = [
    {
      session_key: "claude_code:key-A",
      tool: "claude_code",
      source_session_id: "key-A",
      source_path: "/tmp/fixture/a.jsonl",
      source_fingerprint: "fp-a",
      created_at: "2026-04-22T00:00:00Z",
      source_updated_at: "2026-04-22T00:00:00Z",
      project_path: "/tmp/fixture",
      title: "A",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
    {
      session_key: "claude_code:key-B",
      tool: "claude_code",
      source_session_id: "key-B",
      source_path: "/tmp/fixture/b.jsonl",
      source_fingerprint: "fp-b",
      created_at: "2026-04-22T00:00:00Z",
      source_updated_at: "2026-04-22T00:00:00Z",
      project_path: "/tmp/fixture",
      title: "B",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
  ];
  const AFTER_RESCAN_SOURCE: SourceSessionView[] = [INITIAL_SOURCE[0]!];

  // Toggle that flips after the rescan POST so the next GET of
  // /source-sessions returns only key-A.
  let rescanned = false;
  const fetchMock = mock(
    async (
      input: Request | string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = urlOf(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url === RESCAN_PATH) {
        rescanned = true;
        return jsonResponse(RESCAN_FIXTURE);
      }
      if (method === "POST" && url === IMPORT_PATH) {
        return jsonResponse(IMPORT_FIXTURE);
      }
      if (method === "GET" && url === SOURCE_SESSIONS_PATH) {
        return jsonResponse(rescanned ? AFTER_RESCAN_SOURCE : INITIAL_SOURCE);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse(STORED_FIXTURE);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse(SCAN_ERRORS_FIXTURE);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // Wait for initial panels to settle; both rows rendered.
  await screen.findByText("claude_code:key-A");
  await screen.findByText("claude_code:key-B");
  expect(fetchMock).toHaveBeenCalledTimes(3);

  // Select both rows via per-row checkboxes.
  const checkboxA = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:key-A"]',
  );
  const checkboxB = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:key-B"]',
  );
  expect(checkboxA).not.toBeNull();
  expect(checkboxB).not.toBeNull();
  await act(async () => {
    checkboxA?.click();
  });
  await act(async () => {
    checkboxB?.click();
  });

  // Sanity: both are selected and the Import button reflects count 2.
  const importButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(2)",
  );
  expect(importButton?.textContent).toBe("Import selected (2)");

  // Install a text-node data setter interceptor BEFORE clicking Rescan so
  // that the moment React writes "Import selected (1)" into the button
  // (i.e., during the commit that applies the post-rescan source-state
  // update), we schedule the Import click via `queueMicrotask`. That
  // click fires before the React scheduler's passive-effect macrotask
  // (which runs the reconciliation `useEffect`) can prune `selected`.
  // Without the click-time visible-intersection filter in `handleImport`,
  // `handleImport` would read the raw `selected = {key-A, key-B}` and
  // POST both keys — reproducing Codex's race. The filter guarantees the
  // POST body matches the visible rows regardless of effect timing.
  let clicked = false;
  const findDescriptor = (
    node: object,
    prop: string,
  ): PropertyDescriptor | undefined => {
    let p: object | null = Object.getPrototypeOf(node);
    while (p !== null) {
      const d = Object.getOwnPropertyDescriptor(p, prop);
      if (d) return d;
      p = Object.getPrototypeOf(p);
    }
    return undefined;
  };
  const textNode = importButton!.firstChild;
  if (textNode) {
    const descriptor = findDescriptor(textNode, "data");
    if (descriptor?.set && descriptor.get) {
      const { set: originalSet, get: originalGet } = descriptor;
      Object.defineProperty(textNode, "data", {
        configurable: true,
        get() {
          return originalGet.call(this);
        },
        set(value: string) {
          originalSet.call(this, value);
          if (!clicked && value === "Import selected (1)") {
            clicked = true;
            // Schedule via `queueMicrotask` so we don't dispatch events
            // during React's commit phase (React won't process the click
            // handler then), but BEFORE React's `setImmediate`-scheduled
            // passive-effect callback runs on the macrotask queue.
            queueMicrotask(() => {
              importButton!.click();
            });
          }
        },
      });
    }
  }

  // Click Rescan WITHOUT wrapping in `act()`. Wrapping in `act()` would
  // force React to drain its post-commit effect queue before the `await
  // act(...)` resolves, closing the race window. By letting the click
  // fire without `act()`, passive effects schedule via the real scheduler
  // (setImmediate-backed macrotasks), giving the setter-hook
  // microtask-queued Import click a chance to fire BEFORE React's
  // reconciliation useEffect macrotask runs. Silence the ensuing "not
  // wrapped in act" warning — it's intentional for this test only.
  const originalActEnv = (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }).IS_REACT_ACT_ENVIRONMENT = false;
  const rescanButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(1)",
  );
  rescanButton?.click();

  // Wait for the interceptor-scheduled Import click to run.
  await waitFor(() => {
    expect(clicked).toBe(true);
  });

  // Restore act-environment flag now that the race-window click has fired.
  (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  }).IS_REACT_ACT_ENVIRONMENT = originalActEnv;

  // The disappearing row must be pruned from the DOM by this point.
  expect(
    container.textContent?.includes("claude_code:key-B"),
  ).toBe(false);

  // Wait for the import POST + its refetch to land. Total so far: 7 from
  // the rescan cycle + 1 import POST + 3 refetch GETs = 11.
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  // Exactly one import POST fired; its body MUST contain only the still-
  // visible key, not the stale key-B that was selected before the rescan.
  const importCalls = fetchMock.mock.calls.filter((args) => {
    const init = args[1] as RequestInit | undefined;
    const url = urlOf(args[0] as Request | string | URL);
    return (init?.method ?? "GET") === "POST" && url === IMPORT_PATH;
  });
  expect(importCalls.length).toBe(1);
  const importInit = importCalls[0]?.[1] as RequestInit | undefined;
  expect(importInit?.body).toBe(
    JSON.stringify({ session_keys: ["claude_code:key-A"] }),
  );
  // And the POST body must NOT include the stale key under any
  // serialization — assert the raw string contains no substring of
  // `key-B`. This is a direct guard against future refactors that might
  // reorder keys or wrap the payload differently.
  expect(
    (importInit?.body as string).includes("claude_code:key-B"),
  ).toBe(false);
});

test("per-panel error isolation: scan-errors 500 leaves source and stored panels rendered", async () => {
  // `Promise.allSettled` in `refetchAll` is supposed to isolate failures
  // per panel: a non-2xx on `/api/v1/admin/scan-errors` must not prevent
  // the source + stored panels from rendering their fixtures. This test
  // pins that contract so a future refactor that short-circuits on the
  // first rejection (e.g. switching to `Promise.all`) surfaces as a
  // failing assertion on either fixture's presence.
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) {
        return jsonResponse(SOURCE_FIXTURE);
      }
      if (url === STORED_SESSIONS_PATH) {
        return jsonResponse(STORED_FIXTURE);
      }
      if (url === SCAN_ERRORS_PATH) {
        return new Response("boom", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // Wait for the source and stored panels to land (they must still render
  // even though the scan-errors panel is about to error out).
  await screen.findByText("claude_code:fixture-abc");
  await screen.findAllByText("abc-uid-123");

  // Wait for the errored panel to surface its `<p role="alert">`.
  await waitFor(() => {
    expect(container.querySelectorAll('[role="alert"]').length).toBe(1);
  });

  // (1) Source fixture session_key is in the DOM -> source panel rendered.
  expect(
    container.textContent?.includes("claude_code:fixture-abc"),
  ).toBe(true);

  // (2) Stored fixture session_uid is in the DOM -> stored panel rendered.
  expect(container.textContent?.includes("abc-uid-123")).toBe(true);

  // (3) Exactly one errored panel in the DOM — `App.tsx`'s `PanelBody`
  // renders `<p role="alert">` only on the error branch, so the count is
  // a precise match for "exactly one panel failed". A regression that
  // shared the error across all three panels (e.g. a `Promise.all` short-
  // circuit) would push this to 3.
  const alerts = container.querySelectorAll('[role="alert"]');
  expect(alerts.length).toBe(1);
  // The surviving alert must belong to the scan-errors panel: its error
  // label starts with "Failed to load scan errors" (see `App.tsx`).
  expect(
    alerts[0]?.textContent?.startsWith("Failed to load scan errors"),
  ).toBe(true);

  // (4) The scan-errors section's tbody has zero rows — the error state
  // renders only the alert paragraph; `ScanErrorsPanel` is not mounted.
  // The three `<section>` children are in DOM order: source, stored,
  // scan-errors (see App.tsx), so the 3rd section is the scan-errors one.
  const sections = container.querySelectorAll("section");
  expect(sections.length).toBe(3);
  const scanErrorsSection = sections[2]!;
  expect(scanErrorsSection.querySelectorAll("tbody tr").length).toBe(0);
});
