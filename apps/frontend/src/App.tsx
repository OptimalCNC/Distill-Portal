// Inspection page.
//
// Orchestrates three parallel fetches — source sessions, stored sessions,
// scan errors — via `Promise.allSettled` so each panel settles
// independently. A failure on one panel does not blank the others.
// Each panel owns its own `{ loading, ok, error }` slice of state.
//
// As of Phase 4 Milestone 2 the inspection surface renders a unified
// session list joined from the source + stored fetches (the dual-table
// layout is retired; see `src/features/sessions/`). The orchestration
// shape is unchanged: same three GETs, same `Promise.allSettled`
// per-panel error isolation, same `selected: Set<string>` selection
// model holding backend-provided `session_key` values, same import
// click-time intersection rule (now extended to filter by
// importability — see `handleImport`).
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
import { ScanErrorsCallout } from "./components/ScanErrorsCallout";
import { SessionsView, type PanelState } from "./features/sessions/SessionsView";
import { mergeSessions } from "./features/sessions/mergeSessions";
import { isImportable } from "./features/sessions/types";

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
  //
  // Importability is INTENTIONALLY not checked here: a row that's still
  // visible but no longer importable (e.g. just got ingested via a
  // separate flow) should remain in the raw set so the user can see
  // their stale selection in the count. The click-time intersection in
  // `handleImport` is the authoritative POST-time filter.
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
      // Compute the importable keys from the current merged-row set,
      // not just the source-side keys. A `both`-with-`up_to_date` row
      // has a sourceSessionKey but is NOT importable, and the bulk
      // toggle must skip it.
      const sourceData = sourceState.kind === "ok" ? sourceState.data : [];
      const storedData = storedState.kind === "ok" ? storedState.data : [];
      const rows = mergeSessions(sourceData, storedData);
      const importableKeys: string[] = [];
      for (const row of rows) {
        if (isImportable(row) && row.sourceSessionKey !== null) {
          importableKeys.push(row.sourceSessionKey);
        }
      }
      const allSelected =
        importableKeys.length > 0 &&
        importableKeys.every((k) => prev.has(k));
      if (allSelected) {
        return new Set();
      }
      return new Set(importableKeys);
    });
  }, [sourceState, storedState]);

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
    // Derive the import payload at click time from the currently-merged
    // rows that are still importable. Two defenses bake into one
    // expression:
    //   (a) F2 visible-intersection: a rescan that has just pruned a
    //       row from the source list won't ship its key, even if the
    //       reconciliation `useEffect` has not yet flushed.
    //   (b) M2 importability: a row that has ALWAYS had a non-null
    //       `sourceSessionKey` but is `up_to_date` (i.e. visible but
    //       not eligible for import) won't ship either, even if the
    //       UI somehow leaked a stale identity into `selected`.
    // The same `isImportable` helper used by SessionsTable governs
    // both checks, so the rendered checkbox set and the POST body
    // cannot drift apart.
    const sourceData = sourceState.kind === "ok" ? sourceState.data : [];
    const storedData = storedState.kind === "ok" ? storedState.data : [];
    const rows = mergeSessions(sourceData, storedData);
    const visibleImportableKeys = new Set<string>();
    for (const row of rows) {
      if (isImportable(row) && row.sourceSessionKey !== null) {
        visibleImportableKeys.add(row.sourceSessionKey);
      }
    }
    const keysToImport = Array.from(selected).filter((k) =>
      visibleImportableKeys.has(k),
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
  }, [selected, sourceState, storedState, refetchAll]);

  // Selected count for the action bar mirrors the same intersection
  // the import POST will use, so "Import selected (N)" always names
  // the exact set that would ship if clicked now.
  const sourceData = sourceState.kind === "ok" ? sourceState.data : [];
  const storedData = storedState.kind === "ok" ? storedState.data : [];
  const visibleImportableSet = new Set<string>();
  for (const row of mergeSessions(sourceData, storedData)) {
    if (isImportable(row) && row.sourceSessionKey !== null) {
      visibleImportableSet.add(row.sourceSessionKey);
    }
  }
  let selectedCount = 0;
  for (const k of selected) {
    if (visibleImportableSet.has(k)) selectedCount += 1;
  }

  return (
    <main>
      <h1>Distill Portal</h1>
      <section className="panel">
        <h2>Sessions</h2>
        <ActionBar
          selectedCount={selectedCount}
          pending={pending}
          lastReport={lastReport}
          onRescan={handleRescan}
          onImport={handleImport}
        />
        <SessionsView
          sourceState={sourceState}
          storedState={storedState}
          selected={selected}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          onRetry={() => {
            void refetchAll();
          }}
        />
      </section>
      {errorsState.kind === "error" ? (
        <p role="alert">
          Failed to load scan errors: {errorsState.message}
        </p>
      ) : (
        <ScanErrorsCallout
          errors={errorsState.kind === "ok" ? errorsState.data : []}
        />
      )}
    </main>
  );
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
