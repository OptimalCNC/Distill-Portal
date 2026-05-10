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
//
// Phase 5 / M2b: the modal drawer was retired in favour of the
// right-pane four-tab shell. Steps 6 / 7 / 9 / 10 were rewritten in
// M2b to assert against the new surface; the original step 9
// drawer focus-trap walk is grounded in the JSDoc reproducer at
// `Drawer.tsx` (which stays on disk through M5 per
// `working/phase-5.md` Resolved Decision #6) and is no longer a
// recurring e2e.
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
    await expect(
      page.getByText(FIXTURE_SESSION_KEY, { exact: false }),
    ).toBeVisible();

    // 3. Select the fixture's row by its aria-label
    //    (`Select claude_code:<uuid>` — emitted by the unified
    //    `SessionsTable` for any importable row).
    const rowCheckbox = page.getByLabel(`Select ${FIXTURE_SESSION_KEY}`);
    await rowCheckbox.click();
    await expect(rowCheckbox).toBeChecked();

    // 4. The Import button should reflect the selection count.
    const importButton = page.getByRole("button", {
      name: /^Import selected \(1\)$/,
    });
    await expect(importButton).toBeEnabled();
    await importButton.click();

    // 5. The ImportReport summary lands as a success toast (M5 swapped
    //    the M3-era inline status paragraph for a Toast queue).
    const importToast = page.locator(".toast.success", {
      hasText: "Import complete",
    });
    await expect(importToast).toBeVisible({ timeout: 5_000 });
    await expect(importToast).toContainText(/requested_sessions/);
    await importToast.locator(".toast-dismiss").click();
    await expect(importToast).toHaveCount(0);

    // 6. M4: the default tab shifted from "metadata" to "transcript"
    //    alongside TranscriptView landing (Resolved Decision #11).
    //    The Metadata tab still carries the "View raw" anchor in its
    //    body — activate it explicitly to make the assertion. The
    //    M4-added "Open raw" anchor lives in the session header.
    const fixtureRow = page
      .locator(`tr:has-text("${FIXTURE_SESSION_KEY}")`)
      .first();
    await fixtureRow.click();
    const sessionPane = page.locator("article.session-pane");
    await expect(sessionPane).toHaveAttribute("data-state", "ready", {
      timeout: 5_000,
    });
    // M4 default tab is Transcript (not Metadata).
    await expect(page.locator("#tab-transcript")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Wait for the TranscriptView to resolve (loading → success) and
    // assert the M4 landmark <section aria-label="Session transcript">.
    const transcriptPanelInitial = page.locator("#panel-transcript");
    await expect(
      transcriptPanelInitial.locator(".transcript-loading"),
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      transcriptPanelInitial.locator('[aria-label="Session transcript"]'),
    ).toBeVisible({ timeout: 10_000 });
    // M4: the "Open raw" anchor lives in the session header (right-
    // side action group, AFTER the conflict badge). The seeded
    // session has storedSessionUid !== null so the anchor renders.
    const openRawAnchor = sessionPane.locator(".session-open-raw");
    await expect(openRawAnchor).toBeVisible();
    await expect(openRawAnchor).toHaveText("Open raw");
    // Activate Metadata for the "View raw" anchor assertion.
    await page.locator("#tab-metadata").click();
    const metadataPanel = page.locator("#panel-metadata");
    await expect(metadataPanel).toBeVisible();
    const rawLink = metadataPanel
      .getByRole("link", { name: "View raw" })
      .first();
    await expect(rawLink).toBeVisible();
    const rawHref = await rawLink.getAttribute("href");
    expect(rawHref).not.toBeNull();
    expect(rawHref!).toMatch(
      /^\/api\/v1\/sessions\/[0-9a-f-]+\/raw$/,
    );
    const rawResponse = await request.get(rawHref!);
    expect(rawResponse.status()).toBe(200);
    const rawBody = await rawResponse.body();
    expect(rawBody.byteLength).toBeGreaterThan(16);

    // 7. M2b: the Metadata tab `<dl>` exposes the session_uid as
    //    one of the 18 fields. The lookup now lives in
    //    `.session-metadata` (was `.drawer-meta` in M1b).
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    const sessionUidValue = metadataPanel
      .locator(".session-metadata .metadata-meta dd.mono")
      .filter({ hasText: uuidPattern })
      .first();
    await expect(sessionUidValue).toBeVisible();

    // 8. Rescan must emit a RescanReport summary as a success toast.
    await page.getByRole("button", { name: "Rescan" }).click();
    const firstRescanToast = page.locator(".toast.success", {
      hasText: "Rescan complete",
    });
    await expect(firstRescanToast).toBeVisible({ timeout: 5_000 });
    await expect(firstRescanToast).toContainText(/discovered_files/);
    await firstRescanToast.locator(".toast-dismiss").click();
    await expect(firstRescanToast).toHaveCount(0);

    // 9. M2b tab strip e2e (replaces the M1b drawer focus-trap walk).
    //    Sub-steps:
    //      (a) Click each tab → verify aria-selected + the right
    //          panel is active.
    //      (b) Skim + Transcript show placeholder copy; Metadata
    //          shows the <dl>; Raw shows preview.
    //      (c) Keyboard nav: ArrowLeft / ArrowRight cycle with
    //          wrap; Home / End jump to first / last.
    //
    //    The original M1b focus-trap walk is grounded in the
    //    JSDoc reproducer at `Drawer.tsx` (still on disk through
    //    M5 per Resolved Decision #6 + spec line 231) and is no
    //    longer a recurring e2e. Drawer.tsx + Drawer.test.tsx
    //    cover the focus-trap matrix via direct import; M6 deletes
    //    them.
    await fixtureRow.click();
    await expect(sessionPane).toHaveAttribute("data-state", "ready");

    // (a) Click each tab → aria-selected toggles + the active
    //     panel becomes visible.
    await page.locator("#tab-skim").click();
    await expect(page.locator("#tab-skim")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const skimPanel = page.locator("#panel-skim");
    await expect(skimPanel).toBeVisible();
    await expect(skimPanel).toContainText("Coming in Milestone 5");

    await page.locator("#tab-transcript").click();
    await expect(page.locator("#tab-transcript")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const transcriptPanel = page.locator("#panel-transcript");
    await expect(transcriptPanel).toBeVisible();
    // M4: TranscriptView replaces the "Coming in Milestone 4"
    // placeholder. The detailed render assertion lives at step 6
    // (before any Rescan-driven cache invalidation). Here we only
    // confirm the panel is the new TranscriptView surface — i.e.
    // the placeholder is gone — without re-asserting the full
    // section landmark (after Rescan + bumpCacheEpoch the hook
    // may stay in its already-resolved state via the warm closure;
    // the surface contract assertion at step 6 is authoritative).
    await expect(transcriptPanel).not.toContainText(
      "Coming in Milestone 4",
    );

    await page.locator("#tab-metadata").click();
    await expect(page.locator("#tab-metadata")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(metadataPanel).toBeVisible();
    // Metadata tab carries the 18-field <dl>.
    await expect(
      metadataPanel.locator(".metadata-meta dt"),
    ).toHaveCount(18);

    // (c) Keyboard nav: focus the active tab (Metadata) →
    //     ArrowLeft cycles to Raw → ArrowLeft to Skim →
    //     Home jumps to Transcript (first) →
    //     End jumps back to Metadata (last) →
    //     ArrowRight wraps to Transcript (first).
    await page.locator("#tab-metadata").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#tab-raw")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#tab-skim")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Home");
    await expect(page.locator("#tab-transcript")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("End");
    await expect(page.locator("#tab-metadata")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tab-transcript")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // 10. M2b: streaming raw-preview block now lives inside the
    //     Raw tab body (.raw-tab) instead of the modal drawer.
    //
    //     Click the Raw tab. The fixture is stored
    //     (`storedSessionUid !== null`), so RawTab fires the
    //     fetch and renders the streamed lines + caption. Assert:
    //       - the `.raw-tab` wrapper is in the active panel.
    //       - at least one rendered NDJSON line lands
    //         (`.raw-pre .line`).
    //       - the caption matches one of the spec forms.
    //
    //     The byte-cap path is exercised in
    //     `RawTab.test.tsx` against a hand-built >256 KB
    //     ReadableStream; the seeded fixture is intentionally
    //     tiny.
    await page.locator("#tab-raw").click();
    await expect(page.locator("#tab-raw")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const rawPanel = page.locator("#panel-raw");
    await expect(rawPanel).toBeVisible();
    const rawTabBody = rawPanel.locator(".raw-tab");
    await expect(rawTabBody).toBeVisible();
    const firstLine = rawTabBody.locator(".raw-pre .line").first();
    await expect(firstLine).toBeVisible({ timeout: 5_000 });
    const caption = rawTabBody.locator(".raw-caption");
    await expect(caption).toBeVisible();
    await expect(caption).toHaveText(
      /Showing first \d+ lines|Stopped at byte cap/,
    );

    // 11. M5 Chunk F: Pagination + sticky action bar + toasts.
    //
    //    The seeded fixture has a single session, so the unified
    //    table renders one row total -> "Page 1 of 1" caption.
    const paginationCaption = page.locator(".pagination-caption");
    await expect(paginationCaption).toBeVisible();
    await expect(paginationCaption).toHaveText("Page 1 of 1");

    // (b) Change page-size to 100 -> still "Page 1 of 1" + table
    //     still has the fixture row. Scope to the list pane (the
    //     Metadata tab's <dl> also contains the session_key text).
    const pageSizeSelect = page.locator('select[aria-label="Page size"]');
    await pageSizeSelect.selectOption("100");
    await expect(paginationCaption).toHaveText("Page 1 of 1");
    await expect(
      page
        .locator(".list-pane")
        .getByText(FIXTURE_SESSION_KEY, { exact: false })
        .first(),
    ).toBeVisible();

    // (d) Sticky-modifier on the action-bar root.
    const actionBar = page.locator(".action-bar").first();
    await expect(actionBar).toHaveClass(/(^|\s)sticky(\s|$)/);

    // (c) Click Rescan; the success toast lands.
    await page.getByRole("button", { name: "Rescan" }).click();
    const rescanToast = page.locator(".toast.success", {
      hasText: "Rescan complete",
    });
    await expect(rescanToast).toBeVisible({ timeout: 5_000 });
    await expect(rescanToast).toContainText("discovered_files");

    // (e) Last-rescan caption is no longer the em-dash form.
    const lastRescanCaption = page.locator(".action-bar-last-rescan");
    await expect(lastRescanCaption).not.toHaveText(
      "last rescan from this browser —",
    );

    // 12. Phase 5 / M1a: deep-link arrival via ?session=<rowKey>
    //
    //     Navigate directly to /?session=<FIXTURE_SESSION_KEY> and
    //     assert:
    //       - the right pane mounts under <article class="session-pane">
    //         (data-state attribute reflects the current state — once
    //         the row merges in it should be "ready", per M2b)
    //       - the matched list row carries data-deep-link="true"
    //         transiently during the 600 ms pulse animation
    //       - the data-deep-link attribute is REMOVED after the
    //         pulse settles
    //       - reload (page.reload) preserves the URL state and the
    //         right-pane mount: the same row remains aria-current
    //         after the reload.
    await page.goto(`/?session=${encodeURIComponent(FIXTURE_SESSION_KEY)}`);
    await expect(
      page.getByRole("heading", { name: "Distill Portal", level: 1 }),
    ).toBeVisible();
    const sessionPaneAfterDeepLink = page.locator("article.session-pane");
    await expect(sessionPaneAfterDeepLink).toHaveCount(1);
    const matchedRow = page
      .locator("tbody tr")
      .filter({ has: page.locator(`text=${FIXTURE_SESSION_KEY}`) });
    await expect(matchedRow).toBeVisible({ timeout: 5_000 });
    await expect(matchedRow).toHaveAttribute("data-deep-link", "true", {
      timeout: 1_500,
    });
    await expect(matchedRow).not.toHaveAttribute("data-deep-link", "true", {
      timeout: 3_000,
    });
    // M2b: the data-state flips to "ready" once the row merges in
    // (M1a "ready-placeholder" was retired alongside the four-tab
    // shell landing).
    await expect(sessionPaneAfterDeepLink).toHaveAttribute(
      "data-state",
      "ready",
      { timeout: 5_000 },
    );
    const ariaCurrentRow = page.locator(`tr[aria-current="true"]`);
    await expect(ariaCurrentRow).toBeVisible({ timeout: 5_000 });
    await expect(ariaCurrentRow).toContainText(FIXTURE_SESSION_KEY);

    // Reload the page; the URL state must survive and the same
    // row must remain selected.
    await page.reload();
    await expect(sessionPaneAfterDeepLink).toHaveAttribute(
      "data-state",
      "ready",
      { timeout: 5_000 },
    );
    await expect(
      page.locator(`tr[aria-current="true"]`),
    ).toContainText(FIXTURE_SESSION_KEY, { timeout: 5_000 });
  });
});
