// Hand-written toast for non-blocking mutation feedback.
//
// Per `working/phase-4.md` §Action Bar and Mutation UX, rescan and
// import outcomes surface as toasts that describe the change in
// plain language ("Imported 4 new sessions, 1 updated") with the
// structured numeric counts available as an expanded disclosure for
// debugging. Errors surface as error toasts with a Retry action.
// The spec explicitly notes: "Toast behavior is small enough that a
// handwritten component is justified; adding a toast library is
// not." This file is the entire toast surface; there is no toast
// library import.
//
// Component contract:
//   - `id` — stable React key supplied by the queue. The Toast does
//     not generate IDs itself; it only forwards back to `onDismiss`.
//   - `kind` — one of "success" | "error" | "info"; drives the CSS
//     class and the implicit ARIA role.
//   - `title` — short heading copy ("Rescan complete", "Import
//     failed", etc.).
//   - `message` — optional plain-language summary line.
//   - `onRetry` — optional handler for error toasts. Renders the
//     "Retry" button only when provided.
//   - `onDismiss` — required dismiss handler. Receives the toast's
//     own `id` so the parent queue can filter it out by identity.
//   - `details` — optional React node rendered inside a `<details>`
//     disclosure for the structured counts. The disclosure is
//     collapsed by default so the user only sees the plain-language
//     message until they ask for the numbers.
//
// Rendering shape:
//
//   <div role={role} className="toast {kind}">
//     <p className="toast-title">{title}</p>
//     {message && <p className="toast-message">{message}</p>}
//     {details && <details>...{details}</details>}
//     <div className="toast-actions">
//       {onRetry && <button>Retry</button>}
//       <button>Dismiss</button>
//     </div>
//   </div>
//
// `role`: success/info -> "status", error -> "alert" so screen
// readers announce errors more aggressively than the friendly
// success path.

import type { ReactNode } from "react";
import "./Toast.css";

export type ToastKind = "success" | "error" | "info";

export type ToastProps = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  onRetry?: () => void;
  onDismiss: (id: string) => void;
  /** Structured payload (e.g. RescanReport / ImportReport counts)
   *  rendered inside a collapsible `<details>` disclosure. The
   *  disclosure is collapsed by default. */
  details?: ReactNode;
};

export function Toast({
  id,
  kind,
  title,
  message,
  onRetry,
  onDismiss,
  details,
}: ToastProps) {
  // Errors get role="alert" so AT users hear them immediately;
  // success/info use the polite "status" role so a sequence of
  // background updates doesn't interrupt the user mid-task.
  const role = kind === "error" ? "alert" : "status";
  return (
    <div
      role={role}
      className={`toast ${kind}`}
      data-toast-id={id}
    >
      <p className="toast-title">{title}</p>
      {message ? <p className="toast-message">{message}</p> : null}
      {details ? (
        <details className="toast-details">
          <summary>Details</summary>
          {details}
        </details>
      ) : null}
      <div className="toast-actions">
        {onRetry ? (
          <button
            type="button"
            className="toast-retry"
            onClick={onRetry}
          >
            Retry
          </button>
        ) : null}
        <button
          type="button"
          className="toast-dismiss"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
