// The cashier (POS) connection: a cashier system calls Perkly with the business's API key on each sale.
// It finds the customer by phone or by the code on their card, and records the purchase or the reward
// with the same rules as the staff station (lib/server/card-actions.ts).
import { sha256 } from "./crypto";

export type PosKey = { id: string; business: string; label: string; branch: string | null };

/** The key from "Authorization: Bearer pk_..." (or the X-Api-Key header). */
export async function posKey(db: D1Database, request: Request): Promise<PosKey | null> {
  const auth = request.headers.get("authorization") ?? "";
  const raw = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : request.headers.get("x-api-key") ?? "").trim();
  if (!/^pk_[A-Za-z0-9_-]{20,80}$/.test(raw)) return null;
  const key = await db
    .prepare("SELECT id, business, label, branch FROM pos_keys WHERE key_hash = ? AND revoked IS NULL")
    .bind(await sha256(raw))
    .first<PosKey>();
  return key;
}

/**
 * A stable request id for one cashier transaction, so the cashier can resend the same sale safely:
 * the same transaction id (for the same business and operation) is applied only once.
 */
export async function posRequestId(business: string, op: string, transactionId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pos:${business}:${op}:${transactionId}`));
  const h = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The customer's code as the cashier scanned it: "perkly:abc" or "abc". */
export function scanCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/^perkly:/i, "");
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/** An amount in major units from the cashier (45.9, "45.90") as minor units, or null. */
export function posAmount(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === "string") return value;
  return null;
}
