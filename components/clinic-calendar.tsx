"use client";

// The clinic's calendar, for the owner: the day, the week or the month by the working hours, busy and free.
// A free slot books an appointment for a customer (the same reminders as from the station).
// Also here: the working hours and slot length, and what the appointments card adds (the owner's choice).

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Gift, Search, X } from "lucide-react";
import { addDays, endOf, freeStarts, monthGrid, parseHours, parseServices, slotsOf, SLOT_CHOICES, toMin, weekStart, type Service, type WorkHours } from "../lib/calendar";
import { formatTime } from "../lib/appointment";

type T = (key: string, vars?: Record<string, string | number>) => string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each action answers with its own shape
type Call = (b: Record<string, unknown>) => Promise<any>;

export type CalendarBusiness = {
  id: string; reward: string; target: number; work_hours?: string | null; appt_slot?: number;
  appt_extra?: "none" | "stamps" | "points" | "cashback"; appt_points?: number; cashback_bp?: number; cashback_min?: number; currency?: string;
  services?: string | null;
};
export type CalendarCustomer = { id: string; name: string; phone: string; appt_at?: string | null; appt_service?: string | null; appt_min?: number | null };
type Found = { id: string; name: string; phone?: string; apptAt?: string | null };

const TZ = "Asia/Jerusalem";

/** The Israel date and time of a moment. */
function israelParts(iso: string): { date: string; hm: string } {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
    hm: formatTime(iso),
  };
}

/** Today in Israel, and the minutes since midnight (outside render, so the component stays pure). */
function israelNowParts(): { date: string; min: number } {
  const p = israelParts(new Date().toISOString());
  return { date: p.date, min: toMin(p.hm) };
}

