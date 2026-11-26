"use client";

// The six simpler cards at the station (one customer) and their owner settings.
//   pass       — use one entry; sell a pass
//   gift       — load an amount; pay with the gift balance
//   club       — the discount to give; record a visit
//   service    — the next service date: "done today" (next one in N months) or a chosen date and name
//   coupon     — use the coupon (once, until its date)
//   attendance — mark a lesson; the next payment date

import { useState } from "react";
import { Check, CalendarClock, Gift, Minus, Plus, RotateCcw, Settings2, Ticket } from "lucide-react";
import { post } from "../lib/api";
import { errorText } from "../lib/i18n";
import type { SiteLang } from "../lib/i18n-types";
import { formatMoney } from "../lib/cashback";
import { addDays, israelDate } from "../lib/library";
import { addMonths, couponState, passUsable, shortDate, simpleFace, type SimpleProgram } from "../lib/programs";

type T = (key: string, vars?: Record<string, string | number>) => string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each action answers with its own shape
type Call = (b: Record<string, unknown>) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the station's card state, passed through
type Card = Record<string, any> & { id: string };

export type SimpleBusiness = {
  id: string; program?: string; reward: string; currency?: string;
  pass_size?: number; pass_days?: number; club_pct?: number; service_months?: number; coupon_until?: string | null;
};

function todayIL(): string {
  return israelDate(new Date());
}

