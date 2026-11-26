"use client";
import { useEffect, useState } from "react";
import { CalendarCheck, CalendarX, Clock, RefreshCw, User } from "lucide-react";
import { errorText, useLang } from "../../../../lib/i18n";
import { post } from "../../../../lib/api";
import { LangSwitch } from "../../../../components/lang-switch";
import { Logo } from "../../../../components/loyalty-card";
import { Brand } from "../../../../components/brand";
import { formatMoney } from "../../../../lib/cashback.ts";
import { durationLabel, type BookService } from "../../../../lib/booking";
import { textsFor, type Design } from "../../../../lib/design";
import { DayStrip, TimeGrid, dayLabel } from "../../[key]/booking-flow";

type Business = { name: string; design: Design; key: string; currency: "ILS" | "USD" };
type Info = {
  booking: { date: string; time: string; status: "pending" | "confirmed" | "cancelled" | "declined"; minutes: number; price: number; services: BookService[]; staff: string | null; staffId: string };
  canChange: boolean; cancelHours: number; key: string;
};

export default function ManageBooking({ token, business }: { token: string; business: Business | null }) {
  const { lang, setLang, t, dir } = useLang();
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<"view" | "cancel" | "move">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [today, setToday] = useState("");
  const [open, setOpen] = useState<string[] | null>(null);
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[] | null>(null);
  const [time, setTime] = useState("");

  async function load() {
    const r = await fetch(`/api/book?m=${encodeURIComponent(token)}`);
    if (r.ok) setInfo(await r.json());
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load once on open
  useEffect(() => { if (business) load(); }, []);

  const query = (extra: Record<string, string>) => info
    ? "/api/book?" + new URLSearchParams({ key: info.key, services: info.booking.services.map((s) => s.id).join(","), staff: info.booking.staffId, move: token, ...extra })
    : "";
  useEffect(() => {
    if (mode !== "move" || !info) return;
    let stop = false;
    fetch(query({})).then((r) => r.json() as Promise<{ today: string; days: string[] }>).then((d) => {
      if (stop) return;
      setToday(d.today); setOpen(d.days ?? []); setDate(d.days?.[0] ?? "");
    }).catch(() => !stop && setOpen([]));
    return () => { stop = true; };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode !== "move" || !date) return;
    let stop = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the old answer while the new one loads
    setTimes(null);
    fetch(query({ date })).then((r) => r.json() as Promise<{ times: string[] }>).then((d) => { if (!stop) setTimes(d.times ?? []); }).catch(() => !stop && setTimes([]));
    return () => { stop = true; };
  }, [mode, date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setError("");
    const r = await post("/api/book", { m: token, ...body });
    setBusy(false);
    if (r.ok) { setMessage(okText); setMode("view"); setTime(""); await load(); return; }
    setError(errorText(lang, r.code));
  }

  const title = business ? textsFor(business.design, lang).title || business.name : "";
  const bk = info?.booking;
  const live = bk && (bk.status === "confirmed" || bk.status === "pending");
  return (
    <div className="auth-page bk-page" dir={dir} style={business ? ({ "--bk": business.design.colors.bg, "--bk-fg": business.design.colors.fg } as React.CSSProperties) : undefined}>
      <header className="auth-top">
        <Brand />
        <LangSwitch lang={lang} setLang={setLang} />
      </header>
      <main id="main" className="page-main bk-main">
        {!business ? (
          <div className="auth-card panel"><h1>{t("err_booking_closed")}</h1></div>
        ) : (
          <>
            <div className="bk-head">
              <Logo design={business.design} title={title} className="bk-logo" />
              <div><small>{t("bk_manage")}</small><h1>{title}</h1></div>
            </div>
            {!bk ? <p className="muted bk-wait">…</p> : (
              <section className="panel bk-step">
                <span className={"bk-status is-" + bk.status}>{t("bk_status_" + bk.status)}</span>
                <p className="bk-when"><bdi>{`${dayLabel(bk.date, lang).day} ${dayLabel(bk.date, lang).date} · ${bk.time}`}</bdi></p>
                <p className="bk-detail"><b>{bk.services.map((s) => s.name).join(" + ")}</b> · {durationLabel(bk.minutes, lang)}{bk.price > 0 ? ` · ${formatMoney(bk.price, business.currency, lang)}` : ""}</p>
                {bk.staff && <p className="bk-detail"><User size={14} aria-hidden="true" /> {bk.staff}</p>}
                {message && <p className="bk-ok" role="status">{message}</p>}
                {error && <p className="form-error" role="alert">{error}</p>}

                {live && !info!.canChange && <p className="form-hint">{t("bk_tooLate")}</p>}
                {live && info!.canChange && mode === "view" && (
                  <div className="bk-actions">
                    <button className="btn soft wide" onClick={() => { setMessage(""); setMode("move"); }}><RefreshCw size={16} />{t("bk_move")}</button>
                    <button className="btn danger wide" onClick={() => { setMessage(""); setMode("cancel"); }}><CalendarX size={16} />{t("bk_cancel")}</button>
                    <p className="form-hint">{info!.cancelHours > 0 ? t("bk_cancelUntil", { h: info!.cancelHours }) : t("bk_cancelAnytime")}</p>
                  </div>
                )}
                {mode === "cancel" && (
                  <div className="bk-confirm" role="group" aria-label={t("bk_cancel")}>
                    <p>{t("bk_cancelSure")}</p>
                    <button className="btn danger wide" disabled={busy} onClick={() => act({ action: "cancel" }, t("bk_cancelled"))}>{t("bk_cancelYes")}</button>
                    <button className="btn soft wide" onClick={() => setMode("view")}>{t("bk_keep")}</button>
                  </div>
                )}
                {mode === "move" && (
                  <div className="bk-move">
                    <h2>{t("bk_day")}</h2>
                    {open === null ? <p className="muted bk-wait">…</p> : !open.length ? <p className="muted">{t("bk_noDays")}</p> : (
                      <>
                        <DayStrip today={today} open={open} value={date} onPick={(d) => { setDate(d); setTime(""); }} lang={lang} />
                        <h2>{t("bk_time")}</h2>
                        <TimeGrid times={times} value={time} onPick={setTime} empty={t("bk_noTimes")} />
                      </>
                    )}
                    <button className="btn primary wide" disabled={busy || !date || !time} onClick={() => act({ action: "move", date, time }, t("bk_moved"))}>
                      <Clock size={16} />{date && time ? t("bk_moveTo", { when: `${dayLabel(date, lang).day} ${dayLabel(date, lang).date} · ${time}` }) : t("bk_move")}
                    </button>
                    <button className="btn soft wide" onClick={() => setMode("view")}>{t("bk_keep")}</button>
                  </div>
                )}
                <a className="btn soft wide" href={`/book/${business.key}`}><CalendarCheck size={16} />{t("bk_bookAgain")}</a>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