export function ClinicCalendar({ business, owner, t, lang, busy, call, reload, notify, onNewCard }: {
  business: CalendarBusiness; owner: boolean; t: T; lang: string; busy: boolean; call: Call; reload: () => void;
  notify: (s: string, bad?: boolean) => void;
  /** A customer registered while booking: their card link, to send them (the reminders reach the card). */
  onNewCard: (url: string, name: string, when: string) => void;
}) {
  // The appointments come from their own query (owners and staff; staff see a masked phone).
  const [customers, setCustomers] = useState<CalendarCustomer[]>([]);
  const [loaded, setLoaded] = useState(false);
  async function refresh() {
    const r = await call({ action: "appt_list" });
    if (r) setCustomers(r.appts as CalendarCustomer[]);
    setLoaded(true);
  }
  // Once, when the calendar opens (the dashboard's `call` is a new function on every render).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load once on open
  useEffect(() => { refresh(); }, []);
  const hours = parseHours(business.work_hours);
  const slot = business.appt_slot ?? 30;
  const services = parseServices(business.services);
  const [now] = useState(israelNowParts);
  const [mode, setMode] = useState<"day" | "week" | "month">("day");
  const [anchor, setAnchor] = useState(now.date);
  const [booking, setBooking] = useState<{ date: string; hm: string; busy: [number, number][] } | null>(null);
  const locale = lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB";

  // Appointments by Israel date, then by time.
  const byDate = useMemo(() => {
    const map = new Map<string, { hm: string; end: string; c: CalendarCustomer }[]>();
    for (const c of customers) {
      if (!c.appt_at) continue;
      const { date, hm } = israelParts(c.appt_at);
      const list = map.get(date) ?? [];
      list.push({ hm, end: endOf(hm, c.appt_min ?? slot), c });
      map.set(date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.hm.localeCompare(b.hm));
    return map;
  }, [customers, slot]);

  const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts }).format(new Date(`${date}T12:00:00Z`));
  const past = (date: string, hm: string) => date < now.date || (date === now.date && toMin(hm) + slot <= now.min);
  /** A day's slots with who is in each, plus appointments outside the hours. */
  const dayRows = (date: string) => {
    const slots = slotsOf(hours, date, slot);
    const appts = byDate.get(date) ?? [];
    // A slot is taken by every appointment that overlaps it (a long treatment takes several slots).
    const overlaps = (a: { hm: string; end: string }, s: string) => toMin(a.hm) < toMin(s) + slot && toMin(a.end) > toMin(s);
    const rows = slots.map((s) => ({ hm: s, who: appts.filter((a) => overlaps(a, s)), starts: appts.filter((a) => overlaps(a, s) && (toMin(a.hm) >= toMin(s) || s === slots[0])) }));
    const outside = appts.filter((a) => !slots.some((s) => overlaps(a, s)));
    const busyRanges = appts.map((a) => [toMin(a.hm), toMin(a.end)] as [number, number]);
    return { rows, outside, total: slots.length, busy: rows.filter((r) => r.who.length).length, busyRanges };
  };

  const step = (n: number) => setAnchor(mode === "day" ? addDays(anchor, n) : mode === "week" ? addDays(anchor, 7 * n) : shiftMonth(anchor, n));
  const title = mode === "day" ? dayLabel(anchor, { weekday: "long", day: "numeric", month: "long" })
    : mode === "week" ? `${dayLabel(weekStart(anchor), { day: "numeric", month: "numeric" })} – ${dayLabel(addDays(weekStart(anchor), 6), { day: "numeric", month: "numeric" })}`
    : dayLabel(anchor, { month: "long", year: "numeric" });

  return (
    <div className="cal">
      <div className="page-head">
        <div><h1><CalendarDays size={24} /> {t("calTitle")}</h1><p className="muted">{t("calIntro")}</p></div>
      </div>
      <section className="panel cal-panel">
        <div className="cal-bar">
          <div className="seg" role="group" aria-label={t("calTitle")}>
            {(["day", "week", "month"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{t("cal_" + m)}</button>
            ))}
          </div>
          <div className="cal-nav">
            <button type="button" className="icon-btn" aria-label={t("calPrev")} onClick={() => step(-1)}><ChevronRight size={18} className="cal-prev" /></button>
            <strong aria-live="polite">{title}</strong>
            <button type="button" className="icon-btn" aria-label={t("calNext")} onClick={() => step(1)}><ChevronLeft size={18} className="cal-next" /></button>
            {anchor !== now.date && <button type="button" className="btn soft small" onClick={() => setAnchor(now.date)}>{t("calToday")}</button>}
          </div>
        </div>

        {!loaded && <p className="form-hint" role="status">{t("loading")}</p>}
        {loaded && mode === "day" && (() => {
          const { rows, outside, total, busy: taken } = dayRows(anchor);
          if (!total && !outside.length) return <p className="cal-closed">{t("calClosed")}</p>;
          return (
            <>
              <p className="form-hint">{t("calDayCount", { busy: taken, free: total - taken })}</p>
              <ul className="cal-day">
                {rows.map((r) => (
                  <li key={r.hm} className={r.who.length ? "is-busy" : past(anchor, r.hm) ? "is-past" : "is-free"}>
                    <time>{r.hm}</time>
                    {r.who.length ? (
                      <div className="cal-who">
                        {r.starts.length ? r.starts.map((a) => (
                          <span key={a.c.id}>
                            <b>{a.c.name}</b>
                            {a.c.appt_service && <em>{a.c.appt_service}</em>}
                            <small><bdi>{a.hm}–{a.end}</bdi> · <bdi dir="ltr">{a.c.phone}</bdi></small>
                          </span>
                        )) : <small className="cal-cont">{t("calContinues", { name: r.who[0].c.name })}</small>}
                      </div>
                    ) : past(anchor, r.hm) ? (
                      <span className="cal-free-label">—</span>
                    ) : (
                      <button type="button" className="cal-book" onClick={() => setBooking({ date: anchor, hm: r.hm, busy: dayRows(anchor).busyRanges })}>{t("calFree")} · {t("calBook")}</button>
                    )}
                  </li>
                ))}
                {outside.map((a) => (
                  <li key={a.c.id} className="is-busy is-outside">
                    <time>{a.hm}</time>
                    <div className="cal-who"><span><b>{a.c.name}</b><small>{t("calOutside")}</small></span></div>
                  </li>
                ))}
              </ul>
            </>
          );
        })()}

        {loaded && mode === "week" && (() => {
          const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
          const open = hours.filter((h): h is [string, string] => !!h);
          if (!open.length) return <p className="cal-closed">{t("calClosed")}</p>;
          const first = Math.min(...open.map((h) => toMin(h[0])));
          const last = Math.max(...open.map((h) => toMin(h[1])));
          const times: string[] = [];
          for (let m = first; m + slot <= last; m += slot) times.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
          const perDay = days.map((d) => ({ d, ...dayRows(d), slots: slotsOf(hours, d, slot) }));
          return (
            <div className="cal-week-wrap">
              <table className="cal-week">
                <thead>
                  <tr>
                    <th aria-hidden="true" />
                    {perDay.map(({ d, total, busy: taken }) => (
                      <th key={d} className={d === now.date ? "is-today" : ""}>
                        <button type="button" onClick={() => { setAnchor(d); setMode("day"); }}>
                          {dayLabel(d, { weekday: "short" })} <b>{dayLabel(d, { day: "numeric" })}</b>
                          <small>{total ? `${taken}/${total}` : t("calClosedShort")}</small>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {times.map((hm) => (
                    <tr key={hm}>
                      <th scope="row">{hm}</th>
                      {perDay.map(({ d, rows, slots }) => {
                        if (!slots.includes(hm)) return <td key={d} className="is-closed" />;
                        const who = rows.find((r) => r.hm === hm)?.who ?? [];
                        if (who.length) return <td key={d} className="is-busy" title={who.map((w) => `${w.hm} ${w.c.name}`).join(", ")}><span>{who[0].c.name}{who.length > 1 ? ` +${who.length - 1}` : ""}</span></td>;
                        if (past(d, hm)) return <td key={d} className="is-past" />;
                        return <td key={d} className="is-free"><button type="button" aria-label={`${t("calBook")} ${dayLabel(d, { weekday: "long", day: "numeric", month: "numeric" })} ${hm}`} onClick={() => setBooking({ date: d, hm, busy: dayRows(d).busyRanges })}>+</button></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {loaded && mode === "month" && (
          <div className="cal-month">
            {Array.from({ length: 7 }, (_, i) => <span key={i} className="cal-wd" aria-hidden="true">{dayLabel(addDays("2026-11-22", i), { weekday: "short" })}</span>)}
            {monthGrid(anchor.slice(0, 7)).flat().map((d) => {
              const { total, busy: taken } = dayRows(d);
              const other = d.slice(0, 7) !== anchor.slice(0, 7);
              const full = total > 0 && taken >= total;
              return (
                <button key={d} type="button" className={"cal-mday" + (other ? " is-other" : "") + (d === now.date ? " is-today" : "") + (!total ? " is-closed" : full ? " is-full" : "")}
                  onClick={() => { setAnchor(d); setMode("day"); }} aria-label={`${dayLabel(d, { weekday: "long", day: "numeric", month: "long" })}: ${total ? t("calDayCount", { busy: taken, free: total - taken }) : t("calClosed")}`}>
                  <b>{dayLabel(d, { day: "numeric" })}</b>
                  {total > 0 && <small>{taken}/{total}</small>}
                  {total > 0 && <i aria-hidden="true"><em style={{ width: `${(taken / total) * 100}%` }} /></i>}
                </button>
              );
            })}
          </div>
        )}
        <p className="cal-legend" aria-hidden="true"><span className="is-busy">{t("calBusy")}</span><span className="is-free">{t("calFree")}</span><span className="is-closed">{t("calClosedShort")}</span></p>
      </section>

      {booking && <BookSlot slot={booking} services={services} fits={(min) => freeStarts(hours, booking.date, 5, min, booking.busy).includes(booking.hm)} defaultMin={slot} t={t} call={call} busy={busy} dayLabel={dayLabel}
        onClose={() => setBooking(null)} onDone={(name, cardUrl) => {
          // "יום א׳, 22.11 בשעה 11:00": the word between keeps the date and the time in order in Hebrew and Arabic.
          const when = t("calWhen", { day: dayLabel(booking.date, { weekday: "short", day: "numeric", month: "numeric" }), time: booking.hm });
          setBooking(null);
          if (cardUrl) onNewCard(cardUrl, name, when); else notify(t("calBooked", { name, when }));
          refresh();
        }} />}

      {/* The settings: the owner (and Perkly) only. */}
      {owner && (
        <>
          <ServicesEditor services={services} t={t} busy={busy} call={call} reload={reload} notify={notify} />
          <HoursEditor hours={hours} slot={slot} t={t} busy={busy} call={call} reload={reload} notify={notify} />
          <ExtraEditor business={business} t={t} busy={busy} call={call} reload={reload} notify={notify} />
        </>
      )}
    </div>
  );
}

/** "2026-11" + n months, keeping the day within the month. */
function shiftMonth(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 10);
}

/** Booking a free slot: find the customer, and the appointment is set (with the usual reminders). */
function BookSlot({ slot, services, fits, defaultMin, t, call, busy, dayLabel, onClose, onDone }: {
  slot: { date: string; hm: string }; services: Service[]; fits: (min: number) => boolean; defaultMin: number;
  t: T; call: Call; busy: boolean; dayLabel: (d: string, o: Intl.DateTimeFormatOptions) => string;
  onClose: () => void; onDone: (name: string, cardUrl?: string) => void;
}) {
  // A new customer: name and phone, registered and booked in one go.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [svc, setSvc] = useState<Service | null>(services.find((s) => fits(s.min)) ?? null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const search = async () => {
    if (q.trim().length < 2) return;
    const r = await call({ action: "lookup", query: q.trim() });
    setFound(r ? (r.results as Found[]) : []);
  };
  const book = async (c: Found, cardUrl?: string) => {
    const r = await call({ action: "appt_set", customer: c.id, requestId: crypto.randomUUID(), date: slot.date, time: slot.hm, ...(svc ? { service: svc.id } : { minutes: defaultMin }) });
    if (r) onDone(c.name, cardUrl);
  };
  const registerAndBook = async () => {
    const r = await call({ action: "register_customer", name: newName.trim(), phone: newPhone.trim() });
    if (r?.id) await book({ id: r.id, name: newName.trim() }, r.cardUrl);
  };
  return (
    <div className="modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal cal-book-modal" role="dialog" aria-modal="true" aria-labelledby="cal-book-title">
        <button type="button" className="close" aria-label={t("close")} onClick={onClose}><X size={20} /></button>
        <span className="modal-icon" aria-hidden="true"><Clock size={22} /></span>
        <h2 id="cal-book-title">{t("calBookTitle")}</h2>
        <p className="cal-book-when"><b>{dayLabel(slot.date, { weekday: "long", day: "numeric", month: "long" })}</b> · <bdi>{slot.hm}–{endOf(slot.hm, svc?.min ?? defaultMin)}</bdi></p>
        {services.length > 0 && (
          <div className="svc-chips" role="group" aria-label={t("svcPick")}>
            {services.map((s) => {
              const ok = fits(s.min);
              return (
                <button key={s.id} type="button" className="svc-chip" aria-pressed={svc?.id === s.id} disabled={!ok} title={ok ? undefined : t("svcNoFit")} onClick={() => setSvc(s)}>
                  {s.name}<small>{minutesLabel(s.min, t)}</small>
                </button>
              );
            })}
          </div>
        )}
        {adding ? (
          <form className="cal-new" onSubmit={(e) => { e.preventDefault(); registerAndBook(); }}>
            <label>{t("name")}<input value={newName} required maxLength={80} autoFocus autoComplete="off" onChange={(e) => setNewName(e.target.value)} /></label>
            <label>{t("phone")}<input value={newPhone} type="tel" required maxLength={20} dir="ltr" placeholder={t("phoneHint")} autoComplete="off" onChange={(e) => setNewPhone(e.target.value)} /></label>
            <p className="form-hint">{t("privacy")}</p>
            <div className="form-actions">
              <button className="btn primary" disabled={busy || !newName.trim() || newPhone.trim().length < 9}>{t("calNewAndBook")}</button>
              <button type="button" className="btn soft" onClick={() => setAdding(false)}>{t("calExisting")}</button>
            </div>
          </form>
        ) : (<>
        <form className="cal-book-search" role="search" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <label className="search"><Search size={17} />
            <input autoFocus value={q} placeholder={t("sxSearchPh")} aria-label={t("sxSearchPh")} enterKeyHint="search" onChange={(e) => { setQ(e.target.value); setFound(null); }} />
          </label>
          <button className="btn primary" disabled={busy || q.trim().length < 2}>{t("sxSearch")}</button>
        </form>
        {found && (
          found.length ? (
            <div className="cal-found" role="list">
              {found.map((c) => (
                <button key={c.id} type="button" role="listitem" className="customer-result" disabled={busy} onClick={() => book(c)}>
                  <span><strong>{c.name}</strong>{c.phone && <small dir="ltr">{c.phone}</small>}</span>
                  <span>{c.apptAt ? t("calHasAppt") : t("calBook")}</span>
                </button>
              ))}
            </div>
          ) : <p className="form-hint">{t("noCustomer")}</p>
        )}
        <button type="button" className="btn soft cal-new-btn" onClick={() => { setAdding(true); if (q.trim() && !/\d{3}/.test(q)) setNewName(q.trim()); else if (/\d{3}/.test(q)) setNewPhone(q.trim()); }}>+ {t("newCustomer")}</button>
        <p className="form-hint">{t("calBookHint")}</p>
        </>)}
      </section>
    </div>
  );
}

/** "45 דק׳", "1:30 ש׳". */
export function minutesLabel(min: number, t: T): string {
  return min < 60 ? t("svcMin", { n: min }) : t("svcHours", { h: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}` });
}

/** The clinic's services: a name and how long it takes. Booking picks one, and the calendar blocks that long. */
function ServicesEditor({ services, t, busy, call, reload, notify }: {
  services: Service[]; t: T; busy: boolean; call: Call; reload: () => void; notify: (s: string, bad?: boolean) => void;
}) {
  const [rows, setRows] = useState<{ id?: string; name: string; min: number }[]>(services.length ? services : [{ name: "", min: 30 }]);
  const set = (i: number, v: Partial<{ name: string; min: number }>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...v } : r)));
  const filled = rows.filter((r) => r.name.trim());
  return (
    <details className="panel cal-settings" open={services.length ? undefined : true}>
      <summary><h2><Clock size={18} /> {t("svcTitle")}</h2></summary>
      <p className="form-hint">{t("svcHint")}</p>
      <div className="svc-rows">
        {rows.map((r, i) => (
          <div key={i} className="svc-row">
            <input value={r.name} maxLength={60} placeholder={t("svcNamePh")} aria-label={t("svcName")} onChange={(e) => set(i, { name: e.target.value })} />
            <select value={r.min} aria-label={t("svcLength")} onChange={(e) => set(i, { min: Number(e.target.value) })}>
              {[10, 15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240].map((m) => <option key={m} value={m}>{minutesLabel(m, t)}</option>)}
            </select>
            <button type="button" className="icon-btn" aria-label={t("svcRemove")} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X size={16} /></button>
          </div>
        ))}
      </div>
      <div className="row-actions">
        <button type="button" className="btn soft small" disabled={rows.length >= 30} onClick={() => setRows([...rows, { name: "", min: rows.at(-1)?.min ?? 30 }])}>+ {t("svcAdd")}</button>
        <button type="button" className="btn primary" disabled={busy} onClick={async () => {
          if (await call({ action: "set_services", services: filled.map((r) => ({ id: r.id, name: r.name.trim(), min: r.min })) })) { notify(t("saved")); reload(); }
        }}>{t("save")}</button>
      </div>
    </details>
  );
}

/** Working days and hours, and the slot length. */
function HoursEditor({ hours, slot, t, busy, call, reload, notify }: {
  hours: WorkHours; slot: number; t: T; busy: boolean; call: Call; reload: () => void; notify: (s: string, bad?: boolean) => void;
}) {
  const [draft, setDraft] = useState<WorkHours>(hours);
  const [len, setLen] = useState(slot);
  const bad = draft.some((d) => d && d[0] >= d[1]);
  const set = (i: number, v: [string, string] | null) => setDraft(draft.map((d, j) => (j === i ? v : d)));
  return (
    <details className="panel cal-settings">
      <summary><h2><Clock size={18} /> {t("calHoursTitle")}</h2></summary>
      <div className="cal-hours">
        {draft.map((d, i) => (
          <div key={i} className="cal-hours-row">
            <label className="check-row"><input type="checkbox" checked={!!d} onChange={(e) => set(i, e.target.checked ? (hours[i] ?? ["09:00", "18:00"]) : null)} /><span>{weekdayName(i, t)}</span></label>
            {d ? (
              <span className="cal-hours-times">
                <input type="time" step={300} value={d[0]} aria-label={`${weekdayName(i, t)} ${t("calFrom")}`} onChange={(e) => set(i, [e.target.value, d[1]])} />
                <span aria-hidden="true">–</span>
                <input type="time" step={300} value={d[1]} aria-label={`${weekdayName(i, t)} ${t("calTo")}`} onChange={(e) => set(i, [d[0], e.target.value])} />
              </span>
            ) : <span className="muted">{t("calClosedShort")}</span>}
          </div>
        ))}
        <label className="cal-slot">{t("calSlot")}
          <select value={len} onChange={(e) => setLen(Number(e.target.value))}>
            {SLOT_CHOICES.map((m) => <option key={m} value={m}>{t("calMinutes", { n: m })}</option>)}
          </select>
        </label>
        {bad && <p className="form-error" role="alert">{t("calHoursBad")}</p>}
        <button type="button" className="btn primary" disabled={busy || bad} onClick={async () => {
          if (await call({ action: "set_work_hours", hours: draft, slot: len })) { notify(t("saved")); reload(); }
        }}>{t("save")}</button>
      </div>
    </details>
  );
}

function weekdayName(i: number, t: T): string {
  return t("wd_" + i);
}

/** What the appointments card adds besides the next appointment (the owner's choice). */
function ExtraEditor({ business, t, busy, call, reload, notify }: {
  business: CalendarBusiness; t: T; busy: boolean; call: Call; reload: () => void; notify: (s: string, bad?: boolean) => void;
}) {
  const [kind, setKind] = useState(business.appt_extra ?? "none");
  const [reward, setReward] = useState(kind === "stamps" || kind === "points" ? business.reward : "");
  const [target, setTarget] = useState(kind === "stamps" || kind === "points" ? business.target : 10);
  const [points, setPoints] = useState(business.appt_points ?? 10);
  const [pct, setPct] = useState((business.cashback_bp ?? 500) / 100);
  const [minUse, setMinUse] = useState((business.cashback_min ?? 0) / 100);
  const options = [["none", "extraNone"], ["stamps", "extraStamps"], ["points", "extraPoints"], ["cashback", "extraCashback"]] as const;
  const save = async () => {
    const body: Record<string, unknown> = { action: "set_appt_extra", extra: kind };
    if (kind === "stamps" || kind === "points") Object.assign(body, { reward: reward.trim(), target });
    if (kind === "points") body.points = points;
    if (kind === "cashback") Object.assign(body, { cashbackBp: Math.round(pct * 100), cashbackMin: Math.round(minUse * 100) });
    if (await call(body)) { notify(t("extraSaved")); reload(); }
  };
  return (
    <details className="panel cal-settings" open={kind === "none" ? undefined : true}>
      <summary><h2><Gift size={18} /> {t("extraTitle")}</h2></summary>
      <p className="form-hint">{t("extraHint")}</p>
      <fieldset className="sp-mode extra-kinds">
        <legend className="sr-only">{t("extraTitle")}</legend>
        {options.map(([k, label]) => (
          <label key={k} className="sp-radio"><input type="radio" name="appt-extra" checked={kind === k} onChange={() => setKind(k)} /><span>{t(label)}</span></label>
        ))}
      </fieldset>
      {(kind === "stamps" || kind === "points") && (
        <div className="extra-fields">
          <label>{t("extraReward")}<input value={reward} maxLength={160} placeholder={t("extraRewardPh")} onChange={(e) => setReward(e.target.value)} /></label>
          {kind === "points" && <label>{t("extraPerVisit")}<input type="number" min={1} max={1000} value={points} onChange={(e) => setPoints(Number(e.target.value))} /></label>}
          <label>{kind === "stamps" ? t("extraVisitsGoal") : t("extraPointsGoal")}<input type="number" min={2} max={kind === "stamps" ? 30 : 100000} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
          <p className="form-hint">{kind === "stamps" ? t("extraStampsHow", { n: target, reward: reward || "…" }) : t("extraPointsHow", { p: points, n: target, reward: reward || "…" })}</p>
        </div>
      )}
      {kind === "cashback" && (
        <div className="extra-fields">
          <label>{t("extraPct")}<input type="number" inputMode="decimal" min={0.1} max={50} step={0.1} dir="ltr" value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
          <label>{t("extraMin")}<input type="number" inputMode="decimal" min={0} step={1} dir="ltr" value={minUse} onChange={(e) => setMinUse(Number(e.target.value))} /></label>
          <p className="form-hint">{t("extraCashbackHow", { pct })}</p>
        </div>
      )}
      <button type="button" className="btn primary" disabled={busy || ((kind === "stamps" || kind === "points") && !reward.trim())} onClick={save}>{t("save")}</button>
    </details>
  );
}
