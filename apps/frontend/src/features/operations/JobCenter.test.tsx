// Phase 9b M3-B — unit tests for `JobCenter.tsx`.
//
// Strategy: mount the component into happy-dom via RTL; assert DOM
// shape, ARIA hooks, dialog open/close transitions, focus management,
// empty states, divider visibility, and the three close paths
// (close-button click, backdrop click, native close event funnel).
// happy-dom provides showModal()/close() so the platform path is
// exercised in tests — no manual mock needed.

import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { Operation, OperationKind, OperationStatus } from "../../lib/contracts";
import { JobCenter } from "./JobCenter";

afterEach(() => {
  cleanup();
});

function makeOp(overrides: Partial<Operation>): Operation {
  return {
    id: "op-1",
    kind: "import_sessions" as OperationKind,
    status: "queued" as OperationStatus,
    canonical_params_hash: "deadbeef",
    input_version: "v1",
    params_json: {},
    result_json: null,
    error_json: null,
    submitted_at: "2026-05-18T13:59:55.000Z",
    started_at: null,
    finished_at: null,
    cancel_requested_at: null,
    ...overrides,
  };
}

// 1. Mount + open/close prop transitions ----------------------------

test("JobCenter mounts hidden when open=false (dialog has no open attribute)", () => {
  const { container } = render(
    <JobCenter
      open={false}
      onClose={() => {}}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const dialog = container.querySelector<HTMLDialogElement>("dialog#jc-dialog");
  expect(dialog).not.toBeNull();
  expect(dialog!.hasAttribute("open")).toBe(false);
});

test("JobCenter calls showModal() when open flips to true and close() when it flips back", () => {
  const { container, rerender } = render(
    <JobCenter
      open={false}
      onClose={() => {}}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const dialog = container.querySelector<HTMLDialogElement>("dialog#jc-dialog")!;
  expect(dialog.hasAttribute("open")).toBe(false);

  act(() => {
    rerender(
      <JobCenter
        open={true}
        onClose={() => {}}
        activeOps={[]}
        recentOps={[]}
        onCancel={() => {}}
      />,
    );
  });
  expect(dialog.hasAttribute("open")).toBe(true);

  act(() => {
    rerender(
      <JobCenter
        open={false}
        onClose={() => {}}
        activeOps={[]}
        recentOps={[]}
        onCancel={() => {}}
      />,
    );
  });
  expect(dialog.hasAttribute("open")).toBe(false);
});

// 2. Focus management -----------------------------------------------

test("JobCenter focuses the close button within one rAF after opening", async () => {
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  await waitFor(() => {
    const closeBtn = container.querySelector(".jc-close");
    expect(closeBtn).not.toBeNull();
    expect(document.activeElement).toBe(closeBtn);
  });
});

// 3. ARIA wiring ----------------------------------------------------

test("JobCenter header renders <h2 id='jc-dialog-title'>Job Center</h2>", () => {
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const h2 = container.querySelector("h2#jc-dialog-title");
  expect(h2).not.toBeNull();
  expect(h2!.textContent).toBe("Job Center");
});

test("JobCenter body region uses aria-live=polite + aria-labelledby pointing at the h2", () => {
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const body = container.querySelector(".jc-body");
  expect(body).not.toBeNull();
  expect(body!.getAttribute("role")).toBe("region");
  expect(body!.getAttribute("aria-live")).toBe("polite");
  expect(body!.getAttribute("aria-labelledby")).toBe("jc-dialog-title");
});

test("JobCenter dialog carries aria-labelledby='jc-dialog-title'", () => {
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const dialog = container.querySelector("dialog#jc-dialog");
  expect(dialog!.getAttribute("aria-labelledby")).toBe("jc-dialog-title");
});

// 4. Sections + counts -----------------------------------------------

test("JobCenter renders Active and Recent sections with their counts when both populated", () => {
  const active = [makeOp({ id: "a1", status: "running" })];
  const recent = [
    makeOp({ id: "r1", status: "succeeded", result_json: { imported: 1, skipped: 0, failed: 0 } }),
    makeOp({ id: "r2", status: "failed", error_json: { message: "x" } }),
  ];
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={active}
      recentOps={recent}
      onCancel={() => {}}
    />,
  );
  const titles = Array.from(container.querySelectorAll(".jc-section-title")).map(
    (n) => n.textContent,
  );
  // Each title contains "Active <count>" or "Recent <count>".
  expect(titles[0]).toContain("Active");
  expect(titles[0]).toContain("1");
  expect(titles[1]).toContain("Recent");
  expect(titles[1]).toContain("2");
});

// 5. Empty states ---------------------------------------------------

test("JobCenter shows tray-wide 'No operations.' when both sections are empty", () => {
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const empty = container.querySelector(".jc-empty.jc-empty-tray");
  expect(empty).not.toBeNull();
  expect(empty!.textContent).toBe("No operations.");
  // Per-section sections must NOT render in this state.
  expect(container.querySelector(".jc-section-active")).toBeNull();
  expect(container.querySelector(".jc-section-recent")).toBeNull();
});

test("JobCenter shows 'No active operations.' when only active is empty", () => {
  const recent = [
    makeOp({ id: "r1", status: "succeeded", result_json: { imported: 0, skipped: 0, failed: 0 } }),
  ];
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={[]}
      recentOps={recent}
      onCancel={() => {}}
    />,
  );
  // Tray-wide empty MUST NOT render.
  expect(container.querySelector(".jc-empty-tray")).toBeNull();
  // Active section empty copy renders inside that section.
  const active = container.querySelector(".jc-section-active");
  expect(active).not.toBeNull();
  expect(active!.querySelector(".jc-empty")!.textContent).toBe(
    "No active operations.",
  );
});

