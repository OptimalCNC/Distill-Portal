// Mounted-App Bun smoke tests for the unified inspection surface.
//
// Phase 4 Milestone 2 retired the dual-table layout; the inspection
// page now renders one merged session list (`SessionsView` +
// `SessionsTable` under `src/features/sessions/`) plus a collapsible
// `ScanErrorsCallout`. The orchestration is unchanged: three parallel
// GETs settled with `Promise.allSettled`, per-panel error isolation,
// `Set<string>` selection holding backend-provided `session_key`
// values, click-time intersection in `handleImport` extended to filter
// by importability.
//
// Coverage:
//
//   (1) Unified-list happy path: three initial GETs settle and their
//       fixtures all show up in one merged table. The scan-error
//       fixture surfaces in the `ScanErrorsCallout`.
//   (2) Rescan flow: click "Rescan", typed RescanReport summary
//       renders, three-panel refetch fires (3 + 1 + 3 = 7 calls).
//   (3) Import flow: select a `not_stored` row, click
//       "Import selected (1)", typed ImportSourceSessionsRequest body
//       fires, typed ImportReport summary renders, selection clears,
//       three-panel refetch fires.
//   (4) F2 click-time intersection regression: a rescan that prunes
//       a selected row mid-click must NOT ship the stale key in the
//       import POST. Test source preserved verbatim from the Phase 3
//       version (only fixture/selector adjustments — see Handoff Notes).
//   (5) Per-panel error isolation: source 500 / stored 500 /
//       scan-errors 500 each leave the surviving fetches rendered.
//   (6) Importability rule at POST: a fixture with one importable +
//       multiple non-importable rows; manual injection of a rogue key
//       into `selected` does not leak into the POST body.
//   (7) statusConflict affordance: a `presence: both` row with
//       disagreeing source/stored statuses renders the (refresh) hint.
//   (8) `stored_only + source_missing` row renders the last-known
//       source path with the title= hover hint.
import { afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

// happy-dom installs `localStorage` on `window` but not on the bare
// `globalThis` object that test-setup.ts initializes. App reads via
// `globalThis.localStorage` (through `readLastRescan` /
// `useSessionFilters`). Promote it once so the M5 caption tests
// can pre-seed the key. Mirrors the pattern in
// `useSessionFilters.test.ts` and `lastRescan.test.ts`.
beforeAll(() => {
  const windowAny = (globalThis as unknown as { window?: { localStorage?: Storage } })
    .window;
  if (windowAny?.localStorage && !globalThis.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      value: windowAny.localStorage,
      configurable: true,
      writable: true,
    });
  }
});

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
  // Clear persisted filter blob + last-rescan timestamp between
  // tests so leftover state from a prior test (e.g. importableOnly
  // set to true in the M3 empty-state test) doesn't bleed forward
  // and break the next render's defaults.
  try {
    globalThis.localStorage?.clear();
  } catch {
    // ignore — some tests deliberately disable storage.
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

test("mounted App fetches all three panels and renders the unified table", async () => {
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

  // Each fetch settles independently; wait for each fixture's signature.
  await screen.findByText("claude_code:fixture-abc");
  await screen.findByText("Malformed NDJSON on line 3");

  // (1) Three initial GETs to the three known paths.
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const requestedUrls = fetchMock.mock.calls
    .map((args) => urlOf(args[0] as Request | string | URL))
    .sort();
  expect(requestedUrls).toEqual(
    [SOURCE_SESSIONS_PATH, STORED_SESSIONS_PATH, SCAN_ERRORS_PATH].sort(),
  );

  // (2) Source-fixture session_key appears once (in the merged table).
  expect(
    container.textContent?.includes("claude_code:fixture-abc"),
  ).toBe(true);

  // (3) Stored fixture session_uid appears in the merged table (the
  //     `up_to_date` join path emits the UID in the stored-copy cell).
  expect(container.textContent?.includes("abc-uid-123")).toBe(true);

  // (4) Scan-error message appears in the ScanErrorsCallout.
  expect(
    container.textContent?.includes("Malformed NDJSON on line 3"),
  ).toBe(true);

  // (5) StatusBadge renders with the expected class for the `up_to_date`
  //     row (joined source ⊕ stored).
  const badges = container.querySelectorAll("span.badge.up-to-date");
  expect(badges.length).toBeGreaterThanOrEqual(1);

  // (6) Raw-download anchor targets the exact backend path. The unified
  //     table emits the View Raw anchor whenever a stored UID is present.
  const rawAnchor = container.querySelector(
    'a[href="/api/v1/sessions/abc-uid-123/raw"]',
  );
  expect(rawAnchor).not.toBeNull();
  expect(rawAnchor?.textContent).toBe("View Raw");

  // (7) Exactly one merged `<table>` for the unified list. The
  //     ScanErrorsCallout's table is in addition (one for the unified
  //     list, one for the scan-errors callout).
  const tables = container.querySelectorAll("table");
  expect(tables.length).toBe(2);

  // (8) The fixture `up_to_date` row is NOT importable — there should
  //     be no per-row checkbox for it. Only the disabled header
  //     checkbox is present.
  const importCheckbox = container.querySelector(
    'input[aria-label="Select claude_code:fixture-abc"]',
  );
  expect(importCheckbox).toBeNull();
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

  // After the refetch, the rescan-success toast lands. M5 swapped the
  // M3-era inline `lastReport` text for a Toast queue; the title +
  // plain-language summary go in the toast body and the typed count
  // names live inside the `<details>` disclosure (textContent walks
  // into closed `<details>` elements, so the typed names are still
  // findable in `container.textContent`).
  await waitFor(() => {
    expect(
      container.textContent?.includes("Rescan complete"),
    ).toBe(true);
  });
  expect(container.textContent?.includes("discovered_files")).toBe(true);
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

  // After import resolves, the import-success toast lands. M5 swapped
  // the M3-era inline `lastReport` text for a Toast queue; the title
  // + plain-language summary go in the toast body and the typed
  // count names live inside the `<details>` disclosure (textContent
  // walks closed `<details>` blocks, so the typed names remain
  // findable).
  await waitFor(() => {
    expect(
      container.textContent?.includes("Import complete"),
    ).toBe(true);
  });
  expect(
    container.textContent?.includes("requested_sessions"),
  ).toBe(true);

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
  //
  // This is the F2 regression test — pinned source unchanged from the
  // Phase 3 version because the selectors and timing it relies on are
  // ActionBar+button shape, not the dual-table layout. The unified
  // SessionsTable still emits the same `Select <key>` aria-labels for
  // importable rows, and `App.tsx` still owns `selected: Set<string>`
  // and the Import handler.
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

test("per-panel error isolation: source 500 leaves stored rows rendered in the unified table", async () => {
  // The merged-list contract: when source fetch fails, the unified
  // table still renders the stored-side rows (presence: stored_only)
  // plus a banner alerting to the source failure. The page must NOT
  // be blank, and the stored fixture's session_uid must remain
  // visible.
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) {
        return new Response("boom", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (url === STORED_SESSIONS_PATH) {
        return jsonResponse(STORED_FIXTURE);
      }
      if (url === SCAN_ERRORS_PATH) {
        return jsonResponse(SCAN_ERRORS_FIXTURE);
      }
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);
  await screen.findByText("Malformed NDJSON on line 3");

  // Wait for the banner to appear and the merged-row body to settle.
  await waitFor(() => {
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  // Stored fixture session_uid is in the DOM -> stored-side rendered.
  expect(container.textContent?.includes("abc-uid-123")).toBe(true);

  // The source-failure banner is in the DOM and identifies the source side.
  const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
  const sourceAlert = alerts.find((el) =>
    el.textContent?.startsWith("Failed to load source sessions"),
  );
  expect(sourceAlert).not.toBeUndefined();

  // Exactly one merged-list row in the table (the stored fixture).
  const tbodyRows = container.querySelectorAll("tbody tr");
  // 1 unified-table row + N callout rows; the unified table should
  // hold exactly the single stored fixture.
  // The unified table is the FIRST table in the DOM (the callout's
  // table comes after).
  const tables = container.querySelectorAll("table");
  expect(tables.length).toBe(2);
  const unifiedTable = tables[0]!;
  expect(unifiedTable.querySelectorAll("tbody tr").length).toBe(1);
  // Source-only fixture-source-row was NOT rendered in the table.
  expect(
    container.textContent?.includes("claude_code:fixture-abc"),
  ).toBe(false);
  // Sanity: the body has at least the unified table row plus the
  // callout's row.
  expect(tbodyRows.length).toBeGreaterThanOrEqual(2);
});

test("per-panel error isolation: stored 500 leaves source rows rendered in the unified table", async () => {
  // The mirror-image of the source-500 case: when stored fetch fails,
  // the unified table renders the source-side rows (presence:
  // source_only) plus a banner alerting to the stored failure.
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) {
        return jsonResponse(SOURCE_FIXTURE);
      }
      if (url === STORED_SESSIONS_PATH) {
        return new Response("boom", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (url === SCAN_ERRORS_PATH) {
        return jsonResponse(SCAN_ERRORS_FIXTURE);
      }
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);
  await screen.findByText("claude_code:fixture-abc");

  // Wait for the banner to appear.
  await waitFor(() => {
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  // Source fixture session_key is in the DOM -> source-side rendered.
  expect(
    container.textContent?.includes("claude_code:fixture-abc"),
  ).toBe(true);

  // Banner identifies the stored side.
  const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
  const storedAlert = alerts.find((el) =>
    el.textContent?.startsWith("Failed to load stored sessions"),
  );
  expect(storedAlert).not.toBeUndefined();

  // Unified table holds exactly the source fixture; no stored UID
  // is in any row of the unified table.
  const tables = container.querySelectorAll("table");
  expect(tables.length).toBe(2);
  const unifiedTable = tables[0]!;
  expect(unifiedTable.querySelectorAll("tbody tr").length).toBe(1);
});

test("per-panel error isolation: scan-errors 500 leaves the unified table rendered", async () => {
  // The unified-list+callout contract: when only scan-errors fails,
  // the unified table renders both source and stored rows (joined),
  // and the scan-errors error surfaces as its own [role="alert"]
  // INSTEAD OF the empty ScanErrorsCallout (the callout collapses on
  // empty; the alert replaces it on error).
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
  await screen.findByText("claude_code:fixture-abc");

  // Wait for the scan-errors alert.
  await waitFor(() => {
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(1);
  });

  // Unified table renders both fixtures (joined into one row).
  expect(
    container.textContent?.includes("claude_code:fixture-abc"),
  ).toBe(true);
  expect(container.textContent?.includes("abc-uid-123")).toBe(true);

  // The surviving alert mentions the scan-errors fetch.
  const alerts = container.querySelectorAll('[role="alert"]');
  expect(
    alerts[0]?.textContent?.startsWith("Failed to load scan errors"),
  ).toBe(true);

  // The unified table is the only `<table>` because the empty
  // ScanErrorsCallout doesn't render and the error displaces it.
  const tables = container.querySelectorAll("table");
  expect(tables.length).toBe(1);
});

test("scan-errors error path: Retry button refetches all three panels", async () => {
  // Per the M3 partial-fetch-failure contract, every panel-error
  // surface must offer a Retry/refetch affordance. The scan-errors
  // alert is the third such surface (the source/stored alerts inside
  // SessionsView already have one). After the initial 500 the user
  // clicks Retry; the click invokes `refetchAll`, which fires three
  // fresh GETs (source + stored + scan-errors). On the second pass
  // we serve the scan-errors fixture so the alert is replaced by the
  // ScanErrorsCallout — proving the refetch landed.
  let scanErrorsCallCount = 0;
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(SOURCE_FIXTURE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse(STORED_FIXTURE);
      if (url === SCAN_ERRORS_PATH) {
        scanErrorsCallCount += 1;
        if (scanErrorsCallCount === 1) {
          return new Response("boom", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return jsonResponse(SCAN_ERRORS_FIXTURE);
      }
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // Wait for the initial render: the unified table renders + the
  // scan-errors alert appears.
  await screen.findByText("claude_code:fixture-abc");
  await waitFor(() => {
    const alerts = Array.from(
      container.querySelectorAll('[role="alert"]'),
    );
    const scanAlert = alerts.find((el) =>
      el.textContent?.startsWith("Failed to load scan errors"),
    );
    expect(scanAlert).not.toBeUndefined();
  });
  // Three initial GETs (source + stored + scan-errors).
  const initialCallCount = fetchMock.mock.calls.length;
  expect(initialCallCount).toBe(3);

  // The Retry button lives inside the scan-errors alert (NOT inside
  // SessionsView's per-section banners, which fire only when source
  // or stored fail).
  const alerts = Array.from(
    container.querySelectorAll('[role="alert"]'),
  );
  const scanAlert = alerts.find((el) =>
    el.textContent?.startsWith("Failed to load scan errors"),
  );
  expect(scanAlert).not.toBeUndefined();
  const retryButton = scanAlert!.querySelector<HTMLButtonElement>(
    "button",
  );
  expect(retryButton).not.toBeNull();
  expect(retryButton!.textContent).toBe("Retry");

  // Click Retry -> refetchAll() fires three fresh GETs.
  await act(async () => {
    retryButton!.click();
  });
  await waitFor(() => {
    expect(fetchMock.mock.calls.length).toBe(initialCallCount + 3);
  });
  // After the refetch, scan-errors returned the fixture so the alert
  // is gone and the ScanErrorsCallout renders the message instead.
  await waitFor(() => {
    expect(
      container.textContent?.includes("Malformed NDJSON on line 3"),
    ).toBe(true);
  });
  const remainingScanAlerts = Array.from(
    container.querySelectorAll('[role="alert"]'),
  ).filter((el) =>
    el.textContent?.startsWith("Failed to load scan errors"),
  );
  expect(remainingScanAlerts.length).toBe(0);
});

test("importability rule at POST: rogue keys in selection do not leak into the import body", async () => {
  // Fixture with one importable + multiple non-importable rows.
  // After the user selects the one importable row, the POST body
  // must contain ONLY the importable session_key, even if the user
  // (or a future refactor) somehow leaks a non-importable key into
  // the `selected` set. We force the leak deterministically by
  // clicking the importable checkbox AND then injecting a rogue
  // identity via the only accessible mutation path: clicking on a
  // checkbox that isn't actually rendered would be impossible by
  // construction, so we instead build a test in three layers:
  //
  //   (a) Render the App with the mixed fixture.
  //   (b) Verify that exactly one per-row checkbox is in the DOM
  //       (the importable row's), and that clicking it sets count=1.
  //   (c) Verify that the import POST contains exactly the importable
  //       key, never a non-importable identity from the fixture.
  //
  // Coverage of the actual click-time intersection happens in the F2
  // regression above (where the rescan removes a row from view but
  // leaves it in `selected`).
  const MIXED_FIXTURE: SourceSessionView[] = [
    {
      session_key: "claude_code:not-stored-key-1",
      tool: "claude_code",
      source_session_id: "not-stored-1",
      source_path: "/tmp/fixture/ns1.jsonl",
      source_fingerprint: "fp-ns-1",
      created_at: null,
      source_updated_at: null,
      project_path: null,
      title: "Not stored 1",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
    {
      session_key: "claude_code:up-to-date-key-1",
      tool: "claude_code",
      source_session_id: "up-1",
      source_path: "/tmp/fixture/up1.jsonl",
      source_fingerprint: "fp-up-1",
      created_at: null,
      source_updated_at: null,
      project_path: null,
      title: "Up to date 1",
      has_subagent_sidecars: false,
      status: "up_to_date",
      session_uid: "uid-up-1",
      stored_ingested_at: "2026-04-22T00:00:00Z",
    },
  ];
  const MIXED_STORED: StoredSessionView[] = [
    {
      status: "up_to_date",
      session_uid: "uid-up-1",
      tool: "claude_code",
      source_session_id: "up-1",
      source_path: "/tmp/fixture/up1.jsonl",
      source_fingerprint: "fp-up-1",
      raw_ref: "raw/uid-up-1.ndjson",
      created_at: null,
      source_updated_at: null,
      ingested_at: "2026-04-22T00:00:00Z",
      project_path: null,
      title: "Up to date 1",
      has_subagent_sidecars: false,
    },
    // A stored_only + source_missing row. NOT importable (no
    // sourceSessionKey).
    {
      status: "source_missing",
      session_uid: "uid-missing-1",
      tool: "claude_code",
      source_session_id: "missing-1",
      source_path: "/tmp/last-known/missing1.jsonl",
      source_fingerprint: "fp-missing-1",
      raw_ref: "raw/uid-missing-1.ndjson",
      created_at: null,
      source_updated_at: null,
      ingested_at: "2026-04-22T00:00:00Z",
      project_path: null,
      title: "Missing 1",
      has_subagent_sidecars: false,
    },
  ];

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
        return jsonResponse(MIXED_FIXTURE);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse(MIXED_STORED);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);
  await screen.findByText("claude_code:not-stored-key-1");

  // EXACTLY ONE per-row checkbox in the DOM (the importable row).
  // Plus one header checkbox. Total: 2.
  const allCheckboxes = container.querySelectorAll(
    'input[type="checkbox"]',
  );
  expect(allCheckboxes.length).toBe(2);
  const importableCheckbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:not-stored-key-1"]',
  );
  expect(importableCheckbox).not.toBeNull();
  // Confirm the up_to_date and source_missing rows have NO checkbox.
  expect(
    container.querySelector(
      'input[type="checkbox"][aria-label="Select claude_code:up-to-date-key-1"]',
    ),
  ).toBeNull();
  expect(
    container.querySelector('input[type="checkbox"][aria-label^="Select stored:"]'),
  ).toBeNull();

  // Click the importable row's checkbox -> count=1.
  await act(async () => {
    importableCheckbox?.click();
  });
  const importButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(2)",
  );
  expect(importButton?.textContent).toBe("Import selected (1)");

  // Click Import.
  await act(async () => {
    importButton?.click();
  });
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  // The POST body MUST contain exactly the one importable key —
  // no `up-to-date-key-1` and no `stored:uid-missing-1` fallback.
  const importCalls = fetchMock.mock.calls.filter((args) => {
    const init = args[1] as RequestInit | undefined;
    const url = urlOf(args[0] as Request | string | URL);
    return (init?.method ?? "GET") === "POST" && url === IMPORT_PATH;
  });
  expect(importCalls.length).toBe(1);
  const body = importCalls[0]?.[1]?.body as string;
  expect(body).toBe(
    JSON.stringify({ session_keys: ["claude_code:not-stored-key-1"] }),
  );
  // Defensive substring assertions for the non-importable identities.
  expect(body.includes("up-to-date-key-1")).toBe(false);
  expect(body.includes("uid-missing-1")).toBe(false);
  expect(body.includes("stored:")).toBe(false);
});

test("statusConflict: a both-row with disagreeing source/stored statuses renders the (refresh) affordance", async () => {
  const CONFLICT_SOURCE: SourceSessionView[] = [
    {
      session_key: "claude_code:conflict-key",
      tool: "claude_code",
      source_session_id: "conflict-1",
      source_path: "/tmp/fixture/conflict.jsonl",
      source_fingerprint: "fp-conflict",
      created_at: null,
      source_updated_at: null,
      project_path: null,
      title: "Conflict",
      has_subagent_sidecars: false,
      status: "outdated",
      session_uid: "uid-conflict",
      stored_ingested_at: "2026-04-22T00:00:00Z",
    },
  ];
  const CONFLICT_STORED: StoredSessionView[] = [
    {
      status: "up_to_date",
      session_uid: "uid-conflict",
      tool: "claude_code",
      source_session_id: "conflict-1",
      source_path: "/tmp/fixture/conflict.jsonl",
      source_fingerprint: "fp-conflict-old",
      raw_ref: "raw/uid-conflict.ndjson",
      created_at: null,
      source_updated_at: null,
      ingested_at: "2026-04-22T00:00:00Z",
      project_path: null,
      title: "Conflict",
      has_subagent_sidecars: false,
    },
  ];
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(CONFLICT_SOURCE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse(CONFLICT_STORED);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);
  await screen.findByText("claude_code:conflict-key");
  // The (refresh) hint span is in the DOM near the badge.
  const refreshSpan = Array.from(container.querySelectorAll("span.muted"))
    .find((el) => el.textContent === "(refresh)");
  expect(refreshSpan).not.toBeUndefined();
  expect(refreshSpan?.getAttribute("title")).toBe(
    "Source and stored status disagreed during load — refresh to re-fetch.",
  );
});

test("stored_only + source_missing: source-path cell renders the last-known path with title= hover hint", async () => {
  const STORED_ONLY: StoredSessionView[] = [
    {
      status: "source_missing",
      session_uid: "uid-stale-1",
      tool: "claude_code",
      source_session_id: "stale-1",
      source_path: "/last/known/path/stale1.jsonl",
      source_fingerprint: "fp-stale-1",
      raw_ref: "raw/uid-stale-1.ndjson",
      created_at: null,
      source_updated_at: null,
      ingested_at: "2026-04-22T00:00:00Z",
      project_path: null,
      title: "Stale",
      has_subagent_sidecars: false,
    },
  ];
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse([]);
      if (url === STORED_SESSIONS_PATH) return jsonResponse(STORED_ONLY);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);
  await screen.findByText("/last/known/path/stale1.jsonl");
  // Source-path cell is the rightmost <td> in the unified table's row.
  const tables = container.querySelectorAll("table");
  expect(tables.length).toBeGreaterThanOrEqual(1);
  const unifiedTable = tables[0]!;
  const row = unifiedTable.querySelector("tbody tr");
  expect(row).not.toBeNull();
  const sourcePathCell = row!.querySelector("td:last-child");
  expect(sourcePathCell?.textContent).toBe("/last/known/path/stale1.jsonl");
  expect(sourcePathCell?.getAttribute("title")).toBe(
    "last seen source path — source file no longer discoverable",
  );
});

// ---------- Phase 4 Milestone 3 additions ----------
//
// (a) FILTER-only click-time intersection regression — direct mirror of
//     the F2 regression above, but the racing event is a FILTER mutation
//     rather than a rescan. Two not_stored rows are loaded; the user
//     selects both via per-row checkboxes; the user then sets
//     `tool=codex` (which hides the claude_code row). Without the
//     filter-window extension to the click-time intersection, the
//     import POST would still ship both selected keys (the raw
//     `selected` set is unchanged across filter mutations per spec).
//     With the extension, the POST body must contain only the visible
//     codex key.
// (b) Multi-filter integration — render with mixed fixtures, apply
//     three filter axes, assert exactly the matching subset renders.
// (c) Four empty-state branches — distinct copy + working affordances.

test("M3: filter mutation + click-time intersection — POST contains only the visible-after-filter key", async () => {
  // Mixed-tool fixture: one claude_code + one codex; both not_stored
  // (so both render checkboxes). After the user selects both, applying
  // a `tool=codex` filter must hide the claude_code row from the POST.
  const SOURCE: SourceSessionView[] = [
    {
      session_key: "claude_code:filter-A",
      tool: "claude_code",
      source_session_id: "filter-A",
      source_path: "/tmp/fixture/a.jsonl",
      source_fingerprint: "fp-a",
      created_at: "2026-04-22T00:00:00Z",
      source_updated_at: "2026-04-22T00:00:00Z",
      project_path: "/tmp/fixture",
      title: "Filter A (claude)",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
    {
      session_key: "codex:filter-B",
      tool: "codex",
      source_session_id: "filter-B",
      source_path: "/tmp/fixture/b.jsonl",
      source_fingerprint: "fp-b",
      created_at: "2026-04-22T00:00:00Z",
      source_updated_at: "2026-04-22T00:00:00Z",
      project_path: "/tmp/fixture",
      title: "Filter B (codex)",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
  ];

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
        return jsonResponse(SOURCE);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse([]);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // Wait for both rows to render.
  await screen.findByText("claude_code:filter-A");
  await screen.findByText("codex:filter-B");

  // Select both per-row checkboxes.
  const checkboxA = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:filter-A"]',
  );
  const checkboxB = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select codex:filter-B"]',
  );
  expect(checkboxA).not.toBeNull();
  expect(checkboxB).not.toBeNull();
  await act(async () => {
    checkboxA?.click();
  });
  await act(async () => {
    checkboxB?.click();
  });

  // Sanity: import button reads count=2 (two visible importable +
  // two selected). zero hidden by filter at this point.
  const importButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(2)",
  );
  expect(importButton?.textContent).toBe("Import selected (2)");

  // Apply tool=codex filter via the chip; the claude_code row drops
  // out of the FILTER window. The selection set is unchanged
  // (per spec: filter changes do not clear raw selection); the
  // action-bar count drops to 1 and the +1 hidden by filters caption
  // appears.
  const codexChip = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.chip"),
  ).find((el) => el.textContent === "Codex");
  expect(codexChip).not.toBeUndefined();
  await act(async () => {
    codexChip!.click();
  });

  // Action-bar count is now 1 (only codex:filter-B is in the filter
  // window's importable set); +1 hidden by filters caption is in DOM.
  expect(importButton?.textContent).toBe("Import selected (1)");
  const hiddenCaption = container.querySelector(".action-bar-hidden-caption");
  expect(hiddenCaption?.textContent).toBe("+1 hidden by filters");

  // Click Import.
  await act(async () => {
    importButton?.click();
  });
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(7); // 3 initial + 1 POST + 3 refetch
  });

  // The POST body MUST contain ONLY the codex key — the click-time
  // intersection drops the hidden claude_code key.
  const importCalls = fetchMock.mock.calls.filter((args) => {
    const init = args[1] as RequestInit | undefined;
    const url = urlOf(args[0] as Request | string | URL);
    return (init?.method ?? "GET") === "POST" && url === IMPORT_PATH;
  });
  expect(importCalls.length).toBe(1);
  const body = importCalls[0]?.[1]?.body as string;
  expect(body).toBe(
    JSON.stringify({ session_keys: ["codex:filter-B"] }),
  );
  // Defensive substring assertion: the hidden key cannot appear under
  // any future serialization.
  expect(body.includes("claude_code:filter-A")).toBe(false);
});

test("M3: multi-filter combination renders only the matching subset", async () => {
  // 4 source rows, distinct on (tool, status, project_path). Apply
  // filters that should pin to exactly one row: tool=claude_code,
  // status=outdated, project=/p/alpha.
  const SOURCE: SourceSessionView[] = [
    {
      session_key: "claude_code:match-1",
      tool: "claude_code",
      source_session_id: "match-1",
      source_path: "/srv/match-1.jsonl",
      source_fingerprint: "fp-m1",
      created_at: null,
      source_updated_at: "2026-04-22T01:00:00Z",
      project_path: "/p/alpha",
      title: "Match 1",
      has_subagent_sidecars: false,
      status: "outdated",
      session_uid: "uid-m1",
      stored_ingested_at: "2026-04-22T01:00:00Z",
    },
    {
      session_key: "codex:wrong-tool",
      tool: "codex",
      source_session_id: "wrong-tool",
      source_path: "/srv/wt.jsonl",
      source_fingerprint: "fp-wt",
      created_at: null,
      source_updated_at: "2026-04-22T01:00:00Z",
      project_path: "/p/alpha",
      title: "Wrong tool",
      has_subagent_sidecars: false,
      status: "outdated",
      session_uid: "uid-wt",
      stored_ingested_at: "2026-04-22T01:00:00Z",
    },
    {
      session_key: "claude_code:wrong-status",
      tool: "claude_code",
      source_session_id: "wrong-status",
      source_path: "/srv/ws.jsonl",
      source_fingerprint: "fp-ws",
      created_at: null,
      source_updated_at: "2026-04-22T01:00:00Z",
      project_path: "/p/alpha",
      title: "Wrong status",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
    {
      session_key: "claude_code:wrong-project",
      tool: "claude_code",
      source_session_id: "wrong-project",
      source_path: "/srv/wp.jsonl",
      source_fingerprint: "fp-wp",
      created_at: null,
      source_updated_at: "2026-04-22T01:00:00Z",
      project_path: "/p/beta",
      title: "Wrong project",
      has_subagent_sidecars: false,
      status: "outdated",
      session_uid: "uid-wp",
      stored_ingested_at: "2026-04-22T01:00:00Z",
    },
  ];

  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(SOURCE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse([]);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);
  await screen.findByText("claude_code:match-1");

  // Apply tool=claude_code chip.
  const claudeChip = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.chip"),
  ).find((el) => el.textContent === "Claude Code");
  await act(async () => {
    claudeChip!.click();
  });
  // Apply status=outdated chip.
  const outdatedChip = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.chip"),
  ).find((el) => el.textContent === "Outdated");
  await act(async () => {
    outdatedChip!.click();
  });
  // Type project=/p/alpha into the project input.
  const projectInput = container.querySelector<HTMLInputElement>(
    "#session-filters-project",
  );
  await act(async () => {
    fireEvent.change(projectInput!, { target: { value: "/p/alpha" } });
  });

  // After all three filters, the unified table holds exactly the
  // match-1 row. The wrong-tool / wrong-status / wrong-project rows
  // are absent from the rendered DOM.
  await waitFor(() => {
    expect(
      container.textContent?.includes("claude_code:match-1"),
    ).toBe(true);
  });
  expect(container.textContent?.includes("codex:wrong-tool")).toBe(false);
  expect(
    container.textContent?.includes("claude_code:wrong-status"),
  ).toBe(false);
  expect(
    container.textContent?.includes("claude_code:wrong-project"),
  ).toBe(false);
});

test("M3 empty state — No sessions at all (both fetches resolve empty)", async () => {
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse([]);
      if (url === STORED_SESSIONS_PATH) return jsonResponse([]);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);
  await waitFor(() => {
    expect(
      container.textContent?.includes(
        "No sessions have been discovered or stored yet.",
      ),
    ).toBe(true);
  });
  // Affordance: a Rescan button is rendered inside the empty-state
  // block (in addition to the action-bar Rescan).
  const rescanButtons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).filter((b) => b.textContent === "Rescan");
  expect(rescanButtons.length).toBeGreaterThanOrEqual(2);
});

