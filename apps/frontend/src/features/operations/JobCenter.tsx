// Phase 9b M3-B — Job Center tray.
//
// Native `<dialog id="jc-dialog">` opened via `showModal()` so the
// platform supplies the focus trap, top-layer rendering, Escape
// handling, and `aria-modal` semantics for free. The tray lists every
// active operation (queued / running / cancel_requested) and the
// most-recent 50 terminal operations as hairline-bordered cards built
// from `OperationCard.tsx`.
//
// Design source-of-truth: `working/phase-9b/designs/m1-job-center/
// design.md` §3.2 (tray frame), §3.3 (header), §3.4 (sections),
// §3.8 (backdrop + empty state). The 54-item acceptance checklist in
// §10 covers items 9–23 + 46–48 here.
//
// Open/close contract: this component is a controlled view of the
// `open` prop owned by App.tsx. The `useEffect` below calls
// `dialog.showModal()` on rising edge and `dialog.close()` on falling
// edge; the `close` event fires on Escape, backdrop click, AND the
// close button, all funneling through `onClose`. Per checklist item
// 54 the App holds no persistence — the tray defaults to closed on
// mount.
//
// Backdrop click: the platform fires a `click` on the `<dialog>`
// element itself when the user clicks the `::backdrop` pseudo-element.
// We compare `event.target === dialogRef.current` to discriminate
// backdrop clicks from inner-content clicks.
//
// Empty states (item 23): when both sections are empty the tray
// renders ONE "No operations." line in lieu of sections; when only
// one is empty the corresponding section renders its label + a
// per-section empty line. The hairline divider between Active and
// Recent shows ONLY when both sections render content (item 22).

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Operation } from "../../lib/contracts";
import { OperationCard } from "./OperationCard";
import "./JobCenter.css";

export interface JobCenterProps {
  open: boolean;
  onClose: () => void;
  /** Pre-sorted by `submitted_at DESC` by the caller. */
  activeOps: Operation[];
  /** Pre-sorted by `submitted_at DESC`, sliced to 50 by the caller. */
  recentOps: Operation[];
  onCancel: (id: string) => void;
}

export function JobCenter({
  open,
  onClose,
  activeOps,
  recentOps,
  onCancel,
}: JobCenterProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Drive the native <dialog> open state from the React prop. The
  // platform `close` event is the single funnel for Escape, backdrop,
  // and close-button paths.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      // Some happy-dom builds throw a SecurityError if showModal() is
      // called twice; guard via dialog.open. In real browsers,
      // showModal() on an already-open dialog throws — same guard.
      try {
        dialog.showModal();
      } catch {
        // Fall back to setting the open attribute. The browser then
        // skips the focus trap, but the UI still renders.
        dialog.setAttribute("open", "");
      }
      // Focus the close button on the next paint so Tab cycles inward
      // and Escape is one keypress away (checklist item 20).
      const raf = requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }

    if (!open && dialog.open) {
      dialog.close();
    }
    return undefined;
  }, [open]);

  // Funnel native `close` events back through onClose. This covers
  // Escape (native dialog cancel/close) AND backdrop-click closes that
  // we route through dialog.close().
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = () => {
      // Only forward when the parent still believes the tray is open
      // — otherwise prop-driven closes would loop.
      if (open) onClose();
    };
    dialog.addEventListener("close", handler);
    return () => dialog.removeEventListener("close", handler);
  }, [open, onClose]);

  // Backdrop click: a click whose target is the dialog itself comes
  // from the ::backdrop. Anything inner-bubbled was caught earlier in
  // the tree.
  const handleDialogClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) {
      // Closing the dialog dispatches the native `close` event, which
      // our other effect funnels into onClose. Avoid calling onClose
      // twice by deferring to that path.
      dialogRef.current?.close();
    }
  };

  const showActive = activeOps.length > 0;
  const showRecent = recentOps.length > 0;
  const showDivider = showActive && showRecent;
  const trayEmpty = activeOps.length === 0 && recentOps.length === 0;

  return (
    <dialog
      ref={dialogRef}
      id="jc-dialog"
      className="jc-dialog"
      aria-labelledby="jc-dialog-title"
      onClick={handleDialogClick}
    >
      <div className="jc-tray">
        <header className="jc-header">
          <h2 id="jc-dialog-title">Job Center</h2>
          <button
            type="button"
            ref={closeButtonRef}
            className="jc-close"
            onClick={onClose}
            aria-label="Close Job Center"
          >
            Close
          </button>
        </header>
        <div
          className="jc-body"
          role="region"
          aria-live="polite"
          aria-labelledby="jc-dialog-title"
        >
          {trayEmpty ? (
            <p className="jc-empty jc-empty-tray">No operations.</p>
          ) : (
            <>
              <section className="jc-section jc-section-active">
                <h3 className="jc-section-title">
                  Active{" "}
                  <span className="jc-section-count">{activeOps.length}</span>
                </h3>
                {showActive ? (
                  <ul className="jc-card-list">
                    {activeOps.map((op) => (
                      <li key={op.id}>
                        <OperationCard op={op} onCancel={onCancel} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="jc-empty">No active operations.</p>
                )}
              </section>
              {showDivider ? <hr className="jc-section-divider" /> : null}
              <section className="jc-section jc-section-recent">
                <h3 className="jc-section-title">
                  Recent{" "}
                  <span className="jc-section-count">{recentOps.length}</span>
                </h3>
                {showRecent ? (
                  <ul className="jc-card-list">
                    {recentOps.map((op) => (
                      <li key={op.id}>
                        <OperationCard op={op} onCancel={onCancel} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="jc-empty">No recent operations.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
