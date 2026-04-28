// Right-pane placeholder for the Phase-5 split-pane master-detail
// layout. M1a ships the SHELL only — the four-tab Tabs primitive
// (Transcript / Skim / Raw / Metadata) lands in M2.
//
// State machine driven by a `data-state` attribute on the wrapping
// `<article>` (chosen over conditional className per design.md
// §7.6): Playwright tests can assert
// `expect(...).toHaveAttribute("data-state", "session_not_found")`
// directly, and the CSS reads via attribute selectors so each
// state's visual treatment is colocated with the state name.
//
//   - "empty"               → no `selectedRowKey`. Two-paragraph
//                             preface (verbatim spec lines 591–593)
//                             plus a centered text glyph (·) at
//                             `var(--text-xl)` weight 200. NO icon
//                             library, no SVG asset — typographic
//                             ornament only (designer §7.1).
//   - "loading"             → `selectedRowKey` set AND the row is
//                             not yet in the merged set AND any of
//                             the source/stored/scan-errors fetches
//                             is still in flight. Single quiet
//                             "Reading session…" line in
//                             `var(--color-text-muted)`.
//   - "ready-placeholder"   → row IS selected and merged in. M1a
//                             renders a brief "Session view coming
//                             in Milestone 2" line. M1b will add
//                             the vestigial "Open detail" button
//                             pointing at the still-mounted Phase-4
//                             Drawer; M1a deliberately does NOT
//                             render it (the row click already opens
//                             the drawer in M1a, so the vestigial
//                             button is M1b material).
//   - "session_not_found"   → the URL `?session=<key>` has no
//                             matching row AFTER all three GETs
//                             have settled. Two-line message +
//                             two quiet buttons:
//                               · "Clear selection" → selectRow(null)
//                               · "Try Rescan"      → refetchAll()
//                             Per spec line 572–574 the URL is NOT
//                             auto-cleared — user pressing
//                             "Clear selection" is the explicit
//                             gesture.
//
// Stacked-narrow viewports (< 900 px) when narrowMode === "session"
// also render the "← Back to list" quiet text-link button at the
// top. Per Resolved Decision #17 (spec line 1162) "Back to list"
// only sets narrowMode = "list" and PRESERVES selectedRowKey + URL
// (so re-opening the same row brings the session pane back exactly
// where the user left it). Esc is a different gesture: fully clears
// selection. The handler for Esc lives globally in App.tsx.
import "./SessionView.css";

export type SessionViewState =
  | "empty"
  | "loading"
  | "ready-placeholder"
  | "session_not_found";

export type SessionViewProps = {
  state: SessionViewState;
  /** When true (narrow viewport + narrowMode === "session"), render the "← Back to list" affordance. */
  showBackToList: boolean;
  /** Called when the user clicks "← Back to list". Sets narrowMode = "list" only. */
  onBackToList: () => void;
  /** Called when the user clicks "Clear selection" in the session_not_found state. */
  onClearSelection: () => void;
  /** Called when the user clicks "Try Rescan" in the session_not_found state. */
  onTryRescan: () => void;
};

export function SessionView({
  state,
  showBackToList,
  onBackToList,
  onClearSelection,
  onTryRescan,
}: SessionViewProps) {
  return (
    <article
      className="session-pane"
      data-state={state}
      aria-busy={state === "loading"}
      aria-live="polite"
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
      <div className="session-state">
        {state === "empty" ? <EmptyPaneCopy /> : null}
        {state === "loading" ? <LoadingCopy /> : null}
        {state === "ready-placeholder" ? <ReadyPlaceholderCopy /> : null}
        {state === "session_not_found" ? (
          <SessionNotFoundCopy
            onClearSelection={onClearSelection}
            onTryRescan={onTryRescan}
          />
        ) : null}
      </div>
    </article>
  );
}

/**
 * Empty preface — verbatim spec lines 591–593. The mark glyph is a
 * typographic ornament (a centered middle-dot) at `var(--text-xl)`
 * — designer §7.1 picked text-only over an SVG illustration to
 * match the Archive-room "ink-on-paper" mood AND avoid a new asset
 * dependency. NB: the spec's narrative once mentioned `--text-2xl`
 * but that is an M2 typography token; M1a uses `--text-xl` (Phase-4
 * baseline) and the round-1 UI/UX reviewer pinned this as a
 * blocking finding in the design loop.
 */
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

function ReadyPlaceholderCopy() {
  return (
    <p className="placeholder-line">
      Session view coming in Milestone 2.
    </p>
  );
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
