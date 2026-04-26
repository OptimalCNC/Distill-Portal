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

    // 9. M4 Chunk E1: Drawer interaction + focus-trap gate +
    //    full close-path coverage. This step is the documented
    //    Playwright reproducer per `working/phase-4.md` §Dependency
    //    Policy AND the M4 DoD bullet 3 evidence: the drawer's
    //    focus-trap, Esc-close, close-button-close, backdrop-close,
    //    and focus-restoration must all be covered in BOTH the
    //    component suite (`src/components/Drawer.test.tsx`) and
    //    here under real Chromium. While these assertions all pass,
    //    no new runtime dep is added; if focus-trap fails on real
    //    Chromium the documented escape hatch (a focus-management
    //    package, e.g. `focus-trap-react`) lands and the failing
    //    reproducer is captured in the progress log.
    //
    //    Sub-steps:
    //      (a) Open via Enter on the focused fixture row. The
    //          dialog becomes visible.
    //      (b) Esc-close + focus restoration. Press Esc, assert
    //          the dialog hides, then `waitForFunction` until
    //          `document.activeElement` is back inside the
    //          fixture row (DoD bullet 3: focus restoration to
    //          originating row).
    //      (c) Re-open via row click; close via the in-dialog
    //          `.drawer-close` button (DoD bullet 3: close-
    //          button-close). After the close, `waitForFunction`
    //          until focus is back on the row — this serializes
    //          us with focus-trap-react's deactivation lifecycle.
    //      (d) Re-open via row click; close via a backdrop click
    //          dispatched in-page (`dialog.dispatchEvent(new
    //          MouseEvent("click"))`) so `event.target === dialog`
    //          (the source-side guard in `Drawer.tsx`). We
    //          dispatch synthetically rather than positional-
    //          click because the backdrop has no addressable hit
    //          target — `page.locator("dialog[open]").click()`
    //          lands on dialog content, not the backdrop scrim
    //          (DoD bullet 3: backdrop-close).
    //      (e) Re-open via Enter on the focused row; verify the
    //          focus-trap holds across multiple Tabs. Native
    //          `<dialog>` does NOT cycle Tab inside the modal —
    //          focus escapes to BODY past the last focusable
    //          child. With focus-trap-react installed, walking
    //          through `(focusable count + 1)` Tabs must keep
    //          focus inside the dialog on every step (DoD
    //          bullet 3: focus-trap).
    //      (f) Final Esc-close so the dialog state is clean for
    //          the test teardown.
    //
    //    The (c)/(d) re-opens use `fixtureRow.click()` rather
    //    than `keyboard.press("Enter")` because, after a previous
    //    close where focus-trap-react's deactivation runs as a
    //    React effect, the next synthetic keydown can race the
    //    cleanup tail and the React onKeyDown handler will not
    //    fire (the keydown reaches the document but is swallowed
    //    before reaching React's synthetic event system). A real-
    //    input click avoids that race deterministically. The
    //    Enter-open path is exercised in (a) and (e), which is
    //    enough to satisfy the spec ("open the drawer via Enter
    //    on the focused fixture row" — required for the focus-
    //    restoration assertion in (b) and the focus-trap gate
    //    in (e)).
    const fixtureRow = page
      .locator(`tr:has-text("${FIXTURE_SESSION_KEY}")`)
      .first();
    const dialog = page.locator("dialog[open]");

    // (a) Open via Enter on focused row.
    await fixtureRow.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();

    // (b) Esc-close + focus restoration to the originating row.
    //     Native `<dialog>` Esc semantics, not our happy-dom shim.
    //     The platform restores focus on `dialog.close()`; the
    //     Drawer also wires an explicit `restoreFocusRef.current
    //     ?.focus()` belt-and-braces; focus-trap-react ALSO does
    //     a `returnFocus` step in its componentDidUpdate-driven
    //     post-deactivate path. All three converge on the row.
    //     We use `waitForFunction` so the assertion does not race
    //     with the post-deactivate step (the explicit ref focus
    //     fires synchronously in our `close` handler, but the
    //     focus-trap-react settle runs later as a React effect).
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.waitForFunction(
      (key: string) => {
        const a = document.activeElement;
        if (a === null) return false;
        const tr = a.closest("tr");
        if (tr === null) return false;
        return tr.textContent?.includes(key) === true;
      },
      FIXTURE_SESSION_KEY,
      { timeout: 2000 },
    );

    // (c) Re-open via row click and close via the in-dialog
    //     Close button. The re-open uses `fixtureRow.click()`
    //     rather than `keyboard.press("Enter")` because the
    //     post-Esc focus-trap-react deactivation can still be
    //     in-flight at this point (the `waitForFunction` above
    //     waits for focus to settle on the row, but the trap's
    //     componentDidUpdate-driven cleanup runs on a slightly
    //     longer tail and can intermittently swallow the next
    //     synthetic keypress before React's onKeyDown handler
    //     sees it). A real-input click avoids that race
    //     deterministically.
    await fixtureRow.click();
    await expect(dialog).toBeVisible();
    await page.locator(".drawer-close").click();
    await expect(dialog).not.toBeVisible();
    await page.waitForFunction(
      (key: string) => {
        const a = document.activeElement;
        if (a === null) return false;
        const tr = a.closest("tr");
        if (tr === null) return false;
        return tr.textContent?.includes(key) === true;
      },
      FIXTURE_SESSION_KEY,
      { timeout: 2000 },
    );

    // (d) Re-open via row click (same rationale as (c)) and close
    //     via a backdrop click. We synthesize the backdrop click
    //     in-page so `event.target === dialog` (the guard in
    //     `Drawer.tsx`'s click handler). A
    //     `page.locator("dialog[open]").click({ position: ... })`
    //     would land on the dialog's padding area but the
    //     `event.target` would still be the dialog element; that
    //     said, hit-testing is fragile across viewports, so the
    //     `dispatchEvent` path is the reliable choice.
    await fixtureRow.click();
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

    // (e) Re-open and verify the focus-trap holds across multiple
    //     Tabs. Native `<dialog>` marks the rest of the document
    //     inert during modal mode, but does NOT cycle Tab back to
    //     the first focusable element when the user steps past
    //     the last one — focus escapes to BODY (the documented
    //     Chromium reproducer captured in
    //     `progress/phase-4.progress.md`, which is why M4 landed
    //     the `focus-trap-react` escape hatch). With the trap
    //     installed, walking through `(focusable count + 1)` Tabs
    //     must keep focus inside the dialog on every step.
    await fixtureRow.focus();
    await page.keyboard.press("Enter");
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
    await fixtureRow.click();
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
  });
});
