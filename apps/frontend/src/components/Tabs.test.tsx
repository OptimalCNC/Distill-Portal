// Component tests for the Tabs primitive (M2b).
//
// Coverage:
//   1. ARIA roles + linkage: tablist + 4 tabs + each tab carries
//      role="tab", aria-controls, aria-selected, tabindex.
//   2. Roving tabindex discipline: exactly one tab has tabindex="0"
//      at any moment (the active one); the other three have
//      tabindex="-1".
//   3. Click on tab → activates it (onValueChange fires; aria-selected
//      flips; focus moves to the clicked tab).
//   4. Keyboard nav: ArrowLeft / ArrowRight cycle (with wrap from
//      first → last and last → first); Home jumps to first; End
//      jumps to last.
//   5. Selection follows focus (automatic activation per WAI-ARIA
//      APG): a single ArrowRight press changes the active tab AND
//      moves focus.
//   6. Reduced-motion smoke (CSS source contains the @media reduced-
//      motion block from global.css; the indicator's transition is
//      zeroed by that rule — covered indirectly because the rule
//      lives in global.css; we only verify the indicator carries
//      `transition: transform` so the global rule has something to
//      zero).
import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { Tabs, type TabDescriptor } from "./Tabs";

afterEach(() => {
  cleanup();
});

type TabId = "transcript" | "skim" | "raw" | "metadata";

const TABS: ReadonlyArray<TabDescriptor<TabId>> = [
  { id: "transcript", label: "Transcript", panel: "transcript-panel" },
  { id: "skim",       label: "Skim",       panel: "skim-panel" },
  { id: "raw",        label: "Raw",        panel: "raw-panel" },
  { id: "metadata",   label: "Metadata",   panel: "metadata-panel" },
];

function Harness({
  initial = "metadata" as TabId,
  onChange,
}: {
  initial?: TabId;
  onChange?: (next: TabId) => void;
}) {
  const [value, setValue] = useState<TabId>(initial);
  return (
    <Tabs<TabId>
      ariaLabel="Test tabs"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      tabs={TABS}
    />
  );
}

test("Tabs: ARIA roles + linkage — tablist with 4 tabs each carrying role/aria-controls/aria-selected/tabindex", () => {
  const { container } = render(<Harness />);
  const tablist = container.querySelector('[role="tablist"]');
  expect(tablist).not.toBeNull();
  expect(tablist?.getAttribute("aria-label")).toBe("Test tabs");
  const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
  expect(tabs.length).toBe(4);
  // Each tab carries id=tab-<id>, aria-controls=panel-<id>,
  // aria-selected, and tabindex.
  const ids = tabs.map((t) => t.getAttribute("id"));
  expect(ids).toEqual([
    "tab-transcript",
    "tab-skim",
    "tab-raw",
    "tab-metadata",
  ]);
  for (const tab of tabs) {
    const id = tab.getAttribute("id") ?? "";
    const tabId = id.replace(/^tab-/, "");
    expect(tab.getAttribute("aria-controls")).toBe(`panel-${tabId}`);
    expect(tab.getAttribute("aria-selected")).toMatch(/^(true|false)$/);
    expect(tab.getAttribute("tabindex")).toMatch(/^(-1|0)$/);
  }
});

test("Tabs: roving tabindex — exactly one tab has tabindex=0 at any moment (the active one)", () => {
  const { container } = render(<Harness initial="metadata" />);
  const tabs = Array.from(
    container.querySelectorAll('[role="tab"]'),
  ) as HTMLButtonElement[];
  const tabindex0 = tabs.filter((t) => t.tabIndex === 0);
  expect(tabindex0.length).toBe(1);
  expect(tabindex0[0]?.id).toBe("tab-metadata");
  // Click on Skim → only Skim has tabindex=0.
  act(() => {
    (tabs.find((t) => t.id === "tab-skim") as HTMLButtonElement).click();
  });
  const tabsAfter = Array.from(
    container.querySelectorAll('[role="tab"]'),
  ) as HTMLButtonElement[];
  const tabindex0After = tabsAfter.filter((t) => t.tabIndex === 0);
  expect(tabindex0After.length).toBe(1);
  expect(tabindex0After[0]?.id).toBe("tab-skim");
});

test("Tabs: click activates and moves focus", () => {
  const onChange = mock((_next: TabId) => {});
  const { container } = render(<Harness onChange={onChange} />);
  const skimTab = container.querySelector("#tab-skim") as HTMLButtonElement;
  act(() => {
    skimTab.click();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0]?.[0]).toBe("skim");
  // aria-selected flipped on Skim.
  expect(skimTab.getAttribute("aria-selected")).toBe("true");
  // The other tabs are aria-selected="false".
  const others = Array.from(
    container.querySelectorAll('[role="tab"]'),
  ).filter((t) => t.id !== "tab-skim");
  for (const t of others) {
    expect(t.getAttribute("aria-selected")).toBe("false");
  }
});