export function SimpleStation({ business, customer, t, lang, branch, notify, onCard }: {
  business: SimpleBusiness; customer: Card; t: T; lang: string; branch?: string;
  notify: (s: string, bad?: boolean) => void; onCard: (card: Card, message: string) => void;
}) {
  const program = business.program as SimpleProgram;
  const currency = business.currency === "USD" ? "USD" : "ILS";
  const money = (m: number) => formatMoney(m, currency, lang);
  const [today] = useState(todayIL);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ key: string; id: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState(String(business.pass_size ?? 10));
  const [date, setDate] = useState<string>(() => customer.dueDate ?? (program === "attendance" ? addMonths(todayIL(), 1) : addMonths(todayIL(), business.service_months ?? 6)));
  const [label, setLabel] = useState<string>(customer.dueLabel ?? "");
  const [confirm, setConfirm] = useState<string | null>(null);

  const face = simpleFace(program, {
    pass_left: customer.passLeft, pass_until: customer.passUntil, balance: customer.balance, due_date: customer.dueDate, due_label: customer.dueLabel,
    coupon_used: customer.couponUsed, month_count: customer.monthCount,
  }, { club_pct: business.club_pct, coupon_until: business.coupon_until, reward: business.reward }, lang, money);

  async function act(action: string, key: string, extra: Record<string, unknown>, message: (card: Card) => string) {
    if (busy) return;
    const requestId = pending?.key === key ? pending.id : crypto.randomUUID();
    setPending({ key, id: requestId });
    setBusy(key);
    setConfirm(null);
    const r = await post("/api/loyalty", { action, business: business.id, customer: customer.id, requestId, branch, ...extra });
    setBusy(null);
    if (r.ok) {
      setPending(null);
      onCard(r.data.card as Card, r.data.replayed ? t("replayed") : message(r.data.card as Card));
    } else if (r.network) {
      notify(t("err_network"), true);
    } else {
      setPending(null);
      if (r.data?.card) onCard(r.data.card as Card, "");
      notify(errorText(lang as SiteLang, r.code), true);
    }
  }
  /** A button that asks once more before an action that cannot be undone. */
  const sure = (key: string, run: () => void) => () => { if (confirm !== key) { setConfirm(key); return; } run(); };
  const label2 = (key: string, normal: string) => (busy === key ? t("sending") : confirm === key ? t("smpSure") : normal);

  return (
    <div className="smp">
      <div className="sx-box smp-face">
        <small>{face.label}</small>
        <strong dir="auto">{face.value}</strong>
        {face.sub && <span>{face.sub}</span>}
      </div>

      {program === "pass" && (
        <>
          <button className="btn primary big sx-wide" disabled={!!busy || !passUsable({ pass_left: customer.passLeft, pass_until: customer.passUntil }, today)}
            onClick={() => act("pass_use", "use", {}, (c) => t("smpPassUsed", { n: c.passLeft ?? 0 }))}>
            <Minus size={18} />{busy === "use" ? t("sending") : t("smpPassUse")}
          </button>
          <h2 className="sx-label">{t("smpPassSell")}</h2>
          <div className="smp-row">
            <label className="smp-field"><span>{t("smpEntries")}</span>
              <input type="number" inputMode="numeric" min={1} max={100} value={count} onChange={(e) => { setCount(e.target.value); setPending(null); }} /></label>
            <button className="btn soft" disabled={!!busy || !(Number(count) >= 1)} onClick={sure("sell", () => act("pass_sell", "sell", { count: Number(count) }, (c) => t("smpPassSold", { n: c.passLeft ?? 0 })))}>
              <Plus size={16} />{label2("sell", t("smpSell", { n: Number(count) || 0 }))}
            </button>
          </div>
          {(business.pass_days ?? 90) > 0 && <small className="muted">{t("smpPassValid", { d: shortDate(addDays(today, business.pass_days ?? 90)) })}</small>}
        </>
      )}

      {program === "gift" && (
        <>
          <label className="smp-field"><span>{t("smpAmount")}</span>
            <input inputMode="decimal" dir="ltr" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); setPending(null); }} /></label>
          <div className="smp-row">
            <button className="btn primary big" disabled={!!busy || !amount} onClick={() => act("spend", "spend", { amount }, (c) => t("smpGiftUsed", { left: money(c.balance ?? 0) }))}>
              <Minus size={18} />{busy === "spend" ? t("sending") : t("smpGiftUse")}
            </button>
            <button className="btn soft big" disabled={!!busy || !amount} onClick={sure("load", () => act("load", "load", { amount }, (c) => t("smpGiftLoaded", { left: money(c.balance ?? 0) })))}>
              <Gift size={18} />{label2("load", t("smpGiftLoad"))}
            </button>
          </div>
          <small className="muted">{t("smpGiftHint")}</small>
        </>
      )}

      {program === "club" && (
        <>
          <p className="smp-big">{t("smpClubGive", { p: business.club_pct ?? 0 })}</p>
          <button className="btn primary big sx-wide" disabled={!!busy} onClick={() => act("checkin", "visit", {}, () => t("smpVisited"))}>
            <Check size={18} />{busy === "visit" ? t("sending") : t("smpVisit")}
          </button>
        </>
      )}

      {program === "coupon" && (() => {
        const st = couponState({ coupon_used: customer.couponUsed }, { coupon_until: business.coupon_until }, today);
        return st === "valid"
          ? <button className="btn primary big sx-wide" disabled={!!busy} onClick={sure("coupon", () => act("coupon_use", "coupon", {}, () => t("smpCouponDone")))}>
              <Ticket size={18} />{label2("coupon", t("smpCouponUse"))}
            </button>
          : <p className="smp-big muted">{st === "used" ? t("smpCouponWasUsed") : t("smpCouponWasExpired")}</p>;
      })()}

      {program === "attendance" && (
        <button className="btn primary big sx-wide" disabled={!!busy} onClick={() => act("checkin", "attend", {}, (c) => t("smpAttended", { n: c.monthCount ?? 0 }))}>
          <Check size={18} />{busy === "attend" ? t("sending") : t("smpAttend")}
        </button>
      )}

      {(program === "service" || program === "attendance") && (
        <>
          {program === "service" && (
            <button className="btn primary big sx-wide" disabled={!!busy} onClick={sure("done", () => act("service_done", "done", {}, (c) => t("smpServiceDone", { d: c.dueDate ? shortDate(c.dueDate) : "" })))}>
              <RotateCcw size={18} />{label2("done", t("smpServiceToday", { n: business.service_months ?? 6 }))}
            </button>
          )}
          <h2 className="sx-label">{program === "service" ? t("smpServiceSet") : t("smpPaySet")}</h2>
          {program === "service" && (
            <label className="smp-field"><span>{t("smpServiceName")}</span>
              <input value={label} maxLength={80} placeholder={t("smpServiceNamePh")} onChange={(e) => { setLabel(e.target.value); setPending(null); }} /></label>
          )}
          <div className="appt-quick" role="group">
            {(program === "service" ? [3, 6, 12] : [1]).map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={date === addMonths(customer.dueDate && program === "attendance" ? customer.dueDate : today, m)}
                onClick={() => { setDate(addMonths(customer.dueDate && program === "attendance" ? customer.dueDate : today, m)); setPending(null); }}>
                {program === "attendance" ? t("smpPayNextMonth") : t("smpMonths", { n: m })}
              </button>
            ))}
            <input type="date" min={today} value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setPending(null); } }} aria-label={t("libOtherDate")} />
          </div>
          <button className="btn soft sx-wide" disabled={!!busy || !date} onClick={() => act("due_set", "due", { date, label }, () => t("smpDueSaved", { d: shortDate(date) }))}>
            <CalendarClock size={16} />{busy === "due" ? t("sending") : t("smpDueSave", { d: shortDate(date) })}
          </button>
        </>
      )}
    </div>
  );
}

