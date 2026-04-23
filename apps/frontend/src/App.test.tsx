// Single mounted-App Bun smoke test for the Phase 3 inspection surface.
//
// Exercises the three read-only panels wired by Chunk F1: Source Sessions,
// Stored Sessions, Scan Errors. We:
//
//   (1) mock `globalThis.fetch` to return a distinct JSON body per URL
//       (source sessions, stored sessions, scan errors), using fixtures
//       typed from the `@contracts/*` re-export barrel so contract shape
//       drift surfaces as a type error,
//   (2) mount `<App />` via `@testing-library/react`,
//   (3) wait for each panel's async settle and assert all three fixtures
//       rendered (session_key, stored session_uid, scan-error message),
//   (4) assert `fetch` was called with exactly the three expected
//       same-origin paths,
//   (5) assert the StatusBadge mapping, the Raw anchor `href`, and the
//       three-section page structure.
//
// happy-dom is installed globally by `./test-setup.ts` (preloaded via
// `bunfig.toml`). Restoring `globalThis.fetch` in `afterEach` keeps the
// mock from leaking across tests even though we only have one.
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "./App";
import {
  SCAN_ERRORS_PATH,
  SOURCE_SESSIONS_PATH,
  STORED_SESSIONS_PATH,
} from "./lib/api";
import type {
  PersistedScanError,
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
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
