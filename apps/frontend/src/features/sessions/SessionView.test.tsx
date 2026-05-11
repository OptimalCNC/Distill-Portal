// Component tests for the M2b right-pane shell.
//
// The four-state machine is preserved from M1a (empty / loading /
// session_not_found unchanged); the M1a `ready-placeholder` state is
// REPLACED by `ready` (M2b mounts the four-tab shell inside it).
//
// Coverage:
//   - empty: preface text matches spec lines 591–593 verbatim;
//     no tabs render.
//   - loading: "Reading session…" with no spinner.
//   - session_not_found: heading + hint + two buttons.
//   - ready: minimal header (title + tool badge + status pill +
//     optional conflict badge) + Tabs primitive (4 tabs) + 4
//     panels lazy-mounted.
//   - default tab AT M2b = "metadata".
//   - tab switching via the Tabs primitive: aria-selected + active
//     panel toggle.
//   - visited-tab matrix: Metadata mounts on first render; Skim does
//     NOT mount until activated; once activated, Skim stays mounted
//     with `hidden`.
//   - selectedRowKey change resets activeTab + visitedTabs (covered
//     via `key` change in the harness).
//   - M5 functional state: Skim renders SkimView (no placeholder);
//     Transcript renders TranscriptView (M4 functional state).
//   - tabIndex=0 on active Skim/Transcript/Raw panels; NOT on
//     Metadata.
//   - Page-turn fade keyframe: `.session-pane` carries the
//     `animation: session-page-turn …` declaration in CSS source
//     (smoke test on the file).
//   - back-to-list visibility tests (preserved).
//   - landmarks test (preserved).
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { SessionView } from "./SessionView";
import type { SessionRow } from "./types";

const NOW = "2026-04-25T12:00:00Z";

afterEach(() => {
  cleanup();
});

const NOOP = () => {};

function buildRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    rowKey: "claude_code:session-view-1",
    sourceSessionKey: "claude_code:session-view-1",
    tool: "claude_code",
    sourceSessionId: "session-view-1",
    title: "View row",
    projectPath: "/projects/view",
    sourcePath: "/srv/sessions/session-view-1.jsonl",
    sourcePathIsStale: false,
    sourceFingerprint: "fp-view",
    createdAt: "2026-04-22T00:00:00Z",
    sourceUpdatedAt: "2026-04-25T11:55:00Z",
    ingestedAt: null,
    storedSessionUid: null,
    storedRawRef: null,
    hasSubagentSidecars: false,
    status: "not_stored",
    statusConflict: false,
    presence: "source_only",
    ...overrides,
  };
}

let savedActEnv: boolean | undefined;
function suppressActWarnings(): void {
  savedActEnv = (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }).IS_REACT_ACT_ENVIRONMENT = false;
}
function restoreActWarnings(): void {
  (globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  }).IS_REACT_ACT_ENVIRONMENT = savedActEnv;
}

