// Controlled pagination strip for the unified inspection list.
//
// Per `working/phase-4.md` §Phase 4 Goals → "7. Scale to a few hundred
// sessions": page sizes 50 / 100 / 200, default 50; pagination is the
// chosen scaling primitive (virtualization is explicitly deferred).
//
// This component is presentational — `App.tsx` owns `pageIndex` and
// `pageSize` (the latter via `useSessionFilters`, where it has been
// persisted since M3). The pure pagination math lives in
// `applyPagination.ts`; this component renders the controls and
// delegates state mutation back to the parent through `onChangePage`
// and `onChangePageSize`.
//
// UI conventions:
//   - `pageIndex` is 0-based on the wire (matches array indexing); the
//     human-facing caption renders the equivalent 1-based "Page N of M"
//     so users don't see "Page 0".
//   - Prev/Next buttons disable at the boundaries.
//   - Page-size selector exposes only the three valid values (no
//     "Custom" path; v1 keeps the surface small).
//   - When `totalRows === 0` the component still renders ("Page 1 of 1")
//     so the layout doesn't shift between "loading" and "loaded
//     empty" — pagination math in `applyPagination` returns
//     totalPages=1 for that case.
//
// Stability:
//   - `onChangePageSize` always receives one of the three valid values.
//   - `onChangePage(next)` always receives a non-negative integer
//     within `[0, totalPages-1]`; the caller still re-clamps via
//     `applyPagination` as a defense in depth.

import type { PageSize } from "../features/sessions/applyPagination";

export type PaginationProps = {
  /** Currently active page size (50 / 100 / 200). */
  pageSize: PageSize;
  /** Currently active 0-based page index. */
  pageIndex: number;
  /** Row count of the post-filter set (NOT the page slice). Used to
   *  derive the total-pages caption. */
  totalRows: number;
  /** Page-size selector callback. Always invoked with one of
   *  50 / 100 / 200. */
  onChangePageSize: (size: PageSize) => void;
  /** Prev/Next callback. Always invoked with a non-negative integer
   *  within `[0, totalPages-1]`. */
  onChangePage: (pageIndex: number) => void;
};

const PAGE_SIZE_OPTIONS: PageSize[] = [50, 100, 200];

export function Pagination({
  pageSize,
  pageIndex,
  totalRows,
  onChangePageSize,
  onChangePage,
}: PaginationProps) {
  // Mirror the math in applyPagination so the caption stays in sync
  // even before the parent finishes re-deriving its slice. Math.max(1,
  // ...) prevents "Page 1 of 0" when totalRows === 0.
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const isFirst = safePageIndex === 0;
  const isLast = safePageIndex >= totalPages - 1;

  return (
    <nav
      className="pagination"
      role="navigation"
      aria-label="Session list pagination"
    >
      <label className="pagination-page-size">
        <span className="pagination-page-size-label">Page size</span>
        <select
          aria-label="Page size"
          value={pageSize}
          onChange={(event) => {
            // The <select> emits string values; coerce to the typed
            // union so the callback contract holds. The schema only
            // includes 50/100/200; if some future change adds an
            // option this cast must be revisited.
            const next = Number(event.target.value) as PageSize;
            onChangePageSize(next);
          }}
        >
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-label="Previous page"
        disabled={isFirst}
        onClick={() => onChangePage(safePageIndex - 1)}
      >
        Prev
      </button>
      <button
        type="button"
        aria-label="Next page"
        disabled={isLast}
        onClick={() => onChangePage(safePageIndex + 1)}
      >
        Next
      </button>
      <span className="pagination-caption" role="status" aria-live="polite">
        Page {safePageIndex + 1} of {totalPages}
      </span>
    </nav>
  );
}
