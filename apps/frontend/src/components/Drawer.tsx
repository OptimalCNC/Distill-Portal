// Generic shell that wraps the native HTML `<dialog>` element.
//
// Why native `<dialog>` instead of a hand-rolled modal:
//   - The platform delegates focus-trap, Esc-close, and focus-restoration
//     semantics so we do not have to re-implement them. Hand-rolled focus
//     traps are a recurring source of a11y bugs and are not worth
//     re-implementing in Phase 4.
//   - One drawer at a time falls out of `showModal()` semantics: a second
//     `showModal()` call on a different `<dialog>` raises
//     `InvalidStateError` in real Chromium, which is the correct
//     behaviour. The Phase 4 spec is explicit ("One drawer at a time").
//
// Per `working/phase-4.md` §Dependency Policy the only browser target is
// Chromium; the documented escape hatch (a focus-management package)
// fires only if the Playwright real-Chromium reproducer fails. THIS
// CHUNK FIRED THE ESCAPE HATCH:
//
//   Reproducer (apps/frontend/e2e/inspection.spec.ts step 9): with a
//   3-focusable-element drawer (Close, Copy path, View raw), open the
//   drawer via Enter on a row, then press Tab repeatedly. After Tab
//   #3 the activeElement leaves the dialog subtree (escapes to BODY),
//   meaning native `<dialog>` does NOT cycle Tab back to the first
//   focusable element. This contradicts the platform's "inert outside,
//   trap inside" expectation that the spec leaned on. Captured as
//   "focus-trap broke after Tab #3; activeElement: BODY" in the chunk
//   evidence pack.
//
// Mitigation per spec: add `focus-trap-react` (one small focus-
// management package) and wrap the dialog children. Component tests
// run under happy-dom; happy-dom does NOT implement Tab cycling, so
// the component-level suite covers only the wiring (`showModal` /
// `close` calls, `close`-event callback, backdrop-click callback,
// restoreFocusRef on close). The real focus-trap assertion lives in
// the Playwright spec.
//
// happy-dom v20 quirk: dispatching a `keydown` Escape on a `<dialog>`
// does NOT close it natively (real Chromium does). To make the
// component-level Esc test meaningful we wire an explicit `keydown`
// listener on the dialog that calls `dialog.close()` when key === Escape.
// In real Chromium this is harmless — the native handler runs first and
// the `dialog.close()` short-circuits because `dialog.open` is already
// false by the time our handler runs.
//
// The drawer is always rendered (never conditionally unmounted); the
// `isOpen` prop drives the imperative `showModal()` / `close()` calls
// inside a `useEffect`. This keeps the underlying `<dialog>` ref stable
// across opens.
import { useEffect, useRef } from "react";
import { FocusTrap } from "focus-trap-react";

export type DrawerProps = {
  /** Whether the drawer should be open. Toggling this prop from false to
   *  true calls `dialog.showModal()`; from true to false calls
   *  `dialog.close()` if the dialog is currently open. */
  isOpen: boolean;
  /** Fires when the platform `close` event lands on the dialog (Esc,
   *  programmatic `dialog.close()`, or our backdrop / close-button
   *  shims). The parent owns the `isOpen` boolean and is responsible
   *  for flipping it to false in response. */
  onClose: () => void;
  /** Element to restore focus to after the drawer closes. The native
   *  `<dialog>` already restores focus to the previously-focused
   *  element when `dialog.close()` runs, so this prop is only useful
   *  when the trigger is unmounted/replaced between open and close, or
   *  when the test environment does not implement the platform
   *  restoration (happy-dom). When set, the close handler will call
   *  `restoreFocusRef.current?.focus()` after `onClose`. */
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  /** Drawer contents — header, body, copy buttons, etc. The drawer
   *  always renders a close button as the first focusable child, so
   *  consumers do not need to add their own. */
  children: React.ReactNode;
  /** Accessible label for the dialog (announced by screen readers when
   *  the dialog opens). Defaults to "Drawer". */
  ariaLabel?: string;
};

