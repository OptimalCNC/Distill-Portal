// Relative-time renderer used by `SessionsTable` to label timestamps.
//
// Per `working/phase-4.md` §Sort semantics: "Relative time is computed
// against a single `now` captured at render time and refreshed on each
// refetch, so the page does not ticker-update; tests pin `now` to a
// fixture value." This helper is pure — it never reads `Date.now()`
// internally; the caller MUST pass `now` so tests can pin it.
//
// Rendering rules:
//   - null `then` -> em-dash `"—"` (matches the M1 muted-empty cell).
//   - within ~30 seconds -> "just now".
//   - 1 minute to 60 minutes -> "Nm ago" / "in Nm".
//   - 1 hour to 24 hours -> "Nh ago" / "in Nh".
//   - 1 day to 30 days -> "Nd ago" / "in Nd".
//   - 30 days to 371 days -> approx "Nw ago" / "in Nw" (uses
//     `weeks < 53` as the cutoff, so 365 days renders "52w ago"
//     rather than "1y ago"; the year branch only fires once the
//     elapsed weeks exceed 52, i.e. ~371 days).
//   - 371+ days -> "Ny ago" / "in Ny".
// Past vs future picked from the sign of `now - then`. The renderer
// rounds toward the nearest small unit (`Math.floor`) so a
// "29.9 seconds ago" reads "just now" until the threshold flips.

export function relativeTimeFrom(
  now: Date | string,
  then: Date | string | null,
): string {
  if (then === null) return "—";
  const nowMs = toMs(now);
  const thenMs = toMs(then);
  if (Number.isNaN(thenMs) || Number.isNaN(nowMs)) return "—";
  const deltaMs = nowMs - thenMs;
  const absMs = Math.abs(deltaMs);
  const inPast = deltaMs >= 0;

  if (absMs < 30_000) return "just now";

  const minutes = Math.floor(absMs / 60_000);
  if (minutes < 60) return inPast ? `${minutes}m ago` : `in ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return inPast ? `${hours}h ago` : `in ${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return inPast ? `${days}d ago` : `in ${days}d`;

  const weeks = Math.floor(days / 7);
  if (weeks < 53) return inPast ? `${weeks}w ago` : `in ${weeks}w`;

  const years = Math.floor(days / 365);
  return inPast ? `${years}y ago` : `in ${years}y`;
}

function toMs(value: Date | string): number {
  if (value instanceof Date) return value.getTime();
  return Date.parse(value);
}
