import { getD1 } from "../../../../../db";
import { fail, json, readJson } from "../../../../../lib/server/http";
import { allow } from "../../../../../lib/server/rate-limit";
import { normalizePhone } from "../../../../../lib/phone";
import { parseAmount } from "../../../../../lib/cashback.ts";
import { businessAccess } from "../../../../../lib/server/billing";
import { parseSocial } from "../../../../../lib/social";
import { getSettings } from "../../../../../lib/server/settings";
import { cardAction, cardState, type Business, type Customer } from "../../../../../lib/server/card-actions";
import { posAmount, posKey, posRequestId, scanCode } from "../../../../../lib/server/pos";

export const dynamic = "force-dynamic";

/**
 * Cashier API, for a cashier system that records sales (see /pos-api for the guide).
 *   POST /api/pos/v1/customer  { phone | code }                                  → the card
 *   POST /api/pos/v1/purchase  { phone | code, amount, transaction_id, items? }  → records the sale on the card
 *   POST /api/pos/v1/redeem    { phone | code, transaction_id, amount? }         → uses a reward or the balance
 * Authorization: Bearer <the business's cashier key>. The same transaction_id is applied only once.
 */
export async function POST(request: Request, { params }: { params: Promise<{ op: string }> }) {
  const { op } = await params;
  if (!["customer", "purchase", "redeem"].includes(op)) return fail("not_found", 404, "Unknown operation");
  const db = getD1();
  const key = await posKey(db, request);
  if (!key) return fail("unauthorized", 401, "Missing or invalid API key");
  if (!(await allow(db, `pos:${key.id}`, 120, 60))) return fail("rate_limited", 429, "Too many requests");
  const p = await readJson(request);
  if (!p) return fail("bad_request", 400, "Invalid JSON body");
  if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");

  const row = await db
    .prepare(
      `SELECT id, name, reward, target, color, join_code, staff_adjust, reward_mode, reward_expiry_days, birthdays, social, owner_designs,
         program, cashback_bp, cashback_min, currency, avg_cap, pos_only FROM businesses WHERE id = ? AND archived IS NULL`,
    )
    .bind(key.business)
    .first<Omit<Business, "social"> & { social: string | null }>();
  if (!row) return fail("unauthorized", 401, "Missing or invalid API key");
  const business: Business = { ...row, social: parseSocial(row.social) };

  // The customer: by phone, or by the code on their card (the QR shows "perkly:<code>").
  const phone = p.phone !== undefined ? normalizePhone(p.phone) : null;
  const code = p.code !== undefined ? scanCode(p.code) : null;
  if (!phone && !code) return fail("customer_required", 400, "Send the customer's phone or card code");
  const c = await db
    .prepare(`SELECT * FROM customers WHERE business = ? AND archived IS NULL AND ${code ? "scan_code = ?" : "phone = ?"}`)
    .bind(business.id, code ?? phone)
    .first<Customer>();
  await db.prepare("UPDATE pos_keys SET last_used = ? WHERE id = ?").bind(new Date().toISOString(), key.id).run();
  if (!c) return json({ ok: false, code: "customer_not_found", error: "No card with this phone or code. The customer can join with the QR at the counter." }, 404);

  const card = async (fresh: Customer) => {
    const s = await cardState(db, fresh, business.reward_mode);
    return {
      name: s.name, program: business.program, currency: business.currency,
      stamps: s.stamps, target: s.target, rewards_ready: s.rewards, reward_value: s.rewardValue ?? null,
      balance: s.balance, round_total: s.roundTotal,
    };
  };
  if (op === "customer") return json({ ok: true, customer: await card(c) });

  // Sales are blocked when the business is suspended or needs a subscription; rewards can always be used.
  if (op === "purchase") {
    const access = await businessAccess(db, business.id);
    if (!access.ok) return fail(access.code, 402, access.code === "business_suspended" ? "Business is suspended" : "Subscription is not active");
  }

  const transactionId = typeof p.transaction_id === "string" ? p.transaction_id.trim() : typeof p.transaction_id === "number" ? String(p.transaction_id) : "";
  if (!transactionId || transactionId.length > 100) return fail("transaction_id_required", 400, "Send a transaction_id (up to 100 characters)");
  const requestId = await posRequestId(business.id, op, transactionId);
  const amountText = posAmount(p.amount);

  let body: Record<string, unknown>;
  if (op === "purchase") {
    if (business.program === "stamps") {
      const items = p.items === undefined ? 1 : p.items;
      if (!Number.isInteger(items) || (items as number) < 1 || (items as number) > 10) return fail("bad_request", 400, "items must be 1-10");
      body = { action: "stamp", count: items };
    } else {
      if (!amountText || !parseAmount(amountText)) return fail("bad_amount", 400, "Send the sale amount, e.g. 45.90");
      body = business.program === "cashback" ? { action: "purchase", amount: amountText } : { action: "stamp", amount: amountText };
    }
  } else if (business.program === "cashback") {
    if (!amountText || !parseAmount(amountText)) return fail("bad_amount", 400, "Send the amount to use from the balance");
    body = { action: "spend", amount: amountText };
  } else {
    body = { action: "redeem" };
  }

  const branch = key.branch ?? (typeof p.branch === "string" ? p.branch : undefined);
  const res = await cardAction({
    db, p: { ...body, customer: c.id, requestId, branch }, business, actorId: `pos:${key.id}`, role: "pos",
    memberBranch: key.branch, now: new Date().toISOString(), origin: new URL(request.url).origin,
  });
  const out = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const fresh = (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c.id).first<Customer>())!;
  if (!res.ok) return json({ ok: false, code: out?.code ?? "error", error: out?.error ?? "Could not record", customer: await card(fresh) }, res.status);
  return json({
    ok: true,
    replayed: !!out?.replayed,
    customer: await card(fresh),
    ...(out?.earned !== undefined ? { earned: out.earned } : {}),
    ...(out?.rewardValue !== undefined ? { reward_value: out.rewardValue } : {}),
    ...(out?.used !== undefined ? { used: out.used } : {}),
  });
}
