// Status pill for the four `SessionSyncStatus` variants.
//
// Renders `<span class="badge {variant}">{label}</span>` where `variant`
// is the status with underscores rewritten to dashes (matching the CSS
// selectors in `styles/app.css`: `.badge.up-to-date`, `.badge.not-stored`,
// `.badge.outdated`, `.badge.source-missing`) and `label` is the status
// with underscores rewritten to spaces for human display.
import type { SessionSyncStatus } from "../lib/contracts";

type StatusBadgeProps = { status: SessionSyncStatus };

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = status.replace(/_/g, "-");
  const label = status.replace(/_/g, " ");
  return <span className={`badge ${variant}`}>{label}</span>;
}
