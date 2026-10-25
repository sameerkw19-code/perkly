import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { MONTHLY_PRICE_ILS } from "../../../lib/server/billing";
import { listOrders, polarConfigured, type PolarOrder } from "../../../lib/server/polar";
import { STATUS_LABEL, adminStatus, requireAdminPage, shortDate, shortDateTime } from "../../../lib/server/admin";
import { AdminHeader } from "../admin-header";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · מנויים וכסף" };

type SubRow = {
  business: string; name: string; owner_email: string | null; status: string | null; current_period_end: string | null;
  updated: string | null; external_subscription: string | null; suspended: string | null; comp_until: string | null;
};

const POLAR_STATUS: Record<string, string> = {
  active: "פעיל", trialing: "בניסיון", past_due: "תשלום נכשל", canceled: "בוטל", unpaid: "לא שולם", incomplete: "לא הושלם", none: "ללא מנוי",
};

function money(n: number, currency: string): string {
  try {
    return n.toLocaleString("he-IL", { style: "currency", currency: currency || "ILS", maximumFractionDigits: 2 });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export default async function AdminBillingPage() {
  await requireAdminPage();
  const db = getD1();
  const nowIso = new Date().toISOString();
  const subs = await db
    .prepare(
      `SELECT b.id AS business, b.name, u.email AS owner_email, s.status, s.current_period_end, s.updated, s.external_subscription,
         b.suspended, b.comp_until
       FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id LEFT JOIN users u ON u.id = b.owner
       ORDER BY (s.status = 'past_due') DESC, s.updated DESC NULLS LAST, b.created DESC LIMIT 500`,
    )
    .all<SubRow>();

  let orders: PolarOrder[] = [];
  let ordersError = "";
  if (!polarConfigured(env)) ordersError = "Polar לא מוגדר בשרת.";
  else {
    try {
      orders = await listOrders(env);
    } catch (e) {
      const m = (e as Error).message;
      ordersError = m.includes("401") || m.includes("403")
        ? "למפתח של Polar אין הרשאה לקרוא תשלומים (orders:read). אפשר להוסיף את ההרשאה למפתח ב-Polar."
        : `לא הצלחתי לקרוא תשלומים מ-Polar (${m}).`;
    }
  }

  const active = subs.results.filter((r) => r.status === "active").length;
  const pastDue = subs.results.filter((r) => r.status === "past_due");
  const byMonth = new Map<string, Map<string, number>>();
  for (const o of orders) {
    if (o.status && !["paid", "succeeded", "partially_refunded"].includes(o.status)) continue;
    const month = o.created.slice(0, 7);
    const m = byMonth.get(month) ?? new Map<string, number>();
    m.set(o.currency, (m.get(o.currency) ?? 0) + o.amount);
    byMonth.set(month, m);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const nameOf = new Map(subs.results.map((r) => [r.business, r.name]));

  return (
    <div className="admin" dir="rtl">
      <AdminHeader active="/admin/billing" />
      <main>
        <h1>מנויים וכסף</h1>
        <p className="muted">מנויים לפי הנתונים שהגיעו מ-Polar, ותשלומים ישירות מ-Polar.</p>

        <section className="stats admin-stats">
          <div className="stat"><span className="stat-label">הכנסה חודשית משוערת</span><strong>{money(active * MONTHLY_PRICE_ILS, "ILS")}</strong><small>{active} מנויים פעילים × {MONTHLY_PRICE_ILS} ₪</small></div>
          <div className="stat"><span className="stat-label">תשלומים שנכשלו</span><strong>{pastDue.length}</strong><small>עסקים במצב "תשלום נכשל"</small></div>
          <div className="stat"><span className="stat-label">תשלומים שהתקבלו</span><strong>{orders.length}</strong><small>מתוך Polar (עד 300 אחרונים)</small></div>
          <div className="stat"><span className="stat-label">סה"כ עסקים</span><strong>{subs.results.length}</strong><small>כולל בלי מנוי</small></div>
        </section>

        <section className="panel">
          <h2>הכנסה לפי חודש</h2>
          {ordersError ? <p className="admin-alert">{ordersError}</p> : !months.length ? <p className="muted">עדיין אין תשלומים.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>חודש</th><th>סכום</th></tr></thead>
                <tbody>
                  {months.map(([month, m]) => (
                    <tr key={month}><td dir="ltr">{month}</td><td>{[...m.entries()].map(([c, n]) => money(n, c)).join(" + ")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>מנויים</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>עסק</th><th>בעלים</th><th>מצב ב-Polar</th><th>גישה בפועל</th><th>סוף תקופה</th><th>עדכון אחרון</th></tr></thead>
              <tbody>
                {subs.results.map((r) => {
                  const st = adminStatus(r, nowIso);
                  return (
                    <tr key={r.business} className={r.status === "past_due" ? "admin-row-warn" : ""}>
                      <td><a href={`/admin/b/${r.business}`}><strong>{r.name}</strong></a></td>
                      <td dir="ltr" className="admin-email">{r.owner_email ?? "—"}</td>
                      <td>{r.status ? POLAR_STATUS[r.status] ?? r.status : "ללא מנוי"}</td>
                      <td><span className={"admin-chip small st-" + st}>{STATUS_LABEL[st]}</span></td>
                      <td>{shortDate(r.current_period_end)}</td>
                      <td>{shortDateTime(r.updated)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>תשלומים אחרונים</h2>
          {ordersError ? <p className="muted">{ordersError}</p> : !orders.length ? <p className="muted">עדיין אין תשלומים.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>תאריך</th><th>עסק</th><th>לקוח ב-Polar</th><th>סכום</th><th>סוג</th><th>מצב</th></tr></thead>
                <tbody>
                  {orders.slice(0, 50).map((o) => (
                    <tr key={o.id}>
                      <td>{shortDateTime(o.created)}</td>
                      <td>{o.business ? <a href={`/admin/b/${o.business}`}>{nameOf.get(o.business) ?? "עסק"}</a> : "—"}</td>
                      <td dir="ltr" className="admin-email">{o.customerEmail ?? "—"}</td>
                      <td>{money(o.amount, o.currency)}</td>
                      <td>{o.reason === "subscription_cycle" ? "חידוש" : o.reason === "subscription_create" ? "מנוי חדש" : o.reason || "—"}</td>
                      <td>{o.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
