// Inspection page.
//
// Orchestrates three parallel fetches — source sessions, stored sessions,
// scan errors — via `Promise.allSettled` so each panel settles
// independently. A failure on one panel does not blank the others.
// Each panel owns its own `{ loading, ok, error }` slice of state.
//
// As of Phase 4 Milestone 3 the inspection surface adds client-side
// filter / sort / search on top of the unified session list. Filter
// state lives in `useSessionFilters` (persisted to `localStorage` under
// `distill-portal:inspection-filters:v1`); the merged + filtered +
// sorted row set is memoized here so all three downstream consumers
// (the table, the action-bar count, and the click-time import POST
// filter) read from one cache.
//
// Selection model unchanged: `selected: Set<string>` holds backend
// `session_key` values. The "+K hidden by filters" caption surfaces the
// raw-minus-effective gap so a user who narrows the view does not lose
// their checkbox state silently. Per-panel error isolation, the
// reconciliation `useEffect` against the source-side keys, and the
// click-time intersection rule are all preserved from M2 — M3 EXTENDS
// the click-time intersection so it filters by the current filter
// window in addition to importability.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  applyFilters,
  applySort,
  distinctProjectPaths,
} from "./features/sessions/filterSessions";
import { useSessionFilters } from "./features/sessions/useSessionFilters";

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

  // `now` is captured at refetch time so the relative-time renderer in
  // SessionsTable does not ticker-update between fetches. The spec
  // requires "Relative time is computed against a single `now` captured
  // at render time and refreshed on each refetch" — using state means
  // refresh-on-refetch automatically triggers a re-render of the table.
  const [now, setNow] = useState<string>(() => new Date().toISOString());

  // Filter / sort / search state (persisted to localStorage).
  const { filters, setFilter, resetAll, setImportableOnly } =
    useSessionFilters();

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
    // Re-pin `now` so the relative-time cells refresh against the just-
    // landed data, not the stale value from the previous render.
    setNow(new Date().toISOString());
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
  //
  // Filter-window membership is ALSO not pruned here. A filter mutation
  // does not clear selection (per spec); rows that fall out of the
  // current filter remain in the raw `selected` set and surface as
  // "+K hidden by filters" in the action bar. The click-time
  // intersection is again the authoritative POST-time filter.
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

  // Memoize the merge step so the three downstream consumers (filter
  // pipeline, click-time importable set, action-bar visible-importable
  // set) share one cache. This bundles the deferred M2 nit (per-render
  // re-merge across three call sites). Depend on `sourceState` /
  // `storedState` (the stable references), not on the inline
  // `sourceData` / `storedData` derivations whose array references
  // would change every render even when the underlying data did not.
  const mergedRows = useMemo(() => {
    const src = sourceState.kind === "ok" ? sourceState.data : [];
    const stor = storedState.kind === "ok" ? storedState.data : [];
    return mergeSessions(src, stor);
  }, [sourceState, storedState]);

  // Filter + sort pipeline. `applyFilters` and `applySort` are pure;
  // they accept new state objects each call, so wrapping the chain in
  // `useMemo` is the natural way to keep render cost flat across
  // re-renders that don't touch the merged set or the filter state.
  const filteredRows = useMemo(
    () => applySort(applyFilters(mergedRows, filters), filters.sort),
    [mergedRows, filters],
  );

  // Distinct project paths in the current MERGED set (not the filtered
  // set) so the project autocomplete still surfaces every project even
  // when another filter narrowed the view.
  const projects = useMemo(
    () => distinctProjectPaths(mergedRows),
    [mergedRows],
  );

  // Visible importable set under the CURRENT filter window. The
  // click-time intersection in `handleImport` reads from this same set
  // so the POST body never contains a row hidden by filter.
  const visibleImportableInFilter = useMemo(() => {
    const set = new Set<string>();
    for (const row of filteredRows) {
      if (isImportable(row) && row.sourceSessionKey !== null) {
        set.add(row.sourceSessionKey);
      }
    }
    return set;
  }, [filteredRows]);

  // Visible importable set across the FULL merged set (i.e. ignoring the
  // filter window). Used to compute the "+K hidden by filters" caption:
  // a key is "hidden by filter" when it's in `selected`, importable in
  // the full merged set, but NOT importable in the current filter
  // window.
  const visibleImportableInMerged = useMemo(() => {
    const set = new Set<string>();
    for (const row of mergedRows) {
      if (isImportable(row) && row.sourceSessionKey !== null) {
        set.add(row.sourceSessionKey);
      }
    }
    return set;
  }, [mergedRows]);

  const handleToggleAll = useCallback(() => {
    setSelected((prev) => {
      // Toggle bulk-select against the CURRENT FILTER window. A user
      // who narrows the view and clicks the header checkbox expects to
      // select only what they can see (per spec § Bulk-select
      // affordances: "Select all importable in current filter").
      const importableKeys = Array.from(visibleImportableInFilter);
      const allSelected =
        importableKeys.length > 0 &&
        importableKeys.every((k) => prev.has(k));
      if (allSelected) {
        // Clear only the keys that came from the current filter
        // window; selection from outside the filter (the +K hidden
        // by filters) is left alone — Clear hidden / Clear selection
        // are the dedicated affordances for those.
        const next = new Set(prev);
        for (const k of importableKeys) next.delete(k);
        return next;
      }
      const next = new Set(prev);
      for (const k of importableKeys) next.add(k);
      return next;
    });
  }, [visibleImportableInFilter]);

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
    // Derive the import payload at click time from the currently-
    // FILTERED rows that are still importable. Three defenses bake
    // into one expression:
    //   (a) F2 visible-intersection: a rescan that has just pruned a
    //       row from the source list won't ship its key, even if the
    //       reconciliation `useEffect` has not yet flushed.
    //   (b) M2 importability: a row that has ALWAYS had a non-null
    //       `sourceSessionKey` but is `up_to_date` (i.e. visible but
    //       not eligible for import) won't ship either, even if the
    //       UI somehow leaked a stale identity into `selected`.
    //   (c) M3 filter-window: a row that the user selected, then
    //       hid via a filter mutation, will NOT ship — only rows in
    //       the current filter window are eligible.
    // The same `isImportable` helper used by SessionsTable governs
    // (a)+(b), and the filter pipeline owns (c), so the rendered
    // checkbox set, the action-bar count, and the POST body cannot
    // drift apart.
    //
    // Build the visible-importable set fresh inside the handler so
    // we read whatever state landed up to the moment of the click,
    // not a value captured by `useMemo` at the previous render. This
    // mirrors the F2 pattern where the click happens during a
    // commit-time scheduler race; a stale memoized closure here
    // would re-open the bug.
    const src = sourceState.kind === "ok" ? sourceState.data : [];
    const stor = storedState.kind === "ok" ? storedState.data : [];
    const liveMerged = mergeSessions(src, stor);
    const liveFiltered = applySort(
      applyFilters(liveMerged, filters),
      filters.sort,
    );
    const liveVisibleImportable = new Set<string>();
    for (const row of liveFiltered) {
      if (isImportable(row) && row.sourceSessionKey !== null) {
        liveVisibleImportable.add(row.sourceSessionKey);
      }
    }
    const keysToImport = Array.from(selected).filter((k) =>
      liveVisibleImportable.has(k),
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
  }, [selected, sourceState, storedState, filters, refetchAll]);

  // Selected count for the action bar mirrors the same intersection
  // the import POST will use, so "Import selected (N)" always names
  // the exact set that would ship if clicked now.
  let selectedCount = 0;
  for (const k of selected) {
    if (visibleImportableInFilter.has(k)) selectedCount += 1;
  }

  // "+K hidden by filters" caption: keys the user has selected that
  // are still importable in the merged set but NOT in the filter
  // window. These are rows that fell out of the user's current view
  // because of a filter, not because the backend pruned them.
  let hiddenByFilterCount = 0;
  for (const k of selected) {
    if (
      visibleImportableInMerged.has(k) &&
      !visibleImportableInFilter.has(k)
    ) {
      hiddenByFilterCount += 1;
    }
  }

  const onClearHidden = useCallback(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const k of prev) {
        if (visibleImportableInFilter.has(k)) next.add(k);
      }
      return next;
    });
  }, [visibleImportableInFilter]);

  const onClearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  return (
    <main>
      <h1>Distill Portal</h1>
      <section className="panel">
        <h2>Sessions</h2>
        <ActionBar
          selectedCount={selectedCount}
          hiddenByFilterCount={hiddenByFilterCount}
          pending={pending}
          lastReport={lastReport}
          onRescan={handleRescan}
          onImport={handleImport}
          onClearHidden={onClearHidden}
          onClearSelection={onClearSelection}
        />
        <SessionsView
          sourceState={sourceState}
          storedState={storedState}
          mergedRows={mergedRows}
          filteredRows={filteredRows}
          filters={filters}
          projects={projects}
          setFilter={setFilter}
          setImportableOnly={setImportableOnly}
          resetAll={resetAll}
          selected={selected}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          onRetry={() => {
            void refetchAll();
          }}
          onRescan={handleRescan}
          rescanPending={pending === "rescan"}
          now={now}
        />
      </section>
      {errorsState.kind === "error" ? (
        <p role="alert">
          Failed to load scan errors: {errorsState.message}{" "}
          <button type="button" onClick={() => void refetchAll()}>
            Retry
          </button>
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
