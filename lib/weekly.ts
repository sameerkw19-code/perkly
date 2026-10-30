/** Change from last week to this week: the difference and, when last week was not zero, the percent. */
export function weekChange(now: number, prev: number): { diff: number; pct: number | null; dir: "up" | "down" | "same" } {
  const diff = now - prev;
  return { diff, pct: prev > 0 ? Math.round((diff / prev) * 100) : null, dir: diff > 0 ? "up" : diff < 0 ? "down" : "same" };
}
