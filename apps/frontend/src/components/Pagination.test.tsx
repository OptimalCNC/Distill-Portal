// Pagination component test surface.
//
// Coverage:
//   (1) "Page N of M" caption math for representative tuples.
//   (2) Prev disabled at page 0; Next disabled on the last page.
//   (3) Prev / Next dispatch with the next 0-based pageIndex.
//   (4) Page-size selector emits the typed PageSize value (number,
//       not string) and triggers onChangePageSize.
//   (5) totalRows === 0 still renders "Page 1 of 1" and disables both
//       Prev and Next (single-page boundary).
//   (6) totalRows < pageSize renders "Page 1 of 1".
//   (7) Out-of-range pageIndex (passed in deliberately) is clamped
//       in the caption display so the UI doesn't show "Page 5 of 3".
//
// The component is presentational; we don't try to drive state from
// here, only verify the renders and the dispatch shapes.
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { Pagination } from "./Pagination";

afterEach(() => {
  cleanup();
});

function findCaption(container: HTMLElement): string {
  const caption = container.querySelector(".pagination-caption");
  if (caption === null) throw new Error("pagination-caption not found");
  return caption.textContent ?? "";
}

function findButtons(container: HTMLElement) {
  const prev = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Previous page"]',
  );
  const next = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Next page"]',
  );
  if (prev === null || next === null) {
    throw new Error("prev/next pagination buttons not found");
  }
  return { prev, next };
}

test("Pagination: 100 rows / pageSize 50 / pageIndex 0 -> Page 1 of 2; Prev disabled, Next enabled", () => {
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={0}
      totalRows={100}
      onChangePageSize={() => {}}
      onChangePage={() => {}}
    />,
  );
  expect(findCaption(container)).toBe("Page 1 of 2");
  const { prev, next } = findButtons(container);
  expect(prev.disabled).toBe(true);
  expect(next.disabled).toBe(false);
});

test("Pagination: 100 rows / pageSize 50 / pageIndex 1 -> Page 2 of 2; Prev enabled, Next disabled", () => {
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={1}
      totalRows={100}
      onChangePageSize={() => {}}
      onChangePage={() => {}}
    />,
  );
  expect(findCaption(container)).toBe("Page 2 of 2");
  const { prev, next } = findButtons(container);
  expect(prev.disabled).toBe(false);
  expect(next.disabled).toBe(true);
});

test("Pagination: 500 rows / pageSize 50 / pageIndex 4 -> Page 5 of 10; both Prev + Next enabled", () => {
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={4}
      totalRows={500}
      onChangePageSize={() => {}}
      onChangePage={() => {}}
    />,
  );
  expect(findCaption(container)).toBe("Page 5 of 10");
  const { prev, next } = findButtons(container);
  expect(prev.disabled).toBe(false);
  expect(next.disabled).toBe(false);
});

test("Pagination: Prev/Next click dispatches the adjacent index", () => {
  const onChangePage = mock<(p: number) => void>(() => {});
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={3}
      totalRows={500}
      onChangePageSize={() => {}}
      onChangePage={onChangePage}
    />,
  );
  const { prev, next } = findButtons(container);
  prev.click();
  expect(onChangePage).toHaveBeenLastCalledWith(2);
  next.click();
  expect(onChangePage).toHaveBeenLastCalledWith(4);
  expect(onChangePage.mock.calls.length).toBe(2);
});

test("Pagination: page-size selector emits the typed numeric value", () => {
  const onChangePageSize = mock<(s: 50 | 100 | 200) => void>(() => {});
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={0}
      totalRows={500}
      onChangePageSize={onChangePageSize}
      onChangePage={() => {}}
    />,
  );
  const select = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Page size"]',
  );
  expect(select).not.toBeNull();
  // Simulate the user picking 200.
  select!.value = "200";
  select!.dispatchEvent(new Event("change", { bubbles: true }));
  expect(onChangePageSize).toHaveBeenCalledWith(200);
});

test("Pagination: page-size options always include 50/100/200", () => {
  const { container } = render(
    <Pagination
      pageSize={100}
      pageIndex={0}
      totalRows={500}
      onChangePageSize={() => {}}
      onChangePage={() => {}}
    />,
  );
  const select = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Page size"]',
  );
  expect(select).not.toBeNull();
  const options = Array.from(select!.querySelectorAll("option")).map(
    (o) => Number(o.value),
  );
  expect(options).toEqual([50, 100, 200]);
  expect(select!.value).toBe("100");
});

test("Pagination: totalRows === 0 still renders Page 1 of 1; both buttons disabled", () => {
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={0}
      totalRows={0}
      onChangePageSize={() => {}}
      onChangePage={() => {}}
    />,
  );
  expect(findCaption(container)).toBe("Page 1 of 1");
  const { prev, next } = findButtons(container);
  expect(prev.disabled).toBe(true);
  expect(next.disabled).toBe(true);
});

test("Pagination: totalRows < pageSize -> Page 1 of 1", () => {
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={0}
      totalRows={7}
      onChangePageSize={() => {}}
      onChangePage={() => {}}
    />,
  );
  expect(findCaption(container)).toBe("Page 1 of 1");
});

test("Pagination: pageIndex past last is clamped in the caption", () => {
  // Caller passes a stale pageIndex (e.g. set state lagged behind a
  // shrunk row set); the component should not display "Page 99 of 3".
  // The caller will sync state from applyPagination's clamped value
  // on the next render, but the component should not show a nonsense
  // intermediate value either.
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={99}
      totalRows={101}
      onChangePageSize={() => {}}
      onChangePage={() => {}}
    />,
  );
  expect(findCaption(container)).toBe("Page 3 of 3");
});

test("Pagination: pageIndex negative is clamped in the caption", () => {
  const { container } = render(
    <Pagination
      pageSize={50}
      pageIndex={-1}
      totalRows={100}
      onChangePageSize={() => {}}
      onChangePage={() => {}}
    />,
  );
  expect(findCaption(container)).toBe("Page 1 of 2");
});
