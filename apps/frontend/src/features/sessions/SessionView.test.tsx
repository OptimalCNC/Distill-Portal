// Component tests for the M1a/M1b right-pane placeholder.
//
// SessionView is a presentational component: its state is driven by
// the `state` prop (one of "empty" / "loading" / "ready-placeholder"
// / "session_not_found") plus a `showBackToList` toggle for stacked-
// narrow viewports. State transitions are owned by App.tsx; this
// component only renders the four states + dispatches the three
// callbacks (onBackToList / onClearSelection / onTryRescan / onOpenDetail).
//
// Coverage:
//   - empty: preface text matches spec lines 591–593 verbatim; NO
//     "Open detail" button
//   - loading: "Reading session…" with no spinner; NO "Open detail"
//     button
//   - ready-placeholder: "Session view coming…" + the M1b vestigial
//     "Open detail" button (verbatim copy per spec line 977). Click
//     invokes `onOpenDetail` exactly once with the button as the
//     trigger element so the parent can stash it for focus
//     restoration on drawer close.
//   - session_not_found: heading + hint + two buttons; NO
//     "Open detail" button
//   - back-to-list: rendered only when showBackToList === true; click
//     fires onBackToList
//   - back-to-list visibility CSS smoke test: the narrow-viewport
//     @media override exists in `styles/global.css` so the button is
//     not stuck at `display: none` (codex M1a fix-up #1)
//   - data-state attribute reflects the state prop verbatim
//   - aria-busy === "true" only when state === "loading"
import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { SessionView } from "./SessionView";

afterEach(() => {
  cleanup();
});

const NOOP = () => {};

