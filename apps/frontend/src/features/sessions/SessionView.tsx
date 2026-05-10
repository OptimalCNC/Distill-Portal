// Right-pane shell for the Phase-5 split-pane master-detail layout.
//
// M2b rewires from the M1a four-state placeholder to a four-tab shell.
// The state machine is preserved verbatim from M1a, with one
// substitution: the M1a `ready-placeholder` state is REPLACED by
// `ready` (the tab shell mounts inside it). Empty / loading /
// session_not_found are unchanged from M1a.
//
// Tab shell (per design.md §3.2):
//   - Minimal header: title (Fraunces italic at --text-xl) + tool
//     badge + status pill + optional conflict badge. Copy path,
//     subagent badge, sourcePathIsStale hint, and "Open raw" header
//     anchor all defer to M4.
//   - Tabs primitive (Transcript / Skim / Raw / Metadata) below.
//     Default tab AT M2b = "metadata" (Resolved Decision #11; M4
//     shifts to "transcript").
//   - Lazy panel mounting (Resolved Decision #12 + spec lines
//     650–658): a panel renders ONLY if `tabId === activeTab` OR
//     `visitedTabs.has(tabId)`. Once activated, the panel stays
//     React-mounted for the rest of the selection — preserves
//     RawTab's in-flight stream + future TranscriptView /
//     SkimView state.
//   - Cross-fade-IN-only animation: the panel's own
//     `<div role="tabpanel">` toggles its inline `style.animation`
//     between "tab-fade-in 120ms var(--ease-out) both" (active) and
//     "none" (inactive). The browser fires the keyframe each time
//     the property string transitions from "none" to a real
//     animation. The panel's React subtree is STABLE — never
//     remounted on tab change.
//   - Page-turn fade: the outer `<article class="session-pane">`
//     carries `key={selectedRowKey}` so every selection change is a
//     fresh React mount; the `@keyframes session-page-turn` rule in
//     SessionView.css fires automatically on mount.
//
// tabIndex matrix (design.md §6.1 + acceptance item 29a — Option A):
//   - Skim, Transcript, AND Raw active panels carry `tabIndex={0}`
//     (none of them have an unconditional focusable child, so the
//     panel itself must be the first Tab stop).
//   - Metadata does NOT carry `tabIndex` — its Copy path button is
//     always rendered and always focusable.
//   - Inactive panels (`hidden=true`) MUST NOT carry `tabIndex`.
//
// Esc / "Back to list" / selection ownership are unchanged from
// M1a (App.tsx still owns selectRow / narrowMode).
import { useEffect, useState, type ReactNode } from "react";
import { Tabs } from "../../components/Tabs";
import { RAW_SESSION_PATH } from "../../lib/api";
import { SessionMetadata } from "./SessionMetadata";
import { RawTab } from "./RawTab";
import { SkimView } from "./SkimView";
import { TranscriptView } from "./TranscriptView";
import type { SessionRow } from "./types";
import "./SessionView.css";

export type SessionViewState =
  | "empty"
  | "loading"
  | "ready"
  | "session_not_found";

export type TabId = "transcript" | "skim" | "raw" | "metadata";

/**
 * Default active tab when a selection arrives. M2b shipped with
 * "metadata"; M4 (this chunk) shifts to "transcript" per Resolved
 * Decision #11 because TranscriptView now renders real content on
 * the default tab (Skim is still placeholder until M5; defaulting
 * to a non-functional placeholder would regress the first
 * impression for every selection click).
 */
export const DEFAULT_TAB_ON_SELECTION: TabId = "transcript";

export type SessionViewProps = {
  state: SessionViewState;
  /** Pinned-`now` ISO string used by the Metadata tab for relative-time labelling. Required when state === "ready". */
  now?: string;
  /** The merged row to render in the tab shell. Required when state === "ready". */
  row?: SessionRow;
  /** When true (narrow viewport + narrowMode === "session"), render the "← Back to list" affordance. */
  showBackToList: boolean;
  /** Called when the user clicks "← Back to list". Sets narrowMode = "list" only. */
  onBackToList: () => void;
  /** Called when the user clicks "Clear selection" in the session_not_found state. */
  onClearSelection: () => void;
  /** Called when the user clicks "Try Rescan" in the session_not_found state. */
  onTryRescan: () => void;
};

