"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BarChart3, Mail } from "lucide-react";
import { Brand } from "../../components/brand";
import { errorText, useLang } from "../../lib/i18n";
import { formatMoney } from "../../lib/cashback";
import { change } from "../../lib/report-month";

type Stats = { visitors: number; returning: number; joined: number; stamps: number; redeemed: number; purchases: number; sales: number };
type Report = {
  month: string; business: { id: string; name: string; program: string; currency: string }; customers: number;
  now: Stats; prev: Stats; friends: number; best: { text: string; visited: number; recipients: number } | null; away: { count: number; names: string[] };
};
type Data = { report: Report; months: string[]; businesses: { id: string; name: string }[]; email: { on: boolean; ready: boolean }; to: string };

export default function ReportView() {
  const { lang, t, dir } = useLang();
  const [business, setBusiness] = useState("");
  const [month, setMonth] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after hydration (the server can't see it)
    setBusiness(q.get("b") ?? "");
    setMonth(q.get("m") ?? "");
  }, []);

  const load = useCallback(async () => {
    setError("");
    const r = await fetch(`/api/report?business=${encodeURIComponent(business)}&month=${encodeURIComponent(month)}`, { credentials: "same-origin" }).catch(() => null);
    const body = (r ? await r.json().catch(() => ({})) : {}) as { code?: string };
    if (!r || !r.ok) return setError(errorText(lang, body.code));
    setData(body as Data);
  }, [business, month, lang]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the report when the business or month changes
  useEffect(() => { load(); }, [load]);

  async function post(url: string, payload: Record<string, unknown>, done: string) {
    setBusy(true); setStatus("");
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ business: data!.report.business.id, ...payload }) }).catch(() => null);
    const body = (r ? await r.json().catch(() => ({})) : {}) as { code?: string };
    setBusy(false);
    if (!r || !r.ok) return setStatus(errorText(lang, body.code));
    setStatus(done);
    await load();
  }

  const locale = lang === "en" ? "en-GB" : lang === "ar" ? "ar" : "he-IL";
  const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const r = data?.report;
  const cash = r?.business.program === "cashback";
  const money = (n: number) => formatMoney(n, r?.business.currency === "USD" ? "USD" : "ILS", lang);
  const rows: [string, number, number, ((n: number) => string)?][] = r ? [
    [t("rpReturning"), r.now.returning, r.prev.returning],
    [t("rpJoined"), r.now.joined, r.prev.joined],
    [t("rpVisitors"), r.now.visitors, r.prev.visitors],
    ...(cash
      ? [[t("rpPurchases"), r.now.purchases, r.prev.purchases], [t("rpSales"), r.now.sales, r.prev.sales, money]] as [string, number, number, ((n: number) => string)?][]
      : [[t("rpStamps"), r.now.stamps, r.prev.stamps], [t("rpRedeemed"), r.now.redeemed, r.prev.redeemed]] as [string, number, number, ((n: number) => string)?][]),
  ] : [];

  return (
    <div className="special-page" dir={dir} lang={lang}>
      <header className="auth-top">
        <Brand href="/" />
        <a className="btn soft small" href={r ? `/?business=${encodeURIComponent(r.business.id)}` : "/"}><ArrowRight size={14} />{t("spBack")}</a>
      </header>
      <main id="main" className="special-main">
        <div className="page-head">
          <div>
            <h1><BarChart3 size={26} /> {t("rpTitle")}</h1>
            <p className="muted">{t("rpIntro")}</p>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {data && r && (
          <>
            <div className="report-pick">
              {data.businesses.length > 1 && (
                <label className="special-biz">
                  <span>{t("spBusiness")}</span>
                  <select value={r.business.id} onChange={(e) => { setBusiness(e.target.value); setMonth(""); }}>
                    {data.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
              )}
              {data.months.length > 0 && (
                <label className="special-biz">
                  <span>{t("rpMonth")}</span>
                  <select value={r.month} onChange={(e) => setMonth(e.target.value)}>
                    {data.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                </label>
              )}
            </div>
            <section className="panel">
              <div>
                <h2>{r.business.name} · {monthLabel(r.month)}</h2>
                <p className="muted">{t("rpCustomers", { n: r.customers })}</p>
              </div>
              <table className="mreport-table">
                <tbody>
                  {rows.map(([label, a, b, fmt]) => {
                    const c = change(a, b);
                    return (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td className="report-num">{fmt ? fmt(a) : a}</td>
                        <td className={"report-change" + (c.startsWith("+") ? " up" : c.startsWith("−") ? " down" : "")}>{c && <span dir="ltr">{c}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="form-hint">{t("rpVsPrev")}</p>
              <ul className="report-notes">
                {r.friends > 0 && <li>🤝 {t("rpFriends", { n: r.friends })}</li>}
                {r.best && r.best.recipients > 0 && <li>📣 {t("rpBest", { text: r.best.text, n: r.best.visited, total: r.best.recipients })}</li>}
                {r.away.count > 0 && (
                  <li>
                    👋 {t("rpAway", { n: r.away.count })}{r.away.names.length > 0 && <> ({r.away.names.join(", ")})</>}{" "}
                    <a href={`/special?b=${encodeURIComponent(r.business.id)}`}>{t("rpAwayAction")}</a>
                  </li>
                )}
                {!r.now.visitors && !r.now.joined && <li>{t("rpQuiet")}</li>}
              </ul>
            </section>
            <section className="panel">
              <h2><Mail size={18} /> {t("rpEmailTitle")}</h2>
              <label className="check-row report-check">
                <input type="checkbox" checked={data.email.on} disabled={busy} onChange={(e) => post("/api/loyalty", { action: "set_report_email", on: e.target.checked }, t(e.target.checked ? "rpEmailOnSaved" : "rpEmailOffSaved"))} />
                <span>{t("rpEmailOn")}<small className="form-hint">{t("rpEmailHint")}</small></span>
              </label>
              {data.email.ready && (
                <button type="button" className="btn soft small" disabled={busy} onClick={() => post("/api/report", { action: "send_me", month: r.month }, t("rpSentTo", { email: data.to }))}>
                  <Mail size={14} />{t("rpSendMe")}
                </button>
              )}
              {status && <p className="form-hint" role="status">{status}</p>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
