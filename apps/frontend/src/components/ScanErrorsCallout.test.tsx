// Coverage for the collapsible scan-errors callout.
//
// Cases:
//   1. Empty: when `errors` is empty, the component renders nothing
//      visible (the M2 "collapse what is rarely non-empty" deliverable).
//   2. Non-empty (one error): the summary line uses the singular form
//      and the row carries the persisted error fields.
//   3. Non-empty (two errors, including the App.test.tsx fixture): the
//      summary line uses the plural form and the row carrying the
//      well-known `Malformed NDJSON on line 3` message renders.
import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ScanErrorsCallout } from "./ScanErrorsCallout";
import type { PersistedScanError } from "../lib/contracts";

afterEach(() => {
  cleanup();
});

test("ScanErrorsCallout: empty list renders nothing visible", () => {
  const { container } = render(<ScanErrorsCallout errors={[]} />);
  // The callout should not contribute any DOM. Container has the
  // wrapper div from RTL but the component itself emits null.
  expect(container.querySelector("section")).toBeNull();
  expect(container.querySelector("table")).toBeNull();
  expect(container.textContent).toBe("");
});

test("ScanErrorsCallout: one error renders the singular summary + the row", () => {
  const errors: PersistedScanError[] = [
    {
      error_id: "err-1",
      tool: "claude_code",
      source_path: "/tmp/fixture/broken.jsonl",
      fingerprint: "fp-broken",
      message: "Malformed NDJSON on line 3",
      first_seen_at: "2026-04-22T00:00:00Z",
      last_seen_at: "2026-04-22T00:00:05Z",
    },
  ];
  const { container } = render(<ScanErrorsCallout errors={errors} />);
  expect(container.querySelector("section")).not.toBeNull();
  expect(
    container.textContent?.includes(
      "1 scan error observed since the last rescan.",
    ),
  ).toBe(true);
  expect(
    container.textContent?.includes("Malformed NDJSON on line 3"),
  ).toBe(true);
  expect(container.textContent?.includes("/tmp/fixture/broken.jsonl")).toBe(
    true,
  );
});

test("ScanErrorsCallout: two errors render the plural summary + both rows", () => {
  const errors: PersistedScanError[] = [
    {
      error_id: "err-1",
      tool: "claude_code",
      source_path: "/tmp/fixture/broken.jsonl",
      fingerprint: "fp-broken",
      message: "Malformed NDJSON on line 3",
      first_seen_at: "2026-04-22T00:00:00Z",
      last_seen_at: "2026-04-22T00:00:05Z",
    },
    {
      error_id: "err-2",
      tool: "codex",
      source_path: "/tmp/codex/oops.jsonl",
      fingerprint: null,
      message: "Permission denied",
      first_seen_at: "2026-04-22T00:01:00Z",
      last_seen_at: "2026-04-22T00:01:00Z",
    },
  ];
  const { container } = render(<ScanErrorsCallout errors={errors} />);
  expect(
    container.textContent?.includes(
      "2 scan errors observed since the last rescan.",
    ),
  ).toBe(true);
  expect(container.querySelectorAll("tbody tr").length).toBe(2);
  expect(container.textContent?.includes("Permission denied")).toBe(true);
});
