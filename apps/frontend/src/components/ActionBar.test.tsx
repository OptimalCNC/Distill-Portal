// Disabled-state + caption truth table for ActionBar.
//
// ActionBar is stateless: `App.tsx` owns every piece of state it
// displays and passes it down as props. As of M5 the inline
// `lastReport` text was replaced by toasts (see `Toast` +
// `useToastQueue`); the rendering rules covered here are now:
//
//   (1) disabled-state truth table for the Rescan / Import buttons as a
//       function of `pending` and `selectedCount`;
//   (2) Import label carries the live `selectedCount` in the idle case
//       and the "Importing N..." form while a mutation is in flight;
//   (3) Rescan label flips to "Rescanning..." while a rescan is pending;
//   (4) clicking an enabled Rescan button invokes `onRescan` exactly once
//       (one handler-dispatch sanity assertion);
//   (5) M3 hidden-by-filter caption + clear affordances;
//   (6) M5 last-rescan caption renders the relative-time form against
//       a pinned `now`; renders the em-dash fallback when
//       `lastRescanAt` is null OR when `now` is omitted (M3-shaped
//       callers that don't pass it yet).
//   (7) The action-bar root element carries the `.sticky` modifier
//       so CSS `position: sticky` engages.
//
// The renderReport-shape assertions from M3 have moved to the toast
// suite (`Toast.test.tsx`) and the App-level toast assertions in
// `App.test.tsx`. ActionBar no longer renders `<p role="status">`.
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ActionBar } from "./ActionBar";

afterEach(() => {
  cleanup();
});

// Narrow helper: locate the Rescan + Import buttons in the rendered
// DOM. They are always the first two `<button>` children of
// `.action-bar-buttons`. M5 added more children (.action-bar-clear,
// .action-bar-last-rescan span); the n-th-of-type query targets
// just the two mutation buttons.
function buttons(container: HTMLElement) {
  const all = container.querySelectorAll<HTMLButtonElement>(
    ".action-bar-buttons > button",
  );
  // At minimum the Rescan + Import buttons are present; M3 adds
  // optional Clear hidden / Clear selection text-style buttons.
  if (all.length < 2) {
    throw new Error(`expected ≥ 2 action-bar buttons, got ${all.length}`);
  }
  return { rescan: all[0]!, import: all[1]! };
}

test("ActionBar idle + zero selection: Rescan enabled, Import disabled, count in label", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const { rescan, import: importBtn } = buttons(container);
  expect(rescan.disabled).toBe(false);
  expect(rescan.textContent).toBe("Rescan");
  expect(importBtn.disabled).toBe(true);
  expect(importBtn.textContent).toBe("Import selected (0)");
  // No status node — toasts replace the inline report copy.
  expect(container.querySelector('[role="status"]')).toBeNull();
});

test("ActionBar idle + non-zero selection: both buttons enabled, count in label", () => {
  const { container } = render(
    <ActionBar
      selectedCount={3}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const { rescan, import: importBtn } = buttons(container);
  expect(rescan.disabled).toBe(false);
  expect(importBtn.disabled).toBe(false);
  expect(importBtn.textContent).toBe("Import selected (3)");
});

test("ActionBar pending=rescan disables both buttons and flips Rescan label", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending="rescan"
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const { rescan, import: importBtn } = buttons(container);
  expect(rescan.disabled).toBe(true);
  expect(importBtn.disabled).toBe(true);
  expect(rescan.textContent).toBe("Rescanning...");
});

test("ActionBar pending=import disables both buttons and flips Import label", () => {
  const { container } = render(
    <ActionBar
      selectedCount={2}
      pending="import"
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const { rescan, import: importBtn } = buttons(container);
  expect(rescan.disabled).toBe(true);
  expect(importBtn.disabled).toBe(true);
  expect(importBtn.textContent).toBe("Importing 2...");
});

test("ActionBar dispatches onRescan exactly once when Rescan is clicked", () => {
  const onRescan = mock(() => {});
  const onImport = mock(() => {});
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      onRescan={onRescan}
      onImport={onImport}
    />,
  );
  const { rescan } = buttons(container);
  rescan.click();
  expect(onRescan).toHaveBeenCalledTimes(1);
  expect(onImport).toHaveBeenCalledTimes(0);
});

