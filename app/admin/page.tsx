import { env } from "cloudflare:workers";
import { AdminHeader } from "./admin-header";
import { getD1 } from "../../db";
import { monthlyValue, planOf } from "../../lib/server/billing";
import { WalletPanel } from "./wallet-panel";
import { STATUS_LABEL, adminStatus, requireAdminPage, shortDate, shortDateTime, type AdminStatus } from "../../lib/server/admin";
import { asCurrency } from "../../lib/pricing";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · ניהול" };

// Platform admin overview. Access: PLATFORM_ADMIN_EMAILS (Cloudflare variable). Everyone else gets 404.
// Customer names and phone numbers are deliberately never shown on admin pages.

const SORTS = {
  created: "b.created DESC",
  customers: "customers DESC",
  activity: "last_activity IS NULL, last_activity DESC",
  stamps: "stamps30 DESC",
  name: "b.name COLLATE NOCASE ASC",
} as const;
type SortKey = keyof typeof SORTS;
const WEEKS = 8;

type Row = {
  id: string; name: string; created: string; owner_email: string | null;
  suspended: string | null; comp_until: string | null; archived: string | null; status: string | null;
  current_period_end: string | null;
  customers: number; stamps30: number; published: number | null; last_activity: string | null;
};

/** Days from now until an ISO date (rounded up; 0 = today or past). */
function daysUntil(iso: string, nowMs: number): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - nowMs) / 86_400_000));
}

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdminPage();
  const params = await searchParams;
  const q = one(params.q).trim().slice(0, 80);
  const statusRaw = one(params.status);
  const statusFilter = (Object.hasOwn(STATUS_LABEL, statusRaw) ? statusRaw : "") as AdminStatus | "";
  // Closed (archived) businesses are hidden unless asked for.
  const showArchived = one(params.archived) === "1";
  // Only whitelisted keys reach the ORDER BY clause.
  const sort: SortKey = Object.hasOwn(SORTS, one(params.sort)) ? (one(params.sort) as SortKey) : "created";

  const db = getD1();
  const now = new Date();
  const nowIso = now.toISOString();
  const day = 86_400_000;
  const since30 = new Date(now.getTime() - 30 * day).toISOString();
  const since7 = new Date(now.getTime() - 7 * day).toISOString();
  const sinceWeeks = new Date(now.getTime() - WEEKS * 7 * day).toISOString();
  // Escape LIKE wildcards so "_" and "%" in names and emails match literally.
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;

  const [list, totals, weeklyBiz, weeklyCust, statusRows] = await Promise.all([
    db.prepare(
      `SELECT b.id, b.name, b.created, b.suspended, b.comp_until, b.archived, s.status, s.current_period_end, u.email AS owner_email,
         (SELECT COUNT(*) FROM customers c WHERE c.business = b.id AND c.archived IS NULL) AS customers,
         (SELECT COUNT(*) FROM events e WHERE e.business = b.id AND e.kind IN ('stamp', 'earn') AND e.created >= ?1) AS stamps30,
         (SELECT MAX(version) FROM card_designs d WHERE d.business = b.id) AS published,
         (SELECT MAX(created) FROM events e WHERE e.business = b.id) AS last_activity
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business = b.id
       LEFT JOIN users u ON u.id = b.owner
       WHERE (?2 = '' OR b.name LIKE ?3 ESCAPE '\\' OR u.email LIKE ?3 ESCAPE '\\')
       ORDER BY ${SORTS[sort]} LIMIT 500`,
    ).bind(since30, q, like).all<Row>(),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM businesses WHERE archived IS NULL) AS businesses,
         (SELECT COUNT(*) FROM businesses WHERE created >= ?1) AS businesses7,
         (SELECT COUNT(*) FROM customers WHERE archived IS NULL) AS customers,
         (SELECT COUNT(*) FROM customers WHERE created >= ?2) AS customers30,
         (SELECT COUNT(*) FROM events WHERE kind IN ('stamp', 'earn') AND created >= ?2) AS stamps30,
         (SELECT COUNT(*) FROM events WHERE kind = 'redeem' AND created >= ?2) AS redeems30,
         (SELECT COUNT(DISTINCT business) FROM events WHERE created >= ?1) AS activeBiz7`,
    ).bind(since7, since30).first<{ businesses: number; businesses7: number; customers: number; customers30: number; stamps30: number; redeems30: number; activeBiz7: number }>(),
    db.prepare(
      `SELECT CAST((julianday(?1) - julianday(created)) / 7 AS INTEGER) AS w, COUNT(*) AS n
       FROM businesses WHERE created >= ?2 GROUP BY w`,
    ).bind(nowIso, sinceWeeks).all<{ w: number; n: number }>(),
    db.prepare(
      `SELECT CAST((julianday(?1) - julianday(created)) / 7 AS INTEGER) AS w, COUNT(*) AS n
       FROM customers WHERE created >= ?2 GROUP BY w`,
    ).bind(nowIso, sinceWeeks).all<{ w: number; n: number }>(),
    // Status counts and revenue always cover every business, whatever the search or filter.
    db.prepare(
      `SELECT b.suspended, b.comp_until, b.currency, s.status, s.plan FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id WHERE b.archived IS NULL`,
    ).all<{ suspended: string | null; comp_until: string | null; currency: string; status: string | null; plan: string | null }>(),
  ]);

  const everything = list.results.map((r) => ({ ...r, st: adminStatus(r, nowIso) }));
  const archivedCount = everything.filter((r) => r.archived).length;
  const all = everything.filter((r) => (showArchived ? !!r.archived : !r.archived));
  // What needs a look: failed payments, suspended businesses, and free access or trials that end within 7 days.
  const nowMs = now.getTime();
  const attention = everything
    .filter((r) => !r.archived)
    .map((r) => {
      if (r.st === "past_due") return { r, why: "התשלום נכשל", tone: "bad" };
      if (r.st === "suspended") return { r, why: "מושהה", tone: "bad" };
      if (r.st === "comp" && !r.comp_until!.startsWith("9999") && daysUntil(r.comp_until!, nowMs) <= 7) {
        const d = daysUntil(r.comp_until!, nowMs);
        return { r, why: d === 0 ? "הגישה החינמית נגמרת היום" : `הגישה החינמית נגמרת בעוד ${d} ימים`, tone: "warn" };
      }
      if (r.st === "trialing" && r.current_period_end && daysUntil(r.current_period_end, nowMs) <= 7) {
        const d = daysUntil(r.current_period_end, nowMs);
        return { r, why: d === 0 ? "תקופת הניסיון נגמרת היום" : `תקופת הניסיון נגמרת בעוד ${d} ימים`, tone: "warn" };
      }
      return null;
    })
    .filter((x): x is { r: (typeof everything)[number]; why: string; tone: string } => !!x);
  const counts = statusRows.results.map((r) => adminStatus(r, nowIso)).reduce<Record<AdminStatus, number>>(
    (acc, st) => ((acc[st] = (acc[st] ?? 0) + 1), acc),
    { suspended: 0, comp: 0, active: 0, trialing: 0, past_due: 0, canceled: 0, none: 0 },
  );
  const rows = statusFilter ? all.filter((r) => r.st === statusFilter) : all;
  // Yearly subscriptions count as a twelfth of their price.
  const paying = statusRows.results.filter((r) => adminStatus(r, nowIso) === "active");
  const yearlyCount = paying.filter((r) => planOf(r.plan, env) === "yearly").length;
  const mrr = Math.round(paying.reduce((sum, r) => sum + monthlyValue(planOf(r.plan, env), asCurrency(r.currency)), 0));
  const t = totals!;

  // Oldest week first, so the chart reads in time order.
  const weeks = Array.from({ length: WEEKS }, (_, i) => WEEKS - 1 - i).map((w) => ({
    w,
    biz: weeklyBiz.results.find((x) => x.w === w)?.n ?? 0,
    cust: weeklyCust.results.find((x) => x.w === w)?.n ?? 0,
  }));
  const maxBiz = Math.max(1, ...weeks.map((x) => x.biz));
  const maxCust = Math.max(1, ...weeks.map((x) => x.cust));

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(statusFilter ? { status: statusFilter } : {}), ...(showArchived ? { archived: "1" } : {}), sort, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return "?" + p.toString();
  };

  return (
    <div className="admin" dir="rtl">
      <AdminHeader active="/admin" />

      <main id="main" tabIndex={-1}>
        <div className="page-head">
          <div>
            <h1>סקירת מערכת</h1>
            <p className="muted">נכון ל־{shortDateTime(nowIso)} · עסקים פעילים בלבד (בלי עסקים סגורים)</p>
          </div>
          <a className="btn primary" href="/admin/new">＋ בניית עסק חדש</a>
        </div>

        <section className="stats admin-stats">
          <Stat label="הכנסה חודשית משוערת" value={`${mrr.toLocaleString("he-IL")} ₪`} hint={`${counts.active} משלמים${yearlyCount ? `, מהם ${yearlyCount} שנתיים` : ""}`} />
          <Stat label="עסקים פעילים" value={t.businesses} hint={`${t.businesses7} חדשים השבוע · ${t.activeBiz7} עם פעילות השבוע`} />
          <Stat label="לקוחות" value={t.customers} hint={`${t.customers30} הצטרפו ב־30 יום`} />
          <Stat label="חותמות ב־30 יום" value={t.stamps30} hint={`${t.redeems30} הטבות מומשו`} />
        </section>

        <section className="panel admin-attention">
          <div className="section-head">
            <h2>דורש טיפול</h2>
            <p>תשלומים שנכשלו, עסקים מושהים, וגישה חינם או ניסיון שנגמרים השבוע</p>
          </div>
          {attention.length ? (
            <ul className="admin-todo">
              {attention.map(({ r, why, tone }) => (
                <li key={r.id} className={"tone-" + tone}>
                  <a href={`/admin/b/${r.id}`}><strong>{r.name}</strong></a>
                  <span>{why}</span>
                  <small dir="ltr" className="admin-email">{r.owner_email ?? ""}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-ok">✓ אין כרגע שום דבר שדורש טיפול.</p>
          )}
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>עסקים</h2>
            <p>{rows.length} {showArchived ? "עסקים סגורים" : "עסקים"}{statusFilter ? ` · ${STATUS_LABEL[statusFilter]}` : ""}</p>
          </div>
          <div className="admin-chips" role="group" aria-label="סינון לפי סטטוס">
            <a href={qs({ status: "", archived: "" })} className="admin-chip" aria-pressed={!statusFilter && !showArchived}>הכול <b>{t.businesses}</b></a>
            {(Object.keys(STATUS_LABEL) as AdminStatus[]).filter((s) => counts[s] > 0 || statusFilter === s).map((s) => (
              <a key={s} href={qs({ status: statusFilter === s ? "" : s, archived: "" })} className={"admin-chip st-" + s} aria-pressed={statusFilter === s && !showArchived}>
                {STATUS_LABEL[s]} <b>{counts[s]}</b>
              </a>
            ))}
            {archivedCount > 0 && (
              <a href={qs({ status: "", archived: showArchived ? "" : "1" })} className="admin-chip st-none" aria-pressed={showArchived}>סגורים <b>{archivedCount}</b></a>
            )}
          </div>
          <form className="admin-tools" method="get">
            <input name="q" defaultValue={q} placeholder="חיפוש לפי שם עסק או מייל בעלים" aria-label="חיפוש" />
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            {showArchived && <input type="hidden" name="archived" value="1" />}
            <select name="sort" defaultValue={sort} aria-label="מיון">
              <option value="created">חדשים קודם</option>
              <option value="activity">פעילות אחרונה</option>
              <option value="customers">הכי הרבה לקוחות</option>
              <option value="stamps">הכי הרבה חותמות (30 יום)</option>
              <option value="name">שם</option>
            </select>
            <button className="btn primary small">הצג</button>
            {(q || statusFilter || showArchived) && <a className="btn soft small" href="?">ניקוי</a>}
          </form>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>עסק</th><th>סטטוס</th><th>לקוחות</th><th>חותמות 30 יום</th><th>פעילות אחרונה</th><th>נוצר</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <a href={`/admin/b/${r.id}`}><strong>{r.name}</strong></a>
                      <small dir="ltr" className="admin-email admin-sub">{r.owner_email ?? "—"}</small>
                    </td>
                    <td>
                      <span className={"admin-chip small st-" + (r.archived ? "none" : r.st)}>{r.archived ? "סגור" : STATUS_LABEL[r.st]}</span>
                      {!r.archived && r.st === "comp" && r.comp_until && !r.comp_until.startsWith("9999") && <small className="admin-sub muted">עד {shortDate(r.comp_until)}</small>}
                    </td>
                    <td>{r.customers}</td>
                    <td>{r.stamps30}</td>
                    <td>{r.last_activity ? shortDateTime(r.last_activity) : <span className="muted">אין</span>}</td>
                    <td>{shortDate(r.created)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="muted">אין עסקים מתאימים.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <div className="admin-grid">
          <section className="panel">
            <div className="section-head">
              <h2>הרשמות לפי שבוע</h2>
              <p>8 שבועות אחרונים</p>
            </div>
            <div className="admin-chart" role="img" aria-label="הרשמות של עסקים ולקוחות ב־8 השבועות האחרונים">
              {weeks.map((x) => (
                <div key={x.w} className="admin-bar">
                  <div className="admin-bar-pair">
                    <i className="b" style={{ height: `${(x.biz / maxBiz) * 100}%` }} title={`${x.biz} עסקים`} />
                    <i className="c" style={{ height: `${(x.cust / maxCust) * 100}%` }} title={`${x.cust} לקוחות`} />
                  </div>
                  <small>{x.biz} / {x.cust}</small>
                  <small className="muted">{x.w === 0 ? "השבוע" : `לפני ${x.w}`}</small>
                </div>
              ))}
            </div>
            <p className="form-hint"><span className="dot b" /> עסקים חדשים · <span className="dot c" /> לקוחות חדשים (לכל אחד סקאלה משלו)</p>
          </section>
          <div className="admin-side">
            <WalletPanel />
            <p className="form-hint">מזהה המשתמש שלך: <code dir="ltr">{me.id}</code> · פרטי לקוחות (שם, טלפון) לא מוצגים בניהול.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
