// Read-only inspection page (Phase 3, Chunk F1).
//
// Orchestrates three parallel fetches — source sessions, stored sessions,
// scan errors — via `Promise.allSettled` so each panel settles
// independently. A failure on one panel does not block the others. Each
// panel owns its own `{ loading, data, error }` slice of state.
//
// Chunk F1 is strictly read-only. Selection, rescan, and import controls
// (and the mutation plumbing that goes with them) are owned by Chunk F2.
import { useEffect, useState } from "react";
import {
  ApiError,
  listScanErrors,
  listSourceSessions,
  listStoredSessions,
} from "./lib/api";
import type {
  PersistedScanError,
  SourceSessionView,
  StoredSessionView,
} from "./lib/contracts";
import { SourceSessionsTable } from "./components/SourceSessionsTable";
import { StoredSessionsTable } from "./components/StoredSessionsTable";
import { ScanErrorsPanel } from "./components/ScanErrorsPanel";

type PanelState<T> =
  | { kind: "loading" }
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string };

export function App() {
  const [sourceState, setSourceState] = useState<PanelState<SourceSessionView[]>>(
    { kind: "loading" },
  );
  const [storedState, setStoredState] = useState<PanelState<StoredSessionView[]>>(
    { kind: "loading" },
  );
  const [errorsState, setErrorsState] = useState<PanelState<PersistedScanError[]>>(
    { kind: "loading" },
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    Promise.allSettled([
      listSourceSessions(signal),
      listStoredSessions(signal),
      listScanErrors(signal),
    ]).then(([sourceResult, storedResult, errorsResult]) => {
      if (signal.aborted) {
        return;
      }
      setSourceState(toPanelState(sourceResult));
      setStoredState(toPanelState(storedResult));
      setErrorsState(toPanelState(errorsResult));
    });

    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Distill Portal</h1>
      <section className="panel">
        <h2>Source Sessions</h2>
        <PanelBody
          state={sourceState}
          render={(data) => <SourceSessionsTable sessions={data} />}
          loadingLabel="Loading source sessions..."
          errorLabel="Failed to load source sessions"
        />
      </section>
      <section className="panel">
        <h2>Stored Sessions</h2>
        <PanelBody
          state={storedState}
          render={(data) => <StoredSessionsTable sessions={data} />}
          loadingLabel="Loading stored sessions..."
          errorLabel="Failed to load stored sessions"
        />
      </section>
      <section className="panel">
        <h2>Scan Errors</h2>
        <PanelBody
          state={errorsState}
          render={(data) => <ScanErrorsPanel errors={data} />}
          loadingLabel="Loading scan errors..."
          errorLabel="Failed to load scan errors"
        />
      </section>
    </main>
  );
}

type PanelBodyProps<T> = {
  state: PanelState<T>;
  render: (data: T) => React.ReactNode;
  loadingLabel: string;
  errorLabel: string;
};

function PanelBody<T>({
  state,
  render,
  loadingLabel,
  errorLabel,
}: PanelBodyProps<T>) {
  if (state.kind === "loading") {
    return <p>{loadingLabel}</p>;
  }
  if (state.kind === "error") {
    return (
      <p role="alert">
        {errorLabel}: {state.message}
      </p>
    );
  }
  return <>{render(state.data)}</>;
}

function toPanelState<T>(
  result: PromiseSettledResult<T>,
): PanelState<T> {
  if (result.status === "fulfilled") {
    return { kind: "ok", data: result.value };
  }
  if (isAbortError(result.reason)) {
    return { kind: "loading" };
  }
  return { kind: "error", message: messageFor(result.reason) };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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
