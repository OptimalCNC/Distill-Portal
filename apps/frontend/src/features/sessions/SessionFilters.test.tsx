// Component-level tests for SessionFilters.
//
// Coverage:
//   1. Tool chip click invokes setFilter("tool", value).
//   2. Storage chip click invokes setFilter("storage", value).
//   3. Status chip toggle adds and removes from the array.
//   4. "All" status chip resets to [].
//   5. Search input change invokes setFilter("search", value) immediately
//      (no debounce required by spec).
//   6. Project datalist exposes options from the passed-in `projects` list.
//   7. Project clear button resets the project filter to null.
//   8. importableOnly toggle calls setImportableOnly with the new boolean.
//   9. Sort field <select> change invokes setFilter("sort", { ... }).
//   10. Sort direction <select> change invokes setFilter("sort", { ... }).
//   11. Active chip carries the `.chip.active` class + `aria-pressed=true`.
//   12. M1b: above 1100 px the filter strip renders inline (the
//       `<details>` open attribute is true; the `<summary>` is hidden
//       via CSS — happy-dom does not evaluate @media queries, so we
//       assert via the `open` attribute presence).
//   13. M1b: below 1100 px the strip wraps inside `<details>` with
//       `open=false` by default.
//   14. M1b: a manual user toggle of `<details>` below 1100 px
//       persists across resize events that stay in the same band.
//   15. M1b: active-filter-count chip is suppressed at 0; renders
//       `${count} active` for each of the 7 axes individually.
//   16. M1b: chip count is 7 when ALL seven axes differ from default.
//   17. M1b: `countActiveFilters` pure helper exposed alongside the
//       component for re-use by App.tsx tests / future call sites.
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { SessionFilters, countActiveFilters } from "./SessionFilters";
import { DEFAULT_FILTERS, type SessionFiltersState } from "./useSessionFilters";

// M1b matchMedia shim. happy-dom ships a basic `window.matchMedia`
// stub that always returns `matches: false` and does not fire change
// events; we override it here with a controllable mock so the tests
// can drive the 1100 px breakpoint deterministically. Mirrors the
// pattern used in App.test.tsx for the narrow-viewport listener.
type MQListener = (e: MediaQueryListEvent) => void;
type MQEntry = {
  query: string;
  matches: boolean;
  listeners: Set<MQListener>;
};
const mediaQueryRegistry = new Map<string, MQEntry>();

function setMediaMatch(query: string, matches: boolean) {
  const existing = mediaQueryRegistry.get(query);
  if (existing && existing.matches === matches) return;
  if (existing) {
    existing.matches = matches;
    // Fire change events on a clone so listeners that mutate the set
    // (the cleanup paths in useEffect) do not corrupt iteration.
    const event = { matches, media: query } as MediaQueryListEvent;
    for (const listener of Array.from(existing.listeners)) {
      listener(event);
    }
  } else {
    mediaQueryRegistry.set(query, {
      query,
      matches,
      listeners: new Set(),
    });
  }
}

const originalMatchMedia = (
  globalThis as unknown as { window: { matchMedia?: typeof window.matchMedia } }
).window.matchMedia;

function installMatchMediaShim() {
  (
    globalThis as unknown as {
      window: { matchMedia: (q: string) => MediaQueryList };
    }
  ).window.matchMedia = (query: string) => {
    if (!mediaQueryRegistry.has(query)) {
      mediaQueryRegistry.set(query, {
        query,
        matches: false,
        listeners: new Set(),
      });
    }
    const entry = mediaQueryRegistry.get(query)!;
    return {
      get matches() {
        return entry.matches;
      },
      media: query,
      onchange: null,
      addListener: (l: MQListener) => entry.listeners.add(l),
      removeListener: (l: MQListener) => entry.listeners.delete(l),
      addEventListener: (_t: string, l: MQListener) => entry.listeners.add(l),
      removeEventListener: (_t: string, l: MQListener) =>
        entry.listeners.delete(l),
      dispatchEvent: (_e: Event) => true,
    } as unknown as MediaQueryList;
  };
}

function restoreMatchMedia() {
  if (originalMatchMedia) {
    (
      globalThis as unknown as {
        window: { matchMedia?: typeof window.matchMedia };
      }
    ).window.matchMedia = originalMatchMedia;
  }
  mediaQueryRegistry.clear();
}

beforeEach(() => {
  installMatchMediaShim();
  // Default to "wide" — most tests assume the inline strip behavior.
  setMediaMatch("(min-width: 1100px)", true);
});

afterEach(() => {
  cleanup();
  restoreMatchMedia();
});

