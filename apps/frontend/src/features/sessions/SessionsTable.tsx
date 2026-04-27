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
// Per spec §Data Model in the Browser, a row whose `statusConflict` is
// true gets a small "(refresh)" affordance next to its inline status
// badge — the M2 minimum for the "fetched state changed during load —
// refresh" hint. The drawer header in M4 ALSO gets its own "Conflict"
// badge; per the open risk in `progress/phase-4.progress.md` the
// row-side affordance MUST stay (the drawer-side one supplements
// rather than replaces it).
//
// Per spec, a row whose `sourcePathIsStale` is true labels its
// source-path cell with a `title=` hover hint clarifying that the
// path is the last-known location, not currently discoverable.
//
// As of M3 the "Updated" cell renders a relative-time string against
// a single `now` captured at refetch time in `App.tsx` (passed in as a
// prop) so the page does not ticker-update. The full ISO timestamp
// stays available via the `title=` hover hint for users who need the
// absolute value.
//
// As of M4 (Chunk E1) the row itself becomes the drawer trigger: a
// click anywhere on the row OR pressing Enter while the row is
// focused calls `onOpenDetail(row.rowKey, triggerEl)`. The trigger
// element is forwarded so the parent can stash it in a ref and
// restore focus to it after the drawer closes (happy-dom does not
// implement the platform focus-restoration on `dialog.close()`; real
// Chromium does, but the explicit ref makes the behaviour
// deterministic across both targets). The checkbox cell stops
// propagation so toggling selection never opens the drawer (a11y bug
// magnet). `onOpenDetail` is optional with a no-op default for
// backward compatibility with M2/M3 tests that did not pass it.
//
// As of M6 (Chunk G) the status pill is rendered inline (the dedicated
// `StatusBadge` component was retired). The transform —
// `variant = status.replace(/_/g, "-")` for the CSS class and
// `label = status.replace(/_/g, " ")` for the visible text — is
// preserved byte-for-byte at the call site so the DOM shape stays
// `<span class="badge {variant}">{label}</span>`.
//
// CSS lives in the sibling `SessionsTable.css` (selectors
// `.table-wrap`, table chrome, `.badge.*`, `.raw-link`, `.select-col`).
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
  /** Open the detail drawer for `rowKey`. The second argument is the
   *  trigger DOM element so the parent can stash it in a ref and
   *  restore focus on close. Optional for backward compatibility with
   *  M2/M3 callers that don't render a drawer. Defaults to a no-op. */
  onOpenDetail?: (rowKey: string, triggerEl: HTMLElement | null) => void;
};

export function SessionsTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  now,
  onOpenDetail,
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
            <th>Status</th>
            <th>Tool</th>
            <th>Title</th>
            <th>Project</th>
            <th>Updated</th>
            <th>Stored Copy</th>
            <th>Source Path</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const importable = isImportable(row);
            const checked =
              row.sourceSessionKey !== null &&
              selected.has(row.sourceSessionKey);
            // Stored-copy display: stored UID + ingested-at when present;
            // otherwise the "not stored" sentinel.
            const storedUidLine =
              row.storedSessionUid !== null
                ? row.storedSessionUid
                : "not stored";
            const ingestedLine = `ingested: ${row.ingestedAt ?? "—"}`;
            // The View Raw anchor is rendered next to the stored UID
            // when there is a stored copy — it's the M2 carry-over from
            // the dual-table layout's stored-side anchor.
            const rawLinkHref =
              row.storedSessionUid !== null
                ? `/api/v1/sessions/${row.storedSessionUid}/raw`
                : null;
            const metadataHref =
              row.storedSessionUid !== null
                ? `/api/v1/sessions/${row.storedSessionUid}`
                : null;
            const handleRowOpen = (
              triggerEl: HTMLElement | null,
            ) => {
              if (onOpenDetail) onOpenDetail(row.rowKey, triggerEl);
            };
            return (
              <tr
                key={row.rowKey}
                tabIndex={0}
                onClick={(event) => {
                  // Walk up from the click target to see whether the
                  // event came from inside the checkbox column. A
                  // click on the checkbox cell (or anything inside
                  // it) toggles selection only — it MUST NOT open
                  // the drawer (a11y bug magnet). The
                  // `event.stopPropagation()` on the cell handles
                  // most cases; this guard is the belt-and-braces
                  // backup in case the propagation interception is
                  // bypassed by an event-time bubble re-fire.
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("td.select-col") !== null) return;
                  handleRowOpen(event.currentTarget);
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
                  handleRowOpen(event.currentTarget);
                }}
              >
                <td
                  className="select-col"
                  // Stop click propagation BEFORE the row's onClick
                  // sees it — toggling selection should never open
                  // the drawer.
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
                  <span
                    className={`badge ${row.status.replace(/_/g, "-")}`}
                  >
                    {row.status.replace(/_/g, " ")}
                  </span>
                  {row.statusConflict ? (
                    <>
                      {" "}
                      <span
                        className="muted"
                        title="Source and stored status disagreed during load — refresh to re-fetch."
                      >
                        (refresh)
                      </span>
                    </>
                  ) : null}
                </td>
                <td className="mono">{row.tool}</td>
                <td className="stack">
                  <strong>{row.title ?? "(untitled)"}</strong>
                  <span className="muted mono">{row.rowKey}</span>
                </td>
                <td>{row.projectPath ?? "—"}</td>
                <td
                  className="mono"
                  title={row.sourceUpdatedAt ?? undefined}
                >
                  {relativeTimeFrom(now, row.sourceUpdatedAt)}
                </td>
                <td className="stack">
                  {metadataHref !== null ? (
                    <a className="raw-link mono" href={metadataHref}>
                      {storedUidLine}
                    </a>
                  ) : (
                    <span className="mono muted">{storedUidLine}</span>
                  )}
                  <span className="muted mono">{ingestedLine}</span>
                  {rawLinkHref !== null ? (
                    <a className="raw-link" href={rawLinkHref}>
                      View Raw
                    </a>
                  ) : null}
                </td>
                <td
                  className="mono"
                  title={
                    row.sourcePathIsStale
                      ? "last seen source path — source file no longer discoverable"
                      : undefined
                  }
                >
                  {row.sourcePath}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
