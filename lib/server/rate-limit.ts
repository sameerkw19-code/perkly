// Simple fixed-window rate limiting stored in D1. Good enough for the pilot;
// Cloudflare's own rate-limiting rules can be added in front for production traffic.

export async function allow(db: D1Database, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits(key, window_start, count) VALUES(?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  // Occasionally clear old windows.
  if (Math.random() < 0.02) {
    await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - 86_400).run();
  }
  return (row?.count ?? 0) <= limit;
}

/** True when `key` already reached `limit` in the current window. Does not count this call. */
export async function limited(db: D1Database, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await db.prepare("SELECT window_start, count FROM rate_limits WHERE key = ?").bind(key).first<{ window_start: number; count: number }>();
  return !!row && row.window_start === windowStart && row.count >= limit;
}