function harness(overrides: Partial<SessionFiltersState> = {}) {
  const filters: SessionFiltersState = { ...DEFAULT_FILTERS, ...overrides };
  const setFilter = mock(() => {});
  const setImportableOnly = mock(() => {});
  const projects = ["/p/alpha", "/p/beta"];
  const utils = render(
    <SessionFilters
      filters={filters}
      projects={projects}
      setFilter={setFilter as never}
      setImportableOnly={setImportableOnly}
    />,
  );
  return { ...utils, filters, setFilter, setImportableOnly, projects };
}

test("SessionFilters: clicking a tool chip calls setFilter('tool', value)", () => {
  const { container, setFilter } = harness();
  const codexChip = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.chip"),
  ).find((el) => el.textContent === "Codex");
  expect(codexChip).not.toBeUndefined();
  codexChip!.click();
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "tool",
    "codex",
  ]);
});

test("SessionFilters: clicking a storage chip calls setFilter('storage', value)", () => {
  const { container, setFilter } = harness();
  const storedChip = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.chip"),
  ).find((el) => el.textContent === "Stored");
  expect(storedChip).not.toBeUndefined();
  storedChip!.click();
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "storage",
    "stored",
  ]);
});

test("SessionFilters: status chip toggle adds and removes from the array", () => {
  const { container, setFilter, rerender } = harness({ status: [] });
  const outdated = () =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>("button.chip"),
    ).find((el) => el.textContent === "Outdated");
  outdated()!.click();
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "status",
    ["outdated"],
  ]);
  // Now mock the persisted state into "outdated active" + click again -> removal.
  const filters2: SessionFiltersState = {
    ...DEFAULT_FILTERS,
    status: ["outdated"],
  };
  const setFilter2 = mock(() => {});
  const setImportableOnly2 = mock(() => {});
  rerender(
    <SessionFilters
      filters={filters2}
      projects={[]}
      setFilter={setFilter2 as never}
      setImportableOnly={setImportableOnly2}
    />,
  );
  outdated()!.click();
  expect((setFilter2.mock.calls as readonly unknown[][])[0]).toEqual([
    "status",
    [],
  ]);
});

test("SessionFilters: status 'All' chip resets the array to []", () => {
  const { container, setFilter } = harness({ status: ["outdated"] });
  // The "All" chip is the FIRST chip in the Status row. Find it via its
  // textContent within the chip group.
  const allChip = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.chip"),
  ).find((el) => el.textContent === "All" && el.getAttribute("aria-pressed") === "false");
  expect(allChip).not.toBeUndefined();
  allChip!.click();
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "status",
    [],
  ]);
});

test("SessionFilters: search input change calls setFilter('search', value)", () => {
  const { container, setFilter } = harness();
  const searchInput = container.querySelector<HTMLInputElement>(
    "#session-filters-search",
  );
  expect(searchInput).not.toBeNull();
  fireEvent.change(searchInput!, { target: { value: "needle" } });
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "search",
    "needle",
  ]);
});

test("SessionFilters: project datalist exposes options from the projects list", () => {
  const { container } = harness();
  const datalist = container.querySelector<HTMLDataListElement>(
    "#session-filters-project-list",
  );
  expect(datalist).not.toBeNull();
  const optionValues = Array.from(
    datalist!.querySelectorAll<HTMLOptionElement>("option"),
  ).map((o) => o.value);
  expect(optionValues).toEqual(["/p/alpha", "/p/beta"]);
});

test("SessionFilters: project clear button calls setFilter('project', null)", () => {
  const { container, setFilter } = harness({ project: "/p/alpha" });
  const clearBtn = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Clear project filter"]',
  );
  expect(clearBtn).not.toBeNull();
  clearBtn!.click();
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "project",
    null,
  ]);
});

test("SessionFilters: importableOnly toggle calls setImportableOnly with the new boolean", () => {
  const { container, setImportableOnly } = harness({ importableOnly: false });
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Show importable only"]',
  );
  expect(toggle).not.toBeNull();
  toggle!.click();
  expect(setImportableOnly).toHaveBeenCalledTimes(1);
  expect(
    (setImportableOnly.mock.calls as readonly unknown[][])[0]?.[0],
  ).toBe(true);
});

test("SessionFilters: importableOnly toggle from on -> off", () => {
  const { container, setImportableOnly } = harness({ importableOnly: true });
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Show importable only"]',
  );
  toggle!.click();
  expect(
    (setImportableOnly.mock.calls as readonly unknown[][])[0]?.[0],
  ).toBe(false);
});

test("SessionFilters: sort field <select> change calls setFilter('sort', {field, direction})", () => {
  const { container, setFilter } = harness();
  const fieldSelect = container.querySelector<HTMLSelectElement>(
    "#session-filters-sort-field",
  );
  expect(fieldSelect).not.toBeNull();
  fireEvent.change(fieldSelect!, { target: { value: "title" } });
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "sort",
    { field: "title", direction: "desc" },
  ]);
});