export function SessionView(props: SessionViewProps) {
  const {
    state,
    showBackToList,
    onBackToList,
    onClearSelection,
    onTryRescan,
  } = props;

  return (
    <article
      className="session-pane"
      data-state={state}
      aria-busy={state === "loading"}
      aria-live="polite"
      aria-label="Session view"
    >
      {showBackToList ? (
        <button
          type="button"
          className="back-to-list"
          onClick={onBackToList}
        >
          ← Back to list
        </button>
      ) : null}
      {state === "empty" ? (
        <div className="session-state">
          <EmptyPaneCopy />
        </div>
      ) : null}
      {state === "loading" ? (
        <div className="session-state">
          <LoadingCopy />
        </div>
      ) : null}
      {state === "session_not_found" ? (
        <div className="session-state">
          <SessionNotFoundCopy
            onClearSelection={onClearSelection}
            onTryRescan={onTryRescan}
          />
        </div>
      ) : null}
      {state === "ready" && props.row !== undefined && props.now !== undefined ? (
        <ReadyTabShell row={props.row} now={props.now} />
      ) : null}
    </article>
  );
}

function EmptyPaneCopy() {
  return (
    <>
      <span className="empty-mark" aria-hidden="true">
        ·
      </span>
      <p className="empty-prose-1">
        Select a session from the list to view its content.
      </p>
      <p className="empty-prose-2">
        The session view shows the full Transcript chronologically, a
        Skim outline (one block per user message), the Raw NDJSON for
        verification, and the session's Metadata.
      </p>
    </>
  );
}

function LoadingCopy() {
  return <p className="loading-line">Reading session…</p>;
}

function SessionNotFoundCopy({
  onClearSelection,
  onTryRescan,
}: {
  onClearSelection: () => void;
  onTryRescan: () => void;
}) {
  return (
    <>
      <h2 className="not-found-heading">Session not found in current view</h2>
      <p className="not-found-hint">
        The session referenced by the URL was not in the merged set
        after the latest scan.
      </p>
      <div className="not-found-actions">
        <button
          type="button"
          className="quiet-button"
          onClick={onClearSelection}
        >
          Clear selection
        </button>
        <button
          type="button"
          className="quiet-button"
          onClick={onTryRescan}
        >
          Try Rescan
        </button>
      </div>
    </>
  );
}

/**
 * The four-tab shell that renders inside `state === "ready"`.
 *
 * Owns:
 *   - `activeTab` state (controlled value passed to <Tabs>).
 *   - `visitedTabs` Set (lazy-mount discipline).
 *   - The minimal header (title / tool badge / status pill / optional
 *     conflict badge).
 *   - The four `<TabPanel>` wrappers with the cross-fade-IN-only
 *     animation toggle.
 *
 * Reset on selection change is automatic — the parent
 * `<SessionView key={selectedRowKey}>` (set in App.tsx) remounts
 * this whole subtree, so `useState` re-initializes activeTab to
 * `DEFAULT_TAB_ON_SELECTION` and visitedTabs to
 * `new Set([DEFAULT_TAB_ON_SELECTION])`.
 */
