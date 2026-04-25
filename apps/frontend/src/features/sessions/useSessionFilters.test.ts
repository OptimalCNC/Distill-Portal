// Robustness tests for `useSessionFilters` and its decoder.
//
// Coverage matrix (per `working/phase-4.md` §Filter, Sort, Search →
// localStorage robustness):
//
//   (1)  Round-trip: persist a custom shape, decode it back, every
//        field matches.
//   (2)  Malformed JSON in the persisted blob -> defaults.
//   (3)  null top-level -> defaults.
//   (4)  Array top-level -> defaults.
//   (5)  String top-level -> defaults.
//   (6)  Missing top-level keys -> per-field defaults; valid keys
//        accepted alongside.
//   (7)  Unknown `tool` enum value -> default.
//   (8)  Unknown `sort.field` value -> default.
//   (9)  Non-array `status` -> default `[]`.
//   (10) `status` array with one valid + one invalid entry -> WHOLE
//        array dropped; do NOT silently filter to valid entries.
//   (11) Non-boolean `importableOnly` -> default `false`.
//   (12) Out-of-range `pageSize` (e.g. 7, 1000, "abc") -> default 50.
//   (13) `localStorage` undefined / throws -> in-memory fallback,
//        no thrown error.
//   (14) `setImportableOnly(true)` clears the persisted `status`
//        array on apply; toggling to `false` leaves `status` alone.
//   (15) `setFilter` mutations write the blob synchronously.
//   (16) `resetAll` returns every field to defaults and re-persists.
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  decodeFilters,
  DEFAULT_FILTERS,
  STORAGE_KEY,
  useSessionFilters,
} from "./useSessionFilters";

// happy-dom installs `localStorage` on `window` but not on the bare
// `globalThis` object that test-setup.ts initializes. Promote it here
// so the hook (which reads `globalThis.localStorage` to mirror real
// browser globals) sees a working store. We only do this once per
// process; individual tests still clear() the store between runs.
beforeAll(() => {
  const windowAny = (globalThis as unknown as { window?: { localStorage?: Storage } })
    .window;
  if (windowAny?.localStorage && !globalThis.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      value: windowAny.localStorage,
      configurable: true,
      writable: true,
    });
  }
});

afterEach(() => {
  cleanup();
  try {
    globalThis.localStorage?.clear();
  } catch {
    // ignore — some test cases deliberately disable storage
  }
});

beforeEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // ignore
  }
});

// (1) Round-trip via the hook: write -> reload -> match shape.
test("useSessionFilters: round-trip persistence across remount", () => {
  const { result, unmount } = renderHook(() => useSessionFilters());
  act(() => {
    result.current.setFilter("tool", "claude_code");
    result.current.setFilter("storage", "stored");
    result.current.setFilter("status", ["outdated"]);
    result.current.setFilter("project", "/projects/foo");
    result.current.setFilter("search", "hello world");
    result.current.setFilter("sort", { field: "title", direction: "asc" });
    result.current.setFilter("pageSize", 100);
  });
  // Persisted blob is what we expect.
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  expect(stored).not.toBeNull();
  const parsed = JSON.parse(stored!);
  expect(parsed.tool).toBe("claude_code");
  expect(parsed.storage).toBe("stored");
  expect(parsed.status).toEqual(["outdated"]);
  expect(parsed.project).toBe("/projects/foo");
  expect(parsed.search).toBe("hello world");
  expect(parsed.sort).toEqual({ field: "title", direction: "asc" });
  expect(parsed.pageSize).toBe(100);

  unmount();
  // Mount a fresh hook against the same storage; state should round-trip.
  const { result: reloaded } = renderHook(() => useSessionFilters());
  expect(reloaded.current.filters.tool).toBe("claude_code");
  expect(reloaded.current.filters.storage).toBe("stored");
  expect(reloaded.current.filters.status).toEqual(["outdated"]);
  expect(reloaded.current.filters.project).toBe("/projects/foo");
  expect(reloaded.current.filters.search).toBe("hello world");
  expect(reloaded.current.filters.sort).toEqual({
    field: "title",
    direction: "asc",
  });
  expect(reloaded.current.filters.pageSize).toBe(100);
});

// (2) Malformed JSON -> defaults; the corrupt blob is rewritten on mount.
test("decodeFilters: malformed JSON returns defaults", () => {
  const out = decodeFilters("{not-json");
  expect(out).toEqual(DEFAULT_FILTERS);
});

test("useSessionFilters: malformed JSON triggers defaults + blob rewrite", () => {
  globalThis.localStorage.setItem(STORAGE_KEY, "{not-json");
  const { result } = renderHook(() => useSessionFilters());
  expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  // The corrupt blob is healed: the next read should be canonical JSON.
  const rewritten = globalThis.localStorage.getItem(STORAGE_KEY);
  expect(rewritten).not.toBeNull();
  const parsed = JSON.parse(rewritten!);
  expect(parsed).toEqual(DEFAULT_FILTERS);
});