test("SessionFilters: sort direction <select> change calls setFilter('sort', {field, direction})", () => {
  const { container, setFilter } = harness();
  const directionSelect = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Sort direction"]',
  );
  expect(directionSelect).not.toBeNull();
  fireEvent.change(directionSelect!, { target: { value: "asc" } });
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "sort",
    { field: "source_updated_at", direction: "asc" },
  ]);
});

test("SessionFilters: search clear button calls setFilter('search', '')", () => {
  const { container, setFilter } = harness({ search: "needle" });
  const clearBtn = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Clear search"]',
  );
  expect(clearBtn).not.toBeNull();
  clearBtn!.click();
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect((setFilter.mock.calls as readonly unknown[][])[0]).toEqual([
    "search",
    "",
  ]);
});

test("SessionFilters: active tool chip carries .chip.active + aria-pressed=true", () => {
  const { container } = harness({ tool: "codex" });
  const codexChip = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.chip"),
  ).find((el) => el.textContent === "Codex");
  expect(codexChip).not.toBeUndefined();
  expect(codexChip!.classList.contains("active")).toBe(true);
  expect(codexChip!.getAttribute("aria-pressed")).toBe("true");
});

// =============================================================
// M1b: <details> wrap below 1100 px + active-filter-count chip.
// =============================================================

test("SessionFilters M1b: above 1100 px renders inline (the <details> wrapper carries open=true)", () => {
  setMediaMatch("(min-width: 1100px)", true);
  const { container } = harness();
  const details = container.querySelector<HTMLDetailsElement>(
    "details.filters-wrap",
  );
  expect(details).not.toBeNull();
  // open attribute is true above 1100 px (default open band).
  expect(details!.hasAttribute("open")).toBe(true);
  // Filter body still renders.
  expect(container.querySelector(".session-filters")).not.toBeNull();
  // Sanity: the body carries the role="group" wrapper that Phase 4
  // installed for assistive tech.
  expect(
    container.querySelector('[role="group"][aria-label="Session filters"]'),
  ).not.toBeNull();
});

test("SessionFilters M1b: below 1100 px wraps in <details open=false> by default", () => {
  setMediaMatch("(min-width: 1100px)", false);
  const { container } = harness();
  const details = container.querySelector<HTMLDetailsElement>(
    "details.filters-wrap",
  );
  expect(details).not.toBeNull();
  expect(details!.hasAttribute("open")).toBe(false);
});

test("SessionFilters M1b: <details> user-toggle persists across resize events that stay below 1100 px", () => {
  // Start below the breakpoint; the disclosure defaults closed.
  setMediaMatch("(min-width: 1100px)", false);
  const { container } = harness();
  const details = container.querySelector<HTMLDetailsElement>(
    "details.filters-wrap",
  );
  expect(details).not.toBeNull();
  expect(details!.hasAttribute("open")).toBe(false);
  // User opens the disclosure manually — emulate the native `<details>`
  // toggle by setting `open` on the element AND firing the `toggle`
  // event so React's onToggle handler runs.
  act(() => {
    details!.open = true;
    const Ctor = (
      globalThis as unknown as { window: { Event: typeof Event } }
    ).window.Event;
    details!.dispatchEvent(new Ctor("toggle", { bubbles: false }));
  });
  expect(details!.hasAttribute("open")).toBe(true);
  // Fire a resize that STAYS below 1100 px. The matchMedia listener
  // is wired with `change`; firing change with the same matches value
  // is a no-op for the breakpoint-cross state. The disclosure must
  // stay open.
  act(() => {
    setMediaMatch("(min-width: 1100px)", false);
  });
  expect(details!.hasAttribute("open")).toBe(true);
});

test("SessionFilters M1b: crossing the 1100 px breakpoint upward forces the disclosure open (new band default)", () => {
  setMediaMatch("(min-width: 1100px)", false);
  const { container } = harness();
  const details = container.querySelector<HTMLDetailsElement>(
    "details.filters-wrap",
  );
  expect(details!.hasAttribute("open")).toBe(false);
  // Cross the breakpoint upward — the new band's default is open.
  act(() => {
    setMediaMatch("(min-width: 1100px)", true);
  });
  expect(details!.hasAttribute("open")).toBe(true);
});

test("SessionFilters M1b: chip suppressed when count = 0 (default filters)", () => {
  setMediaMatch("(min-width: 1100px)", false);
  const { container } = harness();
  expect(container.querySelector(".filter-count-chip")).toBeNull();
});

