// Inspection-surface browser e2e.
//
// Drives the real React app against the real Rust backend through the
// Vite dev proxy. Covers the full inspection workflow (render, import,
// rescan, raw payload retrieval). The companion Rust-level typed-client
// coverage lives at `tests/e2e/tests/inspection_surface.rs` (backend
// HTTP stack directly, no browser).
//
// Topology during this spec:
//   chromium -> http://127.0.0.1:4100 (Vite dev server, webServer hook)
//             -> proxies /api/v1 + /health to http://127.0.0.1:4000
//             -> Rust backend spawned by `startBackend(...)` in beforeAll
//
// `test.describe.serial` + `workers: 1` guarantees we don't double-bind
// port 4000 across test files. The fixture is seeded into the
// harness-owned temp dir BEFORE the backend starts, so the first
// `/api/v1/source-sessions` response already contains it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { startBackend, type BackendHandle } from "./harness/backend";

// `import.meta.dir` is Bun-only; Playwright runs under Node, so derive
// the directory from the URL instead.
const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE_SESSION_ID = "546104ba-031c-46f2-9b24-36b147c6b2f6";
const FIXTURE_SESSION_KEY = `claude_code:${FIXTURE_SESSION_ID}`;
const CLAUDE_PROJECT_DIR = "-home-huwei-ai-codings-distill-portal";

// Load the fixture synchronously at module scope so the harness gets a
// concrete byte buffer (mirrors `tests/e2e/tests/inspection_surface.rs`).
const FIXTURE_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
  "claude_code",
  "sample_session.jsonl",
);
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);

test.describe.serial("inspection surface end-to-end", () => {
  let backend: BackendHandle;

  test.beforeAll(async () => {
    backend = await startBackend({
      seed: {
        claudeProject: CLAUDE_PROJECT_DIR,
        claudeSessionId: FIXTURE_SESSION_ID,
        jsonl: FIXTURE_BYTES,
      },
    });
  });

  test.afterAll(async () => {
    await backend?.stop();
  });

  test("scans, imports, inspects raw, and rescans through the browser", async ({
    page,
    request,
  }) => {
    // 1. Navigate to the Vite-hosted SPA and confirm the shell rendered.
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Distill Portal", level: 1 }),
    ).toBeVisible();

    // 2. The seeded Claude session must appear in the Source Sessions panel.
    //    `claude_code:` is unique enough — the session_key is rendered as
    //    a monospace sub-line under the title cell.
    await expect(
      page.getByText(FIXTURE_SESSION_KEY, { exact: false }),
    ).toBeVisible();

    // 3. Select the fixture's row by its aria-label
    //    (`Select claude_code:<uuid>` — see SourceSessionsTable.tsx).
    const rowCheckbox = page.getByLabel(`Select ${FIXTURE_SESSION_KEY}`);
    await rowCheckbox.click();
    await expect(rowCheckbox).toBeChecked();

    // 4. The Import button should reflect the selection count.
    const importButton = page.getByRole("button", {
      name: /^Import selected \(1\)$/,
    });
    await expect(importButton).toBeEnabled();
    await importButton.click();

    // 5. The ImportReport summary lands in the `role="status"` paragraph.
    //    Assert both the "Import:" prefix and the `requested_sessions: 1`
    //    numeric field we know ActionBar emits.
    const statusLine = page.getByRole("status");
    await expect(statusLine).toContainText(/Import:/);
    await expect(statusLine).toContainText(/1 requested_sessions/);

    // 6. The Stored Sessions panel should now render the freshly-imported
    //    session. The session UID is a UUID; match the UUID pattern.
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    const rawLink = page.getByRole("link", { name: "View Raw" }).first();
    await expect(rawLink).toBeVisible();
    const rawHref = await rawLink.getAttribute("href");
    expect(rawHref).not.toBeNull();
    expect(rawHref!).toMatch(
      /^\/api\/v1\/sessions\/[0-9a-f-]+\/raw$/,
    );
    // Programmatic fetch of the anchor's href through the Vite proxy
    // (instead of `click()` which would navigate away from the SPA).
    const rawResponse = await request.get(rawHref!);
    expect(rawResponse.status()).toBe(200);
    const rawBody = await rawResponse.body();
    expect(rawBody.byteLength).toBeGreaterThan(16);

    // 7. The metadata anchor (session UID column) should expose the UUID
    //    as its link text — this is our "session UID appears in the
    //    Stored Sessions panel" check.
    const uuidLink = page
      .locator("a.raw-link.mono", { hasText: uuidPattern })
      .first();
    await expect(uuidLink).toBeVisible();

    // 8. Rescan must emit a RescanReport summary into the same status line.
    await page.getByRole("button", { name: "Rescan" }).click();
    await expect(statusLine).toContainText(/Rescan:/);
    await expect(statusLine).toContainText(/discovered_files/);
  });
});
