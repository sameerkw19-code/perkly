"use client";

// The vet's pet file: a client's animals (species, breed, birth date and age, weight with its history), vaccines and
// periodic treatments (given when, every how many months, due when; "given today"), and each animal's next appointment
// and what it is for. Also the clinic's list of what is due soon. Owners and staff both work here.

import { createContext, useContext, useEffect, useState } from "react";
import { ArrowRight, CalendarClock, Check, Copy, PawPrint, Pencil, Plus, Scale, Stethoscope, Syringe, Trash2, X } from "lucide-react";
import { post } from "../lib/api";
import { errorText } from "../lib/i18n";
import type { SiteLang } from "../lib/i18n-types";
import { formatAppt } from "../lib/appointment";
import { shortDate } from "../lib/programs";
import { ageText, APPT_KINDS, CARE_PRESETS, daysTo, kgText, kindName, SPECIES, SPECIES_ICON, speciesName, type CareKind } from "../lib/vet";

type T = (key: string, vars?: Record<string, string | number>) => string;
type Care = { id: string; pet: string; kind: CareKind; name: string; last: string | null; months: number | null; next: string | null };
type Pet = {
  id: string; name: string; species: string; breed: string | null; birth: string | null; sex: string | null; grams: number | null; weighed: string | null;
  appt_at: string | null; appt_kind: string | null; appt_note: string | null; vet: string | null; appt_staff: string | null;
  care: Care[]; weights: { grams: number; date: string }[]; log: { id: string; date: string; name: string; kind: string; note: string | null; staff: string | null }[];
};
type Doctor = { id: string; name: string };

// The clinic's doctors, and the one working on this screen (remembered on this device): who gives a vaccine, the default
// for a new appointment.
const Docs = createContext<{ doctors: Doctor[]; me: string; name: (id: string | null | undefined) => string }>({ doctors: [], me: "", name: () => "" });
const meKey = (business: string) => `perkly-vet-doctor:${business}`;
function savedMe(business: string): string {
  try { return localStorage.getItem(meKey(business)) ?? ""; } catch { return ""; }
}

/** The doctor picker: chips when there are a few doctors. */
function DoctorPick({ value, onPick, any }: { value: string; onPick: (id: string) => void; any?: string }) {
  const { doctors } = useContext(Docs);
  if (!doctors.length) return null;
  return (
    <div className="anf-chips" role="radiogroup">
      {any !== undefined && <button type="button" role="radio" aria-checked={value === ""} className={"anf-chip" + (value === "" ? " is-on" : "")} onClick={() => onPick("")}>{any}</button>}
      {doctors.map((d) => (
        <button key={d.id} type="button" role="radio" aria-checked={value === d.id} className={"anf-chip" + (value === d.id ? " is-on" : "")} onClick={() => onPick(d.id)}>
          <Stethoscope size={14} aria-hidden="true" />{d.name}
        </button>
      ))}
    </div>
  );
}

