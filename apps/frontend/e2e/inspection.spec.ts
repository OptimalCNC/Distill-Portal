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
    //    the M3-era inline status paragraph for a Toast queue). Assert
    //    the title + the structured `requested_sessions` count name
    //    inside the <details> disclosure are both visible.
    const importToast = page.locator(".toast.success", {
      hasText: "Import complete",
    });
    await expect(importToast).toBeVisible({ timeout: 5_000 });
    await expect(importToast).toContainText(/requested_sessions/);
    // Dismiss the import-success toast so it doesn't crowd subsequent
    // toast assertions in step 11.
    await importToast.locator(".toast-dismiss").click();
    await expect(importToast).toHaveCount(0);

    // 6. M1b dropped the Stored Copy column from the inline table —
    //    the View raw anchor now lives inside the still-mounted
    //    Phase-4 `<Drawer>` body (`SessionDetail`'s
    //    `.drawer-raw-link-row`). Open the drawer (via the fixture
    //    row + the vestigial "Open detail" button) and assert the
    //    anchor there.
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    await page
      .locator(`tr:has-text("${FIXTURE_SESSION_KEY}")`)
      .first()
      .click();
    await page.locator("article.session-pane button.open-detail").click();
    const drawerForRaw = page.locator("dialog[open]");
    await expect(drawerForRaw).toBeVisible();
    // The drawer body's "View raw" anchor (lowercase 'r' — the
    // SessionDetail copy uses sentence case).
    const rawLink = drawerForRaw
      .getByRole("link", { name: "View raw" })
      .first();
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

    // 7. The drawer body's session_uid `<dd>` row exposes the UUID
    //    as part of the metadata `<dl>`. M1b retired the inline
    //    `a.raw-link.mono` metadata anchor (it lived in the dropped
    //    Stored Copy column); the UUID now surfaces in the
    //    drawer-only metadata table.
    const sessionUidValue = drawerForRaw
      .locator(".drawer-meta dd.mono")
      .filter({ hasText: uuidPattern })
      .first();
    await expect(sessionUidValue).toBeVisible();
    // Close the drawer cleanly so step 8 starts on a settled surface.
    await page.keyboard.press("Escape");
    await expect(drawerForRaw).not.toBeVisible();

    // 8. Rescan must emit a RescanReport summary as a success toast
    //    (mirrors the M5 import-toast flow above). Dismiss the toast
    //    afterwards so step 11's rescan toast assertion has a clean
    //    queue to match against.
    await page.getByRole("button", { name: "Rescan" }).click();
    const firstRescanToast = page.locator(".toast.success", {
      hasText: "Rescan complete",
    });
    await expect(firstRescanToast).toBeVisible({ timeout: 5_000 });
    await expect(firstRescanToast).toContainText(/discovered_files/);
    await firstRescanToast.locator(".toast-dismiss").click();
    await expect(firstRescanToast).toHaveCount(0);

    // 9. M4 Chunk E1 + M1b trigger shift: Drawer interaction +
    //    focus-trap gate + full close-path coverage. This step is the
    //    documented Playwright reproducer per `working/phase-4.md`
    //    §Dependency Policy AND the M4 DoD bullet 3 evidence: the
    //    drawer's focus-trap, Esc-close, close-button-close,
    //    backdrop-close, and focus-restoration must all be covered
    //    in BOTH the component suite (`src/components/Drawer.test.tsx`)
    //    and here under real Chromium. M1b SHIFTED THE TRIGGER from
    //    the row (Phase 4) to the vestigial "Open detail" button
    //    rendered in `SessionView`'s `ready-placeholder` state. The
    //    focus-trap walk + the `dlg.contains(document.activeElement)`
    //    invariant are unchanged — the focus-trap-react escape-hatch
    //    slot 1 evidence remains load-bearing.
    //
    //    Sub-steps (M1b):
    //      (a) Click the row to drive URL-synced selection. The right
    //          pane flips to `data-state="ready-placeholder"`. Pressing
    //          Enter on the focused row sets the URL but DOES NOT open
    //          the drawer (the row click→drawer auto-mount was
    //          retired in M1b).
    //      (a') Click the vestigial "Open detail" button → the dialog
    //          becomes visible.
    //      (b) Esc-close + focus restoration. Press Esc, assert
    //          the dialog hides, then `waitForFunction` until
    //          `document.activeElement` is back on the
    //          `.open-detail` button (M1b shifted the focus-
    //          restoration target from the row to the button).
    //      (c) Re-open via Open detail button click; close via the
    //          in-dialog `.drawer-close` button (DoD bullet 3:
    //          close-button-close). After the close, `waitForFunction`
    //          until focus is back on the button.
    //      (d) Re-open via Open detail button; close via a backdrop
    //          click dispatched in-page so `event.target === dialog`
    //          (DoD bullet 3: backdrop-close).
    //      (e) Re-open via Open detail button; verify the focus-trap
    //          holds across `(focusable count + 1)` Tabs (DoD
    //          bullet 3: focus-trap). The button click replaces the
    //          Phase-4 Enter-on-row open path; the focus-trap walk
    //          itself is unchanged.
    //      (f) Final Esc-close so the dialog state is clean for the
    //          test teardown.
    const fixtureRow = page
      .locator(`tr:has-text("${FIXTURE_SESSION_KEY}")`)
      .first();
    const dialog = page.locator("dialog[open]");

    // (a) Sanity: pressing Enter on the focused row does NOT auto-
    // open the dialog (M1b semantic shift — the row click→drawer
    // auto-mount was retired). The row is already URL-selected from
    // the click at step 6 above (line 115), so the URL portion of
    // the assertion is implicit from that earlier step; we only
    // assert here that the dialog stays closed and the right pane
    // remains in `ready-placeholder`. Tightening this to also
    // re-verify the URL would require clearing the URL between the
    // step-6 click and this Enter press, which is not worth the
    // extra plumbing — the M1a deep-link test already covers
    // URL→state binding.
    await fixtureRow.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).not.toBeVisible();
    // The right pane is now in `ready-placeholder`.
    await expect(page.locator("article.session-pane")).toHaveAttribute(
      "data-state",
      "ready-placeholder",
    );

    // (a') Click the vestigial "Open detail" button → drawer opens.
    const openDetail = page.locator("article.session-pane button.open-detail");
    await expect(openDetail).toBeVisible();
    await openDetail.click();
    await expect(dialog).toBeVisible();

    // (b) Esc-close + focus restoration to the vestigial BUTTON
    //     (M1b shift: Phase 4 restored focus to the row; M1b
    //     restores focus to the button). The Drawer's
    //     `restoreFocusRef.current?.focus()` runs explicitly in the
    //     close handler; focus-trap-react ALSO does a `returnFocus`
    //     step in its post-deactivate path; both converge on the
    //     button.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.waitForFunction(
      () => {
        const a = document.activeElement;
        if (a === null) return false;
        return (a as HTMLElement).classList?.contains("open-detail") === true;
      },
      undefined,
      { timeout: 2000 },
    );

    // (c) Re-open via Open detail click; close via the in-dialog
    //     Close button (M1b: button → drawer; close → button).
    await openDetail.click();
    await expect(dialog).toBeVisible();
    await page.locator(".drawer-close").click();
    await expect(dialog).not.toBeVisible();
    await page.waitForFunction(
      () => {
        const a = document.activeElement;
        if (a === null) return false;
        return (a as HTMLElement).classList?.contains("open-detail") === true;
      },
      undefined,
      { timeout: 2000 },
    );

    // (d) Re-open via Open detail click and close via a backdrop
    //     click. We synthesize the backdrop click in-page so
    //     `event.target === dialog` (the guard in `Drawer.tsx`'s
    //     click handler).
    await openDetail.click();
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
      const dlg = document.querySelector(
        "dialog[open]",
      ) as HTMLDialogElement | null;
      if (dlg === null) throw new Error("dialog[open] not found");
      dlg.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await expect(dialog).not.toBeVisible();

    // (e) Re-open via Open detail click and verify the focus-trap
    //     holds across `(focusable count + 1)` Tabs. Native
    //     `<dialog>` marks the rest of the document inert during
    //     modal mode, but does NOT cycle Tab back to the first
    //     focusable element when the user steps past the last one —
    //     focus escapes to BODY (the documented Chromium
    //     reproducer captured in `progress/phase-4.progress.md`,
    //     which is why M4 landed the `focus-trap-react` escape
    //     hatch). With the trap installed, walking through
    //     `(focusable count + 1)` Tabs must keep focus inside the
    //     dialog on every step. The button-click open path replaces
    //     Phase 4's Enter-on-row open path; the focus-trap walk is
    //     unchanged — the focus-trap-react escape-hatch slot 1
    //     evidence remains load-bearing.
    await openDetail.click();
    await expect(dialog).toBeVisible();
    const focusableInside = await page.evaluate(() => {
      const dlg = document.querySelector("dialog[open]");
      if (dlg === null) return 0;
      return dlg.querySelectorAll(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      ).length;
    });
    const tabSteps = focusableInside + 1;
    for (let i = 0; i < tabSteps; i++) {
      await page.keyboard.press("Tab");
      const stillInside = await page.evaluate(() => {
        const dlg = document.querySelector("dialog[open]");
        return dlg !== null && dlg.contains(document.activeElement);
      });
      expect(stillInside).toBe(true);
    }

    // (f) Final Esc-close so the dialog state is clean for the
    //     test teardown.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // 10. M4 Chunk E2: streaming raw-preview block.
    //
    //     Re-open the drawer on the fixture row (which is now
    //     stored, so `storedSessionUid !== null` → the raw-preview
    //     section MUST render). Assert:
    //       - the "Raw preview" h3 is visible inside the drawer
    //       - at least one rendered NDJSON line lands
    //         (`.raw-preview-line`)
    //       - the caption is visible and matches one of the spec
    //         forms ("Showing first N lines …" or "Stopped at byte
    //         cap …"); the seeded fixture is 4 lines so the
    //         "Showing first 4 lines (full payload below the caps)"
    //         caption is the expected branch.
    //
    //     Why a separate step rather than extending step 9: step 9
    //     specifically exercises the focus-trap + close-path matrix
    //     and ends with the dialog deliberately closed. The
    //     raw-preview assertions rely on the drawer being OPEN with
    //     the streaming fetch having resolved — distinct concern,
    //     distinct step, easier to read in isolation.
    //
    //     Why we don't test the byte-cap path here: the seeded
    //     fixture is intentionally tiny (a few NDJSON lines, well
    //     under the 256 KB byte cap and the 20-line cap), so
    //     Playwright cannot exercise the cap path against it. The
    //     byte-cap test lives in `rawPreview.test.ts` +
    //     `SessionDetail.test.tsx` where a hand-built >256 KB
    //     ReadableStream proves the cap fires AND that
    //     `reader.cancel()` actually runs.
    //
    //     M1b trigger shift: the row click no longer opens the
    //     drawer; the row click drives URL-synced selection only.
    //     Click the vestigial "Open detail" button instead.
    await fixtureRow.click();
    await openDetail.click();
    await expect(dialog).toBeVisible();
    // The Raw preview heading sits inside the drawer.
    const rawPreviewHeading = dialog.locator(
      "section.drawer-raw-preview h3",
    );
    await expect(rawPreviewHeading).toBeVisible();
    await expect(rawPreviewHeading).toHaveText("Raw preview");
    // Wait for the streaming consumer to land (replaces the
    // initial "Loading raw preview…" copy with the rendered lines
    // + caption).
    const firstLine = dialog.locator(".raw-preview-line").first();
    await expect(firstLine).toBeVisible({ timeout: 5_000 });
    const caption = dialog.locator(".raw-preview-caption");
    await expect(caption).toBeVisible();
    await expect(caption).toHaveText(
      /Showing first \d+ lines|Stopped at byte cap/,
    );
    // Final Esc-close so we exit cleanly.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // 11. M5 Chunk F: Pagination + sticky action bar + toasts.
    //
    //    The seeded fixture has a single session, so the unified
    //    table renders one row total -> "Page 1 of 1" caption.
    //    We assert:
    //      (a) the Pagination control is in the DOM and reads
    //          "Page 1 of 1" with the seeded fixture
    //      (b) the page-size selector accepts a change to 100
    //          without breaking the layout (the table still
    //          renders the lone fixture row)
    //      (c) clicking Rescan pushes a "Rescan complete" toast
    //          with the structured RescanReport counts visible
    //          (textContent walks closed <details> elements)
    //      (d) the action-bar carries the .sticky modifier so
    //          CSS position:sticky engages
    //      (e) the last-rescan caption updates to a non-em-dash
    //          form after the rescan succeeds
    //
    //    The sticky-bar visibility-after-scroll assertion is
    //    omitted here because the seeded fixture's single row
    //    does not produce enough vertical content to push the
    //    bar out of natural view; the M5 component test in
    //    `ActionBar.test.tsx` covers the .sticky class wiring
    //    directly.
    const paginationCaption = page.locator(".pagination-caption");
    await expect(paginationCaption).toBeVisible();
    await expect(paginationCaption).toHaveText("Page 1 of 1");

    // (b) Change page-size to 100 -> still "Page 1 of 1" + table
    //     still has the fixture row.
    const pageSizeSelect = page.locator('select[aria-label="Page size"]');
    await pageSizeSelect.selectOption("100");
    await expect(paginationCaption).toHaveText("Page 1 of 1");
    await expect(
      page.getByText(FIXTURE_SESSION_KEY, { exact: false }),
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
    // Structured details: the typed RescanReport count names live
    // inside the toast's <details> disclosure and are findable via
    // the rendered DOM.
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
    //         the row merges in it should be "ready-placeholder")
    //       - the matched list row carries data-deep-link="true"
    //         transiently during the 600 ms pulse animation (codex
    //         M1a fix-up #4 — Option A: race against the pulse to
    //         capture the transient attribute as browser-level
    //         evidence that the pulse machinery actually fires)
    //       - the data-deep-link attribute is REMOVED after the
    //         pulse settles (either via onAnimationEnd or the 2 s
    //         safety timer); aria-current="true" remains as the
    //         stable post-pulse selection marker
    //       - reload (page.reload) preserves the URL state and the
    //         right-pane mount: the same row remains aria-current
    //         after the reload.
    //
    //     Note: the existing drawer flow (steps 9 + 10) ALSO opens
    //     when the user clicks a row — that's the M1a "Phase 4
    //     drawer flow preserved" invariant. M1b will retire it.
    //     Here we exercise the SEPARATE URL-driven path; the drawer
    //     does NOT open from a deep-link arrival because no click
    //     happens.
    //
    //     Cross-reference: the unit-level pulse-attribute behavior is
    //     covered by App.test.tsx tests
    //       - "M1a: URL-on-mount with ?session=<rowKey> pre-selects +
    //          matched row carries data-deep-link='true'"
    //       - "M1a: click-driven selection does NOT set data-deep-link='true'"
    //       - "M1a: deep-link pulse clears via onAnimationEnd → data-
    //          deep-link attribute is removed"
    //     This e2e step is the browser-level cross-check for the
    //     same machinery (codex round-1 blocking finding #4).
    await page.goto(`/?session=${encodeURIComponent(FIXTURE_SESSION_KEY)}`);
    await expect(
      page.getByRole("heading", { name: "Distill Portal", level: 1 }),
    ).toBeVisible();
    // <article class="session-pane"> is in the DOM with a
    // data-state attribute.
    const sessionPane = page.locator("article.session-pane");
    await expect(sessionPane).toHaveCount(1);
    // Capture the matched row by aria-current first — this is the
    // stable post-mount selector. Once it appears, the pulse is
    // either in flight or just-finished; we then make a tight
    // assertion against data-deep-link with a short timeout to
    // catch the transient attribute. This mirrors the unit-test
    // coverage in App.test.tsx (which uses happy-dom + immediate
    // synchronous assertion); the e2e gives us the browser-level
    // proof codex's M1a fix-up #4 asked for.
    const matchedRow = page
      .locator("tbody tr")
      .filter({ has: page.locator(`text=${FIXTURE_SESSION_KEY}`) });
    await expect(matchedRow).toBeVisible({ timeout: 5_000 });
    // Transient pulse attribute. The pulse runs for 600 ms; the 2 s
    // safety timer is the hard ceiling. A 1.5 s timeout for the
    // "attribute is present" assertion is comfortably within the
    // race window even if WebKit / fixture-server load takes a
    // beat. If this turns out flaky in real Chromium the fix-up
    // dispatch brief permits Option B (drop this assertion + add a
    // cross-reference comment); the cross-reference comment above
    // is already in place so the fallback is a one-line revert.
    await expect(matchedRow).toHaveAttribute("data-deep-link", "true", {
      timeout: 1_500,
    });
    // After the pulse settles (≤ 2 s safety timer + a small slack
    // for the React render cycle), the data-deep-link attribute is
    // removed. aria-current persists as the stable selection.
    await expect(matchedRow).not.toHaveAttribute("data-deep-link", "true", {
      timeout: 3_000,
    });
    // Once the row merges in, the data-state flips to
    // "ready-placeholder". (M2 will swap this for the four-tab
    // strip; M1a only renders the placeholder copy.)
    await expect(sessionPane).toHaveAttribute(
      "data-state",
      "ready-placeholder",
      { timeout: 5_000 },
    );
    // The matched row carries aria-current="true" after the pulse
    // settles. aria-current is the stable post-pulse attribute.
    const ariaCurrentRow = page.locator(`tr[aria-current="true"]`);
    await expect(ariaCurrentRow).toBeVisible({ timeout: 5_000 });
    await expect(ariaCurrentRow).toContainText(FIXTURE_SESSION_KEY);

    // Reload the page; the URL state must survive and the same
    // row must remain selected.
    await page.reload();
    await expect(sessionPane).toHaveAttribute(
      "data-state",
      "ready-placeholder",
      { timeout: 5_000 },
    );
    await expect(
      page.locator(`tr[aria-current="true"]`),
    ).toContainText(FIXTURE_SESSION_KEY, { timeout: 5_000 });
  });
});
