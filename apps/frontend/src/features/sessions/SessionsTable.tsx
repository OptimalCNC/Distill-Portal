// Presentational table for the unified inspection list.
//
// Receives the merged + filtered + sorted `SessionRow[]` plus the
// `selected` set + toggle handlers from the parent. Selection keys are
// always backend-provided `sourceSessionKey` strings — never the
// React-only `rowKey` fallback for `stored_only` rows. The table
// renders a checkbox ONLY on importable rows
// (`isImportable(row) === true`) so non-importable rows cannot enter
// the import POST.
//
// Per `working/phase-4.md` §Action Bar and Mutation UX, the bulk-select
// affordance toggles ALL importable rows in the current filter window.
// Non-importable rows are invisible to the bulk action.
//
// Per Phase-5 spec §Compact list rows (lines 520–531) the table is
// compressed to FIVE columns: Select + Title + Status + Project +
// Updated. The Title cell carries a two-line stack: bold title + tool
// badge inline (line 1); muted mono rowKey + optional `(refresh)`
// marker (line 2). The dropped Phase-4 columns (Tool / Stored Copy /
// Source Path) remain reachable via the still-mounted Phase-4
// `<Drawer>` until M2 ships the Metadata tab.
//
// Per spec, a row whose `statusConflict` is true gets a small
// "(refresh)" affordance inside the Title cell — telegraphing the
// "fetched state changed during load — refresh" hint. M1b warmed
// the marker color from `--color-text-muted` (Phase 4) to
// `--color-warn`; the M2a fix-up round 2 reverted it back to
// `--color-text-muted` (italic) because the oklch retint regressed
// the warn-as-text pair vs `--color-surface` to 4.21:1 (fails AA
// 4.5:1 normal text). See `working/phase-5/designs/m2a-tokens/wcag.md`
// "Codex fix-up round 2 closure" and the M1b designer's documented
// mitigation in `working/phase-5/designs/m1b-shell/colors.md` lines
// 56-58. The hint copy is unchanged; only the visual treatment
// stepped back from "warning sienna" to "muted gray italic".
//
// As of M3 the "Updated" cell renders a relative-time string against
// a single `now` captured at refetch time in `App.tsx` (passed in as a
// prop) so the page does not ticker-update. The full ISO timestamp
// stays available via the `title=` hover hint for users who need the
// absolute value.
//
// As of M1b (Phase 5) the row click semantic shifts: a click anywhere
// on the row OR pressing Enter while the row is focused calls
// `onSelectRow(row.rowKey)` ONLY. The Phase-4 `onOpenDetail(rowKey,
// triggerEl)` call is REMOVED from the row click path — the drawer no
// longer auto-mounts on row click. The new entry point is the
// vestigial "Open detail" button rendered by `SessionView` in its
// `ready-placeholder` state. The checkbox cell still stops
// propagation so toggling selection never triggers `onSelectRow`
// (a11y bug magnet preserved verbatim from Phase 4).
//
// As of M6 (Chunk G) the status pill is rendered inline (the dedicated
// `StatusBadge` component was retired). The transform —
// `variant = status.replace(/_/g, "-")` for the CSS class and
// `label = status.replace(/_/g, " ")` for the visible text — is
// preserved byte-for-byte at the call site so the DOM shape stays
// `<span class="badge {variant}">{label}</span>`.
//
// CSS lives in the sibling `SessionsTable.css` (selectors
// `.table-wrap`, table chrome, `.badge.*`, `.title-cell*`,
// `.select-col`).
// Global utility classes (`.muted`, `.mono`, `.stack`, `.empty`) live
// in `styles/global.css`; the filter-bar CSS is in
// `SessionFilters.css`.
import { relativeTimeFrom } from "./relativeTime";
import { isImportable, type SessionRow } from "./types";
import "./SessionsTable.css";

export type SessionsTableProps = {
  rows: SessionRow[];
  /** Backend-provided `sourceSessionKey` values currently selected. */
  selected: Set<string>;
  /** Toggle a single importable row by its `sourceSessionKey`. */
  onToggle: (sourceSessionKey: string) => void;
  /** Toggle all importable rows: if any importable row is unchecked, select all; otherwise clear. */
  onToggleAll: () => void;
  /** Pinned-`now` ISO string used by the relative-time cell renderer. */
  now: string;
  /** M1a: rowKey of the currently URL-selected session. The matched
   *  row carries `aria-current="true"` for assistive tech and the
   *  selected-row visual treatment. `null` means no selection. */
  selectedRowKey?: string | null;
  /** M1a/M1b: setter for the URL-synced selection. Called on row
   *  click (NOT on checkbox-cell click — the importability rule's
   *  stopPropagation guard remains load-bearing). M1b removed the
   *  Phase-4 `onOpenDetail` call from the row click path; the
   *  vestigial "Open detail" button in SessionView is the new drawer
   *  entry point (see `working/phase-5/designs/m1b-shell/design.md`
   *  §3.5). */
  onSelectRow?: (rowKey: string) => void;
  /** M1a: rowKey of the row that should fire the deep-link pulse on
   *  the current paint. Set on initial mount only when
   *  `URLSearchParams.get("session")` was non-null; cleared by the
   *  parent via `onAnimationEnd` OR a 2 s safety timer. Click-driven
   *  selection MUST NOT set this — the pulse marks URL-driven
   *  arrivals only (spec line 585 + Resolved Decision #19). */
  pendingDeepLinkPulseRowKey?: string | null;
  /** M1a: notify the parent that the deep-link pulse animation has
   *  ended on `rowKey` so the parent can clear
   *  `pendingDeepLinkPulseRowKey`. Optional. */
  onDeepLinkPulseEnd?: (rowKey: string) => void;
};

