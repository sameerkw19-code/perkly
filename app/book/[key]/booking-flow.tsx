"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Clock, User, Wallet } from "lucide-react";
import { errorText, useLang } from "../../../lib/i18n";
import { post } from "../../../lib/api";
import { LangSwitch } from "../../../components/lang-switch";
import { Logo } from "../../../components/loyalty-card";
import { Brand } from "../../../components/brand";
import { formatMoney } from "../../../lib/cashback.ts";
import { durationLabel, type BookService } from "../../../lib/booking";
import { addDays } from "../../../lib/calendar";
import { textsFor, type Design } from "../../../lib/design";

type Business = {
  name: string; design: Design; note: string; cancelHours: number; prices: boolean; currency: "ILS" | "USD";
  services: BookService[]; staff: { id: string; name: string; services: string[] | null }[];
};
type Step = "services" | "staff" | "when" | "details" | "done";

/** A date as "יום ג׳ · 2.12" in the page's language. */
export function dayLabel(date: string, lang: string): { day: string; date: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const locale = lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB";
  return {
    day: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(d),
    date: `${d.getUTCDate()}.${d.getUTCMonth() + 1}`,
  };
}

/** The days on the strip: from today to the last day with a free time (closed days greyed out). */
export function DayStrip({ today, open, value, onPick, lang }: { today: string; open: string[]; value: string; onPick: (d: string) => void; lang: string }) {
  const last = open[open.length - 1] ?? today;
  const days: string[] = [];
  for (let d = today; d <= last && days.length < 62; d = addDays(d, 1)) days.push(d);
  return (
    <div className="bk-days" role="radiogroup">
      {days.map((d) => {
        const l = dayLabel(d, lang);
        const ok = open.includes(d);
        return (
          <button key={d} type="button" role="radio" aria-checked={value === d} disabled={!ok} className={"bk-day" + (value === d ? " is-on" : "")} onClick={() => onPick(d)}>
            <small>{l.day}</small><b>{l.date}</b>
          </button>
        );
      })}
    </div>
  );
}

export function TimeGrid({ times, value, onPick, empty }: { times: string[] | null; value: string; onPick: (t: string) => void; empty: string }) {
  if (times === null) return <p className="muted bk-wait">…</p>;
  if (!times.length) return <p className="muted">{empty}</p>;
  return (
    <div className="bk-times" role="radiogroup">
      {times.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={value === t} className={"bk-time" + (value === t ? " is-on" : "")} onClick={() => onPick(t)} dir="ltr">{t}</button>
      ))}
    </div>
  );
}

