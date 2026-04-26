// Component-level tests for the native-`<dialog>`-backed Drawer shell.
//
// happy-dom v20 quirks documented during the probe (see Handoff Notes
// in the chunk evidence pack):
//   - `dialog.showModal()` and `dialog.close()` work; `dialog.open`
//     flips correctly.
//   - `dialog.close()` fires the platform `close` event.
//   - `keydown` Escape on the dialog does NOT auto-close (real Chromium
//     does). The Drawer wires an explicit Esc handler so this test
//     exercises the same code path that fires in Chromium.
//   - Backdrop click semantics work: a click whose `event.target` is
//     the `<dialog>` element itself (not a descendant) lands on the
//     backdrop.
//   - happy-dom does NOT implement the platform focus-trap (Tab
//     cycling). That's exclusively a Playwright concern; this file
//     only covers the wiring.
//   - happy-dom does NOT implement the platform focus-restoration on
//     `close`. The Drawer reads `restoreFocusRef` and calls
//     `restoreFocusRef.current?.focus()` after `onClose`, so the
//     restoration test below works under happy-dom.
import { afterEach, expect, mock, test } from "bun:test";
import { useRef, useState } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { Drawer } from "./Drawer";

afterEach(() => {
  cleanup();
});

test("Drawer renders a <dialog> with the children inside", () => {
  const onClose = mock(() => {});
  const { container } = render(
    <Drawer isOpen={false} onClose={onClose}>
      <p data-testid="drawer-body">hello</p>
    </Drawer>,
  );
  const dialog = container.querySelector("dialog");
  expect(dialog).not.toBeNull();
  expect(dialog?.classList.contains("drawer")).toBe(true);
  expect(dialog?.querySelector('[data-testid="drawer-body"]')).not.toBeNull();
  // The close button is the first focusable child so the user can close
  // via keyboard without depending on focus trap semantics.
  const closeBtn = dialog?.querySelector(
    'button[aria-label="Close drawer"]',
  );
  expect(closeBtn).not.toBeNull();
});

test("Drawer.showModal called when isOpen flips to true", () => {
  const onClose = mock(() => {});
  const { container, rerender } = render(
    <Drawer isOpen={false} onClose={onClose}>
      <p>hi</p>
    </Drawer>,
  );
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  expect(dialog.open).toBe(false);
  rerender(
    <Drawer isOpen={true} onClose={onClose}>
      <p>hi</p>
    </Drawer>,
  );
  expect(dialog.open).toBe(true);
});

test("Drawer.close called when isOpen flips to false", () => {
  const onClose = mock(() => {});
  const { container, rerender } = render(
    <Drawer isOpen={true} onClose={onClose}>
      <p>hi</p>
    </Drawer>,
  );
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  expect(dialog.open).toBe(true);
  rerender(
    <Drawer isOpen={false} onClose={onClose}>
      <p>hi</p>
    </Drawer>,
  );
  expect(dialog.open).toBe(false);
  // The close-driven `onClose` callback fired exactly once.
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Drawer Esc keydown closes the dialog and fires onClose", () => {
  const onClose = mock(() => {});
  const { container } = render(
    <Drawer isOpen={true} onClose={onClose}>
      <p>hi</p>
    </Drawer>,
  );
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  expect(dialog.open).toBe(true);
  // happy-dom does not expose KeyboardEvent on globalThis; reach for it
  // through `window`, which the test-setup preload populates.
  const KeyboardEventCtor =
    (globalThis as unknown as { window: { KeyboardEvent: typeof KeyboardEvent } })
      .window.KeyboardEvent;
  const esc = new KeyboardEventCtor("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    dialog.dispatchEvent(esc);
  });
  expect(dialog.open).toBe(false);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Drawer close button click fires onClose", () => {
  const onClose = mock(() => {});
  const { container } = render(
    <Drawer isOpen={true} onClose={onClose}>
      <p>hi</p>
    </Drawer>,
  );
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  expect(dialog.open).toBe(true);
  const closeBtn = dialog.querySelector(
    'button[aria-label="Close drawer"]',
  ) as HTMLButtonElement;
  expect(closeBtn).not.toBeNull();
  act(() => {
    closeBtn.click();
  });
  expect(dialog.open).toBe(false);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Drawer backdrop click (event.target === dialog) fires onClose", () => {
  const onClose = mock(() => {});
  const { container } = render(
    <Drawer isOpen={true} onClose={onClose}>
      <p data-testid="inner">hi</p>
    </Drawer>,
  );
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  expect(dialog.open).toBe(true);
  // Click DIRECTLY on the dialog: a backdrop click is a click whose
  // event.target IS the dialog element itself (not a descendant).
  // happy-dom's `dialog.click()` synthesizes exactly this.
  act(() => {
    dialog.click();
  });
  expect(dialog.open).toBe(false);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Drawer click on inner content does NOT close (target !== dialog)", () => {
  const onClose = mock(() => {});
  const { container } = render(
    <Drawer isOpen={true} onClose={onClose}>
      <p data-testid="inner">hi</p>
    </Drawer>,
  );
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  const inner = dialog.querySelector(
    '[data-testid="inner"]',
  ) as HTMLParagraphElement;
  expect(dialog.open).toBe(true);
  act(() => {
    inner.click();
  });
  // Inner clicks bubble to the dialog but the target is the inner
  // element, so the backdrop guard short-circuits and the dialog
  // stays open.
  expect(dialog.open).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(0);
});

test("Drawer restores focus to restoreFocusRef.current on close", () => {
  // Build a small harness with a trigger button outside the dialog,
  // open the drawer, close it, then assert the trigger has focus.
  // happy-dom does not implement platform focus restoration; the
  // Drawer's explicit `restoreFocusRef.current?.focus()` call inside
  // the close handler is the path under test.
  function Harness() {
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setOpen(true)}
          data-testid="trigger"
        >
          Open
        </button>
        <Drawer
          isOpen={open}
          onClose={() => setOpen(false)}
          restoreFocusRef={triggerRef}
        >
          <p>hi</p>
        </Drawer>
      </>
    );
  }
  const { container } = render(<Harness />);
  const trigger = container.querySelector(
    '[data-testid="trigger"]',
  ) as HTMLButtonElement;
  trigger.focus();
  // Click the trigger to open the drawer.
  act(() => {
    trigger.click();
  });
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  expect(dialog.open).toBe(true);
  // Programmatic close to fire the close event and the restoration.
  act(() => {
    dialog.close();
  });
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
});
