// Accessible tablist primitive for the Phase-5 right-pane tab strip.
//
// Implements the WAI-ARIA APG "tabs" pattern (automatic activation:
// selection follows focus). Rendered as a flat `<div role="tablist">`
// containing one `<button role="tab">` per tab plus a single
// absolutely-positioned `<span class="indicator">` whose
// `transform: translateX(...) scaleX(...)` is computed from the active
// tab's bounding box and animated over `--motion-base` (120 ms)
// `--ease-standard`.
//
// Controlled-only API: `value` + `onValueChange` come from the parent
// (SessionView holds activeTab + visitedTabs). The primitive does NOT
// own the active value, so M2b's `visitedTabs` mechanism stays in
// SessionView and the panels themselves are rendered by the parent.
//
// Accessibility:
//   - `<div role="tablist" aria-label>` wraps the four tab buttons.
//   - Each `<button role="tab" id aria-controls aria-selected
//     tabindex>` carries the WAI-ARIA APG roving-tabindex pattern:
//     exactly one tab has `tabindex="0"` (the active one); the others
//     have `tabindex="-1"`.
//   - Selection follows focus: ArrowLeft / ArrowRight cycle (with
//     wrap); Home / End jump to first / last; Enter / Space are
//     no-ops because activation already happened on focus.
//   - On click → activate + focus.
//   - Indicator is `aria-hidden="true"` — purely decorative.
//
// Indicator measurement:
//   - `useLayoutEffect` re-runs whenever `value` changes AND on
//     `ResizeObserver` watching the tablist (covers viewport resize
//     + Fraunces font swap remeasurement). Computes
//     `tabRect.left - tablistRect.left` and `tabRect.width` directly
//     via `getBoundingClientRect()` and writes a single
//     `transform: translateX(${x}px) scaleX(${width})` declaration
//     so the CSS `transition: transform` animates both components as
//     one compositor-cheap step. NOTE: `scaleX()` takes a UNITLESS
//     number (a multiplier of the element's own width); writing
//     `scaleX(${width}px)` is INVALID CSS and the browser drops the
//     declaration, so we pass the raw pixel count without a unit.
//   - The indicator's CSS base size is `width: 1px; height: 1px;`
//     (Tabs.css). `scaleX(N) × 1 px = N px`; without the 1 px base
//     the empty span would resolve to `width: auto = 0` and the
//     indicator would never appear.
//   - Initial mount uses `requestAnimationFrame` to defer the first
//     measurement by one frame so Fraunces' fallback metrics shifts
//     (M2a §4 documented the ~1 px swap delta on Charter →
//     Fraunces) don't strand the indicator off-target.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import "./Tabs.css";

export type TabDescriptor<TabId extends string> = {
  id: TabId;
  label: string;
  panel: ReactNode | (() => ReactNode);
};

export type TabsProps<TabId extends string> = {
  /** ARIA tablist label; required for screen-reader context. */
  ariaLabel: string;
  /** Currently-active tab id (controlled). */
  value: TabId;
  /** Called when the active tab changes. */
  onValueChange: (next: TabId) => void;
  /** Tabs in render order. The label is the visible button text. */
  tabs: ReadonlyArray<TabDescriptor<TabId>>;
};

export function Tabs<TabId extends string>({
  ariaLabel,
  value,
  onValueChange,
  tabs,
}: TabsProps<TabId>) {
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const tabButtonsRef = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  // Compute + apply the indicator transform. Returns true when the
  // measurement landed (the active tab button was found in the
  // refs map AND the tablist has rendered).
  const measureIndicator = useCallback(() => {
    const indicator = indicatorRef.current;
    const tablist = tablistRef.current;
    if (indicator === null || tablist === null) return false;
    const activeButton = tabButtonsRef.current.get(value) ?? null;
    if (activeButton === null) return false;
    const tablistRect = tablist.getBoundingClientRect();
    const tabRect = activeButton.getBoundingClientRect();
    const x = tabRect.left - tablistRect.left;
    const width = tabRect.width;
    // One declaration so CSS `transition: transform` animates both
    // components as one compositor-cheap step. The base CSS size is
    // 1 × 1 px (see Tabs.css `.tabs .indicator`); `scaleX(N) × 1 = N`
    // grows the indicator to the tab's measured pixel width.
    // `scaleX()` takes a UNITLESS number — `scaleX(${width}px)` is
    // invalid CSS and the browser would drop the whole declaration.
    indicator.style.transform = `translateX(${x}px) scaleX(${width})`;
    return true;
  }, [value]);

  // Run measurement on every active-tab change. `useLayoutEffect`
  // fires synchronously after DOM mutations but before paint, so the
  // user never sees a single-frame "wrong indicator position".
  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator]);

  // Initial mount: defer the FIRST measurement by one rAF so
  // Fraunces fallback metrics settle before we read
  // getBoundingClientRect (M2a §4 documented the ~1 px swap delta).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      measureIndicator();
    });
    return () => cancelAnimationFrame(id);
    // mount-only; subsequent active-tab changes flow through the
    // useLayoutEffect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ResizeObserver watches the tablist itself: viewport resize +
  // Fraunces font swap both fire layout changes that re-flow the
  // tab buttons. Re-measure on every observation.
  useEffect(() => {
    const tablist = tablistRef.current;
    if (tablist === null) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      measureIndicator();
    });
    observer.observe(tablist);
    return () => observer.disconnect();
  }, [measureIndicator]);

  const activate = useCallback(
    (id: TabId, focusButton: boolean) => {
      onValueChange(id);
      if (focusButton) {
        const btn = tabButtonsRef.current.get(id);
        if (btn !== undefined) btn.focus();
      }
    },
    [onValueChange],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const key = event.key;
      if (
        key !== "ArrowLeft" &&
        key !== "ArrowRight" &&
        key !== "Home" &&
        key !== "End"
      ) {
        return;
      }
      event.preventDefault();
      const idx = tabs.findIndex((t) => t.id === value);
      if (idx === -1) return;
      let nextIdx: number;
      if (key === "ArrowLeft") {
        nextIdx = idx === 0 ? tabs.length - 1 : idx - 1;
      } else if (key === "ArrowRight") {
        nextIdx = idx === tabs.length - 1 ? 0 : idx + 1;
      } else if (key === "Home") {
        nextIdx = 0;
      } else {
        nextIdx = tabs.length - 1;
      }
      const nextTab = tabs[nextIdx];
      if (nextTab !== undefined) {
        activate(nextTab.id, true);
      }
    },
    [tabs, value, activate],
  );

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={ariaLabel}
      className="tabs"
      data-active-tab={value}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el === null) {
                tabButtonsRef.current.delete(tab.id);
              } else {
                tabButtonsRef.current.set(tab.id, el);
              }
            }}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-controls={`panel-${tab.id}`}
            aria-selected={isActive ? "true" : "false"}
            tabIndex={isActive ? 0 : -1}
            className="tab"
            onClick={() => activate(tab.id, true)}
          >
            {tab.label}
          </button>
        );
      })}
      <span ref={indicatorRef} className="indicator" aria-hidden="true" />
    </div>
  );
}
