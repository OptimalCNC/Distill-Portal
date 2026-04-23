// Status pill for the four `SessionSyncStatus` variants.
//
// Ports the `status_badge` helper from `apps/frontend/src/app.rs` (the Rust
// reference page). The class names (`badge`, and the variant class with
// underscores rewritten to dashes) and the human label (underscores
// rewritten to spaces) match the Rust reference verbatim so the CSS
// carried over in `styles/app.css` targets the same selectors.
import type { SessionSyncStatus } from "../lib/contracts";

type StatusBadgeProps = { status: SessionSyncStatus };

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = status.replace(/_/g, "-");
  const label = status.replace(/_/g, " ");
  return <span className={`badge ${variant}`}>{label}</span>;
}