/** The owner's settings for the simpler cards that have any. */
export function SimpleSettingsPanel({ business, t, call, reload }: { business: SimpleBusiness; t: T; call: Call; reload: () => void }) {
  const program = business.program;
  const [passSize, setPassSize] = useState(String(business.pass_size ?? 10));
  const [passDays, setPassDays] = useState(String(business.pass_days ?? 90));
  const [clubPct, setClubPct] = useState(String(business.club_pct ?? 10));
  const [months, setMonths] = useState(String(business.service_months ?? 6));
  const [until, setUntil] = useState(business.coupon_until ?? "");
  const [saved, setSaved] = useState(false);
  if (program !== "pass" && program !== "club" && program !== "service" && program !== "coupon") return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await call({
      action: "set_program", passSize: Number(passSize), passDays: Number(passDays), clubPct: Number(clubPct), serviceMonths: Number(months), couponUntil: until || null,
    });
    if (r) { setSaved(true); reload(); }
  }
  const field = (labelKey: string, value: string, set: (v: string) => void, max: number, min = 1) => (
    <label><span>{t(labelKey)}</span><input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => { set(e.target.value); setSaved(false); }} /></label>
  );
  return (
    <section className="panel">
      <h2><Settings2 size={18} /> {t("smpSettings")}</h2>
      <form className="lib-settings" onSubmit={save}>
        {program === "pass" && <>{field("smpSetPassSize", passSize, setPassSize, 100)}{field("smpSetPassDays", passDays, setPassDays, 730, 0)}<small className="form-hint">{t("smpSetPassHint")}</small></>}
        {program === "club" && <>{field("smpSetClubPct", clubPct, setClubPct, 90)}<small className="form-hint">{t("smpSetClubHint")}</small></>}
        {program === "service" && <>{field("smpSetMonths", months, setMonths, 60)}<small className="form-hint">{t("smpSetMonthsHint")}</small></>}
        {program === "coupon" && (
          <>
            <label><span>{t("smpSetCouponUntil")}</span><input type="date" value={until} onChange={(e) => { setUntil(e.target.value); setSaved(false); }} /></label>
            <small className="form-hint">{t("smpSetCouponHint")}</small>
          </>
        )}
        <button className="btn primary">{saved ? t("saved") : t("save")}</button>
      </form>
    </section>
  );
}
