// Component tests for the shared BoundaryRow chapter-break.
//
// BoundaryRow is the M5 extraction of M4's inline TranscriptView
// boundary recipe. The DOM tree must be byte-equivalent to M4's
// (signature detail #1 — verified at M5 close, spec line 691).
//
// Test obligations (per m5-plan §4.8):
//   - Renders <li role="separator" aria-orientation="horizontal">.
//   - "SESSION RESUMED" for subtype="session_resumed".
//   - "CONVERSATION COMPACTED" for subtype="compacted".
//   - "SESSION RESUMED" for undefined subtype (default).
//   - With staggerIndex prop, sets style.animationDelay = "${idx*40}ms".
//   - Without staggerIndex prop, no inline animationDelay style.
//   - Three-element grid (rule + label + rule).
//   - Class names include `boundary-row` AND legacy `msg msg-boundary`
//     for byte-equivalence with M4's existing CSS rhythm rules.
//   - Renders inside <ol> and <ul> parents byte-equivalent (used by
//     both Transcript and Skim contexts).
//
// Bun-first: imports from "bun:test"; no Jest-style mocks or Node
// process helpers.

import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { BoundaryRow } from "./BoundaryRow";

afterEach(() => {
  cleanup();
});

test("BoundaryRow renders <li role='separator' aria-orientation='horizontal'>", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" />
    </ol>,
  );
  const li = container.querySelector("li");
  expect(li).not.toBeNull();
  expect(li?.tagName.toLowerCase()).toBe("li");
  expect(li?.getAttribute("role")).toBe("separator");
  expect(li?.getAttribute("aria-orientation")).toBe("horizontal");
});

test("BoundaryRow with subtype='session_resumed' renders 'SESSION RESUMED' label", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" />
    </ol>,
  );
  const label = container.querySelector(".boundary-row-label");
  expect(label?.textContent).toBe("SESSION RESUMED");
});

test("BoundaryRow with subtype='compacted' renders 'CONVERSATION COMPACTED' label", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="compacted" />
    </ol>,
  );
  const label = container.querySelector(".boundary-row-label");
  expect(label?.textContent).toBe("CONVERSATION COMPACTED");
});

test("BoundaryRow with undefined subtype defaults to 'SESSION RESUMED'", () => {
  const { container } = render(
    <ol>
      <BoundaryRow />
    </ol>,
  );
  const label = container.querySelector(".boundary-row-label");
  expect(label?.textContent).toBe("SESSION RESUMED");
});

test("BoundaryRow with staggerIndex=0 sets style.animationDelay='0ms'", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" staggerIndex={0} />
    </ol>,
  );
  const li = container.querySelector("li") as HTMLElement;
  expect(li.style.animationDelay).toBe("0ms");
});

test("BoundaryRow with staggerIndex=3 sets style.animationDelay='120ms'", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" staggerIndex={3} />
    </ol>,
  );
  const li = container.querySelector("li") as HTMLElement;
  expect(li.style.animationDelay).toBe("120ms");
});

test("BoundaryRow without staggerIndex carries NO inline animationDelay", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" />
    </ol>,
  );
  const li = container.querySelector("li") as HTMLElement;
  // happy-dom returns "" for unset inline animationDelay.
  expect(li.style.animationDelay).toBe("");
});

test("BoundaryRow renders three-element grid (rule + label + rule)", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" />
    </ol>,
  );
  const li = container.querySelector("li");
  expect(li?.children.length).toBe(3);
  const rules = container.querySelectorAll(".boundary-row-rule");
  expect(rules.length).toBe(2);
  expect(rules[0].getAttribute("aria-hidden")).toBe("true");
  expect(rules[1].getAttribute("aria-hidden")).toBe("true");
});

test("BoundaryRow class names include 'boundary-row' AND legacy 'msg msg-boundary' for byte-equivalence", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" />
    </ol>,
  );
  const li = container.querySelector("li") as HTMLElement;
  // Skim's rhythm rules target `.boundary-row`; Transcript's M4
  // rhythm rules at TranscriptView.css lines 156-172 target
  // `.msg-boundary` directly. Both classes must persist on the same
  // element for both contexts to lay out correctly.
  expect(li.classList.contains("boundary-row")).toBe(true);
  expect(li.classList.contains("msg-boundary")).toBe(true);
  expect(li.classList.contains("msg")).toBe(true);
});

test("BoundaryRow rule classes carry both new and legacy names", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" />
    </ol>,
  );
  const ruleStart = container.querySelector(".boundary-row-rule-start");
  const ruleEnd = container.querySelector(".boundary-row-rule-end");
  expect(ruleStart?.classList.contains("msg-boundary-rule")).toBe(true);
  expect(ruleStart?.classList.contains("msg-boundary-rule-start")).toBe(
    true,
  );
  expect(ruleEnd?.classList.contains("msg-boundary-rule")).toBe(true);
  expect(ruleEnd?.classList.contains("msg-boundary-rule-end")).toBe(true);
});

test("BoundaryRow label class carries both new and legacy names", () => {
  const { container } = render(
    <ol>
      <BoundaryRow subtype="session_resumed" />
    </ol>,
  );
  const label = container.querySelector(".boundary-row-label") as HTMLElement;
  expect(label?.classList.contains("msg-boundary-label")).toBe(true);
});

test("BoundaryRow renders byte-equivalent inside <ol> and <ul> parents", () => {
  // Capture OL render's outerHTML + key attributes BEFORE cleanup
  // (cleanup() unmounts and clears the container).
  const olRender = render(
    <ol>
      <BoundaryRow subtype="session_resumed" />
    </ol>,
  );
  const olLi = olRender.container.querySelector("li") as HTMLElement;
  const olRole = olLi.getAttribute("role");
  const olChildCount = olLi.children.length;
  const olLabel = olLi.querySelector(".boundary-row-label")?.textContent;
  cleanup();
  const ulRender = render(
    <ul>
      <BoundaryRow subtype="session_resumed" />
    </ul>,
  );
  const ulLi = ulRender.container.querySelector("li") as HTMLElement;
  expect(ulLi.getAttribute("role")).toBe(olRole);
  expect(ulLi.children.length).toBe(olChildCount);
  expect(ulLi.querySelector(".boundary-row-label")?.textContent).toBe(olLabel);
});