test("SessionFilters M1b: chip renders for each of the 7 axes individually", () => {
  setMediaMatch("(min-width: 1100px)", false);
  // Each axis individually flipped from default → chip count 1.
  const axes: Array<Partial<SessionFiltersState>> = [
    { tool: "codex" },
    { storage: "stored" },
    { status: ["outdated"] },
    { project: "/p/alpha" },
    { search: "needle" },
    { importableOnly: true },
    { sort: { field: "title", direction: "asc" } },
  ];
  for (const overrides of axes) {
    const { container } = harness(overrides);
    const chip = container.querySelector(".filter-count-chip");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe("1 active");
    cleanup();
  }
});

test("SessionFilters M1b: chip count is 7 when ALL axes differ from default", () => {
  setMediaMatch("(min-width: 1100px)", false);
  const { container } = harness({
    tool: "codex",
    storage: "stored",
    status: ["outdated"],
    project: "/p/alpha",
    search: "needle",
    importableOnly: true,
    sort: { field: "title", direction: "asc" },
  });
  const chip = container.querySelector(".filter-count-chip");
  expect(chip).not.toBeNull();
  expect(chip?.textContent).toBe("7 active");
});

test("SessionFilters M1b: <details> summary has accessible name 'Filters' below 1100 px (codex round 1 fix)", () => {
  // Below the breakpoint the <summary> is the visible disclosure
  // toggle; screen-reader users need an accessible name describing
  // what is being expanded/collapsed. Round-1 codex review caught
  // the previous `aria-hidden="true"` wrap which left the summary
  // either nameless (count=0) or labeled only with the count chip
  // (count>0).
  setMediaMatch("(min-width: 1100px)", false);
  const { container } = harness();
  const summary = container.querySelector<HTMLElement>(
    "details.filters-wrap > summary",
  );
  expect(summary).not.toBeNull();
  // The "Filters" label MUST be present in the accessible text — the
  // simplest assertion is that it lives in `textContent` AND that no
  // descendant carries `aria-hidden="true"` masking it from the AT.
  expect(summary!.textContent).toMatch(/Filters/);
  const filtersSpan = Array.from(summary!.querySelectorAll("span")).find(
    (el) => el.textContent === "Filters",
  );
  expect(filtersSpan).not.toBeUndefined();
  expect(filtersSpan!.getAttribute("aria-hidden")).toBeNull();
});

test("SessionFilters M1b: summary accessible name includes count when filters are active (codex round 1 fix)", () => {
  // When the count chip renders ("3 active"), the summary's
  // accessible name reads "Filters 3 active" (the visible "Filters"
  // text + the chip text), so screen-reader users hear both the
  // section name and the active-count summary on the disclosure.
  setMediaMatch("(min-width: 1100px)", false);
  const { container } = harness({
    tool: "codex",
    storage: "stored",
    status: ["outdated"],
  });
  const summary = container.querySelector<HTMLElement>(
    "details.filters-wrap > summary",
  );
  expect(summary).not.toBeNull();
  expect(summary!.textContent).toMatch(/Filters/);
  expect(summary!.textContent).toMatch(/3 active/);
});

test("countActiveFilters: pure helper agrees with the 7-axis predicate table", () => {
  // 0: defaults
  expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  // 1: each axis flipped
  expect(countActiveFilters({ ...DEFAULT_FILTERS, tool: "codex" })).toBe(1);
  expect(countActiveFilters({ ...DEFAULT_FILTERS, storage: "stored" })).toBe(1);
  expect(
    countActiveFilters({ ...DEFAULT_FILTERS, status: ["outdated"] }),
  ).toBe(1);
  expect(
    countActiveFilters({ ...DEFAULT_FILTERS, project: "/p/alpha" }),
  ).toBe(1);
  expect(
    countActiveFilters({ ...DEFAULT_FILTERS, search: "needle" }),
  ).toBe(1);
  // Whitespace-only search counts as default (axis active predicate
  // is "non-empty after trim").
  expect(countActiveFilters({ ...DEFAULT_FILTERS, search: "   " })).toBe(0);
  expect(
    countActiveFilters({ ...DEFAULT_FILTERS, importableOnly: true }),
  ).toBe(1);
  expect(
    countActiveFilters({
      ...DEFAULT_FILTERS,
      sort: { field: "title", direction: "asc" },
    }),
  ).toBe(1);
  // Sort with same field but flipped direction also counts.
  expect(
    countActiveFilters({
      ...DEFAULT_FILTERS,
      sort: { field: "source_updated_at", direction: "asc" },
    }),
  ).toBe(1);
  // 7: all flipped
  expect(
    countActiveFilters({
      ...DEFAULT_FILTERS,
      tool: "codex",
      storage: "stored",
      status: ["outdated"],
      project: "/p/alpha",
      search: "needle",
      importableOnly: true,
      sort: { field: "title", direction: "asc" },
    }),
  ).toBe(7);
});