function todayIL(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** An appointment not yet over (up to an hour after it started). */
function upcoming(at: string | null): boolean {
  return !!at && Date.parse(at) > Date.now() - 3_600_000;
}

/** "באיחור 3 ימים" / "היום" / "בעוד 5 ימים" style label and its tone. */
function dueBadge(next: string | null, today: string, t: T): { text: string; tone: "late" | "soon" | "ok" } | null {
  if (!next) return null;
  const d = daysTo(next, today);
  if (d < 0) return { text: t("vet_late", { n: -d }), tone: "late" };
  if (d === 0) return { text: t("vet_today"), tone: "soon" };
  return { text: t("vet_inDays", { n: d }), tone: d <= 14 ? "soon" : "ok" };
}

export function VetFile({ businessId, customer, t, lang, notify, onClose }: {
  businessId: string; customer: { id: string; name: string }; t: T; lang: string; notify: (s: string, bad?: boolean) => void; onClose?: () => void;
}) {
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [sel, setSel] = useState<string>("");
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [today] = useState(todayIL);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [me, setMeState] = useState(() => savedMe(businessId));
  const setMe = (id: string) => { setMeState(id); try { localStorage.setItem(meKey(businessId), id); } catch {} };
  const api = async (action: string, body: Record<string, unknown>) => {
    const r = await post("/api/vet", { business: businessId, action, ...body });
    if (!r.ok) { notify(errorText(lang as SiteLang, r.code), true); return null; }
    if (r.data?.pets) { setPets(r.data.pets); setKey(r.data.key ?? null); }
    if (r.data?.doctors) setDoctors(r.data.doctors);
    return r.data;
  };
  const docs = { doctors, me: doctors.some((d) => d.id === me) ? me : "", name: (id: string | null | undefined) => doctors.find((d) => d.id === id)?.name ?? "" };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load when the client changes
  useEffect(() => { setPets(null); api("pets", { customer: customer.id }); }, [customer.id]);
  const pet = pets?.find((p) => p.id === sel) ?? pets?.[0];
  const link = key ? `${typeof location === "undefined" ? "" : location.origin}/p/${key}` : "";

  return (
    <Docs.Provider value={docs}>
    <section className="vet" aria-label={t("vet_file")}>
      <div className="vet-head">
        <h2><PawPrint size={18} aria-hidden="true" /> {t("vet_file")} · {customer.name}</h2>
        {onClose && <button className="icon-btn" aria-label={t("close")} onClick={onClose}><X size={18} /></button>}
      </div>
      {doctors.length > 1 && (
        <div className="vet-me">
          <span>{t("vet_meDoctor")}</span>
          <DoctorPick value={docs.me} onPick={setMe} />
        </div>
      )}
      {pets === null ? <p className="muted">…</p> : (
        <>
          <div className="vet-tabs" role="tablist">
            {pets.map((p) => (
              <button key={p.id} role="tab" aria-selected={pet?.id === p.id && editing !== "new"} className={"vet-tab" + (pet?.id === p.id && editing !== "new" ? " is-on" : "")} onClick={() => { setSel(p.id); setEditing(null); }}>
                <span aria-hidden="true">{SPECIES_ICON[p.species as keyof typeof SPECIES_ICON] ?? "🐾"}</span>{p.name}
              </button>
            ))}
            <button className={"vet-tab add" + (editing === "new" ? " is-on" : "")} onClick={() => setEditing("new")}><Plus size={15} />{t("vet_addPet")}</button>
          </div>
          {editing === "new" || !pets.length ? (
            <PetForm t={t} lang={lang} onCancel={pets.length ? () => setEditing(null) : undefined}
              onSave={async (v) => { const r = await api("pet_save", { customer: customer.id, ...v }); if (r) { setSel(r.pets.at(-1)?.id ?? ""); setEditing(null); notify(t("saved")); } }} />
          ) : pet ? (
            editing === "edit" ? (
              <PetForm t={t} lang={lang} pet={pet} onCancel={() => setEditing(null)}
                onRemove={async () => { if (await api("pet_remove", { id: pet.id })) { setSel(""); setEditing(null); } }}
                onSave={async (v) => { if (await api("pet_save", { customer: customer.id, id: pet.id, ...v })) { setEditing(null); notify(t("saved")); } }} />
            ) : (
              <PetView pet={pet} today={today} t={t} lang={lang} api={api} onEdit={() => setEditing("edit")} notify={notify} />
            )
          ) : null}
          {link && (
            <div className="vet-link">
              <span>{t("vet_booklet")}</span>
              <button className="btn soft small" onClick={async () => { try { await navigator.clipboard.writeText(link); notify(t("bkd_copied")); } catch { notify(link); } }}><Copy size={14} />{t("vet_copyLink")}</button>
            </div>
          )}
        </>
      )}
    </section>
    </Docs.Provider>
  );
}

function PetForm({ pet, t, lang, onSave, onCancel, onRemove }: {
  pet?: Pet; t: T; lang: string; onSave: (v: Record<string, unknown>) => Promise<void>; onCancel?: () => void; onRemove?: () => Promise<void>;
}) {
  const [name, setName] = useState(pet?.name ?? "");
  const [species, setSpecies] = useState(pet?.species ?? "dog");
  const [breed, setBreed] = useState(pet?.breed ?? "");
  const [birth, setBirth] = useState(pet?.birth && pet.birth.length === 10 ? pet.birth : pet?.birth ? `${pet.birth}-01` : "");
  const [sex, setSex] = useState(pet?.sex ?? "");
  const { doctors, me } = useContext(Docs);
  const [vet, setVet] = useState(pet ? pet.vet ?? "" : me);
  const [sure, setSure] = useState(false);
  return (
    <form className="vet-form" onSubmit={async (e) => { e.preventDefault(); await onSave({ name, species, breed, birth: birth || null, sex: sex || null, vet: vet || null }); }}>
      <label>{t("vet_petName")}<input value={name} required maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
      <fieldset className="anf-set">
        <legend>{t("vet_species")}</legend>
        <div className="anf-chips">
          {SPECIES.map((s) => (
            <label key={s} className={"anf-chip" + (species === s ? " is-on" : "")}>
              <input type="radio" name="species" className="sr-only" checked={species === s} onChange={() => setSpecies(s)} />
              <span aria-hidden="true">{SPECIES_ICON[s]}</span>{speciesName(s, lang)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="admin-new-row">
        <label>{t("vet_breed")}<input value={breed} maxLength={60} onChange={(e) => setBreed(e.target.value)} /></label>
        <label>{t("vet_birth")}<input type="date" value={birth} max={todayIL()} onChange={(e) => setBirth(e.target.value)} /></label>
        <label>{t("vet_sex")}<select value={sex} onChange={(e) => setSex(e.target.value)}><option value="">—</option><option value="m">{t("vet_male")}</option><option value="f">{t("vet_female")}</option></select></label>
      </div>
      {doctors.length > 0 && (
        <fieldset className="anf-set">
          <legend>{t("vet_regularDoctor")}</legend>
          <DoctorPick value={vet} onPick={setVet} any={t("vet_noDoctor")} />
        </fieldset>
      )}
      <div className="bkd-row">
        <button className="btn primary small">{t("save")}</button>
        {onCancel && <button type="button" className="btn soft small" onClick={onCancel}>{t("cancel")}</button>}
        {onRemove && (sure
          ? <button type="button" className="btn danger small" onClick={onRemove}>{t("vet_removeSure")}</button>
          : <button type="button" className="btn danger small" onClick={() => setSure(true)}><Trash2 size={14} />{t("vet_removePet")}</button>)}
      </div>
    </form>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each action answers with its own shape
type Api = (action: string, body: Record<string, unknown>) => Promise<any>;

function PetView({ pet, today, t, lang, api, onEdit, notify }: { pet: Pet; today: string; t: T; lang: string; api: Api; onEdit: () => void; notify: (s: string, bad?: boolean) => void }) {
  const [kg, setKg] = useState("");
  const [appt, setAppt] = useState(false);
  const { me, name: docName } = useContext(Docs);
  const age = ageText(pet.birth, today, lang);
  const prev = pet.weights[1];
  return (
    <div className="vet-pet">
      <div className="vet-facts">
        <span className="vet-icon" aria-hidden="true">{SPECIES_ICON[pet.species as keyof typeof SPECIES_ICON] ?? "🐾"}</span>
        <div>
          <b>{pet.name}</b>
          <small>{[speciesName(pet.species, lang), pet.breed, pet.sex === "m" ? t("vet_male") : pet.sex === "f" ? t("vet_female") : null, age].filter(Boolean).join(" · ")}</small>
          {pet.birth && <small>{t("vet_born", { d: shortDate(pet.birth.length === 7 ? `${pet.birth}-01` : pet.birth) })}</small>}
          {docName(pet.vet) && <small><Stethoscope size={12} aria-hidden="true" /> {t("vet_regularDoctor")}: {docName(pet.vet)}</small>}
        </div>
        <button className="icon-btn" aria-label={t("vet_editPet")} onClick={onEdit}><Pencil size={15} /></button>
      </div>

      <div className="vet-box">
        <h3><Scale size={16} aria-hidden="true" /> {t("vet_weight")}</h3>
        <p className="vet-big">{pet.grams ? kgText(pet.grams, lang) : "—"}{pet.weighed && <small> · {shortDate(pet.weighed, today)}</small>}
          {prev && pet.grams && <small className={pet.grams >= prev.grams ? "vet-up" : "vet-down"}> {pet.grams >= prev.grams ? "▲" : "▼"} {kgText(Math.abs(pet.grams - prev.grams), lang)}</small>}</p>
        <form className="vet-inline" onSubmit={async (e) => { e.preventDefault(); if (await api("weight", { pet: pet.id, kg })) { setKg(""); notify(t("saved")); } }}>
          <input inputMode="decimal" dir="ltr" placeholder={t("vet_kg")} value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.,]/g, ""))} aria-label={t("vet_kg")} />
          <button className="btn soft small" disabled={!kg}><Plus size={14} />{t("vet_addWeight")}</button>
        </form>
        {pet.weights.length > 1 && (
          <ul className="vet-weights">{pet.weights.slice(0, 6).map((w, i) => <li key={i}><span>{shortDate(w.date, today)}</span><b>{kgText(w.grams, lang)}</b></li>)}</ul>
        )}
      </div>

      <div className="vet-box">
        <h3><CalendarClock size={16} aria-hidden="true" /> {t("vet_nextAppt")}</h3>
        {upcoming(pet.appt_at) ? (
          <>
            <p className="vet-big"><bdi>{formatAppt(pet.appt_at!, lang)}</bdi> <span className={"vet-kind is-" + pet.appt_kind}>{kindName(pet.appt_kind ?? "visit", lang)}</span></p>
            {docName(pet.appt_staff) && <p className="vet-doc"><Stethoscope size={14} aria-hidden="true" /> {t("bk_with", { name: docName(pet.appt_staff) })}</p>}
            {pet.appt_note && <p className="muted">{pet.appt_note}</p>}
            {!appt && <div className="bkd-row">
              <button className="btn soft small" onClick={() => setAppt(true)}>{t("bk_change")}</button>
              <button className="btn soft small" onClick={() => api("appt_clear", { pet: pet.id })}><X size={14} />{t("vet_clearAppt")}</button>
            </div>}
          </>
        ) : !appt && <button className="btn soft small" onClick={() => setAppt(true)}><Plus size={14} />{t("vet_setAppt")}</button>}
        {appt && <ApptForm pet={pet} t={t} lang={lang} onCancel={() => setAppt(false)} onSave={async (v) => { if (await api("appt_set", { pet: pet.id, ...v })) { setAppt(false); notify(t("bkd_booked")); } }} />}
      </div>

      {(["vaccine", "treatment"] as const).map((kind) => (
        <CareList key={kind} kind={kind} pet={pet} today={today} t={t} lang={lang} api={api} notify={notify} me={me} />
      ))}

      {pet.log.length > 0 && (
        <details className="vet-box">
          <summary><h3>{t("vet_history")}</h3></summary>
          <ul className="vet-log">{pet.log.map((l) => <li key={l.id}><span>{shortDate(l.date)}</span><b>{l.name}</b><small>{kindName(l.kind, lang)}{docName(l.staff) ? ` · ${docName(l.staff)}` : ""}{l.note ? ` · ${l.note}` : ""}</small></li>)}</ul>
        </details>
      )}
    </div>
  );
}

function ApptForm({ pet, t, lang, onSave, onCancel }: { pet: Pet; t: T; lang: string; onSave: (v: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [kind, setKind] = useState(pet.appt_kind ?? "visit");
  const [note, setNote] = useState("");
  const { doctors, me } = useContext(Docs);
  // The appointment's doctor: as before, else the animal's regular doctor, else the one on this screen.
  const [staff, setStaff] = useState(pet.appt_staff ?? pet.vet ?? me);
  return (
    <form className="vet-form" onSubmit={async (e) => { e.preventDefault(); await onSave({ date, time, kind, note, staff: staff || null }); }}>
      <div className="anf-chips" role="radiogroup" aria-label={t("vet_apptKind")}>
        {APPT_KINDS.map((k) => (
          <label key={k} className={"anf-chip" + (kind === k ? " is-on" : "")}>
            <input type="radio" name="apptKind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />{kindName(k, lang)}
          </label>
        ))}
      </div>
      <div className="admin-new-row">
        <label>{t("bk_day")}<input type="date" required min={todayIL()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>{t("bkd_time")}<input type="time" required step={300} value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      {doctors.length > 0 && (
        <fieldset className="anf-set">
          <legend>{t("vet_doctor")}</legend>
          <DoctorPick value={staff} onPick={setStaff} any={t("vet_noDoctor")} />
        </fieldset>
      )}
      <label>{t("vet_apptNote")}<input value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="bkd-row"><button className="btn primary small">{t("save")}</button><button type="button" className="btn soft small" onClick={onCancel}>{t("cancel")}</button></div>
    </form>
  );
}

function CareList({ kind, pet, today, t, lang, api, notify, me }: { kind: CareKind; pet: Pet; today: string; t: T; lang: string; api: Api; notify: (s: string, bad?: boolean) => void; me: string }) {
  const items = pet.care.filter((c) => c.kind === kind);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <div className="vet-box">
      <h3><Syringe size={16} aria-hidden="true" /> {kind === "vaccine" ? t("vet_vaccines") : t("vet_treatments")}</h3>
      {!items.length && !adding && <p className="muted">{t("vet_none")}</p>}
      <ul className="vet-care">
        {items.map((c) => {
          const badge = dueBadge(c.next, today, t);
          return edit === c.id ? (
            <li key={c.id}><CareForm kind={kind} care={c} t={t} lang={lang} onCancel={() => setEdit(null)}
              onRemove={async () => { if (await api("care_remove", { id: c.id })) setEdit(null); }}
              onSave={async (v) => { if (await api("care_save", { pet: pet.id, id: c.id, kind, ...v })) { setEdit(null); notify(t("saved")); } }} /></li>
          ) : (
            <li key={c.id} className={badge ? "is-" + badge.tone : ""}>
              <div>
                <b>{c.name}</b>
                <small>{c.last ? t("vet_lastGiven", { d: shortDate(c.last, today) }) : t("vet_neverGiven")}{c.months ? ` · ${t("vet_everyMonths", { n: c.months })}` : ""}</small>
                {c.next && <small>{t("vet_nextDue", { d: shortDate(c.next, today) })} {badge && <span className={"vet-badge is-" + badge.tone}>{badge.text}</span>}</small>}
              </div>
              <div className="bkd-row">
                <button className="btn primary small" onClick={async () => { if (await api("care_done", { id: c.id, staff: me || null })) notify(t("vet_doneToday", { name: c.name })); }}><Check size={14} />{t("vet_giveToday")}</button>
                <button className="icon-btn" aria-label={t("vet_editPet")} onClick={() => setEdit(c.id)}><Pencil size={14} /></button>
              </div>
            </li>
          );
        })}
      </ul>
      {adding
        ? <CareForm kind={kind} t={t} lang={lang} onCancel={() => setAdding(false)} onSave={async (v) => { if (await api("care_save", { pet: pet.id, kind, staff: me || null, ...v })) { setAdding(false); notify(t("saved")); } }} />
        : <button className="btn soft small" onClick={() => setAdding(true)}><Plus size={14} />{kind === "vaccine" ? t("vet_addVaccine") : t("vet_addTreatment")}</button>}
    </div>
  );
}

function CareForm({ kind, care, t, lang, onSave, onCancel, onRemove }: {
  kind: CareKind; care?: Care; t: T; lang: string; onSave: (v: Record<string, unknown>) => Promise<void>; onCancel: () => void; onRemove?: () => Promise<void>;
}) {
  const l = lang === "ar" ? "ar" : lang === "en" ? "en" : "he";
  const [name, setName] = useState(care?.name ?? "");
  const [last, setLast] = useState(care?.last ?? "");
  const [months, setMonths] = useState(care?.months ? String(care.months) : kind === "vaccine" ? "12" : "3");
  const [manual, setManual] = useState(care && care.next && (!care.last || !care.months) ? care.next : "");
  return (
    <form className="vet-form" onSubmit={async (e) => { e.preventDefault(); await onSave({ name, last: last || null, months: months ? Number(months) : null, next: manual || null }); }}>
      {!care && (
        <div className="anf-chips">
          {CARE_PRESETS[kind].map((p) => (
            <button key={p.en} type="button" className={"anf-chip" + (name === p[l] ? " is-on" : "")} onClick={() => { setName(p[l]); setMonths(String(p.months)); }}>{p[l]}</button>
          ))}
        </div>
      )}
      <label>{kind === "vaccine" ? t("vet_vaccineName") : t("vet_treatmentName")}<input value={name} required maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <div className="admin-new-row">
        <label>{t("vet_lastDate")}<input type="date" max={todayIL()} value={last} onChange={(e) => setLast(e.target.value)} /></label>
        <label>{t("vet_months")}<input type="number" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} /></label>
        <label>{t("vet_manualNext")}<input type="date" value={manual} onChange={(e) => setManual(e.target.value)} /></label>
      </div>
      <p className="form-hint">{t("vet_careHint")}</p>
      <div className="bkd-row">
        <button className="btn primary small">{t("save")}</button>
        <button type="button" className="btn soft small" onClick={onCancel}>{t("cancel")}</button>
        {onRemove && <button type="button" className="btn danger small" onClick={onRemove}><Trash2 size={14} />{t("bkd_remove")}</button>}
      </div>
    </form>
  );
}

type DueCare = { id: string; kind: string; name: string; next: string; pet: string; pet_name: string; species: string; vet: string | null; customer: string; owner: string; phone: string };
type DueAppt = { pet: string; pet_name: string; species: string; vet: string | null; appt_at: string; appt_kind: string; appt_note: string | null; appt_staff: string | null; customer: string; owner: string; phone: string };

/**
 * The clinic's list: what's overdue and due soon, and the animals' coming appointments, for everyone or one doctor
 * (appointments by their doctor, vaccines and treatments by the animal's regular doctor). A row opens the client's pet file.
 * The owner also keeps the list of doctors here.
 */
export function VetDesk({ businessId, owner, t, lang, notify }: { businessId: string; owner: boolean; t: T; lang: string; notify: (s: string, bad?: boolean) => void }) {
  const [data, setData] = useState<{ today: string; care: DueCare[]; appts: DueAppt[]; doctors: Doctor[] } | null>(null);
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const [who, setWho] = useState("");
  const [manage, setManage] = useState(false);
  const load = async () => {
    const r = await post("/api/vet", { business: businessId, action: "due", days: 30 });
    if (r.ok) setData(r.data); else notify(errorText(lang as SiteLang, r.code), true);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load once on open
  useEffect(() => { load(); }, []);
  if (open) {
    return (
      <div className="vet-desk">
        <button className="text-btn" onClick={() => { setOpen(null); load(); }}><ArrowRight size={16} className="sx-back" />{t("vet_backToList")}</button>
        <div className="panel"><VetFile businessId={businessId} customer={open} t={t} lang={lang} notify={notify} /></div>
      </div>
    );
  }
  if (!data) return <div className="empty compact">…</div>;
  const docName = (id: string | null | undefined) => data.doctors.find((d) => d.id === id)?.name ?? "";
  const care = who ? data.care.filter((c) => c.vet === who) : data.care;
  const appts = who ? data.appts.filter((a) => a.appt_staff === who) : data.appts;
  const late = care.filter((c) => c.next < data.today);
  const soon = care.filter((c) => c.next >= data.today);
  const row = (c: DueCare) => {
    const badge = dueBadge(c.next, data.today, t)!;
    return (
      <li key={c.id}>
        <button onClick={() => setOpen({ id: c.customer, name: c.owner })}>
          <span className="vet-icon sm" aria-hidden="true">{SPECIES_ICON[c.species as keyof typeof SPECIES_ICON] ?? "🐾"}</span>
          <span className="vet-row-text"><b>{c.pet_name} · {c.name}</b><small>{c.owner} <bdi dir="ltr">{c.phone}</bdi>{!who && docName(c.vet) ? ` · ${docName(c.vet)}` : ""}</small></span>
          <span className={"vet-badge is-" + badge.tone}>{shortDate(c.next, data.today)} · {badge.text}</span>
        </button>
      </li>
    );
  };
  return (
    <Docs.Provider value={{ doctors: data.doctors, me: "", name: docName }}>
    <div className="vet-desk">
      {(data.doctors.length > 1 || owner) && (
        <div className="vet-filter">
          {data.doctors.length > 1 && <DoctorPick value={who} onPick={setWho} any={t("vet_allDoctors")} />}
          {owner && <button className="btn soft small" onClick={() => setManage(!manage)}><Stethoscope size={15} />{t("vet_doctors")}</button>}
        </div>
      )}
      {manage && owner && <DoctorsPanel businessId={businessId} doctors={data.doctors} t={t} lang={lang} notify={notify} onChange={(d) => setData({ ...data, doctors: d })} />}
      <section className="panel">
        <h2><Syringe size={18} aria-hidden="true" /> {t("vet_dueTitle")}</h2>
        <p className="form-hint">{t("vet_dueHint")}</p>
        {!care.length && <p className="muted">{t("vet_dueNone")}</p>}
        {late.length > 0 && <><h3 className="vet-sub late">{t("vet_overdue")} ({late.length})</h3><ul className="vet-list">{late.map(row)}</ul></>}
        {soon.length > 0 && <><h3 className="vet-sub">{t("vet_soon")} ({soon.length})</h3><ul className="vet-list">{soon.map(row)}</ul></>}
      </section>
      <section className="panel">
        <h2><CalendarClock size={18} aria-hidden="true" /> {t("vet_apptsTitle")}</h2>
        {!appts.length && <p className="muted">{t("vet_apptsNone")}</p>}
        <ul className="vet-list">
          {appts.map((a) => (
            <li key={a.pet}>
              <button onClick={() => setOpen({ id: a.customer, name: a.owner })}>
                <span className="vet-icon sm" aria-hidden="true">{SPECIES_ICON[a.species as keyof typeof SPECIES_ICON] ?? "🐾"}</span>
                <span className="vet-row-text"><b>{a.pet_name} · {kindName(a.appt_kind, lang)}</b><small>{a.owner} <bdi dir="ltr">{a.phone}</bdi>{!who && docName(a.appt_staff) ? ` · ${docName(a.appt_staff)}` : ""}{a.appt_note ? ` · ${a.appt_note}` : ""}</small></span>
                <span className={"vet-kind is-" + a.appt_kind}><bdi>{formatAppt(a.appt_at, lang)}</bdi></span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
    </Docs.Provider>
  );
}

/** The owner's list of doctors: add, rename, remove (not while they have coming appointments). */
function DoctorsPanel({ businessId, doctors, t, lang, notify, onChange }: {
  businessId: string; doctors: Doctor[]; t: T; lang: string; notify: (s: string, bad?: boolean) => void; onChange: (d: Doctor[]) => void;
}) {
  const [name, setName] = useState("");
  const api = async (action: string, body: Record<string, unknown>) => {
    const r = await post("/api/vet", { business: businessId, action, ...body });
    if (!r.ok) { notify(errorText(lang as SiteLang, r.code), true); return false; }
    onChange(r.data.doctors);
    return true;
  };
  return (
    <section className="panel vet-form">
      <h2><Stethoscope size={18} aria-hidden="true" /> {t("vet_doctors")}</h2>
      <p className="form-hint">{t("vet_doctorsHint")}</p>
      <ul className="vet-docs">
        {doctors.map((d) => <DoctorRow key={d.id} d={d} t={t} api={api} />)}
      </ul>
      <form className="vet-inline" onSubmit={async (e) => { e.preventDefault(); if (await api("doctor_save", { name })) { setName(""); notify(t("saved")); } }}>
        <input value={name} required maxLength={60} placeholder={t("vet_doctorName")} aria-label={t("vet_doctorName")} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary small"><Plus size={14} />{t("vet_addDoctor")}</button>
      </form>
    </section>
  );
}

function DoctorRow({ d, t, api }: { d: Doctor; t: T; api: (action: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [name, setName] = useState(d.name);
  return (
    <li>
      <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={t("vet_doctorName")} />
      {name.trim() && name !== d.name && <button className="btn soft small" onClick={() => api("doctor_save", { id: d.id, name })}>{t("save")}</button>}
      <button className="icon-btn" aria-label={t("bkd_remove")} onClick={() => api("doctor_remove", { id: d.id })}><Trash2 size={15} /></button>
    </li>
  );
}
