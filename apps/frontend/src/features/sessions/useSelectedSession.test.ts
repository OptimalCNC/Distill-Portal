// Tests for `useSelectedSession` — the `?session=<rowKey>` URL hook.
//
// Coverage (per chunk dispatch brief):
//   - initial mount reads URLSearchParams.get("session") and pre-
//     selects
//   - initial mount with no `?session=` param: selectedRowKey === null
//   - selectRow(key) updates state AND calls replaceState with
//     `?session=key`
//   - selectRow(null) removes the session param while preserving
//     other query params (e.g. `?foo=bar`)
//   - popstate event re-reads URL and syncs selectedRowKey without
//     calling replaceState
//   - buildUrl preserves all other query params verbatim
//   - popstate listener cleaned up on unmount
//
// Uses happy-dom (preloaded by `bunfig.toml`) for window.location +
// window.history + URLSearchParams. We mutate location.search via
// `history.replaceState` (the browser-correct way; happy-dom
// supports it) and dispatch synthetic `PopStateEvent`s on `window`.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSelectedSession, buildUrl } from "./useSelectedSession";

afterEach(() => {
  cleanup();
  // Reset URL between tests so leftover state doesn't bleed.
  window.history.replaceState(null, "", "/");
});

beforeEach(() => {
  // Same — reset before each test for symmetry.
  window.history.replaceState(null, "", "/");
});

test("useSelectedSession: initial mount with no ?session= → selectedRowKey is null", () => {
  window.history.replaceState(null, "", "/");
  const { result } = renderHook(() => useSelectedSession());
  expect(result.current.selectedRowKey).toBeNull();
});

test("useSelectedSession: initial mount reads URLSearchParams.get('session') and pre-selects", () => {
  window.history.replaceState(null, "", "/?session=foo-key");
  const { result } = renderHook(() => useSelectedSession());
  expect(result.current.selectedRowKey).toBe("foo-key");
});

test("useSelectedSession: selectRow(key) updates state AND calls replaceState with ?session=key", () => {
  window.history.replaceState(null, "", "/");
  const { result } = renderHook(() => useSelectedSession());
  act(() => {
    result.current.selectRow("alpha");
  });
  expect(result.current.selectedRowKey).toBe("alpha");
  expect(window.location.search).toBe("?session=alpha");
});

test("useSelectedSession: selectRow(null) removes the session param while preserving other query params", () => {
  // Pre-seed the URL with both `session` and an unrelated `foo` key.
  window.history.replaceState(null, "", "/?foo=bar&session=alpha");
  const { result } = renderHook(() => useSelectedSession());
  expect(result.current.selectedRowKey).toBe("alpha");
  act(() => {
    result.current.selectRow(null);
  });
  expect(result.current.selectedRowKey).toBeNull();
  // `?foo=bar` is preserved; `session` is gone.
  const params = new URLSearchParams(window.location.search);
  expect(params.get("foo")).toBe("bar");
  expect(params.has("session")).toBe(false);
});

test("useSelectedSession: popstate event re-reads URL and syncs selectedRowKey", () => {
  window.history.replaceState(null, "", "/?session=initial");
  const { result } = renderHook(() => useSelectedSession());
  expect(result.current.selectedRowKey).toBe("initial");

  // Simulate a Back/Forward navigation: change the URL THEN dispatch
  // popstate. Order matters — popstate's handler re-reads
  // window.location.search.
  act(() => {
    window.history.replaceState(null, "", "/?session=after-back");
    const PopStateEventCtor =
      (globalThis as unknown as { window: { PopStateEvent: typeof PopStateEvent } })
        .window.PopStateEvent;
    window.dispatchEvent(new PopStateEventCtor("popstate"));
  });
  expect(result.current.selectedRowKey).toBe("after-back");
});

test("useSelectedSession: popstate handler does NOT call replaceState (no feedback loop)", () => {
  // Spy on history.replaceState. The popstate handler should ONLY
  // call setState — calling replaceState from the popstate path
  // would feedback-loop with the browser's own URL push.
  window.history.replaceState(null, "", "/?session=initial");
  const { result } = renderHook(() => useSelectedSession());
  expect(result.current.selectedRowKey).toBe("initial");

  const original = window.history.replaceState.bind(window.history);
  let calls = 0;
  window.history.replaceState = ((
    state: unknown,
    title: string,
    url?: string | null,
  ) => {
    calls += 1;
    return original(state, title, url ?? null);
  }) as typeof window.history.replaceState;

  try {
    act(() => {
      // Update the URL directly (simulating the browser's own update
      // for Back/Forward) and then dispatch popstate.
      original(null, "", "/?session=via-popstate");
      const PopStateEventCtor =
        (globalThis as unknown as { window: { PopStateEvent: typeof PopStateEvent } })
          .window.PopStateEvent;
      window.dispatchEvent(new PopStateEventCtor("popstate"));
    });
    // The popstate handler should not have called the spy at all.
    expect(calls).toBe(0);
    expect(result.current.selectedRowKey).toBe("via-popstate");
  } finally {
    window.history.replaceState = original;
  }
});

test("buildUrl preserves all other query params verbatim", () => {
  window.history.replaceState(null, "", "/?foo=bar&baz=qux");
  // Setting session="x" should keep foo + baz.
  const url1 = buildUrl("x");
  const params1 = new URLSearchParams(url1.split("?")[1] ?? "");
  expect(params1.get("foo")).toBe("bar");
  expect(params1.get("baz")).toBe("qux");
  expect(params1.get("session")).toBe("x");

  // Removing session entirely must leave the other keys intact.
  window.history.replaceState(null, "", "/?foo=bar&baz=qux&session=x");
  const url2 = buildUrl(null);
  const params2 = new URLSearchParams(url2.split("?")[1] ?? "");
  expect(params2.get("foo")).toBe("bar");
  expect(params2.get("baz")).toBe("qux");
  expect(params2.has("session")).toBe(false);
});

test("useSelectedSession: popstate listener cleaned up on unmount", () => {
  window.history.replaceState(null, "", "/?session=initial");
  const { result, unmount } = renderHook(() => useSelectedSession());
  expect(result.current.selectedRowKey).toBe("initial");

  // Unmount; subsequent popstate events must NOT mutate state of an
  // unmounted component. We verify this via the "no warnings about
  // setting state on unmounted component" approach — attempt the
  // dispatch and make sure no error throws (happy-dom does not warn,
  // but the listener's removeEventListener must have been called).
  // The cleanest assertion is to spy on removeEventListener.
  const removeEventListenerSpy = (() => {
    let called: { type: string; fn: EventListener } | null = null;
    const original = window.removeEventListener.bind(window);
    window.removeEventListener = ((
      type: string,
      fn: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === "popstate") {
        called = { type, fn: fn as EventListener };
      }
      return original(
        type,
        fn,
        options as boolean | EventListenerOptions | undefined,
      );
    }) as typeof window.removeEventListener;
    return {
      called: () => called,
      restore: () => {
        window.removeEventListener = original;
      },
    };
  })();

  try {
    unmount();
    expect(removeEventListenerSpy.called()).not.toBeNull();
  } finally {
    removeEventListenerSpy.restore();
  }
});