function ReadyTabShell({
  row,
  now,
}: {
  row: SessionRow;
  now: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB_ON_SELECTION);
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(
    () => new Set<TabId>([DEFAULT_TAB_ON_SELECTION]),
  );

  // Defensive reset: if `row.rowKey` changes WITHOUT a parent-level
  // remount (shouldn't happen given the App.tsx `key={selectedRowKey}`
  // contract, but kept as a safety belt), snap activeTab back to the
  // default and reset visitedTabs.
  useEffect(() => {
    setActiveTab(DEFAULT_TAB_ON_SELECTION);
    setVisitedTabs(new Set<TabId>([DEFAULT_TAB_ON_SELECTION]));
  }, [row.rowKey]);

  const handleActivate = (next: TabId) => {
    setActiveTab(next);
    setVisitedTabs((prev) => {
      if (prev.has(next)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(next);
      return nextSet;
    });
  };

  // Object-keyed panel content — NEVER index-keyed (so an unvisited
  // mid-sequence panel never causes React to re-key remaining panels
  // by position). The OUTER `key={id}` on `<TabPanel>` is required;
  // the INNER content tree must NOT carry any per-activation key
  // (acceptance #27).
  const panelContent: Record<TabId, ReactNode> = {
    transcript: <TranscriptView row={row} now={now} />,
    skim: <SkimView row={row} now={now} />,
    raw: <RawTab row={row} />,
    metadata: <SessionMetadata row={row} now={now} />,
  };

  const tabs = [
    { id: "transcript" as const, label: "Transcript", panel: null },
    { id: "skim" as const, label: "Skim", panel: null },
    { id: "raw" as const, label: "Raw", panel: null },
    { id: "metadata" as const, label: "Metadata", panel: null },
  ];

  return (
    <>
      <SessionPaneHeader row={row} />
      <Tabs<TabId>
        ariaLabel="Session content tabs"
        value={activeTab}
        onValueChange={handleActivate}
        tabs={tabs}
      />
      <div className="session-pane-tabs">
        {(Object.entries(panelContent) as Array<[TabId, ReactNode]>)
          .filter(([id]) => visitedTabs.has(id))
          .map(([id, content]) => (
            <TabPanel key={id} id={id} isActive={id === activeTab}>
              {content}
            </TabPanel>
          ))}
      </div>
    </>
  );
}

function SessionPaneHeader({ row }: { row: SessionRow }) {
  // M4 expansion (design.md §6.1.1): the "Open raw" anchor lands in
  // the right-side action group AFTER the conflict badge, only when
  // a stored UID exists (source-only rows would 404 on the raw URL).
  // The anchor copy is "Open raw" verbatim per spec line 626 (NOT
  // "View raw", which is the Metadata-tab precedent).
  const rawHref =
    row.storedSessionUid !== null
      ? RAW_SESSION_PATH(row.storedSessionUid)
      : null;
  return (
    <header className="session-pane-header">
      <h2 className="session-title">{row.title ?? "(untitled)"}</h2>
      <span className="session-tool-badge">{row.tool}</span>
      <span className={`badge ${row.status.replace(/_/g, "-")}`}>
        {row.status.replace(/_/g, " ")}
      </span>
      {row.statusConflict ? (
        <span
          className="badge session-conflict-badge"
          title="Source and stored status disagreed during load — refresh to re-fetch."
        >
          Conflict
        </span>
      ) : null}
      {rawHref !== null ? (
        <a
          className="session-open-raw"
          href={rawHref}
          target="_blank"
          rel="noreferrer"
        >
          Open raw
        </a>
      ) : null}
    </header>
  );
}

/**
 * One tab panel. Renders its `<div role="tabpanel">` always; the
 * `hidden` HTML attribute toggles visibility. The panel's React
 * subtree is STABLE — never remounted on tab change (Resolved
 * Decision #12). The cross-fade-IN-only animation is driven by the
 * inline `style.animation` toggle.
 *
 * tabIndex matrix (design.md §6.1 acceptance item 29a):
 *   - Skim, Transcript, Raw → tabIndex=0 when active.
 *   - Metadata              → no tabIndex (Copy path button is always
 *                             focusable).
 *   - Inactive (hidden)     → no tabIndex.
 */
function TabPanel({
  id,
  isActive,
  children,
}: {
  id: TabId;
  isActive: boolean;
  children: ReactNode;
}) {
  const wantsTabIndex =
    isActive && (id === "skim" || id === "transcript" || id === "raw");
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!isActive}
      tabIndex={wantsTabIndex ? 0 : undefined}
      style={{
        animation: isActive
          ? "tab-fade-in 120ms var(--ease-out) both"
          : "none",
      }}
    >
      {children}
    </div>
  );
}

