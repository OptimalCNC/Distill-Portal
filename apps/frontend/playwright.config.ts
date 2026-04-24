// Playwright config for the inspection-surface browser e2e.
//
// Chromium-only — no Firefox/WebKit, no visual-regression snapshots, no
// CI wiring. Tests run serially (`workers: 1`) because the harness binds
// the Rust backend to port 4000, matching the Vite dev proxy in
// `vite.config.ts`; parallel workers would collide.
//
// Intentional omission: the backend is NOT declared as a `webServer`
// here. The spec's `test.beforeAll` starts it via
// `e2e/harness/backend.ts` so it can seed fixtures into the same temp
// dir the backend was pointed at; Playwright's webServer hook can't
// reach back into the spec to share that path. Vite is the only
// `webServer` entry below.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Exclude the harness dir — those are helpers, not specs.
  testIgnore: ["**/harness/**"],
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://127.0.0.1:4100",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
