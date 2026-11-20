// The monthly report for a business owner: last month next to the month before, how many came through a friend,
// the message that brought the most customers back, and who stopped coming. Shown at /report and emailed
// to the owners in the first days of every month (production only: REPORT_EMAILS=on).

import { AWAY_DAYS } from "../visits";
import { formatMoney } from "../cashback";
import { israelNow } from "../birthday";
import { change, lastMonth, monthName, monthStart, nextMonth, prevMonth, validMonth } from "../report-month";

export { lastMonth, monthStart, nextMonth, prevMonth, validMonth };
import { visitedAfter, RESULT_DAYS } from "./message-results";
import { mailReady, sendMail, type Mail, type MailEnv } from "./mailer";

/** Visits: a stamp, a reward, a purchase or use of balance. */
const VISIT = "('stamp', 'redeem', 'earn', 'spend')";
/** Customers who came in the last 3 months but not in the last AWAY_DAYS days: worth a word from the owner. */
const LOST_DAYS = 90;
/** The email goes out in the first days of the month, from this hour (Israel time). */
export const REPORT_HOUR = 9;
const REPORT_LAST_DAY = 7;
/** Businesses handled per run of the 2-minute job. */
const PER_RUN = 5;

export type MonthStats = { visitors: number; returning: number; joined: number; stamps: number; redeemed: number; purchases: number; sales: number };
export type MonthlyReport = {
  month: string;
  business: { id: string; name: string; program: string; currency: string };
  customers: number;
  now: MonthStats;
  prev: MonthStats;
  friends: number;
  best: { text: string; visited: number; recipients: number } | null;
  away: { count: number; names: string[] };
};

async function stats(db: D1Database, business: string, start: string, end: string): Promise<MonthStats> {
  const r = await db
    .prepare(
      `SELECT
         COUNT(DISTINCT e.customer) AS visitors,
         COUNT(DISTINCT CASE WHEN c.created < ?2 THEN e.customer END) AS came_back,
         COALESCE(SUM(CASE WHEN e.kind = 'stamp' THEN e.delta ELSE 0 END), 0) AS stamps,
         COALESCE(SUM(e.kind = 'redeem'), 0) AS redeemed,
         COALESCE(SUM(e.kind = 'earn'), 0) AS purchases,
         COALESCE(SUM(CASE WHEN e.kind IN ('earn', 'stamp') THEN COALESCE(e.amount, 0) ELSE 0 END), 0) AS sales,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND created >= ?2 AND created < ?3) AS joined
       FROM events e JOIN customers c ON c.id = e.customer
       WHERE e.business = ?1 AND e.created >= ?2 AND e.created < ?3 AND e.kind IN ${VISIT}`,
    )
    .bind(business, start, end)
    .first<Omit<MonthStats, "returning"> & { came_back: number }>();
  const { came_back, ...rest } = r ?? { came_back: 0 };
  return { visitors: 0, joined: 0, stamps: 0, redeemed: 0, purchases: 0, sales: 0, ...rest, returning: came_back ?? 0 };
}

export async function monthlyReport(db: D1Database, businessId: string, ym: string): Promise<MonthlyReport | null> {
  const b = await db.prepare("SELECT id, name, program, currency FROM businesses WHERE id = ?").bind(businessId)
    .first<{ id: string; name: string; program: string | null; currency: string | null }>();
  if (!b) return null;
  const start = monthStart(ym);
  const end = monthStart(nextMonth(ym));
  const before = monthStart(prevMonth(ym));
  const awayCut = new Date(Date.parse(end) - AWAY_DAYS * 86_400_000).toISOString();
  const lostCut = new Date(Date.parse(end) - LOST_DAYS * 86_400_000).toISOString();
  const [now, prev, customers, friends, messages, away] = await Promise.all([
    stats(db, b.id, start, end),
    stats(db, b.id, before, start),
    db.prepare("SELECT COUNT(*) AS n FROM customers WHERE business = ? AND archived IS NULL AND created < ?").bind(b.id, end).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM customers WHERE business = ? AND invited_by IS NOT NULL AND created >= ? AND created < ?").bind(b.id, start, end).first<{ n: number }>(),
    db.prepare("SELECT id, text, queued, recipients FROM special_days WHERE business = ? AND queued >= ? AND queued < ? AND canceled IS NULL ORDER BY queued LIMIT 12")
      .bind(b.id, start, end).all<{ id: string; text: string; queued: string; recipients: number | null }>(),
    db
      .prepare(
        `SELECT c.name, MAX(e.created) AS last FROM customers c JOIN events e ON e.customer = c.id
         WHERE c.business = ?1 AND c.archived IS NULL AND e.created < ?2 AND e.kind IN ${VISIT}
         GROUP BY c.id HAVING last < ?3 AND last >= ?4 ORDER BY last DESC LIMIT 500`,
      )
      .bind(b.id, end, awayCut, lostCut)
      .all<{ name: string; last: string }>(),
  ]);
  let best: MonthlyReport["best"] = null;
  for (const m of messages.results ?? []) {
    const visited = await visitedAfter(db, b.id, m);
    if (!best || visited > best.visited) best = { text: m.text, visited, recipients: m.recipients ?? 0 };
  }
  const lost = away.results ?? [];
  return {
    month: ym,
    business: { id: b.id, name: b.name, program: b.program ?? "stamps", currency: b.currency ?? "ILS" },
    customers: customers?.n ?? 0,
    now,
    prev,
    friends: friends?.n ?? 0,
    best,
    away: { count: lost.length, names: lost.slice(0, 5).map((r) => r.name) },
  };
}