test("M3 empty state — No matches after filter/search (Clear filters resets)", async () => {
  // Non-empty fixtures, but a search filter selects nothing.
  const SOURCE: SourceSessionView[] = [
    {
      session_key: "claude_code:has-row",
      tool: "claude_code",
      source_session_id: "has-row",
      source_path: "/srv/x.jsonl",
      source_fingerprint: "fp-x",
      created_at: null,
      source_updated_at: null,
      project_path: null,
      title: "Has row",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
  ];
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(SOURCE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse([]);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:has-row");
  // Apply a search filter that matches nothing.
  const searchInput = container.querySelector<HTMLInputElement>(
    "#session-filters-search",
  );
  await act(async () => {
    fireEvent.change(searchInput!, { target: { value: "no-such-needle" } });
  });
  await waitFor(() => {
    expect(
      container.textContent?.includes("No sessions match the current filter."),
    ).toBe(true);
  });
  // Clear filters affordance.
  const clearBtn = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => b.textContent === "Clear filters");
  expect(clearBtn).not.toBeUndefined();
  await act(async () => {
    clearBtn!.click();
  });
  // After clear: the row is back in the DOM.
  await waitFor(() => {
    expect(
      container.textContent?.includes("claude_code:has-row"),
    ).toBe(true);
  });
});

test("M3 empty state — Nothing to import in current filter (Show importable only flips the boolean)", async () => {
  // Per `working/phase-4.md` §Filter, Sort, Search → Empty States
  // (lines 381–386), the "Nothing to import in the current filter"
  // empty state fires when matching rows EXIST (filteredRows > 0)
  // but every visible row is non-importable (`up_to_date` or
  // `source_missing`). The empty-state copy + a "Show importable
  // only" affordance render alongside the table (the table is
  // informative; rows describe what the user CAN see). Clicking
  // the affordance flips `importableOnly` to `true`.
  //
  // Fixture: one `up_to_date` row (joined source ⊕ stored) and zero
  // `not_stored` / `outdated` rows. No filter is active on mount,
  // so the filter pipeline returns the same one row; `isImportable`
  // is false for it, so the branch fires.
  const SOURCE: SourceSessionView[] = [
    {
      session_key: "claude_code:up-1",
      tool: "claude_code",
      source_session_id: "up-1",
      source_path: "/srv/u.jsonl",
      source_fingerprint: "fp-u",
      created_at: null,
      source_updated_at: null,
      project_path: null,
      title: "Up-to-date 1",
      has_subagent_sidecars: false,
      status: "up_to_date",
      session_uid: "uid-u",
      stored_ingested_at: "2026-04-22T00:00:00Z",
    },
  ];
  const STORED: StoredSessionView[] = [
    {
      status: "up_to_date",
      session_uid: "uid-u",
      tool: "claude_code",
      source_session_id: "up-1",
      source_path: "/srv/u.jsonl",
      source_fingerprint: "fp-u",
      raw_ref: "raw/uid-u.ndjson",
      created_at: null,
      source_updated_at: null,
      ingested_at: "2026-04-22T00:00:00Z",
      project_path: null,
      title: "Up-to-date 1",
      has_subagent_sidecars: false,
    },
  ];
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(SOURCE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse(STORED);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:up-1");
  // The spec-mandated empty-state copy renders.
  await waitFor(() => {
    expect(
      container.textContent?.includes(
        "Nothing to import in the current filter.",
      ),
    ).toBe(true);
  });
  // The empty-state affordance is a button that says "Show
  // importable only" and lives inside the .empty block (NOT to be
  // confused with the SessionFilters chip of the same aria-label,
  // which always renders in the filter bar).
  const emptyBlock = container.querySelector("div.empty");
  expect(emptyBlock).not.toBeNull();
  const showOnlyButton = Array.from(
    emptyBlock!.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => b.textContent === "Show importable only");
  expect(showOnlyButton).not.toBeUndefined();
  // Capture the importable-only chip in the filter bar to verify
  // its aria-pressed state flips after the affordance click. The
  // chip owns the live boolean; the empty-state button merely calls
  // setImportableOnly(true) on its behalf.
  const importableChip = container.querySelector<HTMLButtonElement>(
    'button.chip[aria-label="Show importable only"]',
  );
  expect(importableChip).not.toBeNull();
  expect(importableChip!.getAttribute("aria-pressed")).toBe("false");
  // Click the empty-state affordance -> flips importableOnly to true.
  await act(async () => {
    showOnlyButton!.click();
  });
  await waitFor(() => {
    const refreshedChip = container.querySelector<HTMLButtonElement>(
      'button.chip[aria-label="Show importable only"]',
    );
    expect(refreshedChip!.getAttribute("aria-pressed")).toBe("true");
  });
  // After the toggle, importableOnly === true narrows the effective
  // status set to ["not_stored", "outdated"], dropping the lone
  // up_to_date row — so we now hit the "No sessions match the
  // current filter." branch (a filter is active).
  await waitFor(() => {
    expect(
      container.textContent?.includes(
        "No sessions match the current filter.",
      ),
    ).toBe(true);
  });
});

test("M3 empty state — Partial fetch failure (source 500) preserves stored rows", async () => {
  // Mirrors the M2 per-panel error isolation test, but verifies M3
  // didn't regress the behavior. Source-fetch fails; stored fetch
  // succeeds with one stored_only row; the unified table still
  // renders that row + the per-section banner.
  const STORED: StoredSessionView[] = [
    {
      status: "up_to_date",
      session_uid: "uid-survived",
      tool: "claude_code",
      source_session_id: "survived-1",
      source_path: "/srv/survived.jsonl",
      source_fingerprint: "fp-survived",
      raw_ref: "raw/uid-survived.ndjson",
      created_at: null,
      source_updated_at: null,
      ingested_at: "2026-04-22T00:00:00Z",
      project_path: null,
      title: "Survived",
      has_subagent_sidecars: false,
    },
  ];
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) {
        return new Response("boom", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (url === STORED_SESSIONS_PATH) return jsonResponse(STORED);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("uid-survived");
  // The per-section banner is present.
  const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
  const sourceAlert = alerts.find((el) =>
    el.textContent?.startsWith("Failed to load source sessions"),
  );
  expect(sourceAlert).not.toBeUndefined();
  // The stored-only survivor row is in the DOM (i.e. the table renders).
  expect(container.textContent?.includes("uid-survived")).toBe(true);
});

test("M3: SessionFilters control bar is rendered above the table", async () => {
  // Smoke check that the filter bar is actually wired into
  // SessionsView and not still hidden behind a feature flag etc.
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(SOURCE_FIXTURE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse(STORED_FIXTURE);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:fixture-abc");
  expect(
    container.querySelector('[role="group"][aria-label="Session filters"]'),
  ).not.toBeNull();
});

// ---------- Phase 4 Milestone 5 (Chunk F) additions ----------
//
// (a) 500-row layout — pagination renders 50 rows per page; the
//     pagination caption reads "Page 1 of 10".
// (b) Pagination-cross-page CLICK-TIME INTERSECTION REGRESSION —
//     a row selected on page 1 that gets pruned by a rescan must
//     NOT ship in the import POST when the user is viewing page 2.
//     Mirrors the F2 + M3 microtask choreography. The temp-revert
//     exercise is described in the chunk handoff: temporarily
//     scoping handleImport's eligible set to `pageRows + isImportable`
//     instead of `filteredRows + isImportable` makes this test fail
//     (POST body becomes empty, since the stale key was on page 1
//     and we're now on page 2). Restoring filteredRows-scoped
//     derivation makes it pass.
// (c) Cross-page bulk-select — the header checkbox in SessionsTable
//     now operates on the full FILTER window (M3 wiring intact under
//     pagination); selecting all on page 1 should put cross-page
//     keys into the POST body too.
// (d) Page-reset on filter change — after paging through to page 3,
//     applying any filter resets pageIndex to 0.
// (e) Page-reset RECOMPUTE on pageSize change — keeps the first
//     visible row visible (page 2 with size 50 -> rows 50-99;
//     change to size 100 -> page 1 -> rows 0-99 -> still includes
//     row 50).
// (f) Toast queue tests — rescan success / import success / rescan
//     error with Retry that succeeds on second attempt.
// (g) Last-rescan caption — initially "—"; after rescan success
//     renders the relative-time form; after rescan ERROR, the
//     caption does NOT update.

// Helper: build N synthetic SourceSessionView rows. Status alternates
// every 1 row so all rows are importable (important for the cross-page
// regression and the bulk-select test).
function manySource(n: number): SourceSessionView[] {
  const rows: SourceSessionView[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      session_key: `claude_code:row-${i.toString().padStart(4, "0")}`,
      tool: "claude_code",
      source_session_id: `row-${i.toString().padStart(4, "0")}`,
      source_path: `/srv/r${i}.jsonl`,
      source_fingerprint: `fp-r-${i}`,
      // Spaced timestamps so the descending-by-source_updated_at
      // default sort produces a deterministic order: row-0 newest.
      created_at: `2026-04-22T00:00:00Z`,
      source_updated_at: `2026-04-22T00:${(99 - Math.floor(i / 60))
        .toString()
        .padStart(2, "0")}:${(60 - (i % 60))
        .toString()
        .padStart(2, "0")}Z`,
      project_path: "/p/x",
      title: `Row ${i}`,
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    });
  }
  return rows;
}

test("M5: 500-row layout renders 50 rows on page 1 with 'Page 1 of 10' caption", async () => {
  const SOURCE = manySource(500);
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(SOURCE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse([]);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  // Wait for one of the high-id rows we know lands on the deterministic
  // first page (row-0000 is the most recent under the default
  // descending sort, so it's on page 1).
  await screen.findByText("claude_code:row-0000");

  // Exactly 50 body rows in the unified table (the table is the first
  // <table> in the DOM; the second is the ScanErrorsCallout, which is
  // empty so it doesn't render). With an empty scan-errors fixture
  // there is only one table.
  const tables = container.querySelectorAll("table");
  expect(tables.length).toBe(1);
  const tbodyRows = tables[0]!.querySelectorAll("tbody tr");
  expect(tbodyRows.length).toBe(50);

  // Pagination caption renders "Page 1 of 10".
  const caption = container.querySelector(".pagination-caption");
  expect(caption?.textContent).toBe("Page 1 of 10");
});

test("M5: pagination-cross-page click-time intersection — pruned page-1 key drops; surviving page-1 keys stay (cross-page accumulation)", async () => {
  // Setup: 51 importable rows. Default pageSize is 50, so:
  //   - page 1 has 50 rows (row-0000 .. row-0049)
  //   - page 2 has 1 row (row-0050)
  // The user selects two keys on page 1 (row-0000 and row-0010), then
  // pages to page 2. A rescan fires that prunes row-0010 from the
  // source list. The test then triggers the import via the F2 + M3
  // microtask choreography (text-node setter hook + queueMicrotask
  // scheduled click during a setSelected commit). The POST body must
  // contain row-0000 (still present in the filter window) but NOT
  // row-0010 (pruned by the rescan).
  //
  // The choreography: install the setter hook on the Import button's
  // text node; flip IS_REACT_ACT_ENVIRONMENT to false; click Rescan
  // (without `act()`); when React commits "Import selected (1)" the
  // setter fires, microtask-schedules a click on Import. The click
  // fires before React's reconciliation `useEffect` flushes, so
  // `selected` still contains row-0010. The handler's click-time
  // intersection (over filteredRows + isImportable) drops row-0010.
  const INITIAL = manySource(51); // 51 rows; pages 1 + 2
  // After the rescan, row-0010 is pruned (returns 50 rows excluding
  // row-0010).
  const AFTER_RESCAN = INITIAL.filter(
    (r) => r.session_key !== "claude_code:row-0010",
  );

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
        return jsonResponse(rescanned ? AFTER_RESCAN : INITIAL);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse([]);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);

  // Wait for page 1 to settle.
  await screen.findByText("claude_code:row-0000");

  // Select row-0000 and row-0010 (both on page 1 under default sort).
  const cb0000 = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:row-0000"]',
  );
  const cb0010 = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:row-0010"]',
  );
  expect(cb0000).not.toBeNull();
  expect(cb0010).not.toBeNull();
  await act(async () => {
    cb0000?.click();
  });
  await act(async () => {
    cb0010?.click();
  });

  // Sanity: action-bar count is 2.
  const importButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(2)",
  );
  expect(importButton?.textContent).toBe("Import selected (2)");

  // Page to page 2 by clicking Next.
  const nextButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Next page"]',
  );
  expect(nextButton).not.toBeNull();
  await act(async () => {
    nextButton!.click();
  });

  // Confirm we're on page 2: row-0050 is visible, row-0000 is NOT
  // visible in the table body (it's still in `filteredRows` but
  // pagination has windowed it off).
  await waitFor(() => {
    expect(
      container.textContent?.includes("claude_code:row-0050"),
    ).toBe(true);
  });
  // Sanity: the action-bar count is STILL 2 because selection is
  // filter-window scoped, not page-window scoped.
  expect(importButton?.textContent).toBe("Import selected (2)");

  // Install the text-node setter hook on the Import button. When
  // React commits the post-rescan "Import selected (1)" label
  // (because row-0010 was pruned and the reconciliation useEffect
  // dropped it from `selected`), microtask-schedule a click on
  // Import. The click fires BEFORE handleImport's commit-time
  // re-derivation reads the post-prune state — but the click-time
  // intersection in `handleImport` defends against that race: the
  // FRESH re-derivation inside the handler reads the latest
  // sourceState/storedState/filters, so row-0010 is dropped
  // regardless of timing.
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
            queueMicrotask(() => {
              importButton!.click();
            });
          }
        },
      });
    }
  }

  // Click Rescan WITHOUT `act()` so React's passive-effect macrotask
  // does not run inside our click. Same pattern as the F2 + M3
  // regression tests.
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

  // Wait for the microtask-scheduled Import click to land.
  await waitFor(() => {
    expect(clicked).toBe(true);
  });

  (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  }).IS_REACT_ACT_ENVIRONMENT = originalActEnv;

  // Wait for the import POST + its refetch cycle.
  // 3 initial GETs + 1 rescan POST + 3 refetch GETs + 1 import POST
  // + 3 post-import refetch GETs = 11.
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  // Exactly one Import POST. Body MUST include row-0000 (still in the
  // filter window after the rescan). MUST NOT include row-0010 (pruned).
  const importCalls = fetchMock.mock.calls.filter((args) => {
    const init = args[1] as RequestInit | undefined;
    const url = urlOf(args[0] as Request | string | URL);
    return (init?.method ?? "GET") === "POST" && url === IMPORT_PATH;
  });
  expect(importCalls.length).toBe(1);
  const body = importCalls[0]?.[1]?.body as string;
  expect(body.includes("claude_code:row-0000")).toBe(true);
  expect(body.includes("claude_code:row-0010")).toBe(false);
});