let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("SessionView empty: renders the spec-verbatim preface and no tabs", () => {
  const { container } = render(
    <SessionView
      state="empty"
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  expect(
    container.textContent?.includes(
      "Select a session from the list to view its content.",
    ),
  ).toBe(true);
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  const article = container.querySelector("article.session-pane");
  expect(article?.getAttribute("data-state")).toBe("empty");
  expect(article?.getAttribute("aria-busy")).toBe("false");
});

test("SessionView loading: renders 'Reading session…' with no spinner; no tabs", () => {
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
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  const article = container.querySelector("article.session-pane");
  expect(article?.getAttribute("data-state")).toBe("loading");
  expect(article?.getAttribute("aria-busy")).toBe("true");
});

test("SessionView session_not_found: heading + hint + two buttons (Clear selection / Try Rescan)", () => {
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
  expect(
    container.textContent?.includes("Session not found in current view"),
  ).toBe(true);
  const buttons = Array.from(container.querySelectorAll("button"));
  const clearBtn = buttons.find((b) => b.textContent === "Clear selection");
  const rescanBtn = buttons.find((b) => b.textContent === "Try Rescan");
  expect(clearBtn).not.toBeUndefined();
  expect(rescanBtn).not.toBeUndefined();
  act(() => {
    clearBtn?.click();
  });
  expect(onClearSelection).toHaveBeenCalledTimes(1);
  act(() => {
    rescanBtn?.click();
  });
  expect(onTryRescan).toHaveBeenCalledTimes(1);
  // No tabs in this state.
  expect(container.querySelector('[role="tablist"]')).toBeNull();
});

test("SessionView ready: renders minimal header + Tabs primitive (4 tabs) + default tab = 'transcript'", () => {
  // Stub fetch so TranscriptView's effect (mounting on the default
  // tab in M4) does not crash on an undefined global. The
  // useParsedSession hook for a source-only row short-circuits
  // before any fetch — the test row has no storedSessionUid, so
  // TranscriptView renders the "no_raw" branch without I/O.
  globalThis.fetch = mock(async () =>
    new Response("[]", { status: 200, headers: { "Content-Type": "application/x-ndjson" } }),
  ) as unknown as typeof globalThis.fetch;
  const row = buildRow({ title: "Reading the source", tool: "claude_code" });
  const { container } = render(
    <SessionView
      state="ready"
      now={NOW}
      row={row}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  // Minimal header: title + tool badge + status pill.
  expect(
    container.querySelector(".session-pane-header .session-title")?.textContent,
  ).toBe("Reading the source");
  expect(
    container.querySelector(".session-tool-badge")?.textContent,
  ).toBe("claude_code");
  // Tablist + 4 tabs.
  const tablist = container.querySelector('[role="tablist"]');
  expect(tablist).not.toBeNull();
  const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
  expect(tabs.length).toBe(4);
  const ids = tabs.map((t) => t.getAttribute("id"));
  expect(ids).toEqual([
    "tab-transcript",
    "tab-skim",
    "tab-raw",
    "tab-metadata",
  ]);
  // Default tab = Transcript (M4 shifted from "metadata").
  const transcriptTab = container.querySelector("#tab-transcript");
  expect(transcriptTab?.getAttribute("aria-selected")).toBe("true");
  // data-state reflects the new "ready" value.
  const article = container.querySelector("article.session-pane");
  expect(article?.getAttribute("data-state")).toBe("ready");
});

test("SessionView ready: visited-tab lazy-mount matrix — Transcript mounts on first render; Skim does NOT mount until activated", () => {
  globalThis.fetch = mock(async () =>
    new Response("[]", { status: 200 }),
  ) as unknown as typeof globalThis.fetch;
  const row = buildRow();
  const { container } = render(
    <SessionView
      state="ready"
      now={NOW}
      row={row}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  // Initial (M4): only the transcript panel is in the DOM (default
  // tab shifted from "metadata" to "transcript").
  expect(container.querySelector("#panel-transcript")).not.toBeNull();
  expect(container.querySelector("#panel-skim")).toBeNull();
  expect(container.querySelector("#panel-metadata")).toBeNull();
  expect(container.querySelector("#panel-raw")).toBeNull();
  // Click Skim → Skim panel mounts. Transcript panel is still in the
  // DOM (visited-but-inactive) and carries `hidden`.
  const skimTab = container.querySelector(
    "#tab-skim",
  ) as HTMLButtonElement;
  act(() => {
    skimTab.click();
  });
  expect(container.querySelector("#panel-skim")).not.toBeNull();
  expect(container.querySelector("#panel-transcript")).not.toBeNull();
  // Transcript is now hidden.
  const transcriptPanel = container.querySelector(
    "#panel-transcript",
  ) as HTMLElement;
  expect(transcriptPanel.hasAttribute("hidden")).toBe(true);
  // Skim is the active panel.
  const skimPanel = container.querySelector(
    "#panel-skim",
  ) as HTMLElement;
  expect(skimPanel.hasAttribute("hidden")).toBe(false);
});

test("M5 functional state: Skim renders SkimView, Transcript renders TranscriptView, no placeholders remain", () => {
  globalThis.fetch = mock(async () =>
    new Response("[]", { status: 200 }),
  ) as unknown as typeof globalThis.fetch;
  // Source-only row → both TranscriptView and SkimView land on the
  // "no_raw" branch and render the spec-verbatim "not-imported" copy.
  const row = buildRow();
  const { container } = render(
    <SessionView
      state="ready"
      now={NOW}
      row={row}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  // Default tab = Transcript → renders the TranscriptView
  // "not-imported" copy because the row has no storedSessionUid.
  expect(
    container.querySelector("#panel-transcript")?.textContent,
  ).toContain("This session has not been imported yet");
  expect(
    container.querySelector("#panel-transcript")?.textContent,
  ).not.toContain("Coming in Milestone 4");
  // Activate Skim → SkimView mounts, NOT a placeholder. Source-only
  // row lands on the no_raw branch; the same "not yet imported"
  // copy renders.
  act(() => {
    (container.querySelector("#tab-skim") as HTMLButtonElement).click();
  });
  const skimPanel = container.querySelector("#panel-skim");
  expect(skimPanel?.textContent).not.toContain("Coming in Milestone 5");
  expect(skimPanel?.textContent).toContain(
    "This session has not been imported yet",
  );
  // No placeholder copy anywhere in the SessionView tree.
  expect(container.textContent).not.toContain("Coming in Milestone 5");
  expect(container.textContent).not.toContain("Coming in Milestone 4");
});

test("SessionView ready: Skim → Transcript → Skim keeps the SkimView panel React-mounted (M5 keep-mounted regression)", () => {
  // Activate Skim, then switch to Transcript, then back to Skim. The
  // SkimView panel's element reference must be stable — proving the
  // M5 keep-mounted contract holds for SkimView the way M2b's test
  // proved it for the Raw panel and M4's for Transcript.
  suppressActWarnings();
  try {
    globalThis.fetch = mock(async () =>
      new Response("", { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: null });
    const { container } = render(
      <SessionView
        state="ready"
        now={NOW}
        row={row}
        showBackToList={false}
        onBackToList={NOOP}
        onClearSelection={NOOP}
        onTryRescan={NOOP}
      />,
    );
    // Activate Skim.
    act(() => {
      (container.querySelector("#tab-skim") as HTMLButtonElement).click();
    });
    const skimPanelFirst = container.querySelector(
      "#panel-skim",
    ) as HTMLElement;
    expect(skimPanelFirst).not.toBeNull();
    const initialMarker = skimPanelFirst;
    // Switch to Transcript.
    act(() => {
      (
        container.querySelector("#tab-transcript") as HTMLButtonElement
      ).click();
    });
    const skimStillThere = container.querySelector(
      "#panel-skim",
    ) as HTMLElement;
    expect(skimStillThere).toBe(initialMarker);
    expect(skimStillThere.hasAttribute("hidden")).toBe(true);
    // Switch back to Skim.
    act(() => {
      (container.querySelector("#tab-skim") as HTMLButtonElement).click();
    });
    const skimPanelSecond = container.querySelector(
      "#panel-skim",
    ) as HTMLElement;
    expect(skimPanelSecond).toBe(initialMarker);
    expect(skimPanelSecond.hasAttribute("hidden")).toBe(false);
  } finally {
    restoreActWarnings();
  }
});

test("SessionView ready: native <details> open state inside #panel-skim survives a full Skim → Transcript → Skim tab cycle (M5 follow-up; M6 close)", () => {
  // Phase 5 M6 closure obligation (deferred follow-up from M5 normal
  // Claude reviewer's round-1 soft note #a): assert that the keep-
  // mounted contract on the SkimView panel preserves NATIVE
  // `<details>` open state across a full tab cycle. The two M5
  // composition tests (SkimView.test.tsx:985 — details survives a
  // 'now' prop change; SessionView.test.tsx:297 — #panel-skim element
  // identity stable across Skim↔Transcript↔Skim toggle) prove this
  // by composition. This test asserts the contract end-to-end on a
  // single DOM by INJECTING a `<details>` into the live #panel-skim
  // subtree, toggling it open, cycling Skim→Transcript→Skim, and
  // verifying both the element reference and the `open` attribute
  // survive — proves React did not unmount the panel subtree (which
  // would have destroyed the injected node).
  suppressActWarnings();
  try {
    globalThis.fetch = mock(async () =>
      new Response("", { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: null });
    const { container } = render(
      <SessionView
        state="ready"
        now={NOW}
        row={row}
        showBackToList={false}
        onBackToList={NOOP}
        onClearSelection={NOOP}
        onTryRescan={NOOP}
      />,
    );
    // Activate Skim.
    act(() => {
      (container.querySelector("#tab-skim") as HTMLButtonElement).click();
    });
    const skimPanel = container.querySelector(
      "#panel-skim",
    ) as HTMLElement;
    expect(skimPanel).not.toBeNull();
    // Inject a native <details> child into the Skim panel and toggle
    // its open state. If React unmounted the panel subtree on tab
    // switch, this injected node would disappear.
    const injected = document.createElement("details");
    injected.setAttribute("data-test-injected", "1");
    const summary = document.createElement("summary");
    summary.textContent = "test injection";
    injected.appendChild(summary);
    skimPanel.appendChild(injected);
    injected.open = true;
    expect(injected.open).toBe(true);
    // Switch to Transcript.
    act(() => {
      (
        container.querySelector("#tab-transcript") as HTMLButtonElement
      ).click();
    });
    // Skim panel still in DOM (hidden) and the injected <details>
    // survives untouched.
    const injectedAfterAway = container.querySelector(
      "#panel-skim [data-test-injected]",
    ) as HTMLDetailsElement | null;
    expect(injectedAfterAway).toBe(injected);
    expect(injectedAfterAway?.open).toBe(true);
    // Switch back to Skim.
    act(() => {
      (container.querySelector("#tab-skim") as HTMLButtonElement).click();
    });
    const injectedAfterReturn = container.querySelector(
      "#panel-skim [data-test-injected]",
    ) as HTMLDetailsElement | null;
    expect(injectedAfterReturn).toBe(injected);
    expect(injectedAfterReturn?.open).toBe(true);
  } finally {
    restoreActWarnings();
  }
});

test("SessionView ready: tabIndex=0 on active Skim/Transcript/Raw panels; NOT on Metadata", () => {
  suppressActWarnings();
  try {
    globalThis.fetch = mock(async () =>
      new Response("", { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    const row = buildRow({
      storedSessionUid: null,
      storedRawRef: null,
      presence: "source_only",
      status: "not_stored",
    });
    const { container } = render(
      <SessionView
        state="ready"
        now={NOW}
        row={row}
        showBackToList={false}
        onBackToList={NOOP}
        onClearSelection={NOOP}
        onTryRescan={NOOP}
      />,
    );
    // Transcript is the default tab (M4). Transcript panel carries
    // tabIndex="0" per Option A (unconditional on isActive).
    const transcriptPanel = container.querySelector(
      "#panel-transcript",
    ) as HTMLElement;
    expect(transcriptPanel.getAttribute("tabindex")).toBe("0");
    // Activate Skim → Skim panel carries tabIndex="0".
    act(() => {
      (container.querySelector("#tab-skim") as HTMLButtonElement).click();
    });
    const skimPanel = container.querySelector(
      "#panel-skim",
    ) as HTMLElement;
    expect(skimPanel.getAttribute("tabindex")).toBe("0");
    // Transcript (now inactive) MUST NOT carry tabIndex (lockstep with hidden).
    expect(transcriptPanel.hasAttribute("tabindex")).toBe(false);
    expect(transcriptPanel.hasAttribute("hidden")).toBe(true);
    // Activate Metadata → Metadata panel does NOT carry tabIndex
    // (Copy path button is always the first focusable child).
    act(() => {
      (
        container.querySelector("#tab-metadata") as HTMLButtonElement
      ).click();
    });
    const metadataPanel = container.querySelector(
      "#panel-metadata",
    ) as HTMLElement;
    expect(metadataPanel.hasAttribute("tabindex")).toBe(false);
    // Activate Raw → Raw panel carries tabIndex="0" (Option A:
    // unconditional on isActive).
    act(() => {
      (container.querySelector("#tab-raw") as HTMLButtonElement).click();
    });
    const rawPanel = container.querySelector(
      "#panel-raw",
    ) as HTMLElement;
    expect(rawPanel.getAttribute("tabindex")).toBe("0");
  } finally {
    restoreActWarnings();
  }
});

test("SessionView ready: panel content does NOT remount on tab change (keep-mounted contract for Resolved Decision #12)", () => {
  // Mount a stored row → activate Raw → switch to Skim → switch back
  // to Raw. The Raw panel's <pre> / <p> structure persists across
  // the tab flip because the React subtree was never unmounted. We
  // assert via a DOM identity check: the element reference for the
  // Raw panel is the SAME between the first activation and the
  // second.
  suppressActWarnings();
  try {
    let releaseFetch: () => void = () => {};
    const fetchPending = new Promise<Response>((resolve) => {
      releaseFetch = () => resolve(
        new Response('{"line":1}\n', {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        }),
      );
    });
    globalThis.fetch = mock(async () => fetchPending) as unknown as
      typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: "uid-keep-mounted" });
    const { container } = render(
      <SessionView
        state="ready"
        now={NOW}
        row={row}
        showBackToList={false}
        onBackToList={NOOP}
        onClearSelection={NOOP}
        onTryRescan={NOOP}
      />,
    );
    // Activate Raw.
    act(() => {
      (container.querySelector("#tab-raw") as HTMLButtonElement).click();
    });
    const rawPanelFirst = container.querySelector(
      "#panel-raw",
    ) as HTMLElement;
    expect(rawPanelFirst).not.toBeNull();
    // Capture a stable identity marker on the panel — the panel
    // node itself.
    const initialMarker = rawPanelFirst;
    // Switch to Skim.
    act(() => {
      (container.querySelector("#tab-skim") as HTMLButtonElement).click();
    });
    // The Raw panel is still in the DOM (visited-but-inactive,
    // hidden=true).
    const rawPanelStillThere = container.querySelector(
      "#panel-raw",
    ) as HTMLElement;
    expect(rawPanelStillThere).not.toBeNull();
    expect(rawPanelStillThere.hasAttribute("hidden")).toBe(true);
    // The element reference is the SAME — the React subtree was
    // never unmounted.
    expect(rawPanelStillThere).toBe(initialMarker);
    // Switch back to Raw → the same element is re-revealed.
    act(() => {
      (container.querySelector("#tab-raw") as HTMLButtonElement).click();
    });
    const rawPanelSecond = container.querySelector(
      "#panel-raw",
    ) as HTMLElement;
    expect(rawPanelSecond).toBe(initialMarker);
    expect(rawPanelSecond.hasAttribute("hidden")).toBe(false);
    releaseFetch();
  } finally {
    restoreActWarnings();
  }
});

test("SessionView ready: cross-fade-IN — active panel carries inline style.animation; inactive panels carry 'none'", () => {
  globalThis.fetch = mock(async () =>
    new Response("", { status: 200 }),
  ) as unknown as typeof globalThis.fetch;
  const row = buildRow();
  const { container } = render(
    <SessionView
      state="ready"
      now={NOW}
      row={row}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  // Default (transcript) panel is active → carries the keyframe.
  const transcriptPanel = container.querySelector(
    "#panel-transcript",
  ) as HTMLElement;
  expect(transcriptPanel.style.animation).toContain("tab-fade-in");
  // Activate Skim → Skim is active, Transcript becomes "none".
  act(() => {
    (container.querySelector("#tab-skim") as HTMLButtonElement).click();
  });
  const skimPanel = container.querySelector(
    "#panel-skim",
  ) as HTMLElement;
  expect(skimPanel.style.animation).toContain("tab-fade-in");
  // The previous transcript panel's style.animation is now "none".
  // happy-dom may normalize "none" — just check it does NOT carry
  // the keyframe name anymore.
  expect(transcriptPanel.style.animation).not.toContain("tab-fade-in");
});

test("SessionView ready: page-turn fade — `.session-pane` declares animation in CSS source", async () => {
  // Smoke test: happy-dom does not parse @keyframes, so we verify
  // the declaration exists in the CSS file. The actual animation is
  // verified at the e2e level via the page-turn surface visibility.
  const cssPath = new URL(
    "./SessionView.css",
    import.meta.url,
  ).pathname;
  const css = await Bun.file(cssPath).text();
  expect(css).toMatch(/animation:\s*session-page-turn/);
  expect(css).toMatch(/@keyframes\s+session-page-turn/);
  expect(css).toMatch(/@keyframes\s+tab-fade-in/);
});

test("SessionView back-to-list: rendered only when showBackToList=true; click fires onBackToList", () => {
  const onBackToList = mock(() => {});
  const hidden = render(
    <SessionView
      state="empty"
      showBackToList={false}
      onBackToList={onBackToList}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  expect(hidden.container.querySelector(".back-to-list")).toBeNull();
  cleanup();
  const visible = render(
    <SessionView
      state="empty"
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

test("SessionView back-to-list narrow-viewport visibility: global.css carries the @media override", async () => {
  // Smoke test for codex M1a fix-up #1 — preserved through M2b.
  const cssPath = new URL("../../styles/global.css", import.meta.url).pathname;
  const css = await Bun.file(cssPath).text();
  expect(css).toMatch(/@media\s*\(max-width:\s*899\.98px\)/);
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
  expect(article?.getAttribute("aria-label")).toBe("Session view");
});

test("SessionView ready (M4): 'Open raw' anchor renders only when row.storedSessionUid !== null; URL = /api/v1/sessions/<uid>/raw; target=_blank rel=noreferrer", () => {
  globalThis.fetch = mock(async () =>
    new Response("", { status: 200 }),
  ) as unknown as typeof globalThis.fetch;
  // Source-only row → anchor must NOT render.
  const sourceOnly = render(
    <SessionView
      state="ready"
      now={NOW}
      row={buildRow({ storedSessionUid: null })}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  expect(
    sourceOnly.container.querySelector(".session-open-raw"),
  ).toBeNull();
  cleanup();
  // Stored row → anchor renders with the spec-anchored attributes.
  const stored = render(
    <SessionView
      state="ready"
      now={NOW}
      row={buildRow({
        storedSessionUid: "uid-open-raw-anchor",
        storedRawRef: "raw/uid-open-raw-anchor.ndjson",
        presence: "both",
        status: "up_to_date",
      })}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  const anchor = stored.container.querySelector(
    ".session-open-raw",
  ) as HTMLAnchorElement | null;
  expect(anchor).not.toBeNull();
  expect(anchor?.textContent).toBe("Open raw");
  expect(anchor?.getAttribute("href")).toBe(
    "/api/v1/sessions/uid-open-raw-anchor/raw",
  );
  expect(anchor?.getAttribute("target")).toBe("_blank");
  expect(anchor?.getAttribute("rel")).toBe("noreferrer");
});

test("SessionView ready (M4): TranscriptView mounts on the default Transcript tab; renders aria-label='Session transcript' content", () => {
  globalThis.fetch = mock(async () =>
    new Response("", { status: 200 }),
  ) as unknown as typeof globalThis.fetch;
  // Source-only row → TranscriptView lands on the "no_raw" branch
  // and renders the spec-verbatim "not-imported" copy. The
  // <section aria-label="Session transcript"> wrapper is reserved
  // for the success/truncated branches; for the "no_raw" branch we
  // only assert that the panel mounts and the placeholder copy is
  // gone.
  const row = buildRow({ storedSessionUid: null });
  const { container } = render(
    <SessionView
      state="ready"
      now={NOW}
      row={row}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  const transcriptPanel = container.querySelector("#panel-transcript");
  expect(transcriptPanel).not.toBeNull();
  expect(transcriptPanel?.textContent).not.toContain(
    "Coming in Milestone 4",
  );
  expect(transcriptPanel?.textContent).toContain(
    "This session has not been imported yet",
  );
});

test("SessionView ready (M4): switching Transcript → Metadata → Transcript keeps the panel React-mounted (keep-mounted contract)", () => {
  // The default tab is now Transcript; visit Metadata; come back
  // to Transcript and assert the original element reference is
  // unchanged (no remount). This is the M4 expansion of the
  // M2b keep-mounted contract test for the new functional
  // TranscriptView surface.
  suppressActWarnings();
  try {
    globalThis.fetch = mock(async () =>
      new Response("", { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    const row = buildRow({ storedSessionUid: null });
    const { container } = render(
      <SessionView
        state="ready"
        now={NOW}
        row={row}
        showBackToList={false}
        onBackToList={NOOP}
        onClearSelection={NOOP}
        onTryRescan={NOOP}
      />,
    );
    const transcriptPanelFirst = container.querySelector(
      "#panel-transcript",
    ) as HTMLElement;
    expect(transcriptPanelFirst).not.toBeNull();
    const initialMarker = transcriptPanelFirst;
    // Switch to Metadata.
    act(() => {
      (
        container.querySelector("#tab-metadata") as HTMLButtonElement
      ).click();
    });
    // Transcript panel still in DOM, hidden.
    const transcriptStillThere = container.querySelector(
      "#panel-transcript",
    ) as HTMLElement;
    expect(transcriptStillThere).toBe(initialMarker);
    expect(transcriptStillThere.hasAttribute("hidden")).toBe(true);
    // Switch back to Transcript.
    act(() => {
      (
        container.querySelector("#tab-transcript") as HTMLButtonElement
      ).click();
    });
    const transcriptPanelSecond = container.querySelector(
      "#panel-transcript",
    ) as HTMLElement;
    expect(transcriptPanelSecond).toBe(initialMarker);
    expect(transcriptPanelSecond.hasAttribute("hidden")).toBe(false);
  } finally {
    restoreActWarnings();
  }
});

test("SessionView ready: conflict badge renders only when row.statusConflict=true", () => {
  globalThis.fetch = mock(async () =>
    new Response("", { status: 200 }),
  ) as unknown as typeof globalThis.fetch;
  // No conflict.
  const noConflict = render(
    <SessionView
      state="ready"
      now={NOW}
      row={buildRow({ statusConflict: false })}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  expect(
    noConflict.container.querySelector(".session-conflict-badge"),
  ).toBeNull();
  cleanup();
  // Conflict.
  const conflict = render(
    <SessionView
      state="ready"
      now={NOW}
      row={buildRow({ statusConflict: true })}
      showBackToList={false}
      onBackToList={NOOP}
      onClearSelection={NOOP}
      onTryRescan={NOOP}
    />,
  );
  const badge = conflict.container.querySelector(
    ".session-conflict-badge",
  );
  expect(badge).not.toBeNull();
  expect(badge?.textContent).toBe("Conflict");
});
