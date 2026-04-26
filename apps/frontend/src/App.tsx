// Inspection page.
//
// Orchestrates three parallel fetches — source sessions, stored sessions,
// scan errors — via `Promise.allSettled` so each panel settles
// independently. A failure on one panel does not blank the others.
// Each panel owns its own `{ loading, ok, error }` slice of state.
//
// As of Phase 4 Milestone 5 (Chunk F):
//   - The list is PAGINATED client-side (page sizes 50 / 100 / 200,
//     default 50; persisted via `useSessionFilters`). `pageIndex` is
//     a separate piece of view state owned here, NOT in the filter
//     hook (the hook persists user-settable filter axes; the page
//     index is a transient "where am I in this scroll" value that
//     should NOT survive a reload). The page slice math runs through
//     `applyPagination` which also clamps the index, so a stale
//     `pageIndex` from a shrunk row set self-heals on the next render.
//   - Mutation outcomes (rescan + import) flow through a TOAST QUEUE
//     (`useToastQueue` + `<Toast>`) instead of the M3-era inline
//     `lastReport` text. Errors render a Retry action that re-derives
//     the click-time intersection at retry time (mirrors the M3
//     handleImport pattern; the same fresh re-derivation guards the
//     pagination-cross-page race).
//   - The Rescan button carries a "last rescan from this browser X
//     ago" caption (read from / written to
//     `distill-portal:last-manual-rescan:v1` per spec §Action Bar
//     and Mutation UX). The caption is explicitly scoped to "this
//     browser" because the backend runs its own scans the browser
//     cannot observe.
//
// Selection model unchanged from M3: `selected: Set<string>` holds
// backend `session_key` values; the `+K hidden by filters` caption
// surfaces the raw-minus-effective gap; the click-time intersection
// in `handleImport` continues to filter by the current FILTER
// window (NOT the page window) so cross-page selection accumulated
// through "Select all importable in current filter" still ships.
//
// The toast queue is rendered as a sibling of `<main>` for DOM
// placement (the queue is a fixed-position overlay anchored bottom-
// right). Note this sibling placement does NOT isolate React renders
// — `useToastQueue` is App-level state, so push/dismiss re-renders
// the entire App subtree. The reason the table render stays cheap is
// memoization (`mergedRows` / `filteredRows` / `pageRows` are
// `useMemo`d, so the heavy filter/sort/paginate chain doesn't re-run
// on a toast push).
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
import { ActionBar } from "./components/ActionBar";
import { ScanErrorsCallout } from "./components/ScanErrorsCallout";
import { Toast } from "./components/Toast";
import { SessionsView, type PanelState } from "./features/sessions/SessionsView";
import { mergeSessions } from "./features/sessions/mergeSessions";
import { isImportable } from "./features/sessions/types";
import {
  applyFilters,
  applySort,
  distinctProjectPaths,
} from "./features/sessions/filterSessions";
import { applyPagination, type PageSize } from "./features/sessions/applyPagination";
import { useSessionFilters } from "./features/sessions/useSessionFilters";
import { useToastQueue } from "./features/sessions/useToastQueue";
import { readLastRescan, writeLastRescan } from "./features/sessions/lastRescan";

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

  // useToastQueue is App-level state; push/dismiss re-renders App's
  // JSX walk, but the merged/filtered/sorted/paginated rows are
  // memoized via useMemo (see `mergedRows`, `filteredRows`,
  // `pageRows` below) so the heavy computation does not re-run.
  // The toast UI is a sibling of <main> for DOM placement (it's a
  // fixed-position overlay anchored bottom-right), not for React
  // render isolation — push/dismiss still walks the App subtree;
  // memoization is the perf gate, not sibling placement.
  const { toasts, pushToast, dismissToast } = useToastQueue();

  // "Last rescan from this browser" timestamp. Read on mount;
  // written by the rescan success path (NOT on error). Held in
  // React state so the caption re-renders without an explicit
  // refetch round trip.
  const [lastRescanAt, setLastRescanAt] = useState<string | null>(() =>
    readLastRescan(),
  );

  // `now` is captured at refetch time so the relative-time renderer in
  // SessionsTable + the M5 last-rescan caption do not ticker-update
  // between fetches. The spec requires "Relative time is computed
  // against a single `now` captured at render time and refreshed on
  // each refetch" — using state means refresh-on-refetch automatically
  // triggers a re-render of both consumers.
  const [now, setNow] = useState<string>(() => new Date().toISOString());

  // Filter / sort / search state (persisted to localStorage).
  const { filters, setFilter, resetAll, setImportableOnly } =
    useSessionFilters();

  // Active page index. NOT persisted — page index is a transient
  // "where am I in this scroll" value that should reset to 0 on
  // mount. Page SIZE is persisted (in useSessionFilters); only the
  // index is in transient state here.
  const [pageIndex, setPageIndex] = useState<number>(0);
  // Track the previous pageSize so we can recompute pageIndex on a
  // pageSize change without resetting (keeps the first visible row
  // visible). `useRef` so we don't re-render on every change.
  const prevPageSizeRef = useRef<PageSize>(filters.pageSize);

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

  // Pagination: derive the page slice + the clamped page index. The
  // `applyPagination` helper guarantees pageIndex is in
  // `[0, totalPages-1]` so a stale state value can't render an empty
  // page when filteredRows is non-empty. The clamped value is
  // synced back to React state via the effect below so subsequent
  // renders agree on the same index.
  const {
    pageRows,
    pageIndex: clampedPageIndex,
  } = useMemo(
    () => applyPagination(filteredRows, pageIndex, filters.pageSize),
    [filteredRows, pageIndex, filters.pageSize],
  );

  // Sync the clamped pageIndex back to state if the helper had to
  // adjust it (e.g. a filter mutation shrank the row set so the
  // user's last pageIndex now lands past totalPages). The
  // `clampedPageIndex !== pageIndex` guard prevents an infinite
  // setState loop.
  useEffect(() => {
    if (clampedPageIndex !== pageIndex) {
      setPageIndex(clampedPageIndex);
    }
  }, [clampedPageIndex, pageIndex]);

  // Page-reset on filter change. Per spec §localStorage robustness:
  // "Changing any filter or the sort resets the page to 1." We list
  // every filter axis explicitly so a future addition has to opt in
  // (and we don't accidentally reset on an unrelated render). We do
  // NOT list `filters.pageSize` here — that change is handled by the
  // recompute effect below so the first visible row stays visible.
  useEffect(() => {
    setPageIndex(0);
  }, [
    filters.tool,
    filters.status,
    filters.storage,
    filters.importableOnly,
    filters.project,
    filters.search,
    filters.sort.field,
    filters.sort.direction,
  ]);

  // Page-size change recompute. Per spec §localStorage robustness:
  // "Changing the page size recomputes the current page so the first
  // visible row stays visible if possible." If the user is on page 2
  // with pageSize 50 (rows 50-99) and switches to pageSize 100, the
  // new pageIndex must be 0 (rows 0-99 — keeps row 50 visible);
  // switching back to pageSize 50 from there returns them to page 1
  // (rows 50-99). The math is: firstVisibleRow = pageIndex * oldSize;
  // newPageIndex = floor(firstVisibleRow / newSize).
  useEffect(() => {
    const oldSize = prevPageSizeRef.current;
    const newSize = filters.pageSize;
    if (oldSize !== newSize) {
      // Use a functional setState so we read the freshest pageIndex
      // (not a closure-captured one).
      setPageIndex((prev) => Math.floor((prev * oldSize) / newSize));
      prevPageSizeRef.current = newSize;
    }
  }, [filters.pageSize]);

  // Visible importable set under the CURRENT filter window. The
  // click-time intersection in `handleImport` reads from this same set
  // so the POST body never contains a row hidden by filter. NOTE:
  // intentionally NOT scoped to `pageRows` — pagination must NOT
  // narrow the bulk-select target (per spec §Pagination vs
  // virtualization risk: cross-page selection accumulated through
  // "Select all importable in current filter" must still ship).
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
      // affordances: "Select all importable in current filter"). This
      // is NOT scoped to the current page — the cross-page selection
      // is the whole point of the affordance.
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

  // Refs for the latest handleRescan / handleImport. Toast `onRetry`
  // closures capture these refs (NOT the handlers directly), so a
  // Retry click always invokes the LATEST handler — which re-derives
  // the click-time intersection from current state, not from the
  // state that was live when the failure-toast was first pushed.
  // Without this, a Retry click after a rescan-between-attempts
  // would read the pre-rescan `selected` / `sourceState` snapshot.
  const handleRescanRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleImportRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const handleRescan = useCallback(async () => {
    setPending("rescan");
    try {
      const report: RescanReport = await triggerRescan();
      // Persist the success timestamp + push to local state so the
      // ActionBar caption updates immediately. Per spec, the caption
      // is explicitly scoped to "this browser" so we ONLY write on
      // the success path; an error keeps the previous timestamp.
      const iso = new Date().toISOString();
      writeLastRescan(iso);
      setLastRescanAt(iso);
      pushToast({
        kind: "success",
        title: "Rescan complete",
        message: rescanSummary(report),
        details: rescanCounts(report),
      });
      await refetchAll();
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Rescan failed",
        message: messageFor(error),
        onRetry: () => {
          // Re-derive the rescan call at click time via the ref so
          // we always invoke the LATEST handleRescan — not the
          // closure-captured one from the render that pushed this
          // toast. Fire-and-forget; the inner handler will push its
          // own success/error toast.
          void handleRescanRef.current();
        },
      });
    } finally {
      setPending(null);
    }
  }, [refetchAll, pushToast]);

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
    //   (d) M5 cross-page: pagination does NOT narrow the eligible
    //       set; a row selected on page 1 but currently displayed on
    //       page 2 still ships if it remains in the filter window.
    //       The filter pipeline is the gate, not pagination.
    // The same `isImportable` helper used by SessionsTable governs
    // (a)+(b), and the filter pipeline owns (c)+(d), so the rendered
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
      pushToast({
        kind: "success",
        title: "Import complete",
        message: importSummary(report),
        details: importCounts(report),
      });
      await refetchAll();
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Import failed",
        message: messageFor(error),
        onRetry: () => {
          // Per spec: "Error/retry: if Import fails and the user
          // retries, the retry re-derives the effective selection at
          // click time — if a rescan fired between attempts, the
          // payload reflects the new state, never the pre-error
          // cache." We dispatch through the ref so the click invokes
          // the LATEST handleImport — its useCallback deps include
          // `selected`, `sourceState`, `storedState`, `filters`, so
          // the function identity changes whenever any of those does.
          // Without the ref hop, this closure would capture the
          // handler from the render that pushed the toast and would
          // re-derive against THAT handler's stale closure scope.
          void handleImportRef.current();
        },
      });
    } finally {
      setPending(null);
    }
  }, [selected, sourceState, storedState, filters, refetchAll, pushToast]);

  // Keep the refs pointed at the LATEST handler identities so toast
  // Retry closures (pushed earlier) always re-invoke the current
  // versions — see comment on `handleRescanRef` / `handleImportRef`
  // above for the rationale.
  useEffect(() => {
    handleRescanRef.current = handleRescan;
  }, [handleRescan]);
  useEffect(() => {
    handleImportRef.current = handleImport;
  }, [handleImport]);

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

  const onChangePage = useCallback((next: number) => {
    setPageIndex(next);
  }, []);

  const onChangePageSize = useCallback(
    (size: PageSize) => {
      setFilter("pageSize", size);
    },
    [setFilter],
  );

  return (
    <>
      <main>
        <h1>Distill Portal</h1>
        <section className="panel">
          <h2>Sessions</h2>
          <ActionBar
            selectedCount={selectedCount}
            hiddenByFilterCount={hiddenByFilterCount}
            pending={pending}
            onRescan={handleRescan}
            onImport={handleImport}
            onClearHidden={onClearHidden}
            onClearSelection={onClearSelection}
            lastRescanAt={lastRescanAt}
            now={now}
          />
          <SessionsView
            sourceState={sourceState}
            storedState={storedState}
            mergedRows={mergedRows}
            filteredRows={filteredRows}
            pageRows={pageRows}
            pageIndex={clampedPageIndex}
            pageSize={filters.pageSize}
            onChangePage={onChangePage}
            onChangePageSize={onChangePageSize}
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
      {/* Toast queue lives outside <main> for DOM placement (it's a
          fixed-position overlay anchored bottom-right via CSS;
          pointer-events: none on the queue + auto on individual
          toasts so the gap between toasts doesn't intercept clicks
          on the page underneath). Sibling placement is purely a
          layout choice — push/dismiss still re-renders App's JSX
          walk because `useToastQueue` is App-level state; the
          memoized merge/filter/sort/paginate chain is what keeps
          the table render cheap. */}
      <div className="toast-queue" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            kind={toast.kind}
            title={toast.title}
            message={toast.message}
            onRetry={toast.onRetry}
            onDismiss={dismissToast}
            details={toast.details}
          />
        ))}
      </div>
    </>
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

