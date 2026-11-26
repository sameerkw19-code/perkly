"use client";

// Online booking, the business side: the day's calendar with a column per person, requests waiting for approval,
// booking for a client, and (for the owner) the booking settings: link, rules, hours, services, calendars, special days.

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Plus, Settings2, Trash2, X } from "lucide-react";
import { post } from "../lib/api";
import { errorText } from "../lib/i18n";
import type { SiteLang } from "../lib/i18n-types";
import { formatMoney } from "../lib/cashback";
import { addDays, SLOT_CHOICES, toHM, toMin, type WorkHours } from "../lib/calendar";
import { durationLabel, type BookService } from "../lib/booking";

type T = (key: string, vars?: Record<string, string | number>) => string;
type Staff = { id: string; name: string; hours: [string, string] | null; weekly: WorkHours | null; services: string[] | null };
type Item = {
  id: string; staff: string; date: string; time: string; end: string; minutes: number; price: number; status: "pending" | "confirmed" | "cancelled";
  source: string; note: string | null; services: BookService[]; customer: string; name: string; phone: string;
};
type Day = { date: string; today: string; slot: number; staff: Staff[]; bookings: Item[]; services: BookService[] };
type Pending = { id: string; staff: string; date: string; time: string; minutes: number; services: BookService[]; note: string | null; name: string; phone: string };
type Rules = { auto: boolean; days: number; notice: number; cancelHours: number; prices: boolean };
type Settings = {
  key: string; rules: Rules; note: string; hours: WorkHours; slot: number; services: BookService[];
  staff: { id: string; name: string; hours: WorkHours | null; services: string[] | null }[];
  specials: { id: string; staff: string; date: string; hours: string | null; note: string | null }[];
};

const PX = 1.3; // pixels per minute in the day view

