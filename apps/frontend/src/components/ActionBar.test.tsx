// Disabled-state + report-rendering truth table for ActionBar.
//
// ActionBar is stateless: `App.tsx` owns every piece of state it displays
// and passes it down as props. This file pins down the rendering rules
// for the five observable behaviors below:
//
//   (1) disabled-state truth table for the Rescan / Import buttons as a
//       function of `pending` and `selectedCount`;
//   (2) Import label carries the live `selectedCount` in the idle case
//       and the "Importing N..." form while a mutation is in flight;
//   (3) Rescan label flips to "Rescanning..." while a rescan is pending;
//   (4) the report summary renders the typed RescanReport / ImportReport
//       numeric fields in the idle-null-error-rescan-import cross
//       product;
//   (5) clicking an enabled Rescan button invokes `onRescan` exactly
//       once (one handler-dispatch sanity assertion).
//
// Fixtures are typed from the generated contract so a Rust-side rename
// of any `RescanReport` / `ImportReport` field fails the TS compile
// here. The component renders the literal `No recent mutation.` when
// `lastReport === null`, so that exact string is asserted rather than
// the "no text at all" shape an earlier draft suggested — reading
// the component's idle branch is authoritative.
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ActionBar } from "./ActionBar";
import type { ImportReport, RescanReport } from "../lib/contracts";

afterEach(() => {
  cleanup();
});

const RESCAN_FIXTURE: RescanReport = {
  discovered_files: 12,
  skipped_files: 1,
  parsed_sessions: 11,
  not_stored_sessions: 2,
  outdated_sessions: 0,
  up_to_date_sessions: 9,
  scan_errors: 0,
};

const IMPORT_FIXTURE: ImportReport = {
  requested_sessions: 3,
  inserted_sessions: 2,
  updated_sessions: 1,
  unchanged_sessions: 0,
};

// Narrow helper: locate the two action-bar buttons in the rendered DOM.
// `nth-of-type` is used to match the existing App.test.tsx convention so
// a future reorder of the two buttons surfaces in both suites at once.
function buttons(container: HTMLElement) {
  const all = container.querySelectorAll<HTMLButtonElement>(
    ".action-bar button",
  );
  if (all.length !== 2) {
    throw new Error(`expected 2 action-bar buttons, got ${all.length}`);
  }
  return { rescan: all[0]!, import: all[1]! };
}

function statusNode(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[role="status"]');
  if (!el) throw new Error("action-bar status node not found");
  return el;
}

test("ActionBar idle + zero selection: Rescan enabled, Import disabled, count in label", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      lastReport={null}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const { rescan, import: importBtn } = buttons(container);
  expect(rescan.disabled).toBe(false);
  expect(rescan.textContent).toBe("Rescan");
  expect(importBtn.disabled).toBe(true);
  expect(importBtn.textContent).toBe("Import selected (0)");
  // lastReport === null: the status node renders the canonical idle copy.
  expect(statusNode(container).textContent).toBe("No recent mutation.");
});

test("ActionBar idle + non-zero selection: both buttons enabled, count in label", () => {
  const { container } = render(
    <ActionBar
      selectedCount={3}
      pending={null}
      lastReport={null}
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
      lastReport={null}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const { rescan, import: importBtn } = buttons(container);
  expect(rescan.disabled).toBe(true);
  expect(importBtn.disabled).toBe(true);
  // Actual component copy — "Rescanning..." with ASCII ellipsis.
  expect(rescan.textContent).toBe("Rescanning...");
});

test("ActionBar pending=import disables both buttons and flips Import label", () => {
  const { container } = render(
    <ActionBar
      selectedCount={2}
      pending="import"
      lastReport={null}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const { rescan, import: importBtn } = buttons(container);
  expect(rescan.disabled).toBe(true);
  expect(importBtn.disabled).toBe(true);
  // Pending-import label embeds the live selectedCount via template.
  expect(importBtn.textContent).toBe("Importing 2...");
});

test("ActionBar renders typed RescanReport numeric fields in the status node", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      lastReport={{ kind: "rescan", report: RESCAN_FIXTURE }}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const text = statusNode(container).textContent ?? "";
  // Shape prefix + the two numeric fields the spec explicitly calls out.
  expect(text.startsWith("Rescan:")).toBe(true);
  expect(text.includes("12 discovered_files")).toBe(true);
  expect(text.includes("11 parsed_sessions")).toBe(true);
  // Spot-check one more typed field so a future rename of not_stored_sessions
  // in the Rust source-of-truth fails this test as well as the TS compile.
  expect(text.includes("2 not_stored_sessions")).toBe(true);
});

test("ActionBar renders typed ImportReport numeric fields in the status node", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      lastReport={{ kind: "import", report: IMPORT_FIXTURE }}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  const text = statusNode(container).textContent ?? "";
  expect(text.startsWith("Import:")).toBe(true);
  expect(text.includes("3 requested_sessions")).toBe(true);
  expect(text.includes("2 inserted_sessions")).toBe(true);
  expect(text.includes("1 updated_sessions")).toBe(true);
});

test("ActionBar renders the error message verbatim when lastReport.kind === 'error'", () => {
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      lastReport={{ kind: "error", message: "something went wrong" }}
      onRescan={() => {}}
      onImport={() => {}}
    />,
  );
  expect(statusNode(container).textContent).toBe("something went wrong");
});

test("ActionBar dispatches onRescan exactly once when Rescan is clicked", () => {
  const onRescan = mock(() => {});
  const onImport = mock(() => {});
  const { container } = render(
    <ActionBar
      selectedCount={0}
      pending={null}
      lastReport={null}
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
      lastReport={null}
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
      lastReport={null}
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
      lastReport={null}
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
      lastReport={null}
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
      lastReport={null}
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
