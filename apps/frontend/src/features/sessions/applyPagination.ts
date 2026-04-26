// Pure pagination helper for the unified inspection list.
//
// Per `working/phase-4.md` §Phase 4 Goals → "7. Scale to a few hundred
// sessions": the list is paginated client-side with page sizes
// 50 / 100 / 200 (default 50). Virtualization is explicitly deferred —
// pagination is the smaller surface area and is sufficient for the
// realistic session counts a single-user v1 produces.
//
// `applyPagination` is the single source of truth for pagination math.
// It takes the post-filter row set (any `T[]` — typed generically
// because callers operate on `SessionRow[]` but the helper has no
// reason to bind to that), the requested 0-based page index, and the
// page size, and returns:
//   - `pageRows`: the slice of rows for the requested page
//   - `pageIndex`: the SAME value, clamped to `[0, totalPages-1]` so a
//     caller passing a stale page index (e.g. after the row set
//     shrank because of a filter change) gets back a valid index it
//     can sync into state. Returning the clamped value here avoids
//     re-deriving it at the call site and keeps the action-bar count,
//     the table render, and the page indicator from disagreeing on
//     "where am I?".
//   - `totalPages`: `ceil(rows.length / pageSize)` with a minimum of
//     1 so the page caption can always read "Page 1 of 1" even when
//     the row set is empty.
//
// Clamping behavior:
//   - Negative `pageIndex` (e.g. -1, NaN, very-negative-int) -> 0.
//   - `pageIndex >= totalPages` -> `totalPages - 1` (last valid page).
//   - When `rows.length === 0`, `totalPages === 1` and the only valid
//     `pageIndex` is 0; `pageRows` is `[]`.
//
// The function is pure — no input mutation, no DOM access — so it
// unit-tests cheaply via the truth table in `applyPagination.test.ts`.

export type PageSize = 50 | 100 | 200;

export type PaginationResult<T> = {
  pageRows: T[];
  /** Clamped to `[0, totalPages-1]`. Callers should sync this back to
   *  their `pageIndex` state if it differs from what they passed in. */
  pageIndex: number;
  /** `Math.max(1, ceil(rows.length / pageSize))`. Always at least 1. */
  totalPages: number;
};

export function applyPagination<T>(
  rows: T[],
  pageIndex: number,
  pageSize: PageSize,
): PaginationResult<T> {
  // Defensive: a caller could pass NaN or a negative number; clamp
  // to [0, totalPages-1]. Math.max(1, ...) guarantees totalPages >= 1
  // so the empty-row case still has a "page 1 of 1" semantic.
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  let clamped: number;
  if (!Number.isFinite(pageIndex) || pageIndex < 0) {
    clamped = 0;
  } else if (pageIndex >= totalPages) {
    clamped = totalPages - 1;
  } else {
    // Floor here so a non-integer (e.g. produced by a pageSize-change
    // recompute) still lands on a valid integer page index.
    clamped = Math.floor(pageIndex);
  }
  const start = clamped * pageSize;
  const end = start + pageSize;
  return {
    pageRows: rows.slice(start, end),
    pageIndex: clamped,
    totalPages,
  };
}