export function Drawer({
  isOpen,
  onClose,
  restoreFocusRef,
  children,
  ariaLabel,
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Imperatively sync the dialog's open state with the `isOpen` prop.
  // We deliberately do NOT use the React `open` attribute on `<dialog>`:
  // setting it directly bypasses `showModal()` and you lose the modal
  // behaviour (focus trap, backdrop, etc.). The platform requires the
  // imperative `showModal()` / `close()` calls.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Wire the platform `close` event to the parent's `onClose` callback.
  // `close` fires on Esc (Chromium), on `dialog.close()` (any path), and
  // when the close button or backdrop click handlers below call
  // `dialog.close()`. We wire it once on mount.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const handler = () => {
      onClose();
      // happy-dom does not implement the platform focus restoration on
      // dialog close; fall back to the explicit ref when the consumer
      // provided one. In real Chromium the native restoration has
      // already run by this point — focusing again is idempotent.
      if (restoreFocusRef?.current) {
        restoreFocusRef.current.focus();
      }
    };
    dialog.addEventListener("close", handler);
    return () => {
      dialog.removeEventListener("close", handler);
    };
  }, [onClose, restoreFocusRef]);

  // Backdrop click: a click whose target IS the dialog itself (not a
  // descendant) lands on the backdrop. Closing on backdrop click is the
  // standard `<dialog>` UX expectation; the platform does not provide
  // this for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const handler = (event: MouseEvent) => {
      if (event.target === dialog) {
        dialog.close();
      }
    };
    dialog.addEventListener("click", handler);
    return () => {
      dialog.removeEventListener("click", handler);
    };
  }, []);

  // Esc fallback: happy-dom does not auto-close on Esc keydown (real
  // Chromium does). We wire an explicit handler so component-level
  // tests pass and so any Chromium quirk where the native handler is
  // disabled (e.g. a captured event upstream) still closes the drawer.
  // The handler is a no-op in real Chromium when the platform has
  // already closed the dialog by the time our React listener fires.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dialog.open) {
        // Prevent the platform default to avoid a duplicate `close`
        // event fire in Chromium where the native handler has not yet
        // run; `dialog.close()` will fire `close` once.
        event.preventDefault();
        dialog.close();
      }
    };
    dialog.addEventListener("keydown", handler);
    return () => {
      dialog.removeEventListener("keydown", handler);
    };
  }, []);

  const handleCloseClick = () => {
    const dialog = dialogRef.current;
    if (dialog !== null && dialog.open) {
      dialog.close();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-label={ariaLabel ?? "Drawer"}
    >
      {/* `focus-trap-react` is the documented escape-hatch dependency
       *  (per `working/phase-4.md` §Dependency Policy). It activates
       *  when `isOpen` is true and ensures Tab/Shift+Tab cycle
       *  WITHIN the dialog (which native `<dialog>` does NOT do
       *  reliably — see header comment for the failing reproducer).
       *
       *  - `escapeDeactivates: false` so our own keydown handler
       *    above is still the source of truth for Esc-close
       *    (single code path: dialog.close() -> close event ->
       *    onClose). Without this, focus-trap-react would also
       *    trigger deactivation on Esc, double-firing onClose.
       *  - `clickOutsideDeactivates: false` because the dialog
       *    occupies the entire viewport when open and we already
       *    handle backdrop clicks via the dialog's click handler.
       *  - `allowOutsideClick: true` so the backdrop click
       *    handler can fire (focus-trap-react would otherwise
       *    swallow the event). */}
      <FocusTrap
        active={isOpen}
        focusTrapOptions={{
          escapeDeactivates: false,
          clickOutsideDeactivates: false,
          allowOutsideClick: true,
          // Initial focus lands on the close button, the first
          // child of the trap.
          initialFocus: () => {
            const dialog = dialogRef.current;
            return dialog?.querySelector<HTMLButtonElement>(
              "button.drawer-close",
            ) ?? false;
          },
          // The trap's container is the inner div; the dialog is
          // the parent. Prevent the trap from focusing the dialog
          // itself.
          fallbackFocus: () => {
            const dialog = dialogRef.current;
            return (
              dialog?.querySelector<HTMLButtonElement>(
                "button.drawer-close",
              ) ?? document.body
            );
          },
        }}
      >
        <div className="drawer-trap">
          <button
            type="button"
            className="drawer-close"
            aria-label="Close drawer"
            onClick={handleCloseClick}
          >
            Close
          </button>
          {children}
        </div>
      </FocusTrap>
    </dialog>
  );
}