export default function BookingFlow({ bookingKey, business }: { bookingKey: string; business: Business | null }) {
  const { lang, setLang, t, dir } = useLang();
  const [step, setStep] = useState<Step>("services");
  const [picked, setPicked] = useState<string[]>([]);
  const [staff, setStaff] = useState("");
  const [today, setToday] = useState("");
  const [open, setOpen] = useState<string[] | null>(null);
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[] | null>(null);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ status: string; date: string; time: string; manage: string; cardPath?: string } | null>(null);

  const title = business ? textsFor(business.design, lang).title || business.name : "";
  const chosen = useMemo(() => business?.services.filter((s) => picked.includes(s.id)) ?? [], [business, picked]);
  const minutes = chosen.reduce((n, s) => n + s.min, 0);
  const price = chosen.reduce((n, s) => n + s.price, 0);
  // People who give every picked service.
  const able = business?.staff.filter((s) => !s.services || picked.every((id) => s.services!.includes(id))) ?? [];
  const money = (m: number) => formatMoney(m, business?.currency ?? "ILS", lang);
  const query = (extra: Record<string, string>) =>
    "/api/book?" + new URLSearchParams({ key: bookingKey, services: picked.join(","), staff, ...extra });

  // The open days, once the services and the person are set.
  useEffect(() => {
    if (step !== "when") return;
    let stop = false;
    fetch(query({})).then((r) => r.json() as Promise<{ today: string; days: string[] }>).then((d) => {
      if (stop) return;
      setToday(d.today);
      setOpen(d.days ?? []);
      setDate((cur) => (cur && d.days?.includes(cur) ? cur : d.days?.[0] ?? ""));
    }).catch(() => !stop && setOpen([]));
    return () => { stop = true; };
  }, [step, picked.join(","), staff]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== "when" || !date) return;
    let stop = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the old answer while the new one loads
    setTimes(null);
    fetch(query({ date })).then((r) => r.json() as Promise<{ times: string[] }>).then((d) => { if (!stop) setTimes(d.times ?? []); }).catch(() => !stop && setTimes([]));
    return () => { stop = true; };
  }, [step, date]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setTime("");
  }
  function afterServices() {
    // One person who gives these, or several: then the client picks (or "anyone").
    if (able.length > 1) setStep("staff");
    else { setStaff(""); setStep("when"); }
  }

  async function book(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const r = await post<{ status: string; date: string; time: string; manage: string; cardPath?: string }>("/api/book", {
      action: "book", key: bookingKey, services: picked, staff, date, time,
      name: f.get("name"), phone: f.get("phone"), note: f.get("note") ?? "", terms: f.get("terms") === "on", marketing: f.get("marketing") === "on",
    });
    setBusy(false);
    if (r.ok) {
      setDone(r.data);
      setStep("done");
      try { localStorage.setItem(`perkly-booking:${bookingKey}`, r.data.manage); } catch {}
      return;
    }
    setError(errorText(lang, r.code));
    // The time was just taken: back to the times, refreshed.
    if (r.code === "slot_taken") { setTime(""); setStep("when"); setTimes(null); setOpen(null); }
  }

  const staffName = staff ? business?.staff.find((s) => s.id === staff)?.name : "";
  const when = date && time ? `${dayLabel(date, lang).day} ${dayLabel(date, lang).date} · ${time}` : "";

  return (
    <div className="auth-page bk-page" dir={dir} style={business ? ({ "--bk": business.design.colors.bg, "--bk-fg": business.design.colors.fg } as React.CSSProperties) : undefined}>
      <header className="auth-top">
        <Brand />
        <LangSwitch lang={lang} setLang={setLang} />
      </header>
      <main id="main" className="page-main bk-main">
        {!business ? (
          <div className="auth-card panel"><h1>{t("bk_notAvailable")}</h1></div>
        ) : (
          <>
            <div className="bk-head">
              <Logo design={business.design} title={title} className="bk-logo" />
              <div><small>{t("bk_kicker")}</small><h1>{title}</h1></div>
            </div>
            {business.note && step !== "done" && <p className="bk-note">{business.note}</p>}

            {step !== "services" && step !== "done" && (
              <div className="bk-summary">
                <span><b>{chosen.map((s) => s.name).join(" + ")}</b> · {durationLabel(minutes, lang)}{price > 0 ? ` · ${money(price)}` : ""}</span>
                {staffName && <span><User size={14} aria-hidden="true" /> {staffName}</span>}
                {step === "details" && when && <span><Clock size={14} aria-hidden="true" /> <bdi>{when}</bdi></span>}
              </div>
            )}

            {step === "services" && (
              <section className="panel bk-step" aria-labelledby="bk-s1">
                <h2 id="bk-s1">{t("bk_services")}</h2>
                {!business.services.length ? <p className="muted">{t("bk_noService")}</p> : <p className="form-hint">{t("bk_servicesHint")}</p>}
                <div className="bk-list">
                  {business.services.map((s) => {
                    const on = picked.includes(s.id);
                    return (
                      <label key={s.id} className={"bk-opt" + (on ? " is-on" : "")}>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(s.id)} />
                        <span className="bk-opt-text"><b>{s.name}</b><small>{durationLabel(s.min, lang)}</small></span>
                        {s.price > 0 && <span className="bk-price">{money(s.price)}</span>}
                        <span className="bk-check" aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                      </label>
                    );
                  })}
                </div>
                <button className="btn primary wide bk-go" disabled={!picked.length} onClick={afterServices}>{t("bk_next")}</button>
              </section>
            )}

            {step === "staff" && (
              <section className="panel bk-step" aria-labelledby="bk-s2">
                <h2 id="bk-s2">{t("bk_staff")}</h2>
                <div className="bk-list" role="radiogroup">
                  {[{ id: "", name: t("bk_anyone") }, ...able].map((s) => (
                    <button key={s.id || "any"} type="button" role="radio" aria-checked={staff === s.id} className={"bk-opt" + (staff === s.id ? " is-on" : "")}
                      onClick={() => { setStaff(s.id); setTime(""); setStep("when"); }}>
                      <span className="bk-avatar" aria-hidden="true">{s.id ? s.name.trim().charAt(0) : "★"}</span>
                      <span className="bk-opt-text"><b>{s.name}</b></span>
                    </button>
                  ))}
                </div>
                <button className="text-btn" onClick={() => setStep("services")}>{dir === "rtl" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t("bk_back")}</button>
              </section>
            )}

            {step === "when" && (
              <section className="panel bk-step" aria-labelledby="bk-s3">
                <h2 id="bk-s3">{t("bk_day")}</h2>
                {open === null ? <p className="muted bk-wait">…</p> : !open.length ? <p className="muted">{t("bk_noDays")}</p> : (
                  <>
                    <DayStrip today={today} open={open} value={date} onPick={(d) => { setDate(d); setTime(""); }} lang={lang} />
                    <h2>{t("bk_time")}</h2>
                    <TimeGrid times={times} value={time} onPick={setTime} empty={t("bk_noTimes")} />
                  </>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="btn primary wide bk-go" disabled={!date || !time} onClick={() => { setError(""); setStep("details"); }}>{t("bk_next")}</button>
                <button className="text-btn" onClick={() => setStep(able.length > 1 ? "staff" : "services")}>{dir === "rtl" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t("bk_back")}</button>
              </section>
            )}

            {step === "details" && (
              <form className="panel bk-step stack-form" onSubmit={book} aria-labelledby="bk-s4">
                <h2 id="bk-s4">{t("bk_details")}</h2>
                <label>{t("bk_yourName")}<input name="name" required maxLength={80} autoComplete="name" /></label>
                <label>{t("phone")}<input name="phone" type="tel" required maxLength={20} autoComplete="tel" dir="ltr" placeholder={t("phoneHint")} /></label>
                <label>{t("bk_note")}<textarea name="note" maxLength={300} rows={2} /></label>
                <label className="check"><input type="checkbox" name="terms" required /> <span>{t("terms")}</span></label>
                <p className="form-hint legal-links"><a href="/terms" target="_blank" rel="noreferrer">{t("termsLink")}</a> · <a href="/privacy" target="_blank" rel="noreferrer">{t("privacyLink")}</a></p>
                <label className="check"><input type="checkbox" name="marketing" /> <span>{t("marketing")}</span></label>
                <p className="form-hint">{business.cancelHours > 0 ? t("bk_cancelUntil", { h: business.cancelHours }) : t("bk_cancelAnytime")}</p>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="btn primary wide bk-go" disabled={busy}><CalendarCheck size={18} />{busy ? t("loading") : t("bk_book")}</button>
                <button type="button" className="text-btn" onClick={() => setStep("when")}>{dir === "rtl" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t("bk_back")}</button>
              </form>
            )}

            {step === "done" && done && (
              <section className="panel bk-step bk-done" aria-live="polite">
                <span className="bk-done-icon" aria-hidden="true">{done.status === "confirmed" ? <Check size={28} strokeWidth={3} /> : <Clock size={28} />}</span>
                <h2>{done.status === "confirmed" ? t("bk_doneTitle") : t("bk_pendingTitle")}</h2>
                <p className="bk-when"><bdi>{`${dayLabel(done.date, lang).day} ${dayLabel(done.date, lang).date} · ${done.time}`}</bdi></p>
                <p className="muted">{chosen.map((s) => s.name).join(" + ")}{staffName ? ` · ${t("bk_with", { name: staffName })}` : ""}</p>
                <p>{done.status === "confirmed" ? t("bk_doneText") : t("bk_pendingText")}</p>
                {done.cardPath && <a className="btn primary wide" href={done.cardPath}><Wallet size={18} />{t("bk_saveCard")}</a>}
                <a className="btn soft wide" href={done.manage}>{t("bk_manage")}</a>
                <p className="form-hint">{t("bk_manageHint")}</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
