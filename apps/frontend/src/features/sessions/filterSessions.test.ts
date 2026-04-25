// Pure-function coverage for `applyFilters` and `applySort`.
//
// Coverage:
//   - All 5 filter axes individually (tool / status / storage /
//     project / search).
//   - Multi-axis combinations (3-axis intersection per the spec DoD).
//   - `importableOnly = true` overrides the persisted `status` array
//     defensively (the hook clears `status`, but the filter must
//     also defend against a decode-path corruption that leaves both).
//   - Sort null-handling for both directions per the spec rule:
//     ascending nulls first, descending nulls last.
//   - Sort tiebreaker chain: when the chosen field is null on every
//     row, the chain (`sourceUpdatedAt → ingestedAt → createdAt → title
//     → rowKey`) settles deterministically.
//   - Sort stability across two `applySort` calls with the same input.
//   - `applyFilters` and `applySort` are pure: input arrays are not
//     mutated; output is a new array reference.
import { expect, test } from "bun:test";
import {
  applyFilters,
  applySort,
  distinctProjectPaths,
} from "./filterSessions";
import type { SessionRow } from "./types";
import { DEFAULT_FILTERS, type SessionFiltersState } from "./useSessionFilters";

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    rowKey: "claude_code:row-1",
    sourceSessionKey: "claude_code:row-1",
    tool: "claude_code",
    sourceSessionId: "row-1",
    title: "Row one",
    projectPath: "/projects/alpha",
    sourcePath: "/srv/sessions/row-1.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-row-1",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-22T00:01:00Z",
    ingestedAt: null,
    storedSessionUid: null,
    storedRawRef: null,
    hasSubagentSidecars: false,
    status: "not_stored",
    statusConflict: false,
    presence: "source_only",
    ...overrides,
  };
}

function withFilters(
  partial: Partial<SessionFiltersState>,
): SessionFiltersState {
  return { ...DEFAULT_FILTERS, ...partial };
}

// ---- applyFilters: each axis individually ----

test("applyFilters: defaults pass every row (no-op)", () => {
  const rows = [row({ rowKey: "a" }), row({ rowKey: "b" })];
  const out = applyFilters(rows, DEFAULT_FILTERS);
  expect(out.length).toBe(2);
});

test("applyFilters: tool='codex' keeps only codex rows", () => {
  const rows = [
    row({ rowKey: "claude_code:1", tool: "claude_code" }),
    row({ rowKey: "codex:1", tool: "codex" }),
    row({ rowKey: "codex:2", tool: "codex" }),
  ];
  const out = applyFilters(rows, withFilters({ tool: "codex" }));
  expect(out.map((r) => r.rowKey)).toEqual(["codex:1", "codex:2"]);
});

test("applyFilters: status=['outdated'] keeps only outdated rows", () => {
  const rows = [
    row({ rowKey: "a", status: "not_stored" }),
    row({ rowKey: "b", status: "outdated" }),
    row({ rowKey: "c", status: "up_to_date" }),
  ];
  const out = applyFilters(rows, withFilters({ status: ["outdated"] }));
  expect(out.map((r) => r.rowKey)).toEqual(["b"]);
});

test("applyFilters: status=['not_stored','outdated'] passes both", () => {
  const rows = [
    row({ rowKey: "a", status: "not_stored" }),
    row({ rowKey: "b", status: "outdated" }),
    row({ rowKey: "c", status: "up_to_date" }),
    row({ rowKey: "d", status: "source_missing" }),
  ];
  const out = applyFilters(
    rows,
    withFilters({ status: ["not_stored", "outdated"] }),
  );
  expect(out.map((r) => r.rowKey)).toEqual(["a", "b"]);
});

test("applyFilters: storage='stored' keeps only rows with a stored copy", () => {
  const rows = [
    row({ rowKey: "a", storedSessionUid: null }),
    row({ rowKey: "b", storedSessionUid: "uid-b" }),
  ];
  const out = applyFilters(rows, withFilters({ storage: "stored" }));
  expect(out.map((r) => r.rowKey)).toEqual(["b"]);
});

test("applyFilters: storage='not_stored' keeps only rows without a stored copy", () => {
  const rows = [
    row({ rowKey: "a", storedSessionUid: null }),
    row({ rowKey: "b", storedSessionUid: "uid-b" }),
  ];
  const out = applyFilters(rows, withFilters({ storage: "not_stored" }));
  expect(out.map((r) => r.rowKey)).toEqual(["a"]);
});