export function SessionsTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  now,
  selectedRowKey = null,
  onSelectRow,
  pendingDeepLinkPulseRowKey = null,
  onDeepLinkPulseEnd,
}: SessionsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        No sessions have been discovered or stored yet.
      </div>
    );
  }
  // Header bulk-select state is computed from the importable subset
  // only. A row that cannot be selected (no checkbox) does not
  // participate in "all selected" / "indeterminate" math.
  const importableKeys: string[] = [];
  for (const row of rows) {
    if (isImportable(row) && row.sourceSessionKey !== null) {
      importableKeys.push(row.sourceSessionKey);
    }
  }
  const importableSelectedCount = importableKeys.reduce(
    (acc, k) => (selected.has(k) ? acc + 1 : acc),
    0,
  );
  const allChecked =
    importableKeys.length > 0 &&
    importableSelectedCount === importableKeys.length;
  const someChecked =
    importableSelectedCount > 0 &&
    importableSelectedCount < importableKeys.length;
  // When zero rows are importable we still render the header checkbox
  // but it stays disabled — there's nothing to bulk-select.
  const headerCheckboxDisabled = importableKeys.length === 0;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="select-col">
              <input
                type="checkbox"
                aria-label="Select all importable sessions"
                checked={allChecked}
                disabled={headerCheckboxDisabled}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={onToggleAll}
              />
            </th>
            <th>Title</th>
            <th>Status</th>
            <th>Project</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const importable = isImportable(row);
            const checked =
              row.sourceSessionKey !== null &&
              selected.has(row.sourceSessionKey);
            const handleRowOpen = () => {
              // M1b: row "open" gesture is now URL-synced selection
              // ONLY. The Phase-4 `onOpenDetail` drawer auto-mount has
              // been retired — the vestigial "Open detail" button in
              // `SessionView` is the new drawer entry point.
              if (onSelectRow) onSelectRow(row.rowKey);
            };
            const isSelected = selectedRowKey === row.rowKey;
            const isPulseTarget =
              pendingDeepLinkPulseRowKey === row.rowKey;
            return (
              <tr
                key={row.rowKey}
                tabIndex={0}
                aria-current={isSelected ? "true" : undefined}
                data-deep-link={isPulseTarget ? "true" : undefined}
                onAnimationEnd={
                  isPulseTarget && onDeepLinkPulseEnd
                    ? () => onDeepLinkPulseEnd(row.rowKey)
                    : undefined
                }
                onClick={(event) => {
                  // Walk up from the click target to see whether the
                  // event came from inside the checkbox column. A
                  // click on the checkbox cell (or anything inside
                  // it) toggles selection only — it MUST NOT trigger
                  // the row-open path (a11y bug magnet). The
                  // `event.stopPropagation()` on the cell handles
                  // most cases; this guard is the belt-and-braces
                  // backup in case the propagation interception is
                  // bypassed by an event-time bubble re-fire.
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("td.select-col") !== null) return;
                  handleRowOpen();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  // Same checkbox-cell guard as the click handler.
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("td.select-col") !== null) return;
                  // Prevent the default form-submission behaviour
                  // (no form here, but Enter on a focused element
                  // can still trigger native actions in some
                  // contexts).
                  event.preventDefault();
                  handleRowOpen();
                }}
              >
                <td
                  className="select-col"
                  // Stop click propagation BEFORE the row's onClick
                  // sees it — toggling selection should never trigger
                  // the row-open path.
                  onClick={(event) => event.stopPropagation()}
                >
                  {importable && row.sourceSessionKey !== null ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.sourceSessionKey}`}
                      checked={checked}
                      onChange={() => onToggle(row.sourceSessionKey!)}
                    />
                  ) : null}
                </td>
                <td>
                  <div className="title-cell">
                    <div className="title-cell-line1">
                      <span className="title-cell-title">
                        {row.title ?? "(untitled)"}
                      </span>
                      <span className="title-cell-tool">{row.tool}</span>
                    </div>
                    <div className="title-cell-line2">
                      <span className="title-cell-rowkey">
                        {row.rowKey}
                      </span>
                      {row.statusConflict ? (
                        <span
                          className="title-cell-refresh"
                          title="Source and stored status disagreed during load — refresh to re-fetch."
                        >
                          (refresh)
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={`badge ${row.status.replace(/_/g, "-")}`}
                  >
                    {row.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td
                  className="project-cell"
                  title={row.projectPath ?? undefined}
                >
                  {row.projectPath ?? "—"}
                </td>
                <td
                  className="mono updated-cell"
                  title={row.sourceUpdatedAt ?? undefined}
                >
                  {relativeTimeFrom(now, row.sourceUpdatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