test("M5: cross-page bulk-select — header checkbox selects ALL importable rows across all pages", async () => {
  // 150 importable rows -> 3 pages at default pageSize 50. Click the
  // header checkbox on page 1; assert action-bar count is 150 (NOT
  // 50); click Import; assert POST body contains all 150 keys.
  const SOURCE = manySource(150);
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
        return jsonResponse(SOURCE);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse([]);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:row-0000");

  // The header checkbox is the first input[type=checkbox] inside the
  // <thead>. It does not carry an aria-label that names a key.
  const headerCheckbox = container.querySelector<HTMLInputElement>(
    'thead input[type="checkbox"]',
  );
  expect(headerCheckbox).not.toBeNull();
  await act(async () => {
    headerCheckbox!.click();
  });

  // Action-bar count is 150 (cross-page selection).
  const importButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(2)",
  );
  expect(importButton?.textContent).toBe("Import selected (150)");

  // Click Import.
  await act(async () => {
    importButton?.click();
  });
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  // POST body must contain all 150 keys.
  const importCalls = fetchMock.mock.calls.filter((args) => {
    const init = args[1] as RequestInit | undefined;
    const url = urlOf(args[0] as Request | string | URL);
    return (init?.method ?? "GET") === "POST" && url === IMPORT_PATH;
  });
  expect(importCalls.length).toBe(1);
  const body = importCalls[0]?.[1]?.body as string;
  // The 0000, 0050 (page 2), and 0149 (page 3 last) keys are all
  // present.
  expect(body.includes("claude_code:row-0000")).toBe(true);
  expect(body.includes("claude_code:row-0050")).toBe(true);
  expect(body.includes("claude_code:row-0149")).toBe(true);
  // Sanity: parse the body to count keys.
  const parsed = JSON.parse(body) as { session_keys: string[] };
  expect(parsed.session_keys.length).toBe(150);
});

