// Phase 9b M3-B — unit tests for `OperationCard.tsx`.
//
// Strategy: render the component into a happy-dom container via RTL,
// assert the DOM shape against the 54-item M1 checklist. The 7 status
// variants are exercised explicitly so the regression surface covers
// the pill recipe matrix. The relative-time helper is unit-tested in
// isolation; the helper is exported from OperationCard.tsx (no
// separate file) so the import path stays inside the 6-file
// allow-list.

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Operation, OperationKind, OperationStatus } from "../../lib/contracts";
import { OperationCard, formatRelativeTime } from "./OperationCard";

afterEach(() => {
  cleanup();
});

// Fixtures ------------------------------------------------------------

const NOW_MS = Date.parse("2026-05-18T14:00:00.000Z");

function fixedNow<T>(fn: () => T): T {
  const original = Date.now;
  Date.now = () => NOW_MS;
  try {
    return fn();
  } finally {
    Date.now = original;
  }
}

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

// 1. Status variant rendering ----------------------------------------

const STATUSES: OperationStatus[] = [
  "queued",
  "running",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
];

for (const status of STATUSES) {
  test(`OperationCard renders .jc-pill.${status} for status "${status}"`, () => {
    const op = makeOp({
      status,
      // Provide a non-null result_json for `succeeded` so the
      // bottom-row summary helper has something to render; the others
      // tolerate null payloads.
      result_json:
        status === "succeeded" ? { imported: 1, skipped: 0, failed: 0 } : null,
      error_json: status === "failed" ? { message: "boom" } : null,
    });
    const { container } = fixedNow(() =>
      render(<OperationCard op={op} onCancel={() => {}} />),
    );
    const pill = container.querySelector(`.jc-pill.${status}`);
    expect(pill).not.toBeNull();
  });
}

// 2. data-pulse="true" only on running -------------------------------

test("OperationCard sets data-pulse=true only on running pill", () => {
  for (const status of STATUSES) {
    const op = makeOp({ status });
    const { container } = fixedNow(() =>
      render(<OperationCard op={op} onCancel={() => {}} />),
    );
    const pill = container.querySelector(".jc-pill")!;
    if (status === "running") {
      expect(pill.getAttribute("data-pulse")).toBe("true");
    } else {
      expect(pill.getAttribute("data-pulse")).toBeNull();
    }
    cleanup();
  }
});

// 3. Cancel button rendering -----------------------------------------

test("OperationCard renders enabled Cancel button for queued op", () => {
  const op = makeOp({ status: "queued" });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const cancel = container.querySelector<HTMLButtonElement>("button.jc-cancel");
  expect(cancel).not.toBeNull();
  expect(cancel!.disabled).toBe(false);
  expect(cancel!.textContent).toBe("Cancel");
  // No summary-text span on an active op.
  expect(container.querySelector(".jc-summary-text")).toBeNull();
});

test("OperationCard renders enabled Cancel button for running op", () => {
  const op = makeOp({ status: "running" });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const cancel = container.querySelector<HTMLButtonElement>("button.jc-cancel");
  expect(cancel).not.toBeNull();
  expect(cancel!.disabled).toBe(false);
  expect(cancel!.textContent).toBe("Cancel");
});

test("OperationCard renders disabled 'Cancelling…' for cancel_requested op", () => {
  const op = makeOp({ status: "cancel_requested" });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const cancel = container.querySelector<HTMLButtonElement>("button.jc-cancel");
  expect(cancel).not.toBeNull();
  expect(cancel!.disabled).toBe(true);
  expect(cancel!.textContent).toBe("Cancelling…");
});

test("OperationCard renders <span.jc-summary-text> for terminal ops (with title)", () => {
  const op = makeOp({
    status: "succeeded",
    result_json: { imported: 3, skipped: 0, failed: 0 },
    started_at: "2026-05-18T13:59:50.000Z",
    finished_at: "2026-05-18T13:59:58.000Z",
  });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  expect(container.querySelector("button.jc-cancel")).toBeNull();
  const span = container.querySelector(".jc-summary-text");
  expect(span).not.toBeNull();
  // Title carries the full text. The visible text is truncated at ~40
  // chars; both are present.
  expect(span!.getAttribute("title")).toBeTruthy();
});

test("OperationCard summary text truncates to ~40 chars with full text in title", () => {
  // Construct a long error message that exceeds 40 chars.
  const longMessage =
    "this is a deliberately long failure message that should be truncated for display";
  const op = makeOp({
    status: "failed",
    error_json: { message: longMessage },
  });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const span = container.querySelector<HTMLElement>(".jc-summary-text")!;
  expect(span.getAttribute("title")).toBe(longMessage);
  // Visible text must be shorter than the full text.
  expect(span.textContent!.length).toBeLessThan(longMessage.length);
});

// 4. Cancel click handler --------------------------------------------

test("OperationCard fires onCancel(op.id) exactly once on Cancel click", () => {
  const onCancel = mock((_id: string) => {});
  const op = makeOp({ id: "op-42", status: "running" });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={onCancel} />),
  );
  const cancel = container.querySelector<HTMLButtonElement>("button.jc-cancel")!;
  fireEvent.click(cancel);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledWith("op-42");
});

// 5. Expanded panel --------------------------------------------------

