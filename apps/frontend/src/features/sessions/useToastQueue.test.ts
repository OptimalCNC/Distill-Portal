// useToastQueue hook test surface.
//
// Coverage:
//   (1) push appends to the queue (newest first).
//   (2) dismiss removes the matched id.
//   (3) dismiss with an unknown id is a no-op (returns same reference;
//       tested behaviorally — no error, no length change).
//   (4) Queue cap drops the oldest entry when maxQueueLength is exceeded.
//   (5) IDs are stable: two pushes in the same render tick get distinct
//       ids; a dismiss + push cycle does not reuse a dismissed id.
//
// We use renderHook from @testing-library/react so the hook runs in
// a real React lifecycle (rather than calling the function directly,
// which would bypass useState).
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useToastQueue } from "./useToastQueue";

afterEach(() => {
  cleanup();
});

test("useToastQueue: starts with an empty queue", () => {
  const { result } = renderHook(() => useToastQueue());
  expect(result.current.toasts).toEqual([]);
});

test("useToastQueue: push prepends a toast and assigns a stable id", () => {
  const { result } = renderHook(() => useToastQueue());
  act(() => {
    result.current.pushToast({ kind: "success", title: "A" });
  });
  expect(result.current.toasts.length).toBe(1);
  const first = result.current.toasts[0]!;
  expect(first.title).toBe("A");
  expect(first.kind).toBe("success");
  expect(typeof first.id).toBe("string");
  expect(first.id.length).toBeGreaterThan(0);
});

test("useToastQueue: pushes are newest-first", () => {
  const { result } = renderHook(() => useToastQueue());
  act(() => {
    result.current.pushToast({ kind: "info", title: "first" });
  });
  act(() => {
    result.current.pushToast({ kind: "info", title: "second" });
  });
  expect(result.current.toasts.map((t) => t.title)).toEqual([
    "second",
    "first",
  ]);
});

test("useToastQueue: dismiss removes the matched id", () => {
  const { result } = renderHook(() => useToastQueue());
  act(() => {
    result.current.pushToast({ kind: "info", title: "keep" });
  });
  act(() => {
    result.current.pushToast({ kind: "info", title: "drop" });
  });
  const dropId = result.current.toasts[0]!.id;
  act(() => {
    result.current.dismissToast(dropId);
  });
  expect(result.current.toasts.map((t) => t.title)).toEqual(["keep"]);
});

test("useToastQueue: dismiss with unknown id is a no-op", () => {
  const { result } = renderHook(() => useToastQueue());
  act(() => {
    result.current.pushToast({ kind: "info", title: "stays" });
  });
  const before = result.current.toasts;
  act(() => {
    result.current.dismissToast("toast-does-not-exist");
  });
  // Same array reference -> no re-render burned.
  expect(result.current.toasts).toBe(before);
  expect(result.current.toasts.length).toBe(1);
});

test("useToastQueue: queue cap drops the oldest entry when exceeded", () => {
  const { result } = renderHook(() => useToastQueue(3));
  for (const title of ["a", "b", "c", "d", "e"]) {
    act(() => {
      result.current.pushToast({ kind: "info", title });
    });
  }
  // Queue is newest-first; we kept the 3 newest (e, d, c).
  expect(result.current.toasts.map((t) => t.title)).toEqual(["e", "d", "c"]);
});

test("useToastQueue: distinct ids across concurrent pushes", () => {
  const { result } = renderHook(() => useToastQueue());
  act(() => {
    result.current.pushToast({ kind: "info", title: "1" });
    result.current.pushToast({ kind: "info", title: "2" });
    result.current.pushToast({ kind: "info", title: "3" });
  });
  const ids = new Set(result.current.toasts.map((t) => t.id));
  expect(ids.size).toBe(3);
});

test("useToastQueue: dismissed ids are not reused on subsequent pushes", () => {
  const { result } = renderHook(() => useToastQueue());
  act(() => {
    result.current.pushToast({ kind: "info", title: "first" });
  });
  const firstId = result.current.toasts[0]!.id;
  act(() => {
    result.current.dismissToast(firstId);
  });
  act(() => {
    result.current.pushToast({ kind: "info", title: "second" });
  });
  const secondId = result.current.toasts[0]!.id;
  expect(secondId).not.toBe(firstId);
});