test("M5: page-reset on filter change — paging to page 3 then changing a filter resets pageIndex to 0", async () => {
  const SOURCE = manySource(150); // 3 pages
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(SOURCE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse([]);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:row-0000");

  // Page through to page 3.
  const next = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Next page"]',
  );
  await act(async () => {
    next!.click();
  });
  await act(async () => {
    next!.click();
  });
  await waitFor(() => {
    expect(
      container.querySelector(".pagination-caption")?.textContent,
    ).toBe("Page 3 of 3");
  });

  // Apply a search filter (any non-empty string; we don't care if it
  // matches — only that it triggers the page-reset effect).
  const searchInput = container.querySelector<HTMLInputElement>(
    "#session-filters-search",
  );
  await act(async () => {
    fireEvent.change(searchInput!, { target: { value: "Row 7" } });
  });

  // After the filter change, pagination should reset to page 1 of N
  // (the search "Row 7" matches Row 7, Row 70..79 — exactly 11 rows
  // on a single page).
  await waitFor(() => {
    const caption = container
      .querySelector(".pagination-caption")
      ?.textContent;
    expect(caption?.startsWith("Page 1 of ")).toBe(true);
  });
});

test("M5: page-reset RECOMPUTE on pageSize change — keeps the first visible row visible", async () => {
  // With 500 rows + pageSize 50 + pageIndex 2, the user sees rows 100-149.
  // Switching to pageSize 100 must put pageIndex at 1 (rows 100-199 —
  // row 100 still visible).
  const SOURCE = manySource(500);
  const fetchMock = mock(
    async (input: Request | string | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url === SOURCE_SESSIONS_PATH) return jsonResponse(SOURCE);
      if (url === STORED_SESSIONS_PATH) return jsonResponse([]);
      if (url === SCAN_ERRORS_PATH) return jsonResponse([]);
      return new Response(`unexpected url ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:row-0000");

  // Page to pageIndex=2 (Page 3 of 10).
  const next = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Next page"]',
  );
  await act(async () => {
    next!.click();
  });
  await act(async () => {
    next!.click();
  });
  await waitFor(() => {
    expect(
      container.querySelector(".pagination-caption")?.textContent,
    ).toBe("Page 3 of 10");
  });

  // Confirm row-0100 is the first row on this page.
  const tbody = container.querySelector("tbody");
  const firstRowText = tbody!.querySelectorAll("tr")[0]!.textContent;
  expect(firstRowText?.includes("row-0100")).toBe(true);

  // Change pageSize to 100 via the Pagination select.
  const pageSizeSelect = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Page size"]',
  );
  expect(pageSizeSelect).not.toBeNull();
  await act(async () => {
    pageSizeSelect!.value = "100";
    pageSizeSelect!.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // After the pageSize change: pageIndex should be 1 (Page 2 of 5),
  // and row-0100 should still be the first row on the current page.
  await waitFor(() => {
    expect(
      container.querySelector(".pagination-caption")?.textContent,
    ).toBe("Page 2 of 5");
  });
  const tbodyAfter = container.querySelector("tbody");
  const firstRowTextAfter = tbodyAfter!.querySelectorAll("tr")[0]!.textContent;
  expect(firstRowTextAfter?.includes("row-0100")).toBe(true);
});

test("M5: rescan success pushes a 'Rescan complete' toast + plain-language summary + structured details", async () => {
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
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:fixture-abc");

  const rescanButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(1)",
  );
  await act(async () => {
    rescanButton?.click();
  });

  // The success toast lands; assert the title + the plain-language
  // summary copy are both visible.
  await waitFor(() => {
    expect(container.textContent?.includes("Rescan complete")).toBe(true);
  });
  // Plain-language: "Discovered 12 files, parsed 11 sessions, 2 not yet stored."
  expect(container.textContent?.includes("Discovered 12 files")).toBe(true);
  expect(container.textContent?.includes("parsed 11 sessions")).toBe(true);
  // Structured details (inside <details>): the typed names from the
  // RescanReport contract are findable via textContent (which walks
  // closed <details> blocks).
  expect(container.textContent?.includes("discovered_files")).toBe(true);
  expect(container.textContent?.includes("scan_errors")).toBe(true);
  // Toast root carries the success class + role=status.
  const toast = container.querySelector(".toast.success");
  expect(toast).not.toBeNull();
  expect(toast!.getAttribute("role")).toBe("status");
});

test("M5: import success pushes an 'Import complete' toast + plain-language summary + structured details", async () => {
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
        return jsonResponse([]);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:selected-key-1");

  const cb = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:selected-key-1"]',
  );
  await act(async () => {
    cb?.click();
  });
  const importButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(2)",
  );
  await act(async () => {
    importButton?.click();
  });

  await waitFor(() => {
    expect(container.textContent?.includes("Import complete")).toBe(true);
  });
  // Plain-language summary: "Requested 1 session, 1 updated."
  expect(container.textContent?.includes("Requested 1 session")).toBe(true);
  expect(container.textContent?.includes("1 updated")).toBe(true);
  // Structured details: typed names findable.
  expect(container.textContent?.includes("requested_sessions")).toBe(true);
  expect(container.textContent?.includes("inserted_sessions")).toBe(true);
});

test("M5: rescan ERROR pushes an error toast with Retry; clicking Retry succeeds on the second attempt", async () => {
  let rescanCalls = 0;
  const fetchMock = mock(
    async (
      input: Request | string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = urlOf(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url === RESCAN_PATH) {
        rescanCalls += 1;
        if (rescanCalls === 1) {
          return new Response("boom", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return jsonResponse(RESCAN_FIXTURE);
      }
      if (method === "GET" && url === SOURCE_SESSIONS_PATH) {
        return jsonResponse(SOURCE_FIXTURE);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse(STORED_FIXTURE);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:fixture-abc");

  // First Rescan -> 500 -> error toast lands.
  const rescanButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(1)",
  );
  await act(async () => {
    rescanButton?.click();
  });
  await waitFor(() => {
    expect(container.textContent?.includes("Rescan failed")).toBe(true);
  });
  // The error toast carries role=alert + a Retry button.
  const errorToast = container.querySelector(".toast.error");
  expect(errorToast).not.toBeNull();
  expect(errorToast!.getAttribute("role")).toBe("alert");
  const retryButton = errorToast!.querySelector<HTMLButtonElement>(
    ".toast-retry",
  );
  expect(retryButton).not.toBeNull();
  expect(retryButton!.textContent).toBe("Retry");

  // Click Retry -> second rescan call -> success.
  await act(async () => {
    retryButton!.click();
  });
  await waitFor(() => {
    expect(container.textContent?.includes("Rescan complete")).toBe(true);
  });
  // Both attempts were made.
  expect(rescanCalls).toBe(2);
});

test("M5: last-rescan caption is em-dash on first render, then renders relative-time after success", async () => {
  // Make sure no leftover blob lingers from a previous test run.
  try {
    globalThis.localStorage?.removeItem("distill-portal:last-manual-rescan:v1");
  } catch {
    // ignore
  }
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
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:fixture-abc");

  // Caption initially reads em-dash (no rescan has fired in this
  // browser yet).
  const caption = container.querySelector(".action-bar-last-rescan");
  expect(caption?.textContent).toBe(
    "last rescan from this browser —",
  );

  // Click Rescan -> success path writes the timestamp + setLastRescanAt
  // -> caption updates to a relative-time form ("just now" within the
  // 30-second window after the click).
  const rescanButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(1)",
  );
  await act(async () => {
    rescanButton?.click();
  });
  await waitFor(() => {
    const c = container.querySelector(".action-bar-last-rescan");
    // The caption is no longer the em-dash form; it should match the
    // relative-time renderer's output (likely "just now").
    expect(c?.textContent !== "last rescan from this browser —").toBe(
      true,
    );
  });
  const updated = container
    .querySelector(".action-bar-last-rescan")
    ?.textContent;
  expect(updated?.startsWith("last rescan from this browser ")).toBe(true);
});

test("M5: last-rescan caption does NOT update on rescan ERROR", async () => {
  // Pre-seed a known timestamp so we can assert it stays unchanged
  // after the failed rescan.
  const seed = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 min ago
  try {
    globalThis.localStorage?.setItem(
      "distill-portal:last-manual-rescan:v1",
      JSON.stringify(seed),
    );
  } catch {
    // ignore — the in-memory fallback path is also acceptable.
  }
  const fetchMock = mock(
    async (
      input: Request | string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = urlOf(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url === RESCAN_PATH) {
        return new Response("boom", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (method === "GET" && url === SOURCE_SESSIONS_PATH) {
        return jsonResponse(SOURCE_FIXTURE);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse(STORED_FIXTURE);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const { container } = render(<App />);
  await screen.findByText("claude_code:fixture-abc");

  // Capture the caption text AND the title= ISO before the rescan.
  const beforeCaption = container
    .querySelector(".action-bar-last-rescan")
    ?.textContent;
  const beforeTitle = container
    .querySelector(".action-bar-last-rescan")
    ?.getAttribute("title");
  expect(beforeTitle).toBe(seed);

  const rescanButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(1)",
  );
  await act(async () => {
    rescanButton?.click();
  });
  // Wait for the error toast.
  await waitFor(() => {
    expect(container.textContent?.includes("Rescan failed")).toBe(true);
  });

  // The caption text + title MUST equal the pre-rescan values (the
  // failure path does NOT write a new timestamp).
  const afterCaption = container
    .querySelector(".action-bar-last-rescan")
    ?.textContent;
  const afterTitle = container
    .querySelector(".action-bar-last-rescan")
    ?.getAttribute("title");
  expect(afterCaption).toBe(beforeCaption);
  expect(afterTitle).toBe(seed);
});

test("M5: import-error Retry uses the LATEST handleImport (rescan-between-attempts re-derives at click time)", async () => {
  // Codex round-1 finding (Chunk F fix-up): the import-error toast's
  // `onRetry` closure captured the `handleImport` reference from the
  // render that pushed the toast. If a rescan landed BETWEEN the
  // failure and the Retry click, the click invoked the stale
  // handleImport — its closure-captured `selected` / `sourceState` /
  // `storedState` / `filters` did NOT see the post-rescan state, so
  // the POST body could re-ship a key the rescan had pruned.
  //
  // The fix wraps both handlers in refs (`handleImportRef`,
  // `handleRescanRef`) that an effect keeps pointed at the LATEST
  // identity each render. The toast onRetry captures the ref, not
  // the handler, so a Retry click always invokes the most recent
  // handleImport — and that handler's useCallback closure reads the
  // current state.
  //
  // Test choreography (deterministic; no commit-window race needed):
  //   1. Mount with two importable rows {A, B}; user selects both.
  //   2. Make the IMPORT mock return 500 on the first call -> error
  //      toast lands with Retry.
  //   3. Switch the SOURCE mock to return only [A] (so the next
  //      refetch prunes B).
  //   4. Click Rescan -> rescan POST + refetch -> sourceState
  //      becomes [A] -> reconciliation useEffect prunes `selected`
  //      to {A} -> a new handleImport is created (its useCallback
  //      deps include `selected` and `sourceState`).
  //   5. Click Retry on the import-error toast.
  //   6. Assert: the second IMPORT POST body excludes the pruned
  //      `key-B` and contains only `key-A`.
  //
  // Temp-revert exercise (proves the test catches the bug):
  //   - In App.tsx, change the import error onRetry from
  //     `void handleImportRef.current()` back to `void handleImport()`
  //     and remove the matching ref-sync useEffect for `handleImport`.
  //   - This test then fails: the second POST body contains BOTH
  //     `key-A` AND `key-B`, because the stale handleImport's
  //     closure captured `selected = {A, B}` and
  //     `sourceState = [A, B]`, so its click-time intersection
  //     re-derives against the pre-rescan view.
  //   - Restore the ref-based onRetry + the ref-sync useEffect ->
  //     test passes again.
  const TWO_ROWS: SourceSessionView[] = [
    {
      session_key: "claude_code:retry-A",
      tool: "claude_code",
      source_session_id: "retry-A",
      source_path: "/tmp/fixture/retry-a.jsonl",
      source_fingerprint: "fp-retry-a",
      created_at: "2026-04-22T00:00:00Z",
      source_updated_at: "2026-04-22T00:00:00Z",
      project_path: "/tmp/fixture",
      title: "Retry A",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
    {
      session_key: "claude_code:retry-B",
      tool: "claude_code",
      source_session_id: "retry-B",
      source_path: "/tmp/fixture/retry-b.jsonl",
      source_fingerprint: "fp-retry-b",
      created_at: "2026-04-22T00:00:00Z",
      source_updated_at: "2026-04-22T00:00:00Z",
      project_path: "/tmp/fixture",
      title: "Retry B",
      has_subagent_sidecars: false,
      status: "not_stored",
      session_uid: null,
      stored_ingested_at: null,
    },
  ];
  const ONE_ROW: SourceSessionView[] = [TWO_ROWS[0]!];

  // The test progresses through three phases controlled by booleans:
  //   - importCalls: 1st = 500 (failure), 2nd = success (the Retry).
  //   - rescanned: flips after the rescan POST so the next
  //     /source-sessions GET returns ONE_ROW (B pruned).
  let importCalls = 0;
  let rescanned = false;
  const fetchMock = mock(
    async (
      input: Request | string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = urlOf(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url === IMPORT_PATH) {
        importCalls += 1;
        if (importCalls === 1) {
          return new Response("boom", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return jsonResponse(IMPORT_FIXTURE);
      }
      if (method === "POST" && url === RESCAN_PATH) {
        rescanned = true;
        return jsonResponse(RESCAN_FIXTURE);
      }
      if (method === "GET" && url === SOURCE_SESSIONS_PATH) {
        return jsonResponse(rescanned ? ONE_ROW : TWO_ROWS);
      }
      if (method === "GET" && url === STORED_SESSIONS_PATH) {
        return jsonResponse([]);
      }
      if (method === "GET" && url === SCAN_ERRORS_PATH) {
        return jsonResponse([]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // Wait for both rows to render.
  await screen.findByText("claude_code:retry-A");
  await screen.findByText("claude_code:retry-B");

  // Select both per-row checkboxes.
  const checkboxA = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:retry-A"]',
  );
  const checkboxB = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select claude_code:retry-B"]',
  );
  expect(checkboxA).not.toBeNull();
  expect(checkboxB).not.toBeNull();
  await act(async () => {
    checkboxA?.click();
  });
  await act(async () => {
    checkboxB?.click();
  });

  // Sanity: action-bar count is 2.
  const importButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(2)",
  );
  expect(importButton?.textContent).toBe("Import selected (2)");

  // Click Import -> first POST -> 500 -> error toast appears.
  await act(async () => {
    importButton?.click();
  });
  await waitFor(() => {
    expect(container.textContent?.includes("Import failed")).toBe(true);
  });
  const errorToast = container.querySelector(".toast.error");
  expect(errorToast).not.toBeNull();
  const retryButton = errorToast!.querySelector<HTMLButtonElement>(
    ".toast-retry",
  );
  expect(retryButton).not.toBeNull();

  // Click Rescan -> rescan POST + refetch -> sourceState updates to
  // ONE_ROW -> the reconciliation useEffect prunes B from `selected`
  // -> new handleImport identity is created.
  const rescanButton = container.querySelector<HTMLButtonElement>(
    ".action-bar button:nth-of-type(1)",
  );
  await act(async () => {
    rescanButton?.click();
  });
  // Wait for the rescan POST (1) + refetch (3) cycle to land. Total
  // calls so far: 3 initial GETs + 1 import POST (failed) + 1 rescan
  // POST + 3 refetch GETs = 8.
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
  // Confirm the rescan landed: the pruned row is gone from the DOM
  // and the action-bar count is 1.
  await waitFor(() => {
    expect(container.textContent?.includes("claude_code:retry-B")).toBe(
      false,
    );
  });
  expect(importButton?.textContent).toBe("Import selected (1)");

  // Click Retry on the IMPORT error toast. With the ref fix, this
  // invokes the LATEST handleImport (which sees the post-rescan
  // state). Without the ref fix, this invokes the stale
  // handleImport whose closure captured the pre-rescan state.
  // (The error toast is still in the DOM; the rescan-success toast
  // joins it but does not replace it.)
  const stillThereRetryButton = container
    .querySelector(".toast.error")!
    .querySelector<HTMLButtonElement>(".toast-retry");
  expect(stillThereRetryButton).not.toBeNull();
  await act(async () => {
    stillThereRetryButton!.click();
  });

  // Wait for the second import POST + its refetch.
  await waitFor(() => {
    expect(importCalls).toBe(2);
  });
  // Wait for the post-import refetch trio + the import-success toast.
  await waitFor(() => {
    expect(container.textContent?.includes("Import complete")).toBe(true);
  });

  // Capture both import POST bodies. The first (failed) call shipped
  // both keys (which is correct for that moment in time — the rescan
  // had not yet landed). The second (Retry) call MUST ship only
  // key-A; the closure-captured stale handleImport would have shipped
  // both keys.
  const importPostCalls = fetchMock.mock.calls.filter((args) => {
    const init = args[1] as RequestInit | undefined;
    const url = urlOf(args[0] as Request | string | URL);
    return (init?.method ?? "GET") === "POST" && url === IMPORT_PATH;
  });
  expect(importPostCalls.length).toBe(2);
  const firstBody = importPostCalls[0]?.[1]?.body as string;
  const secondBody = importPostCalls[1]?.[1]?.body as string;
  // First call shipped both keys.
  expect(firstBody.includes("claude_code:retry-A")).toBe(true);
  expect(firstBody.includes("claude_code:retry-B")).toBe(true);
  // Second (Retry) call shipped ONLY key-A — the ref-resolved
  // latest handleImport saw the post-rescan state.
  expect(secondBody).toBe(
    JSON.stringify({ session_keys: ["claude_code:retry-A"] }),
  );
  expect(secondBody.includes("claude_code:retry-B")).toBe(false);
});
