import { getD1 } from "../../../db";
import { clientIp, fail, json, readJson, sameOrigin } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { extendLoan, openLoans } from "../../../lib/server/loans";
import { syncGoogleWallet } from "../../../lib/server/wallet-sync";
import { pushAppleCustomer } from "../../../lib/server/apple-push";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Public: a reader extends a book from their library card. The key (the link on the wallet pass and the
// web card) opens this reader's books only, and the library's limit on extensions applies.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const body = await readJson(request);
  if (!body) return fail("bad_request", 400);
  const db = getD1();
  if (!(await allow(db, `renew-ip:${clientIp(request)}`, 30, 600))) return fail("rate_limited", 429, "Too many attempts");
  const key = typeof body.key === "string" ? body.key.slice(0, 64) : "";
  if (typeof body.loan !== "string" || !UUID.test(body.loan) || typeof body.requestId !== "string" || !UUID.test(body.requestId)) return fail("bad_request", 400);
  const c = key
    ? await db
        .prepare(
          `SELECT c.id, c.business, c.stamps, c.target, c.scan_code, c.google_wallet, c.balance, b.loan_days, b.loan_ext_days, b.loan_max_ext
           FROM customers c JOIN businesses b ON b.id = c.business
           WHERE c.loan_key = ? AND c.archived IS NULL AND b.archived IS NULL AND b.suspended IS NULL AND b.program = 'library'`,
        )
        .bind(key)
        .first<{ id: string; business: string; stamps: number; target: number; scan_code: string; google_wallet: string | null; balance: number; loan_days: number; loan_ext_days: number; loan_max_ext: number }>()
    : null;
  if (!c) return fail("unknown_card", 404, "This link is not active");
  if (!(await allow(db, `renew:${c.id}`, 20, 3600))) return fail("rate_limited", 429, "Too many attempts");
  const r = await extendLoan(db, {
    business: { id: c.business, loan_days: c.loan_days, loan_ext_days: c.loan_ext_days, loan_max_ext: c.loan_max_ext },
    customerId: c.id, loanId: body.loan, requestId: body.requestId, actor: "reader", role: "customer", now: new Date().toISOString(), limit: true,
  });
  if (!r.ok) {
    const status = r.code === "unknown_loan" ? 404 : 409;
    return json({ error: r.code, code: r.code, loans: await openLoans(db, c.id) }, status);
  }
  // The wallet passes show the new date.
  syncGoogleWallet(db, c, 0, new URL(request.url).origin);
  pushAppleCustomer(db, c.id);
  return json({ ok: true, due: r.due, loans: await openLoans(db, c.id) });
}
