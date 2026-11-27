"use client";

import { Printer } from "lucide-react";
import { translate } from "../../../lib/i18n";
import type { Lang } from "../../../lib/i18n-types";
import { formatAppt } from "../../../lib/appointment";
import { shortDate } from "../../../lib/programs";
import { ageText, chipText, daysTo, kgText, kindName, SPECIES_ICON, speciesName } from "../../../lib/vet";
import type { Booklet } from "./load";

/** The client's animals booklet: read-only, in the card's language, laid out like a pet health passport. */
export default function PetBooklet({ data }: { data: Booklet | null }) {
  const lang = (data?.lang ?? "he") as Lang;
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const dir = lang === "en" ? "ltr" : "rtl";
  if (!data) return <div className="center-page" dir={dir}><div className="panel"><h1>{t("vet_bookletGone")}</h1></div></div>;
  const doc = (id: string | null) => (id ? data.doctors[id] ?? null : null);
  return (
    <div className="auth-page bk-page" dir={dir} style={{ "--bk": data.bg, "--bk-fg": data.fg } as React.CSSProperties}>
      <main id="main" className="page-main bk-main">
        <div className="bk-head">
          {data.logo && <img className="pb-logo" src={data.logo} alt="" />}
          <div><small>{t("vet_booklet")}</small><h1>{data.title}</h1></div>
        </div>
        {!data.pets.length && <p className="panel muted">{t("vet_none")}</p>}
        {data.pets.map((p) => {
          const age = ageText(p.birth, data.today, lang);
          const vaccines = p.log.filter((l) => l.kind === "vaccine");
          const treatments = p.log.filter((l) => l.kind === "treatment");
          const due = p.care.filter((c) => c.next).sort((a, b) => a.next!.localeCompare(b.next!));
          const regular = doc(p.vet);
          const apptDoc = doc(p.appt_staff);
          return (
            <section key={p.id} className="panel pb-pet">
              <header className="pb-id">
                <span className="vet-icon lg" aria-hidden="true">{SPECIES_ICON[p.species as keyof typeof SPECIES_ICON] ?? "🐾"}</span>
                <div className="pb-id-text">
                  <h2>{p.name}</h2>
                  <div className="vet-tags">
                    <span className="vet-tag">{speciesName(p.species, lang)}</span>
                    {p.breed && <span className="vet-tag">{p.breed}</span>}
                    {p.sex && <span className="vet-tag">{p.sex === "m" ? t("vet_male") : t("vet_female")}</span>}
                    {p.neutered === 1 && <span className="vet-tag ok">{p.sex === "f" ? t("vet_spayed") : t("vet_neuteredShort")}</span>}
                    {age && <span className="vet-tag">{age}</span>}
                  </div>
                </div>
              </header>
              <dl className="vet-ids pb-ids">
                {p.chip && <div><dt>{t("vet_chip")}</dt><dd dir="ltr">{chipText(p.chip)}</dd></div>}
                {p.color && <div><dt>{t("vet_color")}</dt><dd>{p.color}</dd></div>}
                {p.birth && <div><dt>{t("vet_birth")}</dt><dd>{shortDate(p.birth.length === 7 ? `${p.birth}-01` : p.birth)}</dd></div>}
                {p.grams ? <div><dt>{t("vet_weight")}</dt><dd>{kgText(p.grams, lang)}{p.weighed ? ` · ${shortDate(p.weighed, data.today)}` : ""}</dd></div> : null}
                {regular && <div><dt>{t("vet_regularDoctor")}</dt><dd>{regular.name}</dd></div>}
              </dl>

              {p.appt_at && (
                <p className="vet-appt"><b>{t("vet_nextAppt")}:</b> <bdi>{formatAppt(p.appt_at!, lang)}</bdi> <span className={"vet-kind is-" + p.appt_kind}>{kindName(p.appt_kind ?? "visit", lang)}</span>{apptDoc ? <span>{t("bk_with", { name: apptDoc.name })}</span> : null}</p>
              )}

              {due.length > 0 && (
                <div className="pb-block">
                  <h3>{t("vet_dueNext")}</h3>
                  <ul className="vet-care read">
                    {due.map((c) => {
                      const d = daysTo(c.next!, data.today);
                      const tone = d < 0 ? "late" : d <= 14 ? "soon" : "ok";
                      return (
                        <li key={c.id} className={tone === "ok" ? "" : "is-" + tone}>
                          <div><b>{c.name}</b><small>{kindName(c.kind, lang)}{c.last ? ` · ${t("vet_lastGiven", { d: shortDate(c.last, data.today) })}` : ""}</small></div>
                          <span className={"vet-badge is-" + tone}>{t("vet_nextDue", { d: shortDate(c.next!, data.today) })}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {vaccines.length > 0 && (
                <div className="pb-block">
                  <h3>{t("vet_vaccineRecord")}</h3>
                  <div className="vet-table-wrap">
                    <table className="vet-table stack">
                      <thead><tr><th>{t("vet_vaccineName")}</th><th>{t("vet_dateGiven")}</th><th>{t("vet_validUntil")}</th><th>{t("vet_lot")}</th><th>{t("vet_givenBy")}</th></tr></thead>
                      <tbody>
                        {vaccines.map((l) => (
                          <tr key={l.id}>
                            <td><b>{l.name}</b></td>
                            <td data-label={t("vet_dateGiven")}>{shortDate(l.date)}</td>
                            <td data-label={t("vet_validUntil")}>{l.valid_until ? shortDate(l.valid_until) : "—"}</td>
                            <td dir="ltr" data-label={t("vet_lot")}>{l.lot ?? "—"}</td>
                            <td data-label={t("vet_givenBy")}>{doc(l.staff)?.name ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {treatments.length > 0 && (
                <div className="pb-block">
                  <h3>{t("vet_treatRecord")}</h3>
                  <div className="vet-table-wrap">
                    <table className="vet-table stack">
                      <thead><tr><th>{t("vet_treatmentName")}</th><th>{t("vet_dateGiven")}</th><th>{t("vet_validUntil")}</th><th>{t("vet_givenBy")}</th></tr></thead>
                      <tbody>
                        {treatments.map((l) => (
                          <tr key={l.id}><td><b>{l.name}</b></td><td data-label={t("vet_dateGiven")}>{shortDate(l.date)}</td><td data-label={t("vet_validUntil")}>{l.valid_until ? shortDate(l.valid_until) : "—"}</td><td data-label={t("vet_givenBy")}>{doc(l.staff)?.name ?? "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {p.notes.length > 0 && (
                <div className="pb-block">
                  <h3>{t("vet_medical")}</h3>
                  <ol className="vet-notes">
                    {p.notes.map((n) => (
                      <li key={n.id}>
                        <div className="vet-note-head"><b>{shortDate(n.date)}</b>{n.reason && <span>{n.reason}</span>}{doc(n.staff) && <span className="muted">{doc(n.staff)!.name}</span>}</div>
                        <p className="vet-note-text">{n.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {p.weights.length > 1 && (
                <div className="pb-block">
                  <h3>{t("vet_weightHistory")}</h3>
                  <ul className="vet-weights">{p.weights.map((w, i) => <li key={i}><b>{kgText(w.grams, lang)}</b><span>{shortDate(w.date)}</span></li>)}</ul>
                </div>
              )}

              <a className="btn soft small pb-cert" href={`/p/${data.key}/print?pet=${p.id}`}><Printer size={15} aria-hidden="true" />{t("vet_certificate")}</a>
            </section>
          );
        })}
        <p className="form-hint">{t("vet_bookletHint")}</p>
      </main>
    </div>
  );
}