test("ActionBar: hiddenByFilterCount > 0 renders the +K caption (M3)", () => {
  const { container } = render(
    <ActionBar
      selectedCount={2}
      hiddenByFilterCount={3}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
      onClearHidden={() => {}}
      onClearSelection={() => {}}
    />,
  );
  const caption = container.querySelector(".action-bar-hidden-caption");
  expect(caption).not.toBeNull();
  expect(caption?.textContent).toBe("+3 hidden by filters");
});

test("ActionBar: hiddenByFilterCount === 0 (or omitted) does NOT render the caption", () => {
  const { container } = render(
    <ActionBar
      selectedCount={2}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  expect(container.querySelector(".action-bar-hidden-caption")).toBeNull();
});

test("ActionBar: Clear hidden button shown when hiddenByFilterCount > 0 + onClearHidden provided", () => {
  const onClearHidden = mock(() => {});
  const { container } = render(
    <ActionBar
      selectedCount={2}
      hiddenByFilterCount={3}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
      onClearHidden={onClearHidden}
      onClearSelection={() => {}}
    />,
  );
  const clearHidden = Array.from(
    container.querySelectorAll<HTMLButtonElement>(".action-bar-clear"),
  ).find((btn) => btn.textContent === "Clear hidden");
  expect(clearHidden).not.toBeUndefined();
  clearHidden!.click();
  expect(onClearHidden).toHaveBeenCalledTimes(1);
});

test("ActionBar: Clear selection button shown when selectedCount > 0", () => {
  const onClearSelection = mock(() => {});
  const { container } = render(
    <ActionBar
      selectedCount={2}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
      onClearSelection={onClearSelection}
    />,
  );
  const clearSelection = Array.from(
    container.querySelectorAll<HTMLButtonElement>(".action-bar-clear"),
  ).find((btn) => btn.textContent === "Clear selection");
  expect(clearSelection).not.toBeUndefined();
  clearSelection!.click();
  expect(onClearSelection).toHaveBeenCalledTimes(1);
});

test("ActionBar: zero selection AND zero hidden -> no Clear affordances", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      hiddenByFilterCount={0}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
      onClearHidden={() => {}}
      onClearSelection={() => {}}
    />,
  );
  expect(
    container.querySelectorAll(".action-bar-clear").length,
  ).toBe(0);
});

test("ActionBar (M5): root carries the .sticky modifier so CSS position:sticky engages", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const bar = container.querySelector(".action-bar");
  expect(bar).not.toBeNull();
  expect(bar!.classList.contains("sticky")).toBe(true);
});

test("ActionBar (M5): last-rescan caption renders relative-time when lastRescanAt and now are provided", () => {
  // 90 seconds in the past -> "1m ago"
  const now = "2026-04-25T12:00:00.000Z";
  const lastRescanAt = "2026-04-25T11:58:30.000Z";
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
      lastRescanAt={lastRescanAt}
      now={now}
    />,
  );
  const caption = container.querySelector(".action-bar-last-rescan");
  expect(caption).not.toBeNull();
  expect(caption!.textContent).toBe(
    "last rescan from this browser 1m ago",
  );
  expect(caption!.getAttribute("title")).toBe(lastRescanAt);
});

test("ActionBar (M5): last-rescan caption renders the em-dash when lastRescanAt is null", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
      lastRescanAt={null}
      now="2026-04-25T12:00:00.000Z"
    />,
  );
  const caption = container.querySelector(".action-bar-last-rescan");
  expect(caption).not.toBeNull();
  expect(caption!.textContent).toBe("last rescan from this browser —");
});

test("ActionBar (M5): last-rescan caption renders em-dash when both lastRescanAt and now are omitted (default)", () => {
  // Backward-compatible call shape — callers that don't yet wire
  // lastRescanAt/now still see the labelled caption with the em-dash
  // instead of an empty string or "Invalid Date".
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const caption = container.querySelector(".action-bar-last-rescan");
  expect(caption).not.toBeNull();
  expect(caption!.textContent).toBe("last rescan from this browser —");
});