function dayTitle(date: string, lang: string): string {
  const locale = lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
function weekdayNames(lang: string): string[] {
  const locale = lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB";
  // 2026-11-29 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 29 + i, 12))));
}

export function BookingDesk({ business, owner, t, lang, notify, onNewCard }: {
  business: { id: string; currency?: string };
  owner: boolean; t: T; lang: string;
  notify: (s: string, bad?: boolean) => void;
  onNewCard: (url: string, name: string, when: string) => void;
}) {
  const [tab, setTab] = useState<"day" | "settings">("day");
  const api = async (action: string, body: Record<string, unknown> = {}) => {
    const r = await post("/api/booking", { business: business.id, action, ...body });
    if (!r.ok) { notify(errorText(lang as SiteLang, r.code), true); return null; }
    return r.data;
  };
  const money = (m: number) => formatMoney(m, business.currency === "USD" ? "USD" : "ILS", lang);
  return (
    <section className="bkd">
      {owner && (
        <div className="bkd-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "day"} className={"chip" + (tab === "day" ? " is-on" : "")} onClick={() => setTab("day")}><CalendarCheck size={16} />{t("bkd_calendar")}</button>
          <button role="tab" aria-selected={tab === "settings"} className={"chip" + (tab === "settings" ? " is-on" : "")} onClick={() => setTab("settings")}><Settings2 size={16} />{t("bkd_settings")}</button>
        </div>
      )}
      {tab === "day" ? <DayView api={api} t={t} lang={lang} money={money} notify={notify} onNewCard={onNewCard} /> : <SettingsView api={api} t={t} lang={lang} notify={notify} />}
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each action answers with its own shape
type Api = (action: string, body?: Record<string, unknown>) => Promise<any>;

function DayView({ api, t, lang, money, notify, onNewCard }: {
  api: Api; t: T; lang: string; money: (m: number) => string; notify: (s: string, bad?: boolean) => void;
  onNewCard: (url: string, name: string, when: string) => void;
}) {
  const [date, setDate] = useState("");
  const [day, setDay] = useState<Day | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  const [draft, setDraft] = useState<{ staff: string; time: string } | null>(null);

  async function load(d = date) {
    const [r, p] = await Promise.all([api("day", d ? { date: d } : {}), api("pending")]);
    if (r) { setDay(r); setDate(r.date); }
    if (p) setPending(p.pending);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load once on open
  useEffect(() => { load(); }, []);
  const services = day?.services ?? null;

  const go = (d: string) => { setOpen(null); setDraft(null); load(d); };
  const range = useMemo(() => {
    if (!day) return { from: 8 * 60, to: 20 * 60 };
    let from = 24 * 60, to = 0;
    for (const s of day.staff) if (s.hours) { from = Math.min(from, toMin(s.hours[0])); to = Math.max(to, toMin(s.hours[1])); }
    for (const b of day.bookings) { from = Math.min(from, toMin(b.time)); to = Math.max(to, toMin(b.end)); }
    if (from >= to) return { from: 8 * 60, to: 20 * 60 };
    return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60 };
  }, [day]);

  async function decide(id: string, action: "confirm" | "decline") {
    if (await api(action, { id })) { notify(t("bkd_done")); load(); }
  }

  if (!day) return <div className="empty compact">…</div>;
  const hours: number[] = [];
  for (let m = range.from; m <= range.to; m += 60) hours.push(m);
  const height = (range.to - range.from) * PX;
  return (
    <div className="bkd-day">
      {pending.length > 0 && (
        <div className="panel bkd-pending">
          <h2>{t("bkd_requests")} <span className="count">{pending.length}</span></h2>
          <ul>
            {pending.map((p) => (
              <li key={p.id}>
                <div><b>{p.name}</b> <small dir="ltr">{p.phone}</small><br /><span className="muted"><bdi>{dayTitle(p.date, lang)} · {p.time}</bdi> · {p.services.map((s) => s.name).join(" + ")}</span>{p.note && <><br /><small>“{p.note}”</small></>}</div>
                <div className="bkd-pending-actions">
                  <button className="btn primary small" onClick={() => decide(p.id, "confirm")}><Check size={15} />{t("bkd_confirm")}</button>
                  <button className="btn soft small" onClick={() => decide(p.id, "decline")}><X size={15} />{t("bkd_decline")}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bkd-nav">
        <button className="icon-btn" aria-label={t("bkd_prev")} onClick={() => go(addDays(date, -1))}>{lang === "en" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</button>
        <h2><bdi>{dayTitle(date, lang)}</bdi></h2>
        <button className="icon-btn" aria-label={t("bkd_nextDay")} onClick={() => go(addDays(date, 1))}>{lang === "en" ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button>
        {date !== day.today && <button className="btn soft small" onClick={() => go(day.today)}>{t("bkd_today")}</button>}
        <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} aria-label={t("bkd_calendar")} />
        <button className="btn primary small bkd-new" onClick={() => { setOpen(null); setDraft({ staff: day.staff[0]?.id ?? "", time: "" }); }}><Plus size={16} />{t("bkd_new")}</button>
      </div>

      <div className="bkd-grid" style={{ "--cols": day.staff.length } as React.CSSProperties}>
        <div className="bkd-hours" style={{ height }} aria-hidden="true">
          {hours.map((m) => <span key={m} style={{ top: (m - range.from) * PX }}>{toHM(m)}</span>)}
        </div>
        {day.staff.map((s) => (
          <div key={s.id} className="bkd-col">
            <div className="bkd-col-head">{s.name}{!s.hours && <small> · {t("bkd_closed")}</small>}</div>
            <div className="bkd-col-body" style={{ height }}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const y = e.nativeEvent.offsetY;
                const m = range.from + Math.floor(y / PX / day.slot) * day.slot;
                setOpen(null);
                setDraft({ staff: s.id, time: toHM(m) });
              }}>
              {/* Closed parts of the day are shaded. */}
              {s.hours ? (
                <>
                  <i className="bkd-off" style={{ top: 0, height: Math.max(0, (toMin(s.hours[0]) - range.from) * PX) }} />
                  <i className="bkd-off" style={{ top: (toMin(s.hours[1]) - range.from) * PX, bottom: 0 }} />
                </>
              ) : <i className="bkd-off" style={{ top: 0, bottom: 0 }} />}
              {hours.map((m) => <i key={m} className="bkd-line" style={{ top: (m - range.from) * PX }} />)}
              {day.bookings.filter((b) => b.staff === s.id && b.status !== "cancelled").map((b) => (
                <button key={b.id} className={"bkd-item is-" + b.status + (b.minutes * PX < 44 ? " is-short" : "")} style={{ top: (toMin(b.time) - range.from) * PX, height: Math.max(24, b.minutes * PX - 2) }}
                  onClick={() => { setDraft(null); setOpen(b); }}>
                  <b>{b.time} {b.name}</b>
                  <small>{b.services.map((x) => x.name).join(" + ")}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {day.bookings.filter((b) => b.status !== "cancelled").length === 0 && <p className="muted bkd-empty">{t("bkd_empty")}</p>}

      {open && <ItemPanel item={open} day={day} api={api} t={t} lang={lang} money={money} services={services}
        onClose={() => setOpen(null)} onDone={() => { setOpen(null); notify(t("bkd_done")); load(); }} />}
      {draft && <NewPanel draft={draft} day={day} api={api} t={t} lang={lang} money={money} services={services}
        onClose={() => setDraft(null)}
        onDone={(r, name, when) => { setDraft(null); notify(t("bkd_booked")); if (r.cardPath) onNewCard(location.origin + r.cardPath, name, when); load(); }} />}
    </div>
  );
}

/** The free times for services on a date (and person), from the server. */
function useFree(api: Api, date: string, serviceIds: string[], staff: string, skip?: string, minutes?: number) {
  const [times, setTimes] = useState<string[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the old answer while the new one loads
    if (!date || !serviceIds.length) { setTimes([]); return; }
    let stop = false;
    setTimes(null);
    api("free", { date, services: serviceIds, staff, skip, minutes }).then((r: { times: string[] } | null) => { if (!stop) setTimes(r?.times ?? []); });
    return () => { stop = true; };
  }, [date, serviceIds.join(","), staff, skip]); // eslint-disable-line react-hooks/exhaustive-deps
  return times;
}

function TimeChips({ times, value, onPick }: { times: string[] | null; value: string; onPick: (t: string) => void }) {
  if (times === null) return <p className="muted">…</p>;
  return (
    <div className="bk-times bkd-times" role="radiogroup">
      {times.map((x) => <button key={x} type="button" role="radio" aria-checked={value === x} className={"bk-time" + (value === x ? " is-on" : "")} onClick={() => onPick(x)} dir="ltr">{x}</button>)}
    </div>
  );
}

function ItemPanel({ item, day, api, t, lang, money, services, onClose, onDone }: {
  item: Item; day: Day; api: Api; t: T; lang: string; money: (m: number) => string; services: BookService[] | null; onClose: () => void; onDone: () => void;
}) {
  const [mode, setMode] = useState<"view" | "cancel" | "move">("view");
  const [date, setDate] = useState(item.date);
  const [staff, setStaff] = useState(item.staff);
  const [time, setTime] = useState("");
  const ids = item.services.map((s) => s.id);
  const times = useFree(api, mode === "move" ? date : "", ids, staff, item.id, item.minutes);
  void services;
  return (
    <div className="panel bkd-panel" role="dialog" aria-label={item.name}>
      <button className="close" aria-label="X" onClick={onClose}><X size={18} /></button>
      <span className={"bk-status is-" + item.status}>{t("bk_status_" + item.status)}</span>
      <h2>{item.name} <small dir="ltr" className="muted">{item.phone}</small></h2>
      <p><bdi>{dayTitle(item.date, lang)} · {item.time}–{item.end}</bdi></p>
      <p><b>{item.services.map((s) => s.name).join(" + ")}</b> · {durationLabel(item.minutes, lang)}{item.price > 0 ? ` · ${money(item.price)}` : ""}</p>
      <p className="muted">{day.staff.find((s) => s.id === item.staff)?.name} · {item.source === "online" ? t("bkd_online") : t("bkd_byStaff")}</p>
      {item.note && <p className="bkd-note">“{item.note}”</p>}
      {mode === "view" && (
        <div className="bkd-row">
          {item.status === "pending" && <button className="btn primary small" onClick={async () => { if (await api("confirm", { id: item.id })) onDone(); }}><Check size={15} />{t("bkd_confirm")}</button>}
          <button className="btn soft small" onClick={() => setMode("move")}>{t("bkd_move")}</button>
          <button className="btn danger small" onClick={() => setMode("cancel")}>{t("bkd_cancel")}</button>
        </div>
      )}
      {mode === "cancel" && (
        <div className="bk-confirm">
          <p>{t("bkd_cancelSure")}</p>
          <div className="bkd-row">
            <button className="btn danger small" onClick={async () => { if (await api("cancel", { id: item.id })) onDone(); }}>{t("bk_cancelYes")}</button>
            <button className="btn soft small" onClick={() => setMode("view")}>{t("bk_keep")}</button>
          </div>
        </div>
      )}
      {mode === "move" && (
        <div className="bkd-form">
          <div className="admin-new-row">
            <label>{t("bkd_calendar")}<select value={staff} onChange={(e) => { setStaff(e.target.value); setTime(""); }}>{day.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>{t("bk_day")}<input type="date" value={date} min={day.today} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setTime(""); } }} /></label>
          </div>
          <TimeChips times={times} value={time} onPick={setTime} />
          {times && !times.length && <p className="muted">{t("bk_noTimes")}</p>}
          <div className="bkd-row">
            <button className="btn primary small" disabled={!time} onClick={async () => { if (await api("move", { id: item.id, date, time, staff })) onDone(); }}>{t("bkd_move")}</button>
            <button className="btn soft small" onClick={() => setMode("view")}>{t("bk_keep")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPanel({ draft, day, api, t, lang, money, services, onClose, onDone }: {
  draft: { staff: string; time: string }; day: Day; api: Api; t: T; lang: string; money: (m: number) => string; services: BookService[] | null;
  onClose: () => void; onDone: (r: { cardPath?: string }, name: string, when: string) => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [staff, setStaff] = useState(draft.staff);
  const [date, setDate] = useState(day.date < day.today ? day.today : day.date);
  const [time, setTime] = useState(draft.time);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const list = services ?? [];
  const times = useFree(api, date, picked, staff);
  // A time picked on the calendar stays only if it is free for these services.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the old answer while the new one loads
  useEffect(() => { if (times && time && !times.includes(time)) setTime(""); }, [times]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the old answer while the new one loads
    if (q.trim().length < 2) { setFound([]); return; }
    let stop = false;
    const h = setTimeout(async () => { const r = await api("customer", { q }); if (!stop && r) setFound(r.customers); }, 250);
    return () => { stop = true; clearTimeout(h); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = client?.name ?? name;
  const ready = !!picked.length && !!time && (client || (isNew && name.trim() && phone.trim()));
  async function save() {
    setBusy(true);
    const r = await api("create", { services: picked, staff, date, time, note, ...(client ? { customer: client.id } : { name, phone }) });
    setBusy(false);
    if (r) onDone(r, who, `${dayTitle(date, lang)} · ${time}`);
  }
  return (
    <div className="panel bkd-panel" role="dialog" aria-label={t("bkd_new")}>
      <button className="close" aria-label="X" onClick={onClose}><X size={18} /></button>
      <h2>{t("bkd_new")}</h2>
      <div className="bkd-form">
        <fieldset className="anf-set">
          <legend>{t("bkd_client")}</legend>
          {client ? (
            <p className="bkd-picked"><b>{client.name}</b> <button className="text-btn" onClick={() => setClient(null)}>{t("bk_change")}</button></p>
          ) : isNew ? (
            <div className="admin-new-row">
              <label>{t("bk_yourName")}<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
              <label>{t("phone")}<input value={phone} type="tel" dir="ltr" maxLength={20} onChange={(e) => setPhone(e.target.value)} /></label>
            </div>
          ) : (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("bkd_search")} aria-label={t("bkd_search")} />
              {found.length > 0 && (
                <ul className="bkd-found">
                  {found.map((c) => <li key={c.id}><button type="button" onClick={() => { setClient({ id: c.id, name: c.name }); setFound([]); }}><b>{c.name}</b> <small dir="ltr">{c.phone}</small></button></li>)}
                </ul>
              )}
            </>
          )}
          {!client && <button type="button" className="text-btn" onClick={() => setIsNew(!isNew)}>{isNew ? t("bkd_search") : <><Plus size={15} />{t("bkd_newClient")}</>}</button>}
        </fieldset>
        <fieldset className="anf-set">
          <legend>{t("bkd_pickServices")}</legend>
          {!list.length && <p className="muted">{t("bkd_noServices")}</p>}
          <div className="bkd-svc">
            {list.map((s) => {
              const on = picked.includes(s.id);
              return (
                <label key={s.id} className={"anf-chip" + (on ? " is-on" : "")}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])} />
                  {on && <Check size={14} aria-hidden="true" />}{s.name} <small className="muted">{durationLabel(s.min, lang)}{s.price ? ` · ${money(s.price)}` : ""}</small>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="admin-new-row">
          <label>{t("bkd_calendar")}<select value={staff} onChange={(e) => setStaff(e.target.value)}>{day.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>{t("bk_day")}<input type="date" value={date} min={day.today} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        </div>
        {picked.length > 0 && <><span className="bkd-label">{t("bkd_time")}</span><TimeChips times={times} value={time} onPick={setTime} />{times && !times.length && <p className="muted">{t("bk_noTimes")}</p>}</>}
        <label>{t("bk_note")}<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="btn primary" disabled={!ready || busy} onClick={save}><CalendarCheck size={16} />{busy ? "…" : t("bkd_save")}</button>
      </div>
    </div>
  );
}

// ---------- Settings (owner) ----------

function WeekEditor({ value, onChange, lang }: { value: WorkHours; onChange: (v: WorkHours) => void; lang: string }) {
  const names = weekdayNames(lang);
  return (
    <div className="bkd-week">
      {value.map((d, i) => (
        <div key={i} className="bkd-week-row">
          <label className="check"><input type="checkbox" checked={!!d} onChange={(e) => { const v = [...value]; v[i] = e.target.checked ? ["09:00", "18:00"] : null; onChange(v); }} /> <span>{names[i]}</span></label>
          {d && (
            <>
              <input type="time" value={d[0]} step={300} onChange={(e) => { const v = [...value]; v[i] = [e.target.value, d[1]]; onChange(v); }} aria-label={names[i]} />
              <span aria-hidden="true">–</span>
              <input type="time" value={d[1]} step={300} onChange={(e) => { const v = [...value]; v[i] = [d[0], e.target.value]; onChange(v); }} aria-label={names[i]} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function SettingsView({ api, t, lang, notify }: { api: Api; t: T; lang: string; notify: (s: string, bad?: boolean) => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const load = async () => { const r = await api("settings"); if (r) setS(r); };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load once on open
  useEffect(() => { load(); }, []);
  if (!s) return <div className="empty compact">…</div>;
  const link = `${typeof location === "undefined" ? "" : location.origin}/book/${s.key}`;
  const saved = () => { notify(t("saved")); load(); };
  return (
    <div className="bkd-settings">
      <section className="panel">
        <h2>{t("bkd_link")}</h2>
        <div className="bkd-link"><code dir="ltr">{link.replace(/^https?:\/\//, "")}</code>
          <button className="btn soft small" onClick={async () => { try { await navigator.clipboard.writeText(link); notify(t("bkd_copied")); } catch { notify(link); } }}><Copy size={15} />{t("bkd_copy")}</button>
          <a className="btn soft small" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a>
        </div>
        <p className="form-hint">{t("bkd_linkHint")}</p>
      </section>
      <RulesForm s={s} api={api} t={t} onSaved={saved} />
      <ServicesForm s={s} api={api} t={t} onSaved={saved} />
      <HoursForm s={s} api={api} t={t} lang={lang} onSaved={saved} />
      <StaffForm s={s} api={api} t={t} lang={lang} onSaved={saved} />
      <SpecialsForm s={s} api={api} t={t} lang={lang} onSaved={saved} />
    </div>
  );
}

function RulesForm({ s, api, t, onSaved }: { s: Settings; api: Api; t: T; onSaved: () => void }) {
  const [r, setR] = useState(s.rules);
  const [note, setNote] = useState(s.note);
  return (
    <form className="panel bkd-form" onSubmit={async (e) => { e.preventDefault(); if (await api("rules", { ...r, note })) onSaved(); }}>
      <h2>{t("bkd_rules")}</h2>
      <label className="check"><input type="checkbox" checked={r.auto} onChange={(e) => setR({ ...r, auto: e.target.checked })} /> <span>{t("bkd_auto")}</span></label>
      {!r.auto && <p className="form-hint">{t("bkd_autoHint")}</p>}
      <div className="admin-new-row">
        <label>{t("bkd_days")}<input type="number" min={1} max={365} value={r.days} onChange={(e) => setR({ ...r, days: Number(e.target.value) })} /></label>
        <label>{t("bkd_notice")}<input type="number" min={0} max={10080} step={15} value={r.notice} onChange={(e) => setR({ ...r, notice: Number(e.target.value) })} /></label>
        <label>{t("bkd_cancelHours")}<input type="number" min={0} max={336} value={r.cancelHours} onChange={(e) => setR({ ...r, cancelHours: Number(e.target.value) })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={r.prices} onChange={(e) => setR({ ...r, prices: e.target.checked })} /> <span>{t("bkd_prices")}</span></label>
      <label>{t("bkd_pageNote")}<textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} /></label>
      <button className="btn primary">{t("save")}</button>
    </form>
  );
}

function ServicesForm({ s, api, t, onSaved }: { s: Settings; api: Api; t: T; onSaved: () => void }) {
  const [list, setList] = useState(s.services.map((x) => ({ ...x, priceText: x.price ? String(x.price / 100) : "" })));
  const set = (i: number, patch: Partial<(typeof list)[number]>) => setList(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <form className="panel bkd-form" onSubmit={async (e) => {
      e.preventDefault();
      const services = list.filter((x) => x.name.trim()).map((x) => ({ id: x.id || undefined, name: x.name.trim(), min: x.min, price: Math.round((Number(x.priceText.replace(",", ".")) || 0) * 100) }));
      if (await api("services", { services })) onSaved();
    }}>
      <h2>{t("bkd_servicesTitle")}</h2>
      {list.map((x, i) => (
        <div key={x.id || i} className="bkd-svc-row">
          <label>{t("bkd_serviceName")}<input value={x.name} maxLength={60} onChange={(e) => set(i, { name: e.target.value })} /></label>
          <label>{t("bkd_minutes")}<input type="number" min={5} max={480} step={5} value={x.min} onChange={(e) => set(i, { min: Number(e.target.value) })} /></label>
          <label>{t("bkd_price")}<input inputMode="decimal" dir="ltr" value={x.priceText} placeholder="0" onChange={(e) => set(i, { priceText: e.target.value.replace(/[^\d.,]/g, "") })} /></label>
          <button type="button" className="icon-btn" aria-label={t("bkd_remove")} onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" className="btn soft small" onClick={() => setList([...list, { id: "", name: "", min: 30, price: 0, priceText: "" }])}><Plus size={15} />{t("bkd_addService")}</button>
      <button className="btn primary">{t("save")}</button>
    </form>
  );
}

function HoursForm({ s, api, t, lang, onSaved }: { s: Settings; api: Api; t: T; lang: string; onSaved: () => void }) {
  const [hours, setHours] = useState<WorkHours>(s.hours);
  const [slot, setSlot] = useState(s.slot);
  return (
    <form className="panel bkd-form" onSubmit={async (e) => { e.preventDefault(); if (await api("hours", { hours, slot })) onSaved(); }}>
      <h2>{t("bkd_hours")}</h2>
      <WeekEditor value={hours} onChange={setHours} lang={lang} />
      <label>{t("bkd_step")}<select value={slot} onChange={(e) => setSlot(Number(e.target.value))}>{SLOT_CHOICES.map((m) => <option key={m} value={m}>{t("bkd_minutesShort", { n: m })}</option>)}</select></label>
      <button className="btn primary">{t("save")}</button>
    </form>
  );
}

function StaffForm({ s, api, t, lang, onSaved }: { s: Settings; api: Api; t: T; lang: string; onSaved: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="panel bkd-form">
      <h2>{t("bkd_people")}</h2>
      <p className="form-hint">{t("bkd_peopleHint")}</p>
      {s.staff.map((p) => <PersonRow key={p.id} p={p} s={s} api={api} t={t} lang={lang} onSaved={onSaved} canRemove={s.staff.length > 1} />)}
      {adding ? <PersonRow p={{ id: "", name: "", hours: null, services: null }} s={s} api={api} t={t} lang={lang} onSaved={() => { setAdding(false); onSaved(); }} canRemove={false} />
        : <button className="btn soft small" onClick={() => setAdding(true)}><Plus size={15} />{t("bkd_addPerson")}</button>}
    </section>
  );
}

function PersonRow({ p, s, api, t, lang, onSaved, canRemove }: { p: Settings["staff"][number]; s: Settings; api: Api; t: T; lang: string; onSaved: () => void; canRemove: boolean }) {
  const [name, setName] = useState(p.name);
  const [own, setOwn] = useState(!!p.hours);
  const [hours, setHours] = useState<WorkHours>(p.hours ?? s.hours);
  const [svc, setSvc] = useState<string[] | null>(p.services);
  return (
    <form className="bkd-person" onSubmit={async (e) => { e.preventDefault(); if (await api("staff_save", { id: p.id || undefined, name, hours: own ? hours : null, services: svc })) onSaved(); }}>
      <label>{t("bkd_personName")}<input value={name} required maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      {s.services.length > 1 && (
        <div className="bkd-svc">
          <label className={"anf-chip" + (!svc ? " is-on" : "")}><input type="checkbox" className="sr-only" checked={!svc} onChange={() => setSvc(svc ? null : [])} />{t("bkd_allServices")}</label>
          {svc && s.services.map((x) => (
            <label key={x.id} className={"anf-chip" + (svc.includes(x.id) ? " is-on" : "")}>
              <input type="checkbox" className="sr-only" checked={svc.includes(x.id)} onChange={() => setSvc(svc.includes(x.id) ? svc.filter((y) => y !== x.id) : [...svc, x.id])} />{x.name}
            </label>
          ))}
        </div>
      )}
      <label className="check"><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /> <span>{t("bkd_ownHours")}</span></label>
      {own && <WeekEditor value={hours} onChange={setHours} lang={lang} />}
      <div className="bkd-row">
        <button className="btn primary small">{t("save")}</button>
        {p.id && canRemove && <button type="button" className="btn danger small" onClick={async () => { if (await api("staff_remove", { id: p.id })) onSaved(); }}><Trash2 size={15} />{t("bkd_remove")}</button>}
      </div>
    </form>
  );
}

function SpecialsForm({ s, api, t, lang, onSaved }: { s: Settings; api: Api; t: T; lang: string; onSaved: () => void }) {
  const [date, setDate] = useState("");
  const [staff, setStaff] = useState("");
  const [closed, setClosed] = useState(true);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("13:00");
  const [note, setNote] = useState("");
  const who = (id: string) => (id ? s.staff.find((x) => x.id === id)?.name ?? "—" : t("bkd_everyone"));
  return (
    <section className="panel bkd-form">
      <h2>{t("bkd_specials")}</h2>
      {s.specials.length > 0 && (
        <ul className="bkd-specials">
          {s.specials.map((d) => {
            const h = d.hours ? (JSON.parse(d.hours) as [string, string]) : null;
            return (
              <li key={d.id}>
                <span><b><bdi>{dayTitle(d.date, lang)}</bdi></b> · {who(d.staff)} · {h ? `${h[0]}–${h[1]}` : t("bkd_closedAllDay")}{d.note ? ` · ${d.note}` : ""}</span>
                <button className="icon-btn" aria-label={t("bkd_remove")} onClick={async () => { if (await api("special_remove", { id: d.id })) onSaved(); }}><Trash2 size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="bkd-form" onSubmit={async (e) => {
        e.preventDefault();
        if (await api("special_save", { date, staff, hours: closed ? null : [from, to], note })) { setDate(""); setNote(""); onSaved(); }
      }}>
        <div className="admin-new-row">
          <label>{t("bk_day")}<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>{t("bkd_calendar")}<select value={staff} onChange={(e) => setStaff(e.target.value)}><option value="">{t("bkd_everyone")}</option>{s.staff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>
        <label className="check"><input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> <span>{t("bkd_closedAllDay")}</span></label>
        {!closed && (
          <div className="bkd-week-row">
            <input type="time" value={from} step={300} onChange={(e) => setFrom(e.target.value)} aria-label={t("bkd_hours")} /><span aria-hidden="true">–</span>
            <input type="time" value={to} step={300} onChange={(e) => setTo(e.target.value)} aria-label={t("bkd_hours")} />
          </div>
        )}
        <label>{t("bkd_specialNote")}<input value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="btn soft small"><Plus size={15} />{t("bkd_addSpecial")}</button>
      </form>
    </section>
  );
}
