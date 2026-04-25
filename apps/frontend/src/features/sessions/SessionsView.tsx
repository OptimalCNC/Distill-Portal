// Section-level wrapper for the unified inspection list.
//
// `SessionsView` owns:
//   - the merge of source ⊕ stored data (via `mergeSessions`)
//   - the per-section error banner when ONE side fetch failed
//     (per-panel error isolation rule carried over from Phase 3 F1:
//     a source 500 must not blank the stored-side rows, and vice versa)
//   - the empty-state copy when both sides resolved to zero rows
//
// `App.tsx` retains ownership of fetch state, the `selected` set, and
// the toggle handlers, all passed in here as props.
import { mergeSessions } from "./mergeSessions";
import { SessionsTable } from "./SessionsTable";
import type { SourceSessionView, StoredSessionView } from "../../lib/contracts";

export type PanelState<T> =
  | { kind: "loading" }
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string };

export type SessionsViewProps = {
  sourceState: PanelState<SourceSessionView[]>;
  storedState: PanelState<StoredSessionView[]>;
  selected: Set<string>;
  onToggle: (sourceSessionKey: string) => void;
  onToggleAll: () => void;
  onRetry: () => void;
};

export function SessionsView({
  sourceState,
  storedState,
  selected,
  onToggle,
  onToggleAll,
  onRetry,
}: SessionsViewProps) {
  // Both sides still loading: render a single "loading" hint. This
  // mirrors the Phase 3 PanelBody behavior so the user sees feedback
  // during the initial fetch.
  if (sourceState.kind === "loading" && storedState.kind === "loading") {
    return <p>Loading sessions...</p>;
  }

  // Both sides errored: full-section "no sessions could be loaded"
  // with a Retry. Per spec §Empty States, M2 only needs to handle
  // "no sessions at all" and "partial fetch failure"; this is the
  // both-fail variant of partial-fetch failure.
  if (sourceState.kind === "error" && storedState.kind === "error") {
    return (
      <div className="empty">
        <p role="alert">
          No sessions could be loaded. Source error:{" "}
          {sourceState.message}. Stored error: {storedState.message}.
        </p>
        <p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </p>
      </div>
    );
  }

  // Per-panel error isolation: if exactly one side errored, render the
  // unified table built from the surviving side ONLY plus a banner
  // pointing at what failed. The table can still render — every row
  // simply has presence === "source_only" or "stored_only" depending
  // on which side survived.
  const sourceData =
    sourceState.kind === "ok" ? sourceState.data : [];
  const storedData =
    storedState.kind === "ok" ? storedState.data : [];
  const rows = mergeSessions(sourceData, storedData);

  return (
    <>
      {sourceState.kind === "error" ? (
        <p role="alert">
          Failed to load source sessions: {sourceState.message}{" "}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </p>
      ) : null}
      {storedState.kind === "error" ? (
        <p role="alert">
          Failed to load stored sessions: {storedState.message}{" "}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </p>
      ) : null}
      <SessionsTable
        rows={rows}
        selected={selected}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
      />
    </>
  );
}