test("OperationCard expanded panel: active op shows only Submitted row", () => {
  const op = makeOp({ status: "running", started_at: null, finished_at: null });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  // Force-open via setAttribute since the native <details> ignores
  // React's children-rendered state otherwise.
  const details = container.querySelector("details.jc-card")!;
  details.setAttribute("open", "");
  const dl = container.querySelector(".jc-expand-meta")!;
  const dts = Array.from(dl.querySelectorAll("dt")).map((dt) => dt.textContent);
  expect(dts).toEqual(["Submitted"]);
  expect(container.querySelector(".jc-expand-json")).toBeNull();
});

test("OperationCard expanded panel: succeeded op renders <dl> + <pre> (pretty result_json)", () => {
  const op = makeOp({
    status: "succeeded",
    result_json: { imported: 3, skipped: 0, failed: 0 },
    started_at: "2026-05-18T13:59:50.000Z",
    finished_at: "2026-05-18T13:59:58.000Z",
  });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const dl = container.querySelector(".jc-expand-meta")!;
  const dts = Array.from(dl.querySelectorAll("dt")).map((dt) => dt.textContent);
  expect(dts).toEqual(["Submitted", "Started", "Finished"]);
  const pre = container.querySelector(".jc-expand-json");
  expect(pre).not.toBeNull();
  // 2-space indent
  expect(pre!.textContent).toContain("  \"imported\": 3");
});

test("OperationCard expanded panel: failed op renders <dl> + <pre> (error_json)", () => {
  const op = makeOp({
    status: "failed",
    error_json: { message: "boom", retryable: false },
    started_at: "2026-05-18T13:59:50.000Z",
    finished_at: "2026-05-18T13:59:51.000Z",
  });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const pre = container.querySelector(".jc-expand-json");
  expect(pre).not.toBeNull();
  expect(pre!.textContent).toContain("\"message\": \"boom\"");
});

test("OperationCard expanded panel: cancelled with null payloads renders <dl> only (no <pre>)", () => {
  const op = makeOp({
    status: "cancelled",
    result_json: null,
    error_json: null,
    started_at: "2026-05-18T13:59:50.000Z",
    finished_at: "2026-05-18T13:59:55.000Z",
  });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  expect(container.querySelector(".jc-expand-meta")).not.toBeNull();
  expect(container.querySelector(".jc-expand-json")).toBeNull();
});

test("OperationCard expanded panel: interrupted with null payloads renders <dl> only", () => {
  const op = makeOp({
    status: "interrupted",
    result_json: null,
    error_json: null,
    started_at: "2026-05-18T13:59:50.000Z",
    finished_at: null,
  });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  expect(container.querySelector(".jc-expand-meta")).not.toBeNull();
  expect(container.querySelector(".jc-expand-json")).toBeNull();
});

// 6. Kind glyphs -----------------------------------------------------

test("OperationCard glyph: import_sessions → 'I'", () => {
  const op = makeOp({ kind: "import_sessions", status: "queued" });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const icon = container.querySelector(".jc-icon");
  expect(icon!.textContent).toBe("I");
});

test("OperationCard glyph: rescan_sources → 'R'", () => {
  const op = makeOp({ kind: "rescan_sources", status: "queued" });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const icon = container.querySelector(".jc-icon");
  expect(icon!.textContent).toBe("R");
});

// 7. Disclosure marker hidden + grid summary ------------------------

test("OperationCard summary uses .jc-card-summary class (CSS Grid layout per M1 §3.5)", () => {
  const op = makeOp({ status: "queued" });
  const { container } = fixedNow(() =>
    render(<OperationCard op={op} onCancel={() => {}} />),
  );
  const summary = container.querySelector("summary.jc-card-summary");
  expect(summary).not.toBeNull();
});

// 8. relative-time helper -------------------------------------------

describe("formatRelativeTime", () => {
  test("5 seconds ago", () => {
    fixedNow(() => {
      const iso = new Date(NOW_MS - 5_000).toISOString();
      expect(formatRelativeTime(iso)).toBe("5s ago");
    });
  });

  test("30 minutes ago", () => {
    fixedNow(() => {
      const iso = new Date(NOW_MS - 30 * 60_000).toISOString();
      expect(formatRelativeTime(iso)).toBe("30m ago");
    });
  });

  test("2 hours ago", () => {
    fixedNow(() => {
      const iso = new Date(NOW_MS - 2 * 60 * 60_000).toISOString();
      expect(formatRelativeTime(iso)).toBe("2h ago");
    });
  });

  test("5 days ago", () => {
    fixedNow(() => {
      const iso = new Date(NOW_MS - 5 * 24 * 60 * 60_000).toISOString();
      expect(formatRelativeTime(iso)).toBe("5d ago");
    });
  });

  test("30 days ago renders absolute DD Mon HH:MM (UTC)", () => {
    fixedNow(() => {
      const iso = new Date(NOW_MS - 30 * 24 * 60 * 60_000).toISOString();
      // 30 days before 2026-05-18T14:00Z is 2026-04-18T14:00Z
      expect(formatRelativeTime(iso)).toBe("18 Apr 14:00");
    });
  });

  test("invalid ISO returns the input string unchanged", () => {
    fixedNow(() => {
      expect(formatRelativeTime("not-a-date")).toBe("not-a-date");
    });
  });
});