test("JobCenter shows 'No recent operations.' when only recent is empty", () => {
  const active = [makeOp({ id: "a1", status: "running" })];
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={active}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  expect(container.querySelector(".jc-empty-tray")).toBeNull();
  const recent = container.querySelector(".jc-section-recent");
  expect(recent).not.toBeNull();
  expect(recent!.querySelector(".jc-empty")!.textContent).toBe(
    "No recent operations.",
  );
});

// 6. Section divider visibility -------------------------------------

test("JobCenter renders .jc-section-divider only when BOTH sections have content", () => {
  const active = [makeOp({ id: "a1", status: "running" })];
  const recent = [
    makeOp({ id: "r1", status: "succeeded", result_json: { imported: 1, skipped: 0, failed: 0 } }),
  ];
  const { container, rerender } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={active}
      recentOps={recent}
      onCancel={() => {}}
    />,
  );
  expect(container.querySelector(".jc-section-divider")).not.toBeNull();

  // Only active populated -> divider hidden.
  act(() => {
    rerender(
      <JobCenter
        open={true}
        onClose={() => {}}
        activeOps={active}
        recentOps={[]}
        onCancel={() => {}}
      />,
    );
  });
  expect(container.querySelector(".jc-section-divider")).toBeNull();

  // Only recent populated -> divider hidden.
  act(() => {
    rerender(
      <JobCenter
        open={true}
        onClose={() => {}}
        activeOps={[]}
        recentOps={recent}
        onCancel={() => {}}
      />,
    );
  });
  expect(container.querySelector(".jc-section-divider")).toBeNull();

  // Both empty -> divider hidden (whole-tray empty state).
  act(() => {
    rerender(
      <JobCenter
        open={true}
        onClose={() => {}}
        activeOps={[]}
        recentOps={[]}
        onCancel={() => {}}
      />,
    );
  });
  expect(container.querySelector(".jc-section-divider")).toBeNull();
});

// 7. Close paths ----------------------------------------------------

test("JobCenter Close button fires onClose", () => {
  const onClose = mock(() => {});
  const { container } = render(
    <JobCenter
      open={true}
      onClose={onClose}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const closeBtn = container.querySelector<HTMLButtonElement>(".jc-close")!;
  fireEvent.click(closeBtn);
  expect(onClose).toHaveBeenCalled();
});

test("JobCenter backdrop click (target === dialog) closes the dialog → onClose", () => {
  const onClose = mock(() => {});
  const { container } = render(
    <JobCenter
      open={true}
      onClose={onClose}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const dialog = container.querySelector<HTMLDialogElement>("dialog#jc-dialog")!;
  // Synthesize a click whose target is the dialog itself (backdrop
  // clicks bubble that way per the W3C native-dialog contract).
  fireEvent.click(dialog, { target: dialog });
  // The handler calls dialog.close(), which dispatches the native
  // close event, which routes through our useEffect into onClose.
  expect(onClose).toHaveBeenCalled();
});

test("JobCenter routes the native close event through onClose (Escape path)", () => {
  const onClose = mock(() => {});
  const { container } = render(
    <JobCenter
      open={true}
      onClose={onClose}
      activeOps={[]}
      recentOps={[]}
      onCancel={() => {}}
    />,
  );
  const dialog = container.querySelector<HTMLDialogElement>("dialog#jc-dialog")!;
  // Simulate the native Escape close path: the platform calls
  // dialog.close() which dispatches a `close` Event. We can drive
  // the same code path by calling close() directly on the element.
  act(() => {
    dialog.close();
  });
  expect(onClose).toHaveBeenCalled();
});

// 8. Card-list shape -----------------------------------------------

test("JobCenter renders one .jc-card per op inside .jc-card-list", () => {
  const active = [
    makeOp({ id: "a1", status: "running" }),
    makeOp({ id: "a2", status: "queued" }),
  ];
  const recent = [
    makeOp({ id: "r1", status: "succeeded", result_json: { imported: 1, skipped: 0, failed: 0 } }),
  ];
  const { container } = render(
    <JobCenter
      open={true}
      onClose={() => {}}
      activeOps={active}
      recentOps={recent}
      onCancel={() => {}}
    />,
  );
  const activeList = container.querySelector(".jc-section-active .jc-card-list");
  const recentList = container.querySelector(".jc-section-recent .jc-card-list");
  expect(activeList!.querySelectorAll(".jc-card").length).toBe(2);
  expect(recentList!.querySelectorAll(".jc-card").length).toBe(1);
});
