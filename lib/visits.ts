/** Whole calendar days (local time) from `iso` to `now`; never negative. */
export function daysSince(iso: string, now = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((day(now) - day(new Date(iso))) / 86_400_000));
}
