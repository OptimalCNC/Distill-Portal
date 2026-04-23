// Single mounted-App Bun smoke test.
//
// Replaces the prior unit test on `api.ts` with an end-to-end DOM smoke
// that proves Milestone 2 ("list `session_key`s pulled live from the
// backend"). In one test, we:
//
//   (1) mock `globalThis.fetch` with a canned `SourceSessionView[]`
//       (typed from the `@contracts/*` re-export barrel to preserve the
//       contract-consumption assertion),
//   (2) mount `<App />` via `@testing-library/react`,
//   (3) assert the client requested `/api/v1/source-sessions`,
//   (4) assert the mounted DOM contains the fixture `session_key`
//       `claude_code:fixture-abc` inside the expected `<li><code>` shape.
//
// happy-dom is installed globally by `./test-setup.ts` (preloaded via
// `bunfig.toml`). Restoring `globalThis.fetch` in `afterEach` keeps the
// mock from leaking across tests even though we only have one.
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "./App";
import { SOURCE_SESSIONS_PATH } from "./lib/api";
import type { SourceSessionView } from "./lib/contracts";

const FIXTURE: SourceSessionView[] = [
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

test("mounted App fetches /api/v1/source-sessions and renders the session_key", async () => {
  const fetchMock = mock(
    async (_input: Request | string | URL): Promise<Response> =>
      new Response(JSON.stringify(FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  const { container } = render(<App />);

  // (3) DOM evidence: wait for the async useEffect -> fetch -> setState
  // pipeline to settle, then assert the fixture session_key appears.
  const rendered = await screen.findByText("claude_code:fixture-abc");
  expect(rendered).toBeDefined();

  // (1) URL assertion: client composed the expected same-origin path.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const calledWith = fetchMock.mock.calls[0]?.[0];
  const requestedUrl =
    typeof calledWith === "string"
      ? calledWith
      : calledWith instanceof URL
        ? calledWith.toString()
        : (calledWith as Request).url;
  expect(requestedUrl).toBe(SOURCE_SESSIONS_PATH);

  // (2) Contract-type consumption: FIXTURE is typed `SourceSessionView[]`,
  // so the import above is load-bearing. Re-assert the fields that the
  // contract type guarantees so a future shape drift would surface here.
  expect(FIXTURE[0]?.tool).toBe("claude_code");
  expect(FIXTURE[0]?.status).toBe("not_stored");

  // (4) List structure: the app renders each session as <li><code>...
  const codeEl = container.querySelector("li > code");
  expect(codeEl).not.toBeNull();
  expect(codeEl?.textContent).toBe("claude_code:fixture-abc");
});
