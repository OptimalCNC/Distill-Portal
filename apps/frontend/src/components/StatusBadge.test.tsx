// Variant-matrix coverage for the StatusBadge pill (Chunk G1).
//
// StatusBadge is a pure presentational component that maps a
// `SessionSyncStatus` enum value (four variants) onto a `<span>` with two
// class names plus a human-readable label. The class transformation is a
// simple underscore -> dash rewrite, and the label transformation is
// underscore -> space. This file asserts each of the four variants
// produces the expected DOM shape so a silent drift in the mapping (e.g.
// a future refactor that percent-encodes or camelCases the variant)
// surfaces as a test failure.
//
// Fixtures are typed from the generated contract so a `SessionSyncStatus`
// rename in the Rust source of truth fails the TS compile here.
import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";
import type { SessionSyncStatus } from "../lib/contracts";

afterEach(() => {
  cleanup();
});

type Variant = {
  status: SessionSyncStatus;
  variantClass: string;
  label: string;
};

// The full truth table. Each row drives exactly three assertions below
// (badge class, variant class, label text) so the expect() count per
// variant is 3 and 12 in total across the four variants.
const VARIANTS: Variant[] = [
  { status: "up_to_date", variantClass: "up-to-date", label: "up to date" },
  { status: "not_stored", variantClass: "not-stored", label: "not stored" },
  { status: "outdated", variantClass: "outdated", label: "outdated" },
  {
    status: "source_missing",
    variantClass: "source-missing",
    label: "source missing",
  },
];

function renderBadge(status: SessionSyncStatus): HTMLSpanElement {
  const { container } = render(<StatusBadge status={status} />);
  const span = container.querySelector("span");
  if (!span) {
    throw new Error(`StatusBadge did not render a <span> for status=${status}`);
  }
  return span as HTMLSpanElement;
}

for (const { status, variantClass, label } of VARIANTS) {
  test(`StatusBadge renders expected class + label for status=${status}`, () => {
    const span = renderBadge(status);
    expect(span.classList.contains("badge")).toBe(true);
    expect(span.classList.contains(variantClass)).toBe(true);
    expect(span.textContent).toBe(label);
  });
}
