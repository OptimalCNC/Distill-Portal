// Action bar for the unified session inspection list.
//
// Renders the two mutation buttons — "Rescan" and "Import selected (N)" —
// plus the M3 selection-management affordances:
//   - a `+K hidden by filters` caption when the user's raw selection
//     contains keys that are still importable in the merged set but
//     fell out of the current filter window
//   - a `Clear hidden` button that drops only the hidden-by-filter
//     keys (leaves the visible-importable selection intact)
//   - a `Clear selection` button that drops EVERY selected key
//     (visible AND hidden)
//
// As of Phase 4 Milestone 5, the bar adds:
//   - a `last rescan from this browser X ago` caption next to the
//     Rescan button. The caption is explicitly scoped to "this
//     browser" because the backend runs its own scans (startup +
//     poll interval) that the browser cannot observe; a future phase
//     that exposes a backend-authoritative timestamp can replace
//     this caption (per `working/phase-4.md` §Action Bar and
//     Mutation UX). The caption is computed via the M3
//     `relativeTimeFrom(now, lastRescanAt)` helper so it shares the
//     same pinned-`now` semantics as the table's "Updated" cell.
//   - the inline `lastReport` rendering is GONE — `App.tsx` now
//     surfaces rescan/import outcomes via toasts (`Toast` +
//     `useToastQueue`). The action-bar surface focuses on the
//     mutation triggers and the selection metadata only.
//   - the bar carries a `.action-bar.sticky` CSS class so it
//     position-sticks to the bottom of its containing block when the
//     natural-layout bar would scroll out of view (CSS-only via
//     `position: sticky`; no JS scroll detection).
//
// State is owned by `App.tsx` and passed down as props; this
// component is stateless.
//
// CSS lives in the sibling `ActionBar.css` (selectors `.action-bar`,
// `.action-bar-buttons`, `.action-bar button`, `.action-bar.sticky`,
// `.action-bar-last-rescan`, `.action-bar-hidden-caption`,
// `.action-bar-clear`).
import { relativeTimeFrom } from "../features/sessions/relativeTime";
import "./ActionBar.css";

type ActionBarProps = {
  selectedCount: number;
  /** Per spec §Action Bar and Mutation UX: when the user's raw
   *  selection contains keys hidden by the current filter, surface a
   *  `+K hidden by filters` caption. Defaults to 0 for callers that
   *  do not yet wire this prop. */
  hiddenByFilterCount?: number;
  pending: "rescan" | "import" | null;
  onRescan: () => void;
  onImport: () => void;
  /** Drop only the hidden-by-filter keys from `selected` (leaves the
   *  visible-importable selection intact). */
  onClearHidden?: () => void;
  /** Drop every key from `selected` (visible AND hidden). */
  onClearSelection?: () => void;
  /** ISO timestamp of the most recent successful manual rescan
   *  triggered from this browser (read from
   *  `distill-portal:last-manual-rescan:v1` on mount; updated by the
   *  rescan success path). `null` when no rescan has fired in this
   *  browser yet. */
  lastRescanAt?: string | null;
  /** Pinned-`now` ISO string used by the relative-time renderer.
   *  Shared with the table so the two relative-time fields agree on
   *  the same instant. */
  now?: string;
};

export function ActionBar({
  selectedCount,
  hiddenByFilterCount = 0,
  pending,
  onRescan,
  onImport,
  onClearHidden,
  onClearSelection,
  lastRescanAt = null,
  now,
}: ActionBarProps) {
  const rescanDisabled = pending !== null;
  const importDisabled = pending !== null || selectedCount === 0;
  const showClearAffordances =
    selectedCount > 0 || hiddenByFilterCount > 0;
  // The caption renders relative to `now` (refreshed on each
  // refetch). When `lastRescanAt` is null (first session, or a user
  // who has never clicked Rescan) we render an em-dash so the layout
  // doesn't shift between "never" and "Xm ago".
  const lastRescanCaption =
    lastRescanAt !== null && now !== undefined
      ? relativeTimeFrom(now, lastRescanAt)
      : "—";
  return (
    <div className="action-bar sticky">
      <div className="action-bar-buttons">
        <button
          type="button"
          onClick={onRescan}
          disabled={rescanDisabled}
        >
          {pending === "rescan" ? "Rescanning..." : "Rescan"}
        </button>
        <span className="muted action-bar-last-rescan" title={lastRescanAt ?? undefined}>
          last rescan from this browser {lastRescanCaption}
        </span>
        <button
          type="button"
          onClick={onImport}
          disabled={importDisabled}
        >
          {pending === "import"
            ? `Importing ${selectedCount}...`
            : `Import selected (${selectedCount})`}
        </button>
        {hiddenByFilterCount > 0 ? (
          <span className="muted action-bar-hidden-caption">
            +{hiddenByFilterCount} hidden by filters
          </span>
        ) : null}
        {showClearAffordances && onClearHidden && hiddenByFilterCount > 0 ? (
          <button
            type="button"
            className="action-bar-clear"
            onClick={onClearHidden}
          >
            Clear hidden
          </button>
        ) : null}
        {showClearAffordances && onClearSelection ? (
          <button
            type="button"
            className="action-bar-clear"
            onClick={onClearSelection}
          >
            Clear selection
          </button>
        ) : null}
      </div>
    </div>
  );
}