// (3) null top-level -> defaults.
test("decodeFilters: null top-level returns defaults", () => {
  expect(decodeFilters("null")).toEqual(DEFAULT_FILTERS);
});

// (4) Array top-level -> defaults.
test("decodeFilters: array top-level returns defaults", () => {
  expect(decodeFilters("[1,2,3]")).toEqual(DEFAULT_FILTERS);
});

// (5) String top-level -> defaults.
test("decodeFilters: string top-level returns defaults", () => {
  expect(decodeFilters('"just a string"')).toEqual(DEFAULT_FILTERS);
});

// (6) Missing top-level keys -> per-field defaults; valid keys accepted.
test("decodeFilters: missing keys default; present-and-valid keys are accepted", () => {
  const out = decodeFilters(
    JSON.stringify({ tool: "codex", search: "foo" }),
  );
  expect(out.tool).toBe("codex");
  expect(out.search).toBe("foo");
  // Everything else falls back to defaults.
  expect(out.storage).toBe(DEFAULT_FILTERS.storage);
  expect(out.status).toEqual(DEFAULT_FILTERS.status);
  expect(out.importableOnly).toBe(DEFAULT_FILTERS.importableOnly);
  expect(out.project).toBe(DEFAULT_FILTERS.project);
  expect(out.sort).toEqual(DEFAULT_FILTERS.sort);
  expect(out.pageSize).toBe(DEFAULT_FILTERS.pageSize);
});

// (7) Unknown `tool` enum value -> default.
test("decodeFilters: unknown tool enum falls back to default", () => {
  const out = decodeFilters(JSON.stringify({ tool: "vim" }));
  expect(out.tool).toBe(DEFAULT_FILTERS.tool);
});

// (7b) Unknown `storage` enum value -> default. Mirrors (7) for the
//      sibling enum; covers the second `VALID_STORAGES` membership
//      check in the decoder.
test("decodeFilters: unknown storage enum falls back to default", () => {
  const out = decodeFilters(JSON.stringify({ storage: "vim" }));
  expect(out.storage).toBe(DEFAULT_FILTERS.storage);
});

// (8) Unknown `sort.field` -> default.
test("decodeFilters: unknown sort.field falls back to default sort", () => {
  const out = decodeFilters(
    JSON.stringify({ sort: { field: "nope", direction: "asc" } }),
  );
  expect(out.sort.field).toBe(DEFAULT_FILTERS.sort.field);
  // `direction` was valid; spec robustness rule applies per-key, but
  // the implementation always returns a coherent sort object — when
  // field is invalid the whole field defaults; direction is taken
  // from the persisted value if valid. Either is acceptable; assert
  // both for explicit coverage.
  expect(out.sort.direction).toBe("asc");
});

// (8b) Unknown `sort.direction` -> default direction; `sort.field`
//      from the persisted blob is preserved when it's valid.
//      Mirrors (8) for the sibling sort key.
test("decodeFilters: unknown sort.direction falls back to default direction", () => {
  const out = decodeFilters(
    JSON.stringify({ sort: { field: "title", direction: "sideways" } }),
  );
  expect(out.sort.direction).toBe(DEFAULT_FILTERS.sort.direction);
  // Field was valid; the decoder preserves it.
  expect(out.sort.field).toBe("title");
});

// (9) Non-array `status` -> default [].
test("decodeFilters: non-array status falls back to []", () => {
  const out = decodeFilters(JSON.stringify({ status: "outdated" }));
  expect(out.status).toEqual([]);
});

// (10) status array with one valid + one invalid entry -> WHOLE array dropped.
test("decodeFilters: status with one invalid entry drops the WHOLE array", () => {
  const out = decodeFilters(
    JSON.stringify({ status: ["outdated", "garbage"] }),
  );
  // Per spec: "drop the WHOLE array (apply default `[]`); do NOT silently
  // filter to valid entries." This is the explicit choice so a corrupt
  // blob cannot accidentally narrow the user's view.
  expect(out.status).toEqual([]);
});

// (11) Non-boolean importableOnly -> default false.
test("decodeFilters: non-boolean importableOnly falls back to false", () => {
  const out = decodeFilters(
    JSON.stringify({ importableOnly: "yes" }),
  );
  expect(out.importableOnly).toBe(false);
});

// (12) Out-of-range pageSize -> default 50.
test("decodeFilters: out-of-range pageSize falls back to default 50", () => {
  expect(decodeFilters(JSON.stringify({ pageSize: 7 })).pageSize).toBe(50);
  expect(
    decodeFilters(JSON.stringify({ pageSize: 1000 })).pageSize,
  ).toBe(50);
  expect(
    decodeFilters(JSON.stringify({ pageSize: "abc" })).pageSize,
  ).toBe(50);
});