test("SessionView empty: renders the spec-verbatim two-paragraph preface and a centered text glyph", () => {
  const { container } = render(
    <SessionView
      state="empty"
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  // Para 1 (verbatim spec line 591).
  expect(
    container.textContent?.includes(
      "Select a session from the list to view its content.",
    ),
  ).toBe(true);
  // Para 2 (verbatim spec line 593).
  expect(
    container.textContent?.includes(
      "The session view shows the full Transcript chronologically, a Skim outline (one block per user message), the Raw NDJSON for verification, and the session's Metadata.",
    ),
  ).toBe(true);
  // Mark glyph: a centered middle-dot at --text-xl.
  const mark = container.querySelector(".empty-mark");
  expect(mark).not.toBeNull();
  expect(mark?.textContent).toBe("·");
  expect(mark?.getAttribute("aria-hidden")).toBe("true");
  // data-state attribute drives CSS state styling.
  const article = container.querySelector("article.session-pane");
  expect(article?.getAttribute("data-state")).toBe("empty");
  expect(article?.getAttribute("aria-busy")).toBe("false");
  // No "Open detail" button (M1b material).
  const openDetail = Array.from(
    container.querySelectorAll("button"),
  ).find((b) => b.textContent === "Open detail");
  expect(openDetail).toBeUndefined();
});

test("SessionView loading: renders 'Reading session…' with no spinner", () => {
  const { container } = render(
    <SessionView
      state="loading"
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  expect(container.textContent?.includes("Reading session…")).toBe(true);
  // No spinner / role="progressbar" — the editorial mood prefers
  // quiet over busy.
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  // aria-busy is "true" while loading.
  const article = container.querySelector("article.session-pane");
  expect(article?.getAttribute("data-state")).toBe("loading");
  expect(article?.getAttribute("aria-busy")).toBe("true");
});

test("SessionView ready-placeholder: renders 'Session view coming in Milestone 2.' AND the M1b vestigial 'Open detail' button", () => {
  const { container } = render(
    <SessionView
      state="ready-placeholder"
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  expect(
    container.textContent?.includes("Session view coming in Milestone 2."),
  ).toBe(true);
  // M1b adds the vestigial "Open detail" button verbatim per spec line 977.
  const buttons = Array.from(container.querySelectorAll("button"));
  const openDetail = buttons.find((b) => b.textContent === "Open detail");
  expect(openDetail).not.toBeUndefined();
  expect(openDetail?.classList.contains("open-detail")).toBe(true);
  // data-state reflects the prop.
  const article = container.querySelector("article.session-pane");
  expect(article?.getAttribute("data-state")).toBe("ready-placeholder");
});

test("SessionView ready-placeholder: clicking 'Open detail' invokes onOpenDetail exactly once with the button as triggerEl", () => {
  const onOpenDetail = mock((_trigger: HTMLElement | null) => {});
  const { container } = render(
    <SessionView
      state="ready-placeholder"
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
      onOpenDetail={onOpenDetail}
    />,
  );
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Open detail",
  ) as HTMLButtonElement | undefined;
  expect(button).not.toBeUndefined();
  act(() => {
    button!.click();
  });
  expect(onOpenDetail).toHaveBeenCalledTimes(1);
  // The trigger element forwarded to the parent is the button itself —
  // App.tsx stashes it as the Drawer's `restoreFocusRef` so close
  // restores focus to the button (NOT the row, per M1b semantic shift).
  expect(onOpenDetail.mock.calls[0]?.[0]).toBe(button);
});

test("SessionView: vestigial 'Open detail' button absent in empty / loading / session_not_found states", () => {
  // The button is intentionally tied to the "ready-placeholder" state
  // — drawer auto-mount makes no sense in empty (nothing selected),
  // loading (row not yet merged), or session_not_found (the URL
  // points at a row that isn't in the merged set).
  const states: Array<"empty" | "loading" | "session_not_found"> = [
    "empty",
    "loading",
    "session_not_found",
  ];
  for (const state of states) {
    const { container } = render(
      <SessionView
        state={state}
        showBackToList={false}
        onBackToList={NOOP}
        onClearSelection={NOOP}
        onTryRescan={NOOP}
      />,
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    const openDetail = buttons.find((b) => b.textContent === "Open detail");
    expect(openDetail).toBeUndefined();
    cleanup();
  }
});

test("SessionView session_not_found: renders heading + hint + two buttons (Clear selection / Try Rescan)", () => {
  const onClearSelection = mock(() => {});
  const onTryRescan = mock(() => {});
  const { container } = render(
    <SessionView
      state="session_not_found"
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={onClearSelection}
      onTryRescan={onTryRescan}
    />,
  );
  // Heading.
  expect(
    container.textContent?.includes("Session not found in current view"),
  ).toBe(true);
  // Hint copy.
  expect(
    container.textContent?.includes(
      "The session referenced by the URL was not in the merged set after the latest scan.",
    ),
  ).toBe(true);
  // Both buttons present.
  const buttons = Array.from(container.querySelectorAll("button"));
  const clearBtn = buttons.find((b) => b.textContent === "Clear selection");
  const rescanBtn = buttons.find((b) => b.textContent === "Try Rescan");
  expect(clearBtn).not.toBeUndefined();
  expect(rescanBtn).not.toBeUndefined();
  // Click each → callback fires.
  act(() => {
    clearBtn?.click();
  });
  expect(onClearSelection).toHaveBeenCalledTimes(1);
  act(() => {
    rescanBtn?.click();
  });
  expect(onTryRescan).toHaveBeenCalledTimes(1);
  // data-state reflects the prop.
  const article = container.querySelector("article.session-pane");
  expect(article?.getAttribute("data-state")).toBe("session_not_found");
});

test("SessionView back-to-list: rendered only when showBackToList=true; click fires onBackToList", () => {
  const onBackToList = mock(() => {});
  // Hidden when showBackToList === false.
  const hidden = render(
    <SessionView
      state="ready-placeholder"
      showBackToList={false}
      onBackToList={onBackToList}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  expect(hidden.container.querySelector(".back-to-list")).toBeNull();
  cleanup();

  // Visible when showBackToList === true; click invokes the
  // callback exactly once and does NOT clear selection (the parent
  // is responsible for that distinction — Esc is a different
  // gesture).
  const visible = render(
    <SessionView
      state="ready-placeholder"
      showBackToList={true}
      onBackToList={onBackToList}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  const btn = visible.container.querySelector<HTMLButtonElement>(
    ".back-to-list",
  );
  expect(btn).not.toBeNull();
  expect(btn?.textContent).toBe("← Back to list");
  act(() => {
    btn?.click();
  });
  expect(onBackToList).toHaveBeenCalledTimes(1);
});

test("SessionView back-to-list narrow-viewport visibility: global.css carries the @media override that re-enables `display`", async () => {
  // Smoke test for codex M1a fix-up #1. The `.back-to-list` selector
  // in `SessionView.css` declares `display: none` so the button is
  // hidden on wide viewports. The narrow-viewport override that re-
  // enables it MUST live somewhere — co-located in `global.css` next
  // to the other `data-narrow-mode` visibility rules. happy-dom does
  // not fully evaluate @media queries, so this assertion is a
  // regex-on-source smoke test (acceptable per the chunk dispatch
  // brief). Real-browser visibility is covered by the Playwright
  // step in `e2e/inspection.spec.ts`.
  const cssPath = new URL("../../styles/global.css", import.meta.url).pathname;
  const css = await Bun.file(cssPath).text();
  // 1. The narrow-viewport @media block exists (matches the existing
  //    pattern at `(max-width: 899.98px)`).
  expect(css).toMatch(/@media\s*\(max-width:\s*899\.98px\)/);
  // 2. Within that media context, a rule re-enables `.back-to-list`
  //    when `<main class="split-pane" data-narrow-mode="session">`.
  //    Use a single regex that requires `display:` to be NOT `none`
  //    so a future regression that copy-pastes the wrong rule fails
  //    the assertion. We accept any inline-* keyword (inline-block,
  //    inline-flex, inline) — the design.md §3.5 calls for an inline
  //    treatment so the button reads as a quiet text link.
  expect(css).toMatch(
    /main\.split-pane\[data-narrow-mode="session"\]\s+\.back-to-list\s*\{\s*display:\s*inline(?:-block|-flex)?\s*;?\s*\}/,
  );
});

test("SessionView landmarks: <article> wraps the pane with aria-live=polite", () => {
  const { container } = render(
    <SessionView
      state="empty"
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  const article = container.querySelector("article.session-pane");
  expect(article).not.toBeNull();
  expect(article?.getAttribute("aria-live")).toBe("polite");
});
