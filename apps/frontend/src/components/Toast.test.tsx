// Toast component test surface.
//
// Coverage:
//   (1) Each kind ("success" | "error" | "info") renders the matching
//       CSS class and the appropriate ARIA role (error -> alert,
//       others -> status).
//   (2) The Retry button only renders when `onRetry` is provided;
//       clicking it invokes the handler exactly once.
//   (3) The Dismiss button is always rendered; clicking it invokes
//       `onDismiss(id)` with the toast's own id (so the queue can
//       filter by identity).
//   (4) The optional `details` disclosure renders a `<details>` block
//       with a `<summary>` and the supplied children. Without
//       details, no disclosure is rendered.
//   (5) `message` is optional; rendering without it omits the
//       `.toast-message` paragraph rather than leaving an empty one.
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { Toast } from "./Toast";

afterEach(() => {
  cleanup();
});

test("Toast: kind=success renders class .toast.success and role=status", () => {
  const { container } = render(
    <Toast
      id="t1"
      kind="success"
      title="Rescan complete"
      message="Discovered 12 files"
      onDismiss={() => {}}
    />,
  );
  const root = container.querySelector(".toast");
  expect(root).not.toBeNull();
  expect(root!.classList.contains("success")).toBe(true);
  expect(root!.getAttribute("role")).toBe("status");
  expect(root!.getAttribute("data-toast-id")).toBe("t1");
  expect(
    root!.querySelector(".toast-title")?.textContent,
  ).toBe("Rescan complete");
});

test("Toast: kind=error renders class .toast.error and role=alert", () => {
  const { container } = render(
    <Toast
      id="t2"
      kind="error"
      title="Rescan failed"
      message="Network down"
      onDismiss={() => {}}
    />,
  );
  const root = container.querySelector(".toast");
  expect(root).not.toBeNull();
  expect(root!.classList.contains("error")).toBe(true);
  expect(root!.getAttribute("role")).toBe("alert");
});

test("Toast: kind=info renders class .toast.info and role=status", () => {
  const { container } = render(
    <Toast
      id="t3"
      kind="info"
      title="Just FYI"
      onDismiss={() => {}}
    />,
  );
  const root = container.querySelector(".toast");
  expect(root!.classList.contains("info")).toBe(true);
  expect(root!.getAttribute("role")).toBe("status");
});

test("Toast: Retry button only renders when onRetry is provided", () => {
  // Without onRetry: no Retry button.
  const { container } = render(
    <Toast
      id="t4"
      kind="error"
      title="Failed"
      onDismiss={() => {}}
    />,
  );
  expect(container.querySelector(".toast-retry")).toBeNull();
});

test("Toast: Retry button click invokes onRetry exactly once", () => {
  const onRetry = mock(() => {});
  const onDismiss = mock(() => {});
  const { container } = render(
    <Toast
      id="t5"
      kind="error"
      title="Failed"
      onRetry={onRetry}
      onDismiss={onDismiss}
    />,
  );
  const retry = container.querySelector<HTMLButtonElement>(".toast-retry");
  expect(retry).not.toBeNull();
  retry!.click();
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(0);
});

test("Toast: Dismiss button click invokes onDismiss(id) with the toast's id", () => {
  const onDismiss = mock<(id: string) => void>(() => {});
  const { container } = render(
    <Toast
      id="t6"
      kind="success"
      title="OK"
      onDismiss={onDismiss}
    />,
  );
  const dismiss = container.querySelector<HTMLButtonElement>(
    ".toast-dismiss",
  );
  expect(dismiss).not.toBeNull();
  dismiss!.click();
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledWith("t6");
});

test("Toast: details prop renders a collapsible <details> disclosure", () => {
  const { container } = render(
    <Toast
      id="t7"
      kind="success"
      title="Done"
      onDismiss={() => {}}
      details={<dl><dt>files</dt><dd>12</dd></dl>}
    />,
  );
  const details = container.querySelector("details.toast-details");
  expect(details).not.toBeNull();
  // Default-collapsed: the `open` attribute is absent.
  expect(details!.hasAttribute("open")).toBe(false);
  expect(details!.querySelector("summary")?.textContent).toBe("Details");
  expect(details!.querySelector("dt")?.textContent).toBe("files");
  expect(details!.querySelector("dd")?.textContent).toBe("12");
});

test("Toast: details omitted -> no disclosure node renders", () => {
  const { container } = render(
    <Toast
      id="t8"
      kind="success"
      title="Done"
      onDismiss={() => {}}
    />,
  );
  expect(container.querySelector("details.toast-details")).toBeNull();
});

test("Toast: message omitted -> .toast-message paragraph not rendered", () => {
  const { container } = render(
    <Toast
      id="t9"
      kind="info"
      title="No body"
      onDismiss={() => {}}
    />,
  );
  expect(container.querySelector(".toast-message")).toBeNull();
});

test("Toast: message provided -> .toast-message paragraph renders the value", () => {
  const { container } = render(
    <Toast
      id="t10"
      kind="info"
      title="With body"
      message="hello world"
      onDismiss={() => {}}
    />,
  );
  expect(
    container.querySelector(".toast-message")?.textContent,
  ).toBe("hello world");
});