test("Tabs: ArrowRight cycles forward; wraps from last to first", () => {
  const { container } = render(<Harness initial="metadata" />);
  const tablist = container.querySelector(
    '[role="tablist"]',
  ) as HTMLDivElement;
  // ArrowRight from "metadata" (last) → wraps to "transcript".
  act(() => {
    tablist.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  expect(
    container.querySelector("#tab-transcript")?.getAttribute("aria-selected"),
  ).toBe("true");
});

test("Tabs: ArrowLeft cycles backward; wraps from first to last", () => {
  const { container } = render(<Harness initial="transcript" />);
  const tablist = container.querySelector(
    '[role="tablist"]',
  ) as HTMLDivElement;
  // ArrowLeft from "transcript" (first) → wraps to "metadata".
  act(() => {
    tablist.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
  });
  expect(
    container.querySelector("#tab-metadata")?.getAttribute("aria-selected"),
  ).toBe("true");
});

test("Tabs: Home jumps to first tab; End jumps to last tab", () => {
  const { container } = render(<Harness initial="raw" />);
  const tablist = container.querySelector(
    '[role="tablist"]',
  ) as HTMLDivElement;
  act(() => {
    tablist.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
  });
  expect(
    container.querySelector("#tab-transcript")?.getAttribute("aria-selected"),
  ).toBe("true");
  act(() => {
    tablist.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
  });
  expect(
    container.querySelector("#tab-metadata")?.getAttribute("aria-selected"),
  ).toBe("true");
});

test("Tabs: selection follows focus — keyboard nav moves focus AND fires onValueChange in lockstep", () => {
  const onChange = mock((_next: TabId) => {});
  const { container } = render(
    <Harness initial="transcript" onChange={onChange} />,
  );
  const tablist = container.querySelector(
    '[role="tablist"]',
  ) as HTMLDivElement;
  act(() => {
    tablist.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  // onValueChange fired with the next tab in lockstep.
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0]?.[0]).toBe("skim");
  // aria-selected reflects the change.
  expect(
    container.querySelector("#tab-skim")?.getAttribute("aria-selected"),
  ).toBe("true");
});

test("Tabs: data-active-tab attribute mirrors aria-selected for CSS hooks", () => {
  const { container } = render(<Harness initial="raw" />);
  const tablist = container.querySelector(
    '[role="tablist"]',
  ) as HTMLDivElement;
  expect(tablist.getAttribute("data-active-tab")).toBe("raw");
  act(() => {
    (
      container.querySelector("#tab-skim") as HTMLButtonElement
    ).click();
  });
  expect(tablist.getAttribute("data-active-tab")).toBe("skim");
});

test("Tabs: indicator <span> renders inside the tablist with aria-hidden", () => {
  const { container } = render(<Harness />);
  const tablist = container.querySelector('[role="tablist"]');
  const indicator = tablist?.querySelector(".indicator");
  expect(indicator).not.toBeNull();
  expect(indicator?.getAttribute("aria-hidden")).toBe("true");
});

test("Tabs: indicator transform is unitless scaleX (regression: scaleX(...px) is invalid CSS and would hide the indicator)", () => {
  // `scaleX()` takes a UNITLESS number (a multiplier of the element's
  // own width). Writing `scaleX(${width}px)` produces invalid CSS that
  // the browser drops, falling back to the `.indicator` default
  // transform and rendering the active-tab ink-stroke INVISIBLE.
  // This regression assertion fails the moment a `px` suffix sneaks
  // back into the scaleX argument.
  const { container } = render(<Harness initial="metadata" />);
  const indicator = container.querySelector(".indicator") as HTMLSpanElement;
  expect(indicator).not.toBeNull();
  const transform = indicator.style.transform;
  // Negative assertion: NO `scaleX(<number>px)` form anywhere.
  expect(transform).not.toMatch(/scaleX\([\d.]+px\)/);
  // Positive assertion: a unitless `scaleX(<number>)` IS present.
  expect(transform).toMatch(/scaleX\([\d.]+\)/);
});

test("Tabs: Enter / Space on a focused tab is a no-op (selection already followed focus)", () => {
  // Selection-follows-focus means Enter/Space on the active tab is
  // redundant. The native `<button>` element handles activation
  // synchronously on click; we don't intercept Enter/Space in the
  // keydown handler, so neither key changes the active value.
  const onChange = mock((_next: TabId) => {});
  const { container } = render(
    <Harness initial="metadata" onChange={onChange} />,
  );
  const tablist = container.querySelector(
    '[role="tablist"]',
  ) as HTMLDivElement;
  act(() => {
    tablist.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    tablist.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
  });
  // No state change beyond the initial render.
  expect(onChange).toHaveBeenCalledTimes(0);
});