// The email. Hebrew for businesses in Israel, English for businesses abroad (USD).

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function reportMail(r: MonthlyReport, to: string, origin: string): Mail {
  const he = r.business.currency !== "USD";
  const lang = he ? "he" : "en";
  const month = monthName(r.month, lang);
  const name = r.business.name;
  const cash = r.business.program === "cashback";
  const money = (n: number) => formatMoney(n, r.business.currency === "USD" ? "USD" : "ILS", lang);
  const rows: [string, number, number, ((n: number) => string)?][] = [
    [he ? "לקוחות שחזרו" : "Customers who came back", r.now.returning, r.prev.returning],
    [he ? "לקוחות חדשים" : "New customers", r.now.joined, r.prev.joined],
    [he ? "ביקורים של לקוחות" : "Customers who visited", r.now.visitors, r.prev.visitors],
    ...(cash
      ? [[he ? "קניות" : "Purchases", r.now.purchases, r.prev.purchases], [he ? "סכום הקניות" : "Sales", r.now.sales, r.prev.sales, money]] as [string, number, number, ((n: number) => string)?][]
      : [[he ? "חותמות" : "Stamps", r.now.stamps, r.prev.stamps], [he ? "הטבות שמומשו" : "Rewards used", r.now.redeemed, r.prev.redeemed]] as [string, number, number, ((n: number) => string)?][]),
  ];
  const url = `${origin}/report?b=${encodeURIComponent(r.business.id)}&m=${r.month}`;
  const dash = `${origin}/?business=${encodeURIComponent(r.business.id)}`;
  // The subject leads with the best news: customers who came back, else new ones.
  const headline = r.now.returning
    ? (he ? `${r.now.returning} לקוחות חזרו` : `${r.now.returning} customers came back`)
    : r.now.joined
      ? (he ? `${r.now.joined} לקוחות חדשים` : `${r.now.joined} new customers`)
      : "";
  const subject = he
    ? `${name}: הדוח של ${month}${headline ? ` · ${headline}` : ""}`
    : `${name}: your ${month} report${headline ? ` · ${headline}` : ""}`;
  const notes: string[] = [];
  if (r.friends) notes.push(he ? `🤝 ${r.friends} לקוחות חדשים הגיעו בהזמנה של חבר.` : `🤝 ${r.friends} new customers came through a friend's invite.`);
  if (r.best && r.best.recipients) {
    notes.push(he
      ? `📣 ההודעה שעבדה הכי טוב: "${r.best.text}". ${r.best.visited} מתוך ${r.best.recipients} הגיעו תוך ${RESULT_DAYS} ימים.`
      : `📣 Your best message: "${r.best.text}". ${r.best.visited} of ${r.best.recipients} came in within ${RESULT_DAYS} days.`);
  }
  if (r.away.count) {
    const names = r.away.names.join(he ? ", " : ", ");
    notes.push(he
      ? `👋 ${r.away.count} לקוחות קבועים לא הגיעו כבר יותר מ־${AWAY_DAYS} יום${names ? ` (למשל: ${names})` : ""}. אולי זה הזמן להודעה ללקוחות.`
      : `👋 ${r.away.count} regulars haven't come in for over ${AWAY_DAYS} days${names ? ` (e.g. ${names})` : ""}. A message to customers may bring them back.`);
  }
  if (!r.now.visitors && !r.now.joined) {
    notes.push(he ? "החודש לא נרשמו ביקורים. כדאי לבדוק שהצוות סורק בקופה ושהשלט עם הקוד במקום בולט." : "No visits were recorded this month. Check that staff scan at the counter and the QR sign is easy to see.");
  }
  const dir = he ? "rtl" : "ltr";
  const align = he ? "right" : "left";
  const cell = (s: string, extra = "") => `<td style="padding:10px 8px;border-top:1px solid #ecebf1;${extra}">${s}</td>`;
  const table = rows.map(([label, a, b, fmt]) => {
    const c = change(a, b);
    const color = c.startsWith("+") ? "#1a7f4b" : c.startsWith("−") ? "#b4413a" : "#696875";
    return `<tr>${cell(esc(label))}${cell(`<b style="font-size:18px">${esc(fmt ? fmt(a) : String(a))}</b>`, `text-align:${he ? "left" : "right"};white-space:nowrap`)}${cell(c ? `<span dir="ltr" style="color:${color};font-size:13px;unicode-bidi:isolate">${c}</span>` : "", `text-align:${he ? "left" : "right"};width:56px;white-space:nowrap`)}</tr>`;
  }).join("");
  const para = (l: string) => `<p style="margin:14px 0 0;line-height:1.6">${esc(l)}</p>`;
  const button = (text: string, href: string) => `<a href="${esc(href)}" style="display:inline-block;background:#7558E8;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;margin:6px 0 0 8px">${esc(text)}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f7f7fa;font-family:Arial,sans-serif;color:#242334">
<div dir="${dir}" style="max-width:520px;margin:0 auto;padding:28px 20px;text-align:${align}">
<p style="font-size:14px;color:#696875;margin:0 0 6px">Perkly</p>
<h1 style="font-size:22px;margin:0 0 4px">${esc(name)}</h1>
<p style="margin:0 0 18px;color:#696875">${esc(he ? `הדוח של ${month}` : `Your ${month} report`)} · ${esc(he ? `${r.customers} לקוחות בכרטיס` : `${r.customers} customers on the card`)}</p>
<div style="background:#fff;border:1px solid #ecebf1;border-radius:14px;padding:8px 14px 14px">
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${table}</table>
<p style="margin:10px 0 0;color:#696875;font-size:12px">${esc(he ? "השינוי לעומת החודש הקודם" : "Change from the month before")}</p>
${notes.map(para).join("")}
<p style="margin:18px 0 0">${button(he ? "לדוח המלא" : "Full report", url)}${button(he ? "ללוח העסק" : "Dashboard", dash)}</p>
</div>
<p style="margin:16px 4px 0;color:#696875;font-size:12px;line-height:1.5">${esc(he ? "את הדוח במייל אפשר להפסיק בעמוד הדוח המלא." : "You can stop this email on the full report page.")}</p>
</div></body></html>`;
  const text = [
    `${name} · ${he ? `הדוח של ${month}` : `${month} report`}`,
    "",
    ...rows.map(([label, a, b, fmt]) => `${label}: ${fmt ? fmt(a) : a}${change(a, b) ? ` (${change(a, b)})` : ""}`),
    "",
    ...notes,
    "",
    url,
  ].join("\n");
  return { to, subject, text, html };
}

