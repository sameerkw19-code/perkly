"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarHeart, X } from "lucide-react";
import { Brand } from "../../components/brand";
import { errorText, useLang } from "../../lib/i18n";
import { SPECIAL_MAX_TEXT, noticeText, type Texts } from "../../lib/design";

type Item = { id: string; send_at: string; text: string; queued: string | null; recipients: number | null; canceled: string | null; sent: number };
type Data = { business: { id: string; name: string }; businesses: { id: string; name: string }[]; items: Item[]; walletCustomers: number; walletReady: boolean };

/** "YYYY-MM-DDTHH:mm" in the browser's time, for <input type="datetime-local">. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SpecialView() {
  const { lang, t, dir } = useLang();
  const [business, setBusiness] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setBusiness(new URLSearchParams(window.location.search).get("b") ?? "");
    // Tomorrow at 10:00 as a starting point.
    const d = new Date(Date.now() + 86_400_000);
    d.setHours(10, 0, 0, 0);
    setWhen(localInput(d));
  }, []);

  const load = useCallback(async () => {
    setError("");
    const r = await fetch(`/api/special?business=${encodeURIComponent(business)}`, { credentials: "same-origin" }).catch(() => null);
    const body: any = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) return setError(errorText(lang, body.code));
    setData(body as Data);
  }, [business, lang]);
  useEffect(() => { load(); }, [load]);

  const sample = useMemo(() => {
    if (!data || !text.trim()) return "";
    const texts = { title: data.business.name, reward: "" } as Texts;
    return noticeText(texts, lang, { kind: "special", name: t("edNotifySampleName"), text });
  }, [data, text, lang, t]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setStatus("");
    const r = await fetch("/api/special", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ business: data!.business.id, ...payload }),
    }).catch(() => null);
    const body: any = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) { setStatus(errorText(lang, body.code)); return false; }
    await load();
    return true;
  }

  async function schedule() {
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) return setStatus(errorText(lang, "special_time"));
    if (await post({ action: "create", text, sendAt: at.toISOString() })) { setText(""); setStatus(t("spScheduled")); }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : lang === "ar" ? "ar" : "he-IL", { dateStyle: "medium", timeStyle: "short" });
  const state = (i: Item) =>
    i.canceled ? t("spCanceled")
    : i.queued ? t("spSent", { n: i.sent, total: i.recipients ?? 0 })
    : t("spWaiting");

  return (
    <div className="special-page" dir={dir} lang={lang}>
      <div className="auth-top">
        <Brand href="/" />
        <a className="btn soft small" href="/"><ArrowRight size={14} />{t("spBack")}</a>
      </div>
      <main className="special-main">
        <div className="page-head">
          <div>
            <p className="eyebrow">Google Wallet</p>
            <h1><CalendarHeart size={26} /> {t("spTitle")}</h1>
            <p className="muted">{t("spIntro")}</p>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {data && (
          <>
            {data.businesses.length > 1 && (
              <label className="special-biz">
                <span>{t("spBusiness")}</span>
                <select value={data.business.id} onChange={(e) => setBusiness(e.target.value)}>
                  {data.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <section className="panel">
              <h2>{t("spNew")}</h2>
              <div className="stack-form">
                <label>
                  <span className="label-row">{t("spText")}<small>{text.length}/{SPECIAL_MAX_TEXT}</small></span>
                  <textarea rows={3} value={text} maxLength={SPECIAL_MAX_TEXT} placeholder={t("spPlaceholder")} onChange={(e) => setText(e.target.value)} />
                  <small className="form-hint">{t("spVars")}</small>
                </label>
                {sample && <p className="special-sample"><strong>{data.business.name}</strong><br />{sample}</p>}
                <label>
                  <span>{t("spWhen")}</span>
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </label>
              </div>
              <p className="form-hint">
                {t("spReach", { n: data.walletCustomers })} {t("spLimit")}
                {!data.walletReady && <> {t("spNotReady")}</>}
              </p>
              <button className="btn primary" disabled={busy || !text.trim() || !when} onClick={schedule}>{busy ? t("sending") : t("spSchedule")}</button>
              {status && <p className="form-hint" role="status">{status}</p>}
            </section>

            <section className="panel">
              <h2>{t("spList")}</h2>
              {!data.items.length ? (
                <p className="muted">{t("spNone")}</p>
              ) : (
                <ul className="special-list">
                  {data.items.map((i) => (
                    <li key={i.id} className={i.canceled ? "is-canceled" : ""}>
                      <div>
                        <strong>{fmt(i.send_at)}</strong>
                        <p>{i.text}</p>
                        <small className="form-hint">{state(i)}</small>
                      </div>
                      {!i.queued && !i.canceled && (
                        <button type="button" className="btn soft small" disabled={busy} onClick={() => { if (window.confirm(t("spCancelConfirm"))) post({ action: "cancel", id: i.id }); }}>
                          <X size={14} />{t("spCancel")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
