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
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SessionFilters } from "./SessionFilters";
import { DEFAULT_FILTERS, type SessionFiltersState } from "./useSessionFilters";

afterEach(() => {
  cleanup();
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
  expect(setFilter.mock.calls[0]).toEqual(["tool", "codex"]);
});

test("SessionFilters: clicking a storage chip calls setFilter('storage', value)", () => {
  const { container, setFilter } = harness();
  const storedChip = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.chip"),
  ).find((el) => el.textContent === "Stored");
  expect(storedChip).not.toBeUndefined();
  storedChip!.click();
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect(setFilter.mock.calls[0]).toEqual(["storage", "stored"]);
});

test("SessionFilters: status chip toggle adds and removes from the array", () => {
  const { container, setFilter, rerender } = harness({ status: [] });
  const outdated = () =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>("button.chip"),
    ).find((el) => el.textContent === "Outdated");
  outdated()!.click();
  expect(setFilter.mock.calls[0]).toEqual(["status", ["outdated"]]);
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
  expect(setFilter2.mock.calls[0]).toEqual(["status", []]);
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
  expect(setFilter.mock.calls[0]).toEqual(["status", []]);
});

test("SessionFilters: search input change calls setFilter('search', value)", () => {
  const { container, setFilter } = harness();
  const searchInput = container.querySelector<HTMLInputElement>(
    "#session-filters-search",
  );
  expect(searchInput).not.toBeNull();
  fireEvent.change(searchInput!, { target: { value: "needle" } });
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect(setFilter.mock.calls[0]).toEqual(["search", "needle"]);
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
  expect(setFilter.mock.calls[0]).toEqual(["project", null]);
});

test("SessionFilters: importableOnly toggle calls setImportableOnly with the new boolean", () => {
  const { container, setImportableOnly } = harness({ importableOnly: false });
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Show importable only"]',
  );
  expect(toggle).not.toBeNull();
  toggle!.click();
  expect(setImportableOnly).toHaveBeenCalledTimes(1);
  expect(setImportableOnly.mock.calls[0]?.[0]).toBe(true);
});

test("SessionFilters: importableOnly toggle from on -> off", () => {
  const { container, setImportableOnly } = harness({ importableOnly: true });
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Show importable only"]',
  );
  toggle!.click();
  expect(setImportableOnly.mock.calls[0]?.[0]).toBe(false);
});

test("SessionFilters: sort field <select> change calls setFilter('sort', {field, direction})", () => {
  const { container, setFilter } = harness();
  const fieldSelect = container.querySelector<HTMLSelectElement>(
    "#session-filters-sort-field",
  );
  expect(fieldSelect).not.toBeNull();
  fireEvent.change(fieldSelect!, { target: { value: "title" } });
  expect(setFilter).toHaveBeenCalledTimes(1);
  expect(setFilter.mock.calls[0]).toEqual([
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
  expect(setFilter.mock.calls[0]).toEqual([
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
  expect(setFilter.mock.calls[0]).toEqual(["search", ""]);
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
