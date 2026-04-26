// Truth-table coverage for `applyPagination`.
//
// The matrix axis is (rows.length, pageSize, pageIndex):
//   - row counts: 0, 50, 51, 100, 101, 200, 201, 500
//   - page sizes: 50, 100, 200
//   - page indices: -1, 0, last-valid, last-valid + 1, very-large
//
// We don't enumerate every cell explicitly (that would be ~100+
// assertions); instead we cover the boundary classes that ever
// produce a different return shape: empty rows, full pages, partial
// last page, the boundary at exactly `pageSize` and `pageSize + 1`,
// and the high-index clamp case.
import { expect, test } from "bun:test";
import { applyPagination } from "./applyPagination";

function fakeRows(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

test("applyPagination: empty rows -> totalPages=1, pageRows=[], pageIndex=0", () => {
  const r = applyPagination(fakeRows(0), 0, 50);
  expect(r.totalPages).toBe(1);
  expect(r.pageIndex).toBe(0);
  expect(r.pageRows).toEqual([]);
});

test("applyPagination: empty rows + arbitrary pageIndex still clamps to 0", () => {
  for (const pageIndex of [-1, 0, 5, 999]) {
    const r = applyPagination(fakeRows(0), pageIndex, 50);
    expect(r.totalPages).toBe(1);
    expect(r.pageIndex).toBe(0);
    expect(r.pageRows).toEqual([]);
  }
});

test("applyPagination: 50 rows / pageSize 50 -> 1 page, full slice", () => {
  const r = applyPagination(fakeRows(50), 0, 50);
  expect(r.totalPages).toBe(1);
  expect(r.pageIndex).toBe(0);
  expect(r.pageRows.length).toBe(50);
  expect(r.pageRows[0]).toBe(0);
  expect(r.pageRows[49]).toBe(49);
});

test("applyPagination: 51 rows / pageSize 50 -> 2 pages; page 0 returns 50, page 1 returns 1", () => {
  const r0 = applyPagination(fakeRows(51), 0, 50);
  expect(r0.totalPages).toBe(2);
  expect(r0.pageIndex).toBe(0);
  expect(r0.pageRows.length).toBe(50);
  const r1 = applyPagination(fakeRows(51), 1, 50);
  expect(r1.totalPages).toBe(2);
  expect(r1.pageIndex).toBe(1);
  expect(r1.pageRows.length).toBe(1);
  expect(r1.pageRows[0]).toBe(50);
});

test("applyPagination: 100 rows / pageSize 50 -> exactly 2 full pages", () => {
  const r0 = applyPagination(fakeRows(100), 0, 50);
  expect(r0.totalPages).toBe(2);
  expect(r0.pageRows.length).toBe(50);
  const r1 = applyPagination(fakeRows(100), 1, 50);
  expect(r1.totalPages).toBe(2);
  expect(r1.pageRows.length).toBe(50);
  expect(r1.pageRows[0]).toBe(50);
  expect(r1.pageRows[49]).toBe(99);
});

test("applyPagination: 101 rows / pageSize 50 -> 3 pages; last page has 1 row", () => {
  const r2 = applyPagination(fakeRows(101), 2, 50);
  expect(r2.totalPages).toBe(3);
  expect(r2.pageIndex).toBe(2);
  expect(r2.pageRows.length).toBe(1);
  expect(r2.pageRows[0]).toBe(100);
});

test("applyPagination: 200 rows / pageSize 100 -> exactly 2 full pages", () => {
  const r0 = applyPagination(fakeRows(200), 0, 100);
  expect(r0.totalPages).toBe(2);
  expect(r0.pageRows.length).toBe(100);
  const r1 = applyPagination(fakeRows(200), 1, 100);
  expect(r1.totalPages).toBe(2);
  expect(r1.pageRows.length).toBe(100);
});

test("applyPagination: 201 rows / pageSize 200 -> 2 pages; last has 1 row", () => {
  const r0 = applyPagination(fakeRows(201), 0, 200);
  expect(r0.totalPages).toBe(2);
  expect(r0.pageRows.length).toBe(200);
  const r1 = applyPagination(fakeRows(201), 1, 200);
  expect(r1.totalPages).toBe(2);
  expect(r1.pageRows.length).toBe(1);
  expect(r1.pageRows[0]).toBe(200);
});

test("applyPagination: 500 rows / pageSize 50 -> 10 pages; first/last slice contents", () => {
  const r0 = applyPagination(fakeRows(500), 0, 50);
  expect(r0.totalPages).toBe(10);
  expect(r0.pageRows[0]).toBe(0);
  expect(r0.pageRows[49]).toBe(49);
  const r9 = applyPagination(fakeRows(500), 9, 50);
  expect(r9.totalPages).toBe(10);
  expect(r9.pageIndex).toBe(9);
  expect(r9.pageRows.length).toBe(50);
  expect(r9.pageRows[0]).toBe(450);
  expect(r9.pageRows[49]).toBe(499);
});

test("applyPagination: 500 rows / pageSize 100 -> 5 pages", () => {
  const r = applyPagination(fakeRows(500), 4, 100);
  expect(r.totalPages).toBe(5);
  expect(r.pageRows.length).toBe(100);
  expect(r.pageRows[0]).toBe(400);
  expect(r.pageRows[99]).toBe(499);
});

test("applyPagination: 500 rows / pageSize 200 -> 3 pages; last is partial", () => {
  const r = applyPagination(fakeRows(500), 2, 200);
  expect(r.totalPages).toBe(3);
  expect(r.pageRows.length).toBe(100);
  expect(r.pageRows[0]).toBe(400);
});

test("applyPagination: pageIndex < 0 -> clamped to 0", () => {
  const r = applyPagination(fakeRows(100), -1, 50);
  expect(r.pageIndex).toBe(0);
  expect(r.pageRows.length).toBe(50);
  expect(r.pageRows[0]).toBe(0);
});

test("applyPagination: pageIndex past last -> clamped to totalPages - 1", () => {
  const r = applyPagination(fakeRows(101), 99, 50);
  expect(r.totalPages).toBe(3);
  expect(r.pageIndex).toBe(2);
  expect(r.pageRows.length).toBe(1);
  expect(r.pageRows[0]).toBe(100);
});

test("applyPagination: pageIndex very large -> clamped to last valid index", () => {
  const r = applyPagination(fakeRows(200), 9999, 50);
  expect(r.totalPages).toBe(4);
  expect(r.pageIndex).toBe(3);
  expect(r.pageRows.length).toBe(50);
  expect(r.pageRows[49]).toBe(199);
});

test("applyPagination: NaN pageIndex -> clamped to 0", () => {
  const r = applyPagination(fakeRows(100), Number.NaN, 50);
  expect(r.pageIndex).toBe(0);
  expect(r.pageRows.length).toBe(50);
});

test("applyPagination: non-integer pageIndex -> floored", () => {
  // A defensive caller might compute pageIndex via Math.floor itself
  // (the App.tsx pageSize-change recompute does), but the helper
  // floors anyway so a stray fractional value cannot land between
  // two pages.
  const r = applyPagination(fakeRows(200), 1.7, 50);
  expect(r.pageIndex).toBe(1);
  expect(r.pageRows[0]).toBe(50);
});

test("applyPagination: rows shorter than pageSize -> totalPages 1; full slice", () => {
  const r = applyPagination(fakeRows(7), 0, 50);
  expect(r.totalPages).toBe(1);
  expect(r.pageRows.length).toBe(7);
});
