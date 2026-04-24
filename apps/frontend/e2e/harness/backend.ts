// Backend spawn harness for Playwright e2e (Chunk G2).
//
// Launches `cargo run -p distill-portal-backend` as a child process and
// returns a handle whose `.stop()` terminates it and cleans up the temp
// dir. Bound to 127.0.0.1:4000 because the Vite dev server proxies
// `/api/v1/**` and `/health` to that address (see
// `apps/frontend/vite.config.ts`); pointing the browser at a dynamic
// port would require rewriting the proxy on every run. Tests run
// serially (`workers: 1` in playwright.config.ts) so port 4000 is safe.
//
// Subprocess creation MUST use `Bun.spawn` — Bun-first rule. `node:fs`
// and `node:path` are used only for their sync/async filesystem
// helpers (creating a temp dir, writing a fixture).
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.dir` is Bun-only; Playwright invokes this module under
// Node's ESM loader, so we derive the directory from the URL instead.
const __dirname = dirname(fileURLToPath(import.meta.url));

export type BackendHandle = {
  /** HTTP base URL the backend listens on, including the scheme. */
  baseUrl: string;
  /** Filesystem path the backend treats as the Claude source root. */
  claudeRoot: string;
  /** Root temp dir owning `claudeRoot`, `codexRoot`, and the backend's data dir. */
  tempDir: string;
  /** Terminate the child process and remove the temp dir. Safe to call twice. */
  stop: () => Promise<void>;
};

export type StartBackendOptions = {
  /** Seed a Claude-code jsonl fixture at `<claudeRoot>/<claudeProject>/<claudeSessionId>.jsonl`. */
  seed?: {
    /** Project-directory name under the Claude root (matches Claude Code on-disk layout). */
    claudeProject: string;
    claudeSessionId: string;
    /** Raw NDJSON bytes to write. */
    jsonl: string | Uint8Array;
  };
  /**
   * Port the backend binds to. Hard-coded to 4000 because the Vite dev
   * proxy targets `http://127.0.0.1:4000`; overridable in case that
   * assumption ever changes.
   */
  port?: number;
  /** Max millis to wait for `/health` to return 200. Cold `cargo run` can be slow. */
  readyTimeoutMs?: number;
  /** Poll-interval override so freshly-seeded sessions appear quickly. */
  pollIntervalSecs?: number;
};

/**
 * Start the Rust backend in a temp-dir sandbox and wait until
 * `GET /health` returns 200. Resolves to a `BackendHandle` whose
 * `.stop()` tears everything down.
 */
export async function startBackend(
  options: StartBackendOptions = {},
): Promise<BackendHandle> {
  const port = options.port ?? 4000;
  const readyTimeoutMs = options.readyTimeoutMs ?? 120_000;
  const pollIntervalSecs = options.pollIntervalSecs ?? 1;

  const tempDir = await mkdtemp(join(tmpdir(), "distill-portal-e2e-"));
  const dataDir = join(tempDir, "data");
  const claudeRoot = join(tempDir, "claude", "projects");
  const codexRoot = join(tempDir, "codex", "sessions");
  await mkdir(dataDir, { recursive: true });
  await mkdir(claudeRoot, { recursive: true });
  await mkdir(codexRoot, { recursive: true });

  if (options.seed) {
    const projectDir = join(claudeRoot, options.seed.claudeProject);
    await mkdir(projectDir, { recursive: true });
    const sessionPath = join(
      projectDir,
      `${options.seed.claudeSessionId}.jsonl`,
    );
    await writeFile(sessionPath, options.seed.jsonl);
  }

  const baseUrl = `http://127.0.0.1:${port}`;

  // Bun.spawn: Bun-first rule. Never `child_process.spawn` in this repo.
  // `cargo run` inherits our env. We pin every variable the backend reads
  // so `BackendConfig::load()` resolves them deterministically — see
  // `components/configuration/src/lib.rs`.
  const workspaceRoot = join(__dirname, "..", "..", "..", "..");
  const proc = Bun.spawn({
    cmd: ["cargo", "run", "-p", "distill-portal-backend"],
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DISTILL_PORTAL_BACKEND_BIND: `127.0.0.1:${port}`,
      DISTILL_PORTAL_DATA_DIR: dataDir,
      DISTILL_PORTAL_CLAUDE_ROOTS: claudeRoot,
      // Point Codex at an empty dir so the scanner doesn't touch the
      // developer's actual ~/.codex/sessions directory.
      DISTILL_PORTAL_CODEX_ROOTS: codexRoot,
      DISTILL_PORTAL_POLL_INTERVAL_SECS: String(pollIntervalSecs),
      // Keep log output concise so Playwright's stdout isn't flooded.
      RUST_LOG: process.env.RUST_LOG ?? "error",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    try {
      proc.kill("SIGTERM");
      // Give the child 10s to exit cleanly before abandoning it.
      const exited = await Promise.race([
        proc.exited,
        new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), 10_000),
        ),
      ]);
      if (exited === "timeout") {
        proc.kill("SIGKILL");
        await proc.exited;
      }
    } catch {
      // Already exited.
    }
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort; leaving junk in /tmp is not test-blocking.
    }
  };

  try {
    await waitForHealth(baseUrl, readyTimeoutMs, proc);
  } catch (error) {
    await stop();
    throw error;
  }

  return { baseUrl, claudeRoot, tempDir, stop };
}

async function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
  proc: { exited: Promise<number> },
): Promise<void> {
  const start = Date.now();
  const healthUrl = `${baseUrl}/health`;
  let lastError: unknown = null;

  let childExited = false;
  // Fail fast if the child dies during startup (e.g. port already bound).
  const exitWatcher = proc.exited.then((code) => {
    childExited = true;
    lastError = new Error(`backend exited with code ${code} before /health became ready`);
  });
  void exitWatcher;

  while (Date.now() - start < timeoutMs) {
    if (childExited) {
      throw lastError ?? new Error("backend exited during startup");
    }
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        // Drain the body so the connection releases cleanly.
        await response.arrayBuffer();
        return;
      }
      lastError = new Error(`/health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `backend did not become ready within ${timeoutMs}ms: ${String(lastError)}`,
  );
}
