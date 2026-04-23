import { useEffect, useState } from "react";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; body: string }
  | { kind: "error"; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/health", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.text()).trim();
        if (!response.ok) {
          setHealth({
            kind: "error",
            message: `backend /health returned ${response.status}: ${body}`,
          });
          return;
        }
        setHealth({ kind: "ok", body });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message =
          error instanceof Error ? error.message : String(error);
        setHealth({ kind: "error", message });
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Distill Portal</h1>
      <p>Phase 3 frontend skeleton (Bun + Vite + React + TypeScript).</p>
      <section>
        <h2>Backend health</h2>
        {health.kind === "loading" && <p>Checking backend /health...</p>}
        {health.kind === "ok" && (
          <p>
            Backend reports: <code>{health.body}</code>
          </p>
        )}
        {health.kind === "error" && (
          <p role="alert">Backend /health failed: {health.message}</p>
        )}
      </section>
    </main>
  );
}
