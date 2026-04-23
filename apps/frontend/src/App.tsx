import { useEffect, useState } from "react";
import { ApiError, listSourceSessions } from "./lib/api";
import type { SourceSessionView } from "./lib/contracts";

type ViewState =
  | { kind: "loading" }
  | { kind: "ok"; sessions: SourceSessionView[] }
  | { kind: "error"; message: string };

export function App() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    listSourceSessions(controller.signal)
      .then((sessions) => {
        setState({ kind: "ok", sessions });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message = messageFor(error);
        setState({ kind: "error", message });
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Distill Portal</h1>
      <p>Phase 3 frontend skeleton (Bun + Vite + React + TypeScript).</p>
      <section>
        <h2>Discovered source sessions</h2>
        {state.kind === "loading" && <p>Loading source sessions...</p>}
        {state.kind === "error" && (
          <p role="alert">Failed to load source sessions: {state.message}</p>
        )}
        {state.kind === "ok" && state.sessions.length === 0 && (
          <p>No source sessions found.</p>
        )}
        {state.kind === "ok" && state.sessions.length > 0 && (
          <ul>
            {state.sessions.map((session) => (
              <li key={session.session_key}>
                <code>{session.session_key}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
