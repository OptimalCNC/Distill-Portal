// Pinned-`now` truth table for `relativeTimeFrom`.
//
// All cases pin `now` to a fixture; the helper is pure and never reads
// `Date.now()` internally, so identical inputs always produce identical
// outputs (same call, same render, same test run).
import { expect, test } from "bun:test";
import { relativeTimeFrom } from "./relativeTime";

const NOW = "2026-04-25T12:00:00Z";

test("relativeTimeFrom: null then -> em-dash", () => {
  expect(relativeTimeFrom(NOW, null)).toBe("—");
});

test("relativeTimeFrom: within 30 seconds -> 'just now' in either direction", () => {
  expect(relativeTimeFrom(NOW, "2026-04-25T12:00:00Z")).toBe("just now");
  expect(relativeTimeFrom(NOW, "2026-04-25T11:59:55Z")).toBe("just now");
  expect(relativeTimeFrom(NOW, "2026-04-25T12:00:05Z")).toBe("just now");
});

test("relativeTimeFrom: minutes ago", () => {
  expect(relativeTimeFrom(NOW, "2026-04-25T11:55:00Z")).toBe("5m ago");
  expect(relativeTimeFrom(NOW, "2026-04-25T11:01:00Z")).toBe("59m ago");
});

test("relativeTimeFrom: minutes future", () => {
  expect(relativeTimeFrom(NOW, "2026-04-25T12:05:00Z")).toBe("in 5m");
});

test("relativeTimeFrom: hours ago", () => {
  expect(relativeTimeFrom(NOW, "2026-04-25T07:00:00Z")).toBe("5h ago");
});

test("relativeTimeFrom: hours future", () => {
  expect(relativeTimeFrom(NOW, "2026-04-25T15:00:00Z")).toBe("in 3h");
});

test("relativeTimeFrom: days ago", () => {
  expect(relativeTimeFrom(NOW, "2026-04-22T12:00:00Z")).toBe("3d ago");
});

test("relativeTimeFrom: days future", () => {
  expect(relativeTimeFrom(NOW, "2026-04-28T12:00:00Z")).toBe("in 3d");
});

test("relativeTimeFrom: weeks ago", () => {
  expect(relativeTimeFrom(NOW, "2026-02-25T12:00:00Z")).toBe("8w ago");
});

test("relativeTimeFrom: years ago", () => {
  expect(relativeTimeFrom(NOW, "2024-04-25T12:00:00Z")).toBe("2y ago");
});

test("relativeTimeFrom: deterministic — same call, same answer", () => {
  const a = relativeTimeFrom(NOW, "2026-04-22T12:00:00Z");
  const b = relativeTimeFrom(NOW, "2026-04-22T12:00:00Z");
  const c = relativeTimeFrom(NOW, "2026-04-22T12:00:00Z");
  expect(a).toBe(b);
  expect(b).toBe(c);
});

test("relativeTimeFrom: accepts Date instances on either side", () => {
  expect(
    relativeTimeFrom(new Date(NOW), new Date("2026-04-25T11:55:00Z")),
  ).toBe("5m ago");
});

test("relativeTimeFrom: malformed `then` string -> em-dash", () => {
  expect(relativeTimeFrom(NOW, "not-a-timestamp")).toBe("—");
});
