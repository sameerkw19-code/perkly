"use client";

// The vet's pet file, as a medical record: a header with the animal's details (species, breed, sex, neutered/spayed,
// age, weight, colour and markings, microchip, regular doctor), and tabs: overview (next appointment and what's due),
// vaccines (a vaccination table: date given, valid until, batch/Lot, by which doctor), periodic treatments, medical
// history (dated visit notes) and weight. Also the clinic's list of what is due soon. Owners and staff both work here.

import { createContext, useContext, useEffect, useState } from "react";
import { ArrowRight, CalendarClock, Check, ClipboardList, Copy, FileText, PawPrint, Pencil, Plus, Printer, Scale, Stethoscope, Syringe, Trash2, X } from "lucide-react";
import { post } from "../lib/api";
import { errorText } from "../lib/i18n";
import type { SiteLang } from "../lib/i18n-types";
import { formatAppt } from "../lib/appointment";
import { shortDate } from "../lib/programs";
import { ageText, APPT_KINDS, CARE_PRESETS, chipText, daysTo, kgText, kindName, SPECIES, SPECIES_ICON, speciesName, type CareKind } from "../lib/vet";

type T = (key: string, vars?: Record<string, string | number>) => string;
type Care = { id: string; pet: string; kind: CareKind; name: string; last: string | null; months: number | null; next: string | null };
type Dose = { id: string; care: string; date: string; name: string; kind: string; note: string | null; staff: string | null; lot: string | null; valid_until: string | null };
type Note = { id: string; date: string; reason: string | null; text: string; staff: string | null; shared: number };
type Pet = {
  id: string; name: string; species: string; breed: string | null; birth: string | null; sex: string | null; grams: number | null; weighed: string | null;
  appt_at: string | null; appt_kind: string | null; appt_note: string | null; vet: string | null; appt_staff: string | null;
  color: string | null; chip: string | null; neutered: number | null;
  care: Care[]; weights: { grams: number; date: string }[]; log: Dose[]; notes: Note[];
};
type Doctor = { id: string; name: string; license?: string | null };
type Clinic = { address: string; phone: string };

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
          <div className="vet-tabs" role="tablist" aria-label={t("pets")}>
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
              <PetRecord key={pet.id} pet={pet} today={today} t={t} lang={lang} api={api} onEdit={() => setEditing("edit")} notify={notify} printUrl={key ? `/p/${key}/print?pet=${pet.id}` : null} />
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
  const [color, setColor] = useState(pet?.color ?? "");
  const [birth, setBirth] = useState(pet?.birth && pet.birth.length === 10 ? pet.birth : pet?.birth ? `${pet.birth}-01` : "");
  const [sex, setSex] = useState(pet?.sex ?? "");
  const [neutered, setNeutered] = useState(pet?.neutered === 1 ? "yes" : pet?.neutered === 0 ? "no" : "");
  const [chip, setChip] = useState(pet?.chip ?? "");
  const { doctors, me } = useContext(Docs);
  const [vet, setVet] = useState(pet ? pet.vet ?? "" : me);
  const [sure, setSure] = useState(false);
  return (
    <form className="vet-form vet-petform" onSubmit={async (e) => {
      e.preventDefault();
      await onSave({ name, species, breed, color, birth: birth || null, sex: sex || null, neutered: neutered === "yes" ? true : neutered === "no" ? false : null, chip: chip || null, vet: vet || null });
    }}>
      <h3 className="vet-form-title">{pet ? t("vet_editPet") : t("vet_addPet")}</h3>
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
        <label>{t("vet_color")}<input value={color} maxLength={60} placeholder={t("vet_colorPh")} onChange={(e) => setColor(e.target.value)} /></label>
      </div>
      <div className="admin-new-row">
        <label>{t("vet_birth")}<input type="date" value={birth} max={todayIL()} onChange={(e) => setBirth(e.target.value)} /></label>
        <label>{t("vet_sex")}<select value={sex} onChange={(e) => setSex(e.target.value)}><option value="">—</option><option value="m">{t("vet_male")}</option><option value="f">{t("vet_female")}</option></select></label>
        <label>{t("vet_neutered")}<select value={neutered} onChange={(e) => setNeutered(e.target.value)}><option value="">—</option><option value="yes">{t("vet_yes")}</option><option value="no">{t("vet_no")}</option></select></label>
      </div>
      <label>{t("vet_chip")}<input value={chip} dir="ltr" inputMode="numeric" maxLength={24} placeholder="985 112 000 000 000" onChange={(e) => setChip(e.target.value)} /></label>
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
type Notify = (s: string, bad?: boolean) => void;
type Tab = "overview" | "vaccines" | "treatments" | "history" | "weight";

/** One animal's record: the header, then the tabs. */
function PetRecord({ pet, today, t, lang, api, onEdit, notify, printUrl }: {
  pet: Pet; today: string; t: T; lang: string; api: Api; onEdit: () => void; notify: Notify; printUrl: string | null;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const { me, name: docName } = useContext(Docs);
  const age = ageText(pet.birth, today, lang);
  const late = pet.care.filter((c) => c.next && c.next < today).length;
  const tabs: [Tab, string, number?][] = [
    ["overview", t("vet_tabOverview")],
    ["vaccines", t("vet_vaccines"), pet.care.filter((c) => c.kind === "vaccine").length],
    ["treatments", t("vet_treatments"), pet.care.filter((c) => c.kind === "treatment").length],
    ["history", t("vet_medical"), pet.notes.length],
    ["weight", t("vet_weight")],
  ];
  return (
    <div className="vet-pet">
      <header className="vet-record-head">
        <span className="vet-icon lg" aria-hidden="true">{SPECIES_ICON[pet.species as keyof typeof SPECIES_ICON] ?? "🐾"}</span>
        <div className="vet-record-id">
          <h3>{pet.name}</h3>
          <div className="vet-tags">
            <span className="vet-tag">{speciesName(pet.species, lang)}</span>
            {pet.breed && <span className="vet-tag">{pet.breed}</span>}
            {pet.sex && <span className="vet-tag">{pet.sex === "m" ? t("vet_male") : t("vet_female")}</span>}
            {pet.neutered === 1 && <span className="vet-tag ok">{pet.sex === "f" ? t("vet_spayed") : t("vet_neuteredShort")}</span>}
            {age && <span className="vet-tag">{age}</span>}
            {pet.grams ? <span className="vet-tag">{kgText(pet.grams, lang)}</span> : null}
            {late > 0 && <span className="vet-tag late">{t("vet_lateCount", { n: late })}</span>}
          </div>
          <dl className="vet-ids">
            {pet.chip && <div><dt>{t("vet_chip")}</dt><dd dir="ltr">{chipText(pet.chip)}</dd></div>}
            {pet.color && <div><dt>{t("vet_color")}</dt><dd>{pet.color}</dd></div>}
            {pet.birth && <div><dt>{t("vet_birth")}</dt><dd>{shortDate(pet.birth.length === 7 ? `${pet.birth}-01` : pet.birth)}</dd></div>}
            {docName(pet.vet) && <div><dt>{t("vet_regularDoctor")}</dt><dd>{docName(pet.vet)}</dd></div>}
          </dl>
        </div>
        <div className="vet-record-actions">
          <button className="btn soft small" onClick={onEdit}><Pencil size={14} />{t("vet_editPet")}</button>
          {printUrl && <a className="btn soft small" href={printUrl} target="_blank" rel="noreferrer"><Printer size={14} />{t("vet_certificate")}</a>}
        </div>
      </header>

      <div className="vet-rtabs" role="tablist" aria-label={pet.name}>
        {tabs.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={"vet-rtab" + (tab === k ? " is-on" : "")} onClick={() => setTab(k)}>
            {label}{n ? <span className="count">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview pet={pet} today={today} t={t} lang={lang} api={api} notify={notify} onTab={setTab} />}
      {tab === "vaccines" && <CareTab kind="vaccine" pet={pet} today={today} t={t} lang={lang} api={api} notify={notify} me={me} />}
      {tab === "treatments" && <CareTab kind="treatment" pet={pet} today={today} t={t} lang={lang} api={api} notify={notify} me={me} />}
      {tab === "history" && <HistoryTab pet={pet} today={today} t={t} api={api} notify={notify} me={me} />}
      {tab === "weight" && <WeightTab pet={pet} today={today} t={t} lang={lang} api={api} notify={notify} />}
    </div>
  );
}

function Overview({ pet, today, t, lang, api, notify, onTab }: { pet: Pet; today: string; t: T; lang: string; api: Api; notify: Notify; onTab: (t: Tab) => void }) {
  const [appt, setAppt] = useState(false);
  const { name: docName } = useContext(Docs);
  const due = pet.care.filter((c) => c.next).sort((a, b) => a.next!.localeCompare(b.next!)).slice(0, 4);
  const lastNote = pet.notes[0];
  return (
    <div className="vet-overview">
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
      <div className="vet-box">
        <h3><Syringe size={16} aria-hidden="true" /> {t("vet_dueNext")}</h3>
        {!due.length ? <p className="muted">{t("vet_none")}</p> : (
          <ul className="vet-due">
            {due.map((c) => {
              const badge = dueBadge(c.next, today, t);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => onTab(c.kind === "vaccine" ? "vaccines" : "treatments")}>
                    <span><b>{c.name}</b><small>{kindName(c.kind, lang)}</small></span>
                    {badge && <span className={"vet-badge is-" + badge.tone}>{shortDate(c.next!, today)} · {badge.text}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {lastNote && (
        <div className="vet-box">
          <h3><ClipboardList size={16} aria-hidden="true" /> {t("vet_lastVisit")}</h3>
          <p className="vet-note-head"><b>{shortDate(lastNote.date, today)}</b>{lastNote.reason ? <span>{lastNote.reason}</span> : null}{docName(lastNote.staff) ? <span className="muted">{docName(lastNote.staff)}</span> : null}</p>
          <p className="vet-note-text">{lastNote.text}</p>
        </div>
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

/** Vaccines or treatments: what's on the schedule (with "record a dose"), and the table of every dose given. */
function CareTab({ kind, pet, today, t, lang, api, notify, me }: { kind: CareKind; pet: Pet; today: string; t: T; lang: string; api: Api; notify: Notify; me: string }) {
  const items = pet.care.filter((c) => c.kind === kind);
  const doses = pet.log.filter((l) => l.kind === kind);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [giving, setGiving] = useState<string | null>(null);
  const { name: docName, doctors } = useContext(Docs);
  const license = (id: string | null) => doctors.find((d) => d.id === id)?.license;
  return (
    <div className="vet-care-tab">
      <div className="vet-box">
        <h3><Syringe size={16} aria-hidden="true" /> {kind === "vaccine" ? t("vet_schedule") : t("vet_treatSchedule")}</h3>
        {!items.length && !adding && <p className="muted">{t("vet_none")}</p>}
        <ul className="vet-care">
          {items.map((c) => {
            const badge = dueBadge(c.next, today, t);
            if (edit === c.id) {
              return (
                <li key={c.id}><CareForm kind={kind} care={c} t={t} lang={lang} onCancel={() => setEdit(null)}
                  onRemove={async () => { if (await api("care_remove", { id: c.id })) setEdit(null); }}
                  onSave={async (v) => { if (await api("care_save", { pet: pet.id, id: c.id, kind, ...v })) { setEdit(null); notify(t("saved")); } }} /></li>
              );
            }
            return (
              <li key={c.id} className={badge ? "is-" + badge.tone : ""}>
                <div className="vet-care-row">
                  <div>
                    <b>{c.name}</b>
                    <small>{c.last ? t("vet_lastGiven", { d: shortDate(c.last, today) }) : t("vet_neverGiven")}{c.months ? ` · ${t("vet_everyMonths", { n: c.months })}` : ""}</small>
                    {c.next && <small>{t("vet_nextDue", { d: shortDate(c.next, today) })} {badge && <span className={"vet-badge is-" + badge.tone}>{badge.text}</span>}</small>}
                  </div>
                  <div className="bkd-row">
                    <button className="btn primary small" aria-expanded={giving === c.id} onClick={() => setGiving(giving === c.id ? null : c.id)}><Check size={14} />{t("vet_recordDose")}</button>
                    <button className="icon-btn" aria-label={t("vet_editCare")} onClick={() => setEdit(c.id)}><Pencil size={14} /></button>
                  </div>
                </div>
                {giving === c.id && (
                  <DoseForm care={c} t={t} me={me} kind={kind} onCancel={() => setGiving(null)}
                    onSave={async (v) => { if (await api("care_done", { id: c.id, ...v })) { setGiving(null); notify(t("vet_doneToday", { name: c.name })); } }} />
                )}
              </li>
            );
          })}
        </ul>
        {adding
          ? <CareForm kind={kind} t={t} lang={lang} onCancel={() => setAdding(false)} onSave={async (v) => { if (await api("care_save", { pet: pet.id, kind, staff: me || null, ...v })) { setAdding(false); notify(t("saved")); } }} />
          : <button className="btn soft small" onClick={() => setAdding(true)}><Plus size={14} />{kind === "vaccine" ? t("vet_addVaccine") : t("vet_addTreatment")}</button>}
      </div>
      <div className="vet-box">
        <h3><FileText size={16} aria-hidden="true" /> {kind === "vaccine" ? t("vet_vaccineRecord") : t("vet_treatRecord")}</h3>
        {!doses.length ? <p className="muted">{t("vet_none")}</p> : (
          <div className="vet-table-wrap">
            <table className="vet-table stack">
              <thead><tr><th>{kind === "vaccine" ? t("vet_vaccineName") : t("vet_treatmentName")}</th><th>{t("vet_dateGiven")}</th><th>{t("vet_validUntil")}</th>{kind === "vaccine" && <th>{t("vet_lot")}</th>}<th>{t("vet_givenBy")}</th></tr></thead>
              <tbody>
                {doses.map((d) => (
                  <tr key={d.id}>
                    <td><b>{d.name}</b>{d.note ? <small>{d.note}</small> : null}</td>
                    <td data-label={t("vet_dateGiven")}>{shortDate(d.date)}</td>
                    <td data-label={t("vet_validUntil")}>{d.valid_until ? shortDate(d.valid_until) : "—"}</td>
                    {kind === "vaccine" && <td dir="ltr" data-label={t("vet_lot")}>{d.lot ?? "—"}</td>}
                    <td data-label={t("vet_givenBy")}>{docName(d.staff) || "—"}{license(d.staff) ? <small>{t("vet_licenseShort", { n: license(d.staff)! })}</small> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Recording a dose: the date, its batch (Lot) number, until when it's valid, by which doctor, and a note. */
function DoseForm({ care, kind, t, me, onSave, onCancel }: { care: Care; kind: CareKind; t: T; me: string; onSave: (v: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const [date, setDate] = useState(todayIL);
  const [lot, setLot] = useState("");
  const [valid, setValid] = useState("");
  const [note, setNote] = useState("");
  const { doctors } = useContext(Docs);
  const [staff, setStaff] = useState(me);
  return (
    <form className="vet-form vet-dose" onSubmit={async (e) => { e.preventDefault(); await onSave({ date, lot: lot || null, validUntil: valid || null, note, staff: staff || null }); }}>
      <div className="admin-new-row">
        <label>{t("vet_dateGiven")}<input type="date" required max={todayIL()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {kind === "vaccine" && <label>{t("vet_lot")}<input value={lot} dir="ltr" maxLength={30} placeholder="A123B45" onChange={(e) => setLot(e.target.value)} /></label>}
        <label>{t("vet_validUntil")}<input type="date" value={valid} min={date} onChange={(e) => setValid(e.target.value)} /></label>
      </div>
      <p className="form-hint">{care.months ? t("vet_validAuto", { n: care.months }) : t("vet_validManual")}</p>
      {doctors.length > 0 && (
        <fieldset className="anf-set">
          <legend>{t("vet_givenBy")}</legend>
          <DoctorPick value={staff} onPick={setStaff} any={t("vet_noDoctor")} />
        </fieldset>
      )}
      <label>{t("vet_apptNote")}<input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="bkd-row"><button className="btn primary small"><Check size={14} />{t("save")}</button><button type="button" className="btn soft small" onClick={onCancel}>{t("cancel")}</button></div>
    </form>
  );
}

function CareForm({ kind, care, t, lang, onSave, onCancel, onRemove }: {
  kind: CareKind; care?: Care; t: T; lang: string; onSave: (v: Record<string, unknown>) => Promise<void>; onCancel: () => void; onRemove?: () => Promise<void>;
}) {
  const l = lang === "ar" ? "ar" : lang === "en" ? "en" : "he";
  const [name, setName] = useState(care?.name ?? "");
  const [last, setLast] = useState(care?.last ?? "");
  const [lot, setLot] = useState("");
  const [months, setMonths] = useState(care?.months ? String(care.months) : kind === "vaccine" ? "12" : "3");
  const [manual, setManual] = useState(care && care.next && (!care.last || !care.months) ? care.next : "");
  return (
    <form className="vet-form" onSubmit={async (e) => { e.preventDefault(); await onSave({ name, last: last || null, months: months ? Number(months) : null, next: manual || null, ...(care ? {} : { lot: lot || null }) }); }}>
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
        {!care && kind === "vaccine" && last && <label>{t("vet_lot")}<input value={lot} dir="ltr" maxLength={30} onChange={(e) => setLot(e.target.value)} /></label>}
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

/** The medical history: dated visit notes (why, what was found and done, by whom), newest first. */
function HistoryTab({ pet, today, t, api, notify, me }: { pet: Pet; today: string; t: T; api: Api; notify: Notify; me: string }) {
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const { name: docName } = useContext(Docs);
  return (
    <div className="vet-box">
      <h3><ClipboardList size={16} aria-hidden="true" /> {t("vet_medical")}</h3>
      {adding
        ? <NoteForm t={t} me={me} onCancel={() => setAdding(false)} onSave={async (v) => { if (await api("note_save", { pet: pet.id, ...v })) { setAdding(false); notify(t("saved")); } }} />
        : <button className="btn primary small" onClick={() => setAdding(true)}><Plus size={14} />{t("vet_addNote")}</button>}
      {!pet.notes.length && !adding && <p className="muted">{t("vet_noNotes")}</p>}
      <ol className="vet-notes">
        {pet.notes.map((n) => edit === n.id ? (
          <li key={n.id}><NoteForm note={n} t={t} me={me} onCancel={() => setEdit(null)}
            onRemove={async () => { if (await api("note_remove", { id: n.id })) setEdit(null); }}
            onSave={async (v) => { if (await api("note_save", { pet: pet.id, id: n.id, ...v })) { setEdit(null); notify(t("saved")); } }} /></li>
        ) : (
          <li key={n.id}>
            <div className="vet-note-head">
              <b>{shortDate(n.date, today)}</b>
              {n.reason && <span>{n.reason}</span>}
              {docName(n.staff) && <span className="muted"><Stethoscope size={12} aria-hidden="true" /> {docName(n.staff)}</span>}
              {!n.shared && <span className="vet-tag">{t("vet_clinicOnly")}</span>}
              <button className="icon-btn" aria-label={t("vet_editNote")} onClick={() => setEdit(n.id)}><Pencil size={13} /></button>
            </div>
            <p className="vet-note-text">{n.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NoteForm({ note, t, me, onSave, onCancel, onRemove }: { note?: Note; t: T; me: string; onSave: (v: Record<string, unknown>) => Promise<void>; onCancel: () => void; onRemove?: () => Promise<void> }) {
  const [date, setDate] = useState(note?.date ?? todayIL());
  const [reason, setReason] = useState(note?.reason ?? "");
  const [text, setText] = useState(note?.text ?? "");
  const [shared, setShared] = useState(note ? !!note.shared : true);
  const { doctors } = useContext(Docs);
  const [staff, setStaff] = useState(note?.staff ?? me);
  return (
    <form className="vet-form vet-noteform" onSubmit={async (e) => { e.preventDefault(); await onSave({ date, reason, text, shared, staff: staff || null }); }}>
      <div className="admin-new-row">
        <label>{t("vet_noteDate")}<input type="date" required max={todayIL()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>{t("vet_reason")}<input value={reason} maxLength={120} placeholder={t("vet_reasonPh")} onChange={(e) => setReason(e.target.value)} /></label>
      </div>
      <label>{t("vet_noteText")}<textarea value={text} required maxLength={2000} rows={5} placeholder={t("vet_noteTextPh")} onChange={(e) => setText(e.target.value)} /></label>
      {doctors.length > 0 && (
        <fieldset className="anf-set">
          <legend>{t("vet_doctor")}</legend>
          <DoctorPick value={staff} onPick={setStaff} any={t("vet_noDoctor")} />
        </fieldset>
      )}
      <label className="check"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> <span>{t("vet_shareNote")}</span></label>
      <div className="bkd-row">
        <button className="btn primary small">{t("save")}</button>
        <button type="button" className="btn soft small" onClick={onCancel}>{t("cancel")}</button>
        {onRemove && <button type="button" className="btn danger small" onClick={onRemove}><Trash2 size={14} />{t("bkd_remove")}</button>}
      </div>
    </form>
  );
}

function WeightTab({ pet, today, t, lang, api, notify }: { pet: Pet; today: string; t: T; lang: string; api: Api; notify: Notify }) {
  const [kg, setKg] = useState("");
  const prev = pet.weights[1];
  const max = Math.max(...pet.weights.map((w) => w.grams), 1);
  return (
    <div className="vet-box">
      <h3><Scale size={16} aria-hidden="true" /> {t("vet_weight")}</h3>
      <p className="vet-big">{pet.grams ? kgText(pet.grams, lang) : "—"}{pet.weighed && <small> · {shortDate(pet.weighed, today)}</small>}
        {prev && pet.grams ? <small className={pet.grams >= prev.grams ? "vet-up" : "vet-down"}> {pet.grams >= prev.grams ? "▲" : "▼"} {kgText(Math.abs(pet.grams - prev.grams), lang)}</small> : null}</p>
      <form className="vet-inline" onSubmit={async (e) => { e.preventDefault(); if (await api("weight", { pet: pet.id, kg })) { setKg(""); notify(t("saved")); } }}>
        <input inputMode="decimal" dir="ltr" placeholder={t("vet_kg")} value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.,]/g, ""))} aria-label={t("vet_kg")} />
        <button className="btn soft small" disabled={!kg}><Plus size={14} />{t("vet_addWeight")}</button>
      </form>
      {pet.weights.length > 0 && (
        <ul className="vet-wbars">
          {pet.weights.map((w, i) => (
            <li key={i}><span>{shortDate(w.date, today)}</span><i style={{ width: `${Math.max(6, Math.round((w.grams / max) * 100))}%` }} aria-hidden="true" /><b>{kgText(w.grams, lang)}</b></li>
          ))}
        </ul>
      )}
    </div>
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
  const [data, setData] = useState<{ today: string; care: DueCare[]; appts: DueAppt[]; doctors: Doctor[]; clinic: Clinic } | null>(null);
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
          {owner && <button className="btn soft small" aria-expanded={manage} onClick={() => setManage(!manage)}><Stethoscope size={15} />{t("vet_doctorsAndClinic")}</button>}
        </div>
      )}
      {manage && owner && <DoctorsPanel businessId={businessId} doctors={data.doctors} clinic={data.clinic ?? { address: "", phone: "" }} t={t} lang={lang} notify={notify} onChange={(d) => setData({ ...data, doctors: d })} />}
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

/** The owner's list of doctors (with their licence numbers) and the clinic's details, for the vaccination certificate. */
function DoctorsPanel({ businessId, doctors, clinic, t, lang, notify, onChange }: {
  businessId: string; doctors: Doctor[]; clinic: Clinic; t: T; lang: string; notify: (s: string, bad?: boolean) => void; onChange: (d: Doctor[]) => void;
}) {
  const [name, setName] = useState("");
  const [license, setLicense] = useState("");
  const [address, setAddress] = useState(clinic.address);
  const [phone, setPhone] = useState(clinic.phone);
  const api = async (action: string, body: Record<string, unknown>) => {
    const r = await post("/api/vet", { business: businessId, action, ...body });
    if (!r.ok) { notify(errorText(lang as SiteLang, r.code), true); return false; }
    if (r.data?.doctors) onChange(r.data.doctors);
    return true;
  };
  return (
    <section className="panel vet-form">
      <h2><Stethoscope size={18} aria-hidden="true" /> {t("vet_doctors")}</h2>
      <p className="form-hint">{t("vet_doctorsHint")}</p>
      <ul className="vet-docs">
        {doctors.map((d) => <DoctorRow key={d.id} d={d} t={t} api={api} />)}
      </ul>
      <form className="vet-docs-add" onSubmit={async (e) => { e.preventDefault(); if (await api("doctor_save", { name, license })) { setName(""); setLicense(""); notify(t("saved")); } }}>
        <input value={name} required maxLength={60} placeholder={t("vet_doctorName")} aria-label={t("vet_doctorName")} onChange={(e) => setName(e.target.value)} />
        <input value={license} maxLength={30} dir="ltr" placeholder={t("vet_license")} aria-label={t("vet_license")} onChange={(e) => setLicense(e.target.value)} />
        <button className="btn primary small"><Plus size={14} />{t("vet_addDoctor")}</button>
      </form>
      <h2 className="vet-clinic-title">{t("vet_clinicDetails")}</h2>
      <p className="form-hint">{t("vet_clinicHint")}</p>
      <form className="vet-docs-add" onSubmit={async (e) => { e.preventDefault(); if (await api("clinic_save", { address, phone })) notify(t("saved")); }}>
        <input value={address} maxLength={160} placeholder={t("vet_clinicAddress")} aria-label={t("vet_clinicAddress")} onChange={(e) => setAddress(e.target.value)} />
        <input value={phone} maxLength={30} dir="ltr" placeholder={t("vet_clinicPhone")} aria-label={t("vet_clinicPhone")} onChange={(e) => setPhone(e.target.value)} />
        <button className="btn soft small">{t("save")}</button>
      </form>
    </section>
  );
}

function DoctorRow({ d, t, api }: { d: Doctor; t: T; api: (action: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [name, setName] = useState(d.name);
  const [license, setLicense] = useState(d.license ?? "");
  const changed = name.trim() && (name !== d.name || license !== (d.license ?? ""));
  return (
    <li>
      <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={t("vet_doctorName")} />
      <input value={license} maxLength={30} dir="ltr" placeholder={t("vet_license")} onChange={(e) => setLicense(e.target.value)} aria-label={t("vet_license")} />
      {changed && <button className="btn soft small" onClick={() => api("doctor_save", { id: d.id, name, license })}>{t("save")}</button>}
      <button className="icon-btn" aria-label={t("bkd_remove")} onClick={() => api("doctor_remove", { id: d.id })}><Trash2 size={15} /></button>
    </li>
  );
}