// (13) localStorage unavailable / throws -> in-memory fallback, no throw.
test("useSessionFilters: throwing localStorage falls back to in-memory state", () => {
  // Replace localStorage with a throwing stub for this test only.
  const originalStorage = globalThis.localStorage;
  const throwingStorage = {
    getItem: () => {
      throw new Error("storage disabled");
    },
    setItem: () => {
      throw new Error("storage disabled");
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: throwingStorage,
    configurable: true,
  });
  try {
    const { result } = renderHook(() => useSessionFilters());
    // No throw on mount.
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    // Mutations don't throw either; in-memory state advances.
    act(() => {
      result.current.setFilter("tool", "codex");
    });
    expect(result.current.filters.tool).toBe("codex");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalStorage,
      configurable: true,
    });
  }
});

// (13b) localStorage truly UNDEFINED on globalThis (not just throwing
//       on access) -> in-memory fallback, no throw. The decoder paths
//       are protected by `typeof globalThis.localStorage === "undefined"`
//       guards in `safeGet`/`safeSet`; this test exercises that branch.
//       The throwing-storage test above covers the try/catch fallback;
//       this one covers the typeof-undefined fallback.
test("useSessionFilters: undefined localStorage falls back to in-memory state", () => {
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  // Sanity: confirm the test really did remove the global so the
  // typeof guard is the only thing keeping safeGet from throwing.
  expect(typeof globalThis.localStorage).toBe("undefined");
  try {
    const { result } = renderHook(() => useSessionFilters());
    // No throw on mount + state is the in-memory defaults.
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    // Mutations don't throw either; in-memory state advances even
    // though no persistence layer is available.
    act(() => {
      result.current.setFilter("tool", "codex");
      result.current.setFilter("search", "needle");
    });
    expect(result.current.filters.tool).toBe("codex");
    expect(result.current.filters.search).toBe("needle");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalStorage,
      configurable: true,
      writable: true,
    });
  }
});

// (14) setImportableOnly(true) clears persisted status; (false) leaves it alone.
test("useSessionFilters: setImportableOnly(true) clears status; (false) leaves it", () => {
  const { result } = renderHook(() => useSessionFilters());
  act(() => {
    result.current.setFilter("status", ["outdated", "not_stored"]);
  });
  expect(result.current.filters.status).toEqual(["outdated", "not_stored"]);
  act(() => {
    result.current.setImportableOnly(true);
  });
  expect(result.current.filters.importableOnly).toBe(true);
  expect(result.current.filters.status).toEqual([]);
  // Now toggle off — the persisted (cleared) status array remains [].
  act(() => {
    result.current.setImportableOnly(false);
  });
  expect(result.current.filters.importableOnly).toBe(false);
  expect(result.current.filters.status).toEqual([]);
});

// (15) setFilter mutations write the blob synchronously.
test("useSessionFilters: setFilter writes the localStorage blob synchronously", () => {
  const { result } = renderHook(() => useSessionFilters());
  act(() => {
    result.current.setFilter("search", "needle");
  });
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  expect(stored).not.toBeNull();
  const parsed = JSON.parse(stored!);
  expect(parsed.search).toBe("needle");
});

// (16) resetAll returns to defaults and re-persists.
test("useSessionFilters: resetAll restores defaults and re-persists", () => {
  const { result } = renderHook(() => useSessionFilters());
  act(() => {
    result.current.setFilter("tool", "codex");
    result.current.setFilter("search", "needle");
    result.current.setFilter("status", ["outdated"]);
  });
  act(() => {
    result.current.resetAll();
  });
  expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  expect(stored).not.toBeNull();
  const parsed = JSON.parse(stored!);
  expect(parsed).toEqual(DEFAULT_FILTERS);
});

// (17) `project` accepts any string on decode (dynamic data — validated only
//      structurally; matches spec's explicit clause about partial-fetch
//      failure leaving a saved project that may not match any current row).
test("decodeFilters: project accepts any string", () => {
  expect(
    decodeFilters(JSON.stringify({ project: "/some/path" })).project,
  ).toBe("/some/path");
  expect(
    decodeFilters(JSON.stringify({ project: "" })).project,
  ).toBe("");
  expect(
    decodeFilters(JSON.stringify({ project: null })).project,
  ).toBe(null);
  expect(
    decodeFilters(JSON.stringify({ project: 123 })).project,
  ).toBe(null);
});

// (18) Sanity: a fully default-shaped persisted blob round-trips.
test("decodeFilters: defaults round-trip cleanly", () => {
  const out = decodeFilters(JSON.stringify(DEFAULT_FILTERS));
  expect(out).toEqual(DEFAULT_FILTERS);
});
