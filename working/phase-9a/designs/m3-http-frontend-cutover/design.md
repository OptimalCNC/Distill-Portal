# Phase 9a M3 UI/UX Gate: HTTP Cutover Status Surface

## Scope

M3 changes the inspection surface from synchronous import/rescan requests to submit-then-poll operations. The frontend keeps the existing inspection page, table, sticky footer, pagination, filters, selection behavior, and toast system. The only visible change is a compact operation status surface in the existing `ActionBar`.

## Design Intent

- Preserve the current utilitarian inspection workflow. No job center, drawer, modal, side panel, or extra page.
- Keep operation status in the sticky `ActionBar` where users already start import/rescan work.
- Use existing typography, spacing, borders, and color tokens. No new palette, no new runtime dependency, and no new decorative assets.
- Treat POST request pending state and backend operation state as different concepts: POST pending disables submit buttons briefly; operation state is shown by the badge and last-completed pill.

## ActionBar Anatomy

Left to right within the existing single-line action row:

1. Rescan button.
2. Last-rescan caption, unchanged.
3. Import selected button, unchanged aside from submit-then-poll behavior.
4. Existing hidden-selection and clear-selection controls, unchanged.
5. Operation running badge, hidden when there are no non-terminal operations.
6. Last-completed operation pill, shown when at least one terminal operation exists.
7. Manual operation refresh button, shown when there are no non-terminal operations.

The row must explicitly allow wrapping with `flex-wrap: wrap`; current `ActionBar` CSS does not wrap by default. Badge, pill, and captions use `min-width: 0` and the last-completed pill may shrink with ellipsis so status text cannot force horizontal overflow.

## States

### Idle, No History

- Running badge is hidden.
- Last-completed pill is hidden.
- Manual operation refresh button is visible.
- Import and rescan buttons behave as they do today, except they submit operations.

### Submit Pending

- The clicked submit button label changes to `Starting...`.
- Both submit buttons are disabled only while the POST request is pending.
- The running badge is not faked before the backend returns an operation row.
- The secondary Rescan button in the `SessionsView` no-sessions empty state uses the same submit-pending label and disabled semantics. It is not removed in M3.

### Non-Terminal Operations

- Badge text is `1 running` or `{n} running`, where count includes `queued`, `running`, and `cancel_requested`.
- Badge has `role="status"` and `aria-live="polite"`.
- Manual operation refresh button is hidden while auto-refresh is active.
- Auto-refresh of the operation summary runs every 5 seconds while at least one non-terminal operation exists.

### Terminal Success

- The poller reads the terminal operation row and uses `result_json` for the existing toast details.
- Last-completed pill examples:
  - `Last: Import complete · 3 sessions`
  - `Last: Rescan complete · 12 discovered`
- The pill is a compact inline element, not a card.

### Terminal Failure, Cancellation, Or Interruption

- The poller reads `error_json` when present and routes it through the existing toast system.
- Last-completed pill examples:
  - `Last: Import failed`
  - `Last: Rescan cancelled`
  - `Last: Rescan interrupted`
- Failure states use existing danger/error styling tokens already used by the app.
- The pill reuses existing error/danger token treatment such as `--color-error`; no new failure color or status variant is introduced.

## Polling Behavior

`useOperationPoll.ts` owns per-operation polling:

- Start at 500 ms.
- After 10 seconds, poll every 2 seconds.
- After 60 seconds, poll every 5 seconds.
- Abort polling when the component unmounts or a newer local submission supersedes the old local waiter.
- Terminal statuses are `succeeded`, `failed`, `cancelled`, and `interrupted`.

The ActionBar summary is separate from per-operation polling:

- Refresh once on page load.
- Refresh immediately after every successful submit.
- Refresh immediately after any per-operation poll reaches terminal state.
- Refresh every 5 seconds while the summary reports non-terminal operations.
- When idle, expose a manual refresh button.

## Accessibility

- Running badge uses polite live status updates.
- Last-completed pill uses polite live updates and keeps concise text.
- Toasts continue to announce detailed success/failure messages.
- Buttons retain descriptive text labels; no unlabeled icon-only controls are introduced.
- The row wraps without clipping at mobile and desktop widths.
- Long terminal summaries truncate within the pill instead of expanding the row beyond the viewport.

## Acceptance Checklist

- `ActionBar` remains the only visible operation status surface.
- No new colors beyond existing CSS variables.
- No nested cards, panels, drawers, or modal operation views.
- Submit buttons are disabled only during POST submission, not for the whole backend job lifetime.
- Both ActionBar submit buttons and the no-sessions empty-state Rescan button use `Starting...` while their POST request is pending.
- Badge appears while an operation is non-terminal and disappears after completion.
- Last-completed pill updates from `GET /api/v1/operations`.
- Polling is abortable and uses the M3 cadence.
