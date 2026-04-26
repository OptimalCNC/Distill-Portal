// Round-trip + corruption-resilience truth table for the last-manual-
// rescan persistence helper.
//
// Coverage:
//   (1) write + read round-trip preserves the ISO string.
//   (2) read on missing key -> null.
//   (3) read on non-JSON value -> null (defensive: someone might have
//       hand-edited localStorage in dev).
//   (4) read on JSON value that decodes to a non-string -> null.
//   (5) read on JSON value that decodes to an empty string -> null
//       (treated as missing).
//   (6) localStorage undefined (private mode, headless variants)
//       -> read returns null; write is a no-op.
//   (7) localStorage.setItem throws (quota exceeded, disabled storage)
//       -> write swallows the throw; no exception leaks to the caller.
//
// Tests use direct `globalThis.localStorage.setItem` writes to seed
// corrupt blobs, then call the helper to assert it falls through to
// null. The happy-dom test environment provides a working
// localStorage; tests that need it absent use defineProperty to
// shadow the global temporarily.
import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  LAST_RESCAN_KEY,
  readLastRescan,
  writeLastRescan,
} from "./lastRescan";

// happy-dom installs `localStorage` on `window` but not on the bare
// `globalThis` object that test-setup.ts initializes. Promote it
// here so the helper (which reads `globalThis.localStorage` to
// mirror real browser globals) sees a working store. Mirrors the
// pattern in `useSessionFilters.test.ts`.
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

beforeEach(() => {
  try {
    globalThis.localStorage?.removeItem(LAST_RESCAN_KEY);
  } catch {
    // ignore — storage might be shadowed by a previous test that
    // forgot to restore it; the next afterEach handles the cleanup.
  }
});

afterEach(() => {
  try {
    globalThis.localStorage?.removeItem(LAST_RESCAN_KEY);
  } catch {
    // ignore.
  }
});

test("lastRescan: round-trip preserves the ISO string", () => {
  const iso = "2026-04-25T12:34:56.789Z";
  writeLastRescan(iso);
  expect(readLastRescan()).toBe(iso);
});

test("lastRescan: missing key returns null", () => {
  expect(readLastRescan()).toBeNull();
});

test("lastRescan: malformed JSON returns null (and does not throw)", () => {
  globalThis.localStorage.setItem(LAST_RESCAN_KEY, "{not-json");
  expect(readLastRescan()).toBeNull();
});

test("lastRescan: JSON decodes to non-string -> null", () => {
  // Numeric, boolean, array, object, null all fail the typeof check.
  for (const blob of ["123", "true", "null", "[]", '{"x":1}']) {
    globalThis.localStorage.setItem(LAST_RESCAN_KEY, blob);
    expect(readLastRescan()).toBeNull();
  }
});

test("lastRescan: JSON decodes to empty string -> null", () => {
  globalThis.localStorage.setItem(LAST_RESCAN_KEY, JSON.stringify(""));
  expect(readLastRescan()).toBeNull();
});

test("lastRescan: localStorage undefined -> read null, write no-op", () => {
  // Shadow the global with `undefined` for the duration of this test
  // to simulate a private-browsing-style environment where storage
  // is gated. Restore in `finally` so subsequent tests still see
  // the real localStorage.
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  try {
    expect(readLastRescan()).toBeNull();
    // The write must NOT throw even though storage is unavailable.
    expect(() => writeLastRescan("2026-04-25T00:00:00Z")).not.toThrow();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      // happy-dom defines it on the prototype; remove the override
      // we just set so the prototype value re-emerges.
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
});

test("lastRescan: write throws -> swallowed (no exception escapes)", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  // Replace with a Storage-shaped object whose setItem throws.
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    } as unknown as Storage,
    configurable: true,
    writable: true,
  });
  try {
    expect(() => writeLastRescan("2026-04-25T00:00:00Z")).not.toThrow();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
});

test("lastRescan: localStorage.getItem throws -> read returns null", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      length: 0,
      clear: () => {},
      getItem: () => {
        throw new Error("SecurityError");
      },
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    } as unknown as Storage,
    configurable: true,
    writable: true,
  });
  try {
    expect(readLastRescan()).toBeNull();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
});
