// Inspection page.
//
// Orchestrates three parallel fetches — source sessions, stored sessions,
// scan errors — via `Promise.allSettled` so each panel settles
// independently. A failure on one panel does not block the others. Each
// panel owns its own `{ loading, data, error }` slice of state.
//
// Selection is lifted into this component and drives two mutations:
// backend rescan (`POST /api/v1/admin/rescan`) and source-session import
// (`POST /api/v1/source-sessions/import`). The `ActionBar` owns the
// mutation-button UI but remains stateless; `SourceSessionsTable` is a
// controlled view of the `selected` set below. After each mutation
// resolves we refetch the three panels unconditionally — no optimistic
// updates — to keep the inspection surface consistent with the backend.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  importSourceSessions,
  listScanErrors,
  listSourceSessions,
  listStoredSessions,
  triggerRescan,
} from "./lib/api";
import type {
  ImportReport,
  PersistedScanError,
  RescanReport,
  SourceSessionView,
  StoredSessionView,
} from "./lib/contracts";
import { ActionBar, type LastReport } from "./components/ActionBar";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<"rescan" | "import" | null>(null);
  const [lastReport, setLastReport] = useState<LastReport | null>(null);

  // Tracks the most recent refetch controller so a pending refetch can be
  // cancelled when the component unmounts or a newer refetch kicks off.
  const activeControllerRef = useRef<AbortController | null>(null);

  const refetchAll = useCallback(async () => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const { signal } = controller;

    const [sourceResult, storedResult, errorsResult] = await Promise.allSettled([
      listSourceSessions(signal),
      listStoredSessions(signal),
      listScanErrors(signal),
    ]);
    if (signal.aborted) {
      return;
    }
    setSourceState(toPanelState(sourceResult));
    setStoredState(toPanelState(storedResult));
    setErrorsState(toPanelState(errorsResult));
  }, []);

  useEffect(() => {
    void refetchAll();
    return () => {
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, [refetchAll]);

  // Reconcile `selected` against the current set of visible source sessions
  // whenever a refetch lands. If a previously-selected row disappeared from
  // the backend (e.g. after a rescan removed it), prune its key so the
  // action-bar count and the import POST body stay in sync. The
  // `changed ? next : prev` guard keeps the reference stable when nothing
  // was pruned so downstream consumers don't re-render unnecessarily.
  useEffect(() => {
    if (sourceState.kind !== "ok") return;
    const visibleKeys = new Set(sourceState.data.map((s) => s.session_key));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (visibleKeys.has(k)) {
          next.add(k);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sourceState]);

  const handleToggle = useCallback((sessionKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sessionKey)) {
        next.delete(sessionKey);
      } else {
        next.add(sessionKey);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelected((prev) => {
      if (sourceState.kind !== "ok") {
        return prev;
      }
      const allKeys = sourceState.data.map((s) => s.session_key);
      const allSelected =
        allKeys.length > 0 && allKeys.every((k) => prev.has(k));
      if (allSelected) {
        return new Set();
      }
      return new Set(allKeys);
    });
  }, [sourceState]);

  const handleRescan = useCallback(async () => {
    setPending("rescan");
    try {
      const report: RescanReport = await triggerRescan();
      setLastReport({ kind: "rescan", report });
      await refetchAll();
    } catch (error) {
      setLastReport({
        kind: "error",
        message: `Rescan failed: ${messageFor(error)}`,
      });
    } finally {
      setPending(null);
    }
  }, [refetchAll]);

  const handleImport = useCallback(async () => {
    setPending("import");
    // Derive the import payload from the currently-visible source sessions at
    // click time. If a rescan has just pruned a row from the backend but the
    // `selected`-reconciliation `useEffect` has not yet flushed, the raw
    // `selected` set can still contain the stale key. Filtering here
    // guarantees the POST body matches what the user sees, independent of
    // effect-flush timing.
    const visibleSessionKeys =
      sourceState.kind === "ok"
        ? new Set(sourceState.data.map((s) => s.session_key))
        : new Set<string>();
    const keysToImport = Array.from(selected).filter((k) =>
      visibleSessionKeys.has(k),
    );
    try {
      const report: ImportReport = await importSourceSessions(keysToImport);
      setSelected(new Set());
      setLastReport({ kind: "import", report });
      await refetchAll();
    } catch (error) {
      setLastReport({
        kind: "error",
        message: `Import failed: ${messageFor(error)}`,
      });
    } finally {
      setPending(null);
    }
  }, [selected, sourceState, refetchAll]);

  const sourceSessions =
    sourceState.kind === "ok" ? sourceState.data : [];
  const selectedCount = sourceSessions.reduce(
    (acc, s) => (selected.has(s.session_key) ? acc + 1 : acc),
    0,
  );

  return (
    <main>
      <h1>Distill Portal</h1>
      <section className="panel">
        <h2>Source Sessions</h2>
        <ActionBar
          selectedCount={selectedCount}
          pending={pending}
          lastReport={lastReport}
          onRescan={handleRescan}
          onImport={handleImport}
        />
        <PanelBody
          state={sourceState}
          render={(data) => (
            <SourceSessionsTable
              sessions={data}
              selected={selected}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
            />
          )}
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