/**
 * Run by the 2-minute job: in the first days of the month, a few businesses at a time get last month's report
 * by email (each once). Only where REPORT_EMAILS=on (production) and email is connected.
 */
export async function sendMonthlyReports(db: D1Database, env: MailEnv & { REPORT_EMAILS?: string; PUBLIC_ORIGIN?: string }, now = new Date()): Promise<number> {
  if (env.REPORT_EMAILS !== "on" || !mailReady(env)) return 0;
  const today = israelNow(now);
  if (Number(today.date.slice(8, 10)) > REPORT_LAST_DAY || (today.date.endsWith("-01") && today.hour < REPORT_HOUR)) return 0;
  const ym = prevMonth(today.date.slice(0, 7));
  const end = monthStart(nextMonth(ym));
  const { results } = await db
    .prepare(
      `SELECT id, report_month FROM businesses
       WHERE archived IS NULL AND suspended IS NULL AND report_email = 1 AND created < ? AND (report_month IS NULL OR report_month != ?)
       LIMIT ?`,
    )
    .bind(end, ym, PER_RUN)
    .all<{ id: string; report_month: string | null }>();
  const origin = env.PUBLIC_ORIGIN || "https://perkly.shop";
  let sent = 0;
  for (const b of results ?? []) {
    // Marked first, so two overlapping runs never both send.
    const mark = await db.prepare("UPDATE businesses SET report_month = ? WHERE id = ? AND report_month IS ?").bind(ym, b.id, b.report_month).run();
    if (!mark.meta.changes) continue;
    const report = await monthlyReport(db, b.id, ym);
    if (!report || !report.customers) continue;
    const owners = await db
      .prepare(`SELECT DISTINCT u.email FROM memberships m JOIN users u ON u.id = m.user WHERE m.business = ? AND m.role = 'owner' AND m.revoked IS NULL LIMIT 3`)
      .bind(b.id)
      .all<{ email: string }>();
    for (const o of owners.results ?? []) {
      if (await sendMail(env, reportMail(report, o.email, origin))) sent++;
    }
  }
  if (sent) console.log(`monthly report ${ym}: ${sent} emails`);
  return sent;
}