test("applyFilters: project='/projects/alpha' keeps only matching rows", () => {
  const rows = [
    row({ rowKey: "a", projectPath: "/projects/alpha" }),
    row({ rowKey: "b", projectPath: "/projects/beta" }),
    row({ rowKey: "c", projectPath: null }),
  ];
  const out = applyFilters(
    rows,
    withFilters({ project: "/projects/alpha" }),
  );
  expect(out.map((r) => r.rowKey)).toEqual(["a"]);
});

test("applyFilters: search matches title / sourceSessionId / sourcePath / projectPath case-insensitively", () => {
  const rows = [
    row({ rowKey: "a", title: "Hello World", sourcePath: "/x/a.jsonl" }),
    row({ rowKey: "b", title: null, sourceSessionId: "needle-b" }),
    row({ rowKey: "c", projectPath: "/projects/needle-area" }),
    row({ rowKey: "d", title: "Other", sourceSessionId: "x", sourcePath: "/x/d.jsonl", projectPath: "/p" }),
  ];
  // Match against title.
  expect(
    applyFilters(rows, withFilters({ search: "hello" })).map((r) => r.rowKey),
  ).toEqual(["a"]);
  // Match against sourceSessionId.
  expect(
    applyFilters(rows, withFilters({ search: "NEEDLE-B" })).map((r) => r.rowKey),
  ).toEqual(["b"]);
  // Match against projectPath.
  expect(
    applyFilters(rows, withFilters({ search: "needle-area" })).map((r) => r.rowKey),
  ).toEqual(["c"]);
  // Match against sourcePath.
  expect(
    applyFilters(rows, withFilters({ search: "/x/a.jsonl" })).map((r) => r.rowKey),
  ).toEqual(["a"]);
});

test("applyFilters: importableOnly=true overrides any leftover status array", () => {
  const rows = [
    row({ rowKey: "a", status: "not_stored" }),
    row({ rowKey: "b", status: "outdated" }),
    row({ rowKey: "c", status: "up_to_date" }),
    row({ rowKey: "d", status: "source_missing" }),
  ];
  // The HOOK clears `status` when toggling importableOnly on, but the
  // filter must also defend against a decode-path leak that left both
  // populated (e.g. user manually edited localStorage).
  const out = applyFilters(
    rows,
    withFilters({
      importableOnly: true,
      status: ["up_to_date", "source_missing"], // would be incompatible
    }),
  );
  expect(out.map((r) => r.rowKey)).toEqual(["a", "b"]);
});

// ---- applyFilters: multi-axis combinations ----

test("applyFilters: 3-axis combination (tool + status + project)", () => {
  const rows = [
    row({
      rowKey: "match",
      tool: "claude_code",
      status: "not_stored",
      projectPath: "/projects/alpha",
    }),
    row({
      rowKey: "wrong-tool",
      tool: "codex",
      status: "not_stored",
      projectPath: "/projects/alpha",
    }),
    row({
      rowKey: "wrong-status",
      tool: "claude_code",
      status: "up_to_date",
      projectPath: "/projects/alpha",
    }),
    row({
      rowKey: "wrong-project",
      tool: "claude_code",
      status: "not_stored",
      projectPath: "/projects/beta",
    }),
  ];
  const out = applyFilters(
    rows,
    withFilters({
      tool: "claude_code",
      status: ["not_stored"],
      project: "/projects/alpha",
    }),
  );
  expect(out.map((r) => r.rowKey)).toEqual(["match"]);
});

test("applyFilters: 4-axis combination (tool + status + storage + search)", () => {
  const rows = [
    row({
      rowKey: "match",
      tool: "claude_code",
      status: "outdated",
      storedSessionUid: "uid-1",
      title: "needle-here",
    }),
    row({
      rowKey: "wrong-search",
      tool: "claude_code",
      status: "outdated",
      storedSessionUid: "uid-2",
      title: "no match",
    }),
  ];
  const out = applyFilters(
    rows,
    withFilters({
      tool: "claude_code",
      status: ["outdated"],
      storage: "stored",
      search: "needle",
    }),
  );
  expect(out.map((r) => r.rowKey)).toEqual(["match"]);
});

test("applyFilters: input array is not mutated; output is a new array reference", () => {
  const rows = [row({ rowKey: "a" }), row({ rowKey: "b" })];
  const before = rows.slice();
  const out = applyFilters(rows, withFilters({ tool: "codex" }));
  expect(rows).toEqual(before);
  expect(out).not.toBe(rows);
});

// ---- applySort: null handling per spec ----

test("applySort: ascending puts nulls FIRST (before non-null)", () => {
  const rows = [
    row({ rowKey: "a", sourceUpdatedAt: "2026-04-22T00:01:00Z" }),
    row({ rowKey: "b", sourceUpdatedAt: null }),
    row({ rowKey: "c", sourceUpdatedAt: "2026-04-22T00:02:00Z" }),
  ];
  const out = applySort(rows, { field: "source_updated_at", direction: "asc" });
  expect(out.map((r) => r.rowKey)).toEqual(["b", "a", "c"]);
});

