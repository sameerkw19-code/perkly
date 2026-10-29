// Free-access code: a business that enters the code set in the control center gets free access
// (no subscription needed). Only a hash of the code is stored. Each use is written to admin_log.
import { verifyPassword } from "./crypto.ts";
import { getSettings } from "./settings.ts";

/** Free access "without an end date". */
export const FOREVER = "9999-12-31T00:00:00.000Z";

export function cleanCode(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 64) : "";
}

/** Whether the code matches the one set in the control center. */
export async function freeCodeMatches(db: D1Database, code: string): Promise<boolean> {
  const { freeCodeHash } = await getSettings(db);
  return !!code && !!freeCodeHash && (await verifyPassword(code, freeCodeHash));
}

/** Gives the business free access and logs it. Call only after freeCodeMatches. Returns the end date. */
export async function grantFreeAccess(db: D1Database, businessId: string, userEmail: string): Promise<string> {
  const { freeCodeDays } = await getSettings(db);
  const now = new Date();
  const until = freeCodeDays > 0 ? new Date(now.getTime() + freeCodeDays * 86_400_000).toISOString() : FOREVER;
  await db.batch([
    // Never shortens free access the business already has.
    db.prepare("UPDATE businesses SET comp_until = MAX(COALESCE(comp_until, ''), ?) WHERE id = ?").bind(until, businessId),
    db.prepare("INSERT INTO admin_log(id, admin, business, action, detail, created) VALUES(?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), `code:${userEmail}`, businessId, "free_code", freeCodeDays > 0 ? `${freeCodeDays} days` : "no end date", now.toISOString()),
  ]);
  return until;
}
