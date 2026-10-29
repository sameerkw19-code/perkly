/** Whole calendar days (local time) from `iso` to `now`; never negative. */
export function daysSince(iso: string, now = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((day(now) - day(new Date(iso))) / 86_400_000));
}

/** A customer is "away" after this many days without a visit. */
export const AWAY_DAYS = 30;

/**
 * Away: the last visit (stamp or reward use) was more than AWAY_DAYS ago, or, with no visits,
 * the customer joined more than AWAY_DAYS ago and never came back.
 */
export function isAway(lastVisit: string | null | undefined, joined: string, now = new Date()): boolean {
  return daysSince(lastVisit || joined, now) > AWAY_DAYS;
}