test("applySort: descending puts nulls LAST (after non-null)", () => {
  const rows = [
    row({ rowKey: "a", sourceUpdatedAt: "2026-04-22T00:01:00Z" }),
    row({ rowKey: "b", sourceUpdatedAt: null }),
    row({ rowKey: "c", sourceUpdatedAt: "2026-04-22T00:02:00Z" }),
  ];
  const out = applySort(rows, { field: "source_updated_at", direction: "desc" });
  expect(out.map((r) => r.rowKey)).toEqual(["c", "a", "b"]);
});

test("applySort: title sort is case-insensitive ASCII", () => {
  const rows = [
    row({ rowKey: "a", title: "banana" }),
    row({ rowKey: "b", title: "Apple" }),
    row({ rowKey: "c", title: "cherry" }),
  ];
  const out = applySort(rows, { field: "title", direction: "asc" });
  expect(out.map((r) => r.rowKey)).toEqual(["b", "a", "c"]);
});

// ---- applySort: tiebreaker chain ----

test("applySort: tiebreaker chain settles deterministically when chosen field is null on every row", () => {
  // Every row has null `created_at`; the tiebreaker must walk
  // `sourceUpdatedAt → ingestedAt → createdAt(skipped) → title → rowKey`.
  const rows = [
    row({
      rowKey: "z-row",
      createdAt: null,
      sourceUpdatedAt: "2026-04-22T00:01:00Z",
      ingestedAt: null,
      title: "aa",
    }),
    row({
      rowKey: "a-row",
      createdAt: null,
      sourceUpdatedAt: "2026-04-22T00:01:00Z",
      ingestedAt: null,
      title: "aa",
    }),
  ];
  // Both rows are identical except for rowKey; tiebreak resolves on
  // rowKey (always ascending, deterministic).
  const out = applySort(rows, { field: "created_at", direction: "asc" });
  expect(out.map((r) => r.rowKey)).toEqual(["a-row", "z-row"]);
});

test("applySort: tiebreaker walks remaining timestamps in order", () => {
  // Rows tie on createdAt (both null), so chain falls to
  // sourceUpdatedAt. One row has an earlier sourceUpdatedAt; ascending
  // direction puts it first.
  const rows = [
    row({
      rowKey: "later",
      createdAt: null,
      sourceUpdatedAt: "2026-04-22T05:00:00Z",
    }),
    row({
      rowKey: "earlier",
      createdAt: null,
      sourceUpdatedAt: "2026-04-22T01:00:00Z",
    }),
  ];
  const out = applySort(rows, { field: "created_at", direction: "asc" });
  expect(out.map((r) => r.rowKey)).toEqual(["earlier", "later"]);
});

test("applySort: stable across multiple calls with the same input", () => {
  const rows = [
    row({ rowKey: "a", title: "a", sourceUpdatedAt: "2026-04-22T00:01:00Z" }),
    row({ rowKey: "b", title: "b", sourceUpdatedAt: "2026-04-22T00:02:00Z" }),
    row({ rowKey: "c", title: "c", sourceUpdatedAt: null }),
  ];
  const sort = { field: "source_updated_at" as const, direction: "desc" as const };
  const first = applySort(rows, sort).map((r) => r.rowKey);
  const second = applySort(rows, sort).map((r) => r.rowKey);
  expect(first).toEqual(second);
});

test("applySort: input array is not mutated; output is a new array reference", () => {
  const rows = [
    row({ rowKey: "a", sourceUpdatedAt: "2026-04-22T00:01:00Z" }),
    row({ rowKey: "b", sourceUpdatedAt: null }),
  ];
  const before = rows.slice();
  const out = applySort(rows, { field: "source_updated_at", direction: "asc" });
  expect(rows).toEqual(before);
  expect(out).not.toBe(rows);
});

// ---- distinctProjectPaths ----

test("distinctProjectPaths: returns sorted unique non-null project paths", () => {
  const rows = [
    row({ rowKey: "a", projectPath: "/p/beta" }),
    row({ rowKey: "b", projectPath: "/p/alpha" }),
    row({ rowKey: "c", projectPath: "/p/alpha" }),
    row({ rowKey: "d", projectPath: null }),
  ];
  expect(distinctProjectPaths(rows)).toEqual(["/p/alpha", "/p/beta"]);
});

test("distinctProjectPaths: empty input returns empty array", () => {
  expect(distinctProjectPaths([])).toEqual([]);
});