// Plain-language summary line for a successful rescan, per spec
// §Action Bar and Mutation UX: "describes what changed in plain
// language". Skips fields that are 0 so the typical case reads
// concisely; the Details disclosure carries the full numeric
// breakdown.
function rescanSummary(r: RescanReport): string {
  const parts: string[] = [];
  parts.push(
    `Discovered ${r.discovered_files} ${pluralize(r.discovered_files, "file", "files")}`,
  );
  if (r.parsed_sessions > 0) {
    parts.push(
      `parsed ${r.parsed_sessions} ${pluralize(r.parsed_sessions, "session", "sessions")}`,
    );
  }
  if (r.not_stored_sessions > 0) {
    parts.push(`${r.not_stored_sessions} not yet stored`);
  }
  if (r.outdated_sessions > 0) {
    parts.push(`${r.outdated_sessions} outdated`);
  }
  if (r.scan_errors > 0) {
    parts.push(
      `${r.scan_errors} ${pluralize(r.scan_errors, "scan error", "scan errors")}`,
    );
  }
  return parts.join(", ") + ".";
}

function rescanCounts(r: RescanReport): import("react").ReactNode {
  return (
    <dl className="toast-counts">
      <dt>discovered_files</dt>
      <dd>{r.discovered_files}</dd>
      <dt>skipped_files</dt>
      <dd>{r.skipped_files}</dd>
      <dt>parsed_sessions</dt>
      <dd>{r.parsed_sessions}</dd>
      <dt>not_stored_sessions</dt>
      <dd>{r.not_stored_sessions}</dd>
      <dt>outdated_sessions</dt>
      <dd>{r.outdated_sessions}</dd>
      <dt>up_to_date_sessions</dt>
      <dd>{r.up_to_date_sessions}</dd>
      <dt>scan_errors</dt>
      <dd>{r.scan_errors}</dd>
    </dl>
  );
}

function importSummary(r: ImportReport): string {
  const parts: string[] = [];
  parts.push(
    `Requested ${r.requested_sessions} ${pluralize(r.requested_sessions, "session", "sessions")}`,
  );
  if (r.inserted_sessions > 0) {
    parts.push(`${r.inserted_sessions} newly inserted`);
  }
  if (r.updated_sessions > 0) {
    parts.push(`${r.updated_sessions} updated`);
  }
  if (r.unchanged_sessions > 0) {
    parts.push(`${r.unchanged_sessions} unchanged`);
  }
  return parts.join(", ") + ".";
}

function importCounts(r: ImportReport): import("react").ReactNode {
  return (
    <dl className="toast-counts">
      <dt>requested_sessions</dt>
      <dd>{r.requested_sessions}</dd>
      <dt>inserted_sessions</dt>
      <dd>{r.inserted_sessions}</dd>
      <dt>updated_sessions</dt>
      <dd>{r.updated_sessions}</dd>
      <dt>unchanged_sessions</dt>
      <dd>{r.unchanged_sessions}</dd>
    </dl>
  );
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}
