"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { translate } from "../../../../lib/i18n";
import type { Lang } from "../../../../lib/i18n-types";
import { formatPhone } from "../../../../lib/phone";
import { shortDate } from "../../../../lib/programs";
import { ageText, chipText, kgText, speciesName } from "../../../../lib/vet";
import type { Booklet } from "../load";
import PrintButton from "./print-button";

/** The vaccination certificate, one A4 page per animal (`only`: one animal). */
export default function Certificate({ data, only }: { data: Booklet | null; only: string | null }) {
  const lang = (data?.lang ?? "he") as Lang;
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const dir = lang === "en" ? "ltr" : "rtl";
  if (!data) return <div className="center-page" dir={dir}><div className="panel"><h1>{t("vet_bookletGone")}</h1></div></div>;
  const pets = only && data.pets.some((p) => p.id === only) ? data.pets.filter((p) => p.id === only) : data.pets;
  const doc = (id: string | null) => (id ? data.doctors[id] ?? null : null);
  const yes = (v: number | null) => (v === 1 ? t("vet_yes") : v === 0 ? t("vet_no") : "—");

  return (
    <div className="cert-page" dir={dir} lang={lang}>
      <div className="cert-bar no-print">
        <a className="btn soft" href={`/p/${data.key}`}>{dir === "rtl" ? <ArrowRight size={16} aria-hidden="true" /> : <ArrowLeft size={16} aria-hidden="true" />}{t("vet_back")}</a>
        <PrintButton label={t("vet_printBtn")} />
      </div>
      {!pets.length && <p className="panel muted">{t("vet_none")}</p>}
      {pets.map((p) => {
        const vaccines = p.log.filter((l) => l.kind === "vaccine");
        const treatments = p.log.filter((l) => l.kind === "treatment");
        const regular = doc(p.vet) ?? doc(vaccines[0]?.staff ?? null);
        const age = ageText(p.birth, data.today, lang);
        return (
          <article key={p.id} className="cert">
            <header className="cert-head">
              <div className="cert-clinic">
                {data.logo && <img src={data.logo} alt="" />}
                <div>
                  <h1>{data.title}</h1>
                  {data.clinic.address && <p>{data.clinic.address}</p>}
                  {data.clinic.phone && <p dir="ltr">{data.clinic.phone}</p>}
                </div>
              </div>
              <div className="cert-title">
                <h2>{t("vet_certificate")}</h2>
                <p>{t("vet_issued", { d: shortDate(data.today) })}</p>
              </div>
            </header>

            <div className="cert-boxes">
              <section className="cert-box">
                <h3>{t("vet_owner")}</h3>
                <dl>
                  <div><dt>{t("vet_ownerName")}</dt><dd>{data.owner.name || "—"}</dd></div>
                  <div><dt>{t("vet_phone")}</dt><dd dir="ltr">{data.owner.phone ? formatPhone(data.owner.phone) : "—"}</dd></div>
                </dl>
              </section>
              <section className="cert-box wide">
                <h3>{t("vet_patient")}</h3>
                <dl className="cols">
                  <div><dt>{t("vet_petName")}</dt><dd><b>{p.name}</b></dd></div>
                  <div><dt>{t("vet_species")}</dt><dd>{speciesName(p.species, lang)}</dd></div>
                  <div><dt>{t("vet_breed")}</dt><dd>{p.breed || "—"}</dd></div>
                  <div><dt>{t("vet_sex")}</dt><dd>{p.sex === "m" ? t("vet_male") : p.sex === "f" ? t("vet_female") : "—"}</dd></div>
                  <div><dt>{t("vet_neutered")}</dt><dd>{yes(p.neutered)}</dd></div>
                  <div><dt>{t("vet_birth")}</dt><dd>{p.birth ? shortDate(p.birth.length === 7 ? `${p.birth}-01` : p.birth) : "—"}{age ? ` (${age})` : ""}</dd></div>
                  <div><dt>{t("vet_color")}</dt><dd>{p.color || "—"}</dd></div>
                  <div><dt>{t("vet_weight")}</dt><dd>{p.grams ? kgText(p.grams, lang) : "—"}</dd></div>
                  <div className="span"><dt>{t("vet_chip")}</dt><dd dir="ltr" className="mono">{p.chip ? chipText(p.chip) : "—"}</dd></div>
                </dl>
              </section>
            </div>

            <section className="cert-section">
              <h3>{t("vet_vaccineRecord")}</h3>
              <table className="cert-table">
                <thead><tr><th>{t("vet_vaccineName")}</th><th>{t("vet_dateGiven")}</th><th>{t("vet_validUntil")}</th><th>{t("vet_lot")}</th><th>{t("vet_givenBy")}</th></tr></thead>
                <tbody>
                  {vaccines.map((l) => {
                    const d = doc(l.staff);
                    return (
                      <tr key={l.id}>
                        <td><b>{l.name}</b></td><td>{shortDate(l.date)}</td><td>{l.valid_until ? shortDate(l.valid_until) : "—"}</td>
                        <td dir="ltr" className="mono">{l.lot ?? ""}</td>
                        <td>{d ? <>{d.name}{d.license ? <small>{t("vet_licenseShort", { n: d.license })}</small> : null}</> : ""}</td>
                      </tr>
                    );
                  })}
                  {/* Empty rows to write in by hand (at least a few). */}
                  {Array.from({ length: Math.max(0, 4 - vaccines.length) }, (_, i) => <tr key={"e" + i} className="blank"><td /><td /><td /><td /><td /></tr>)}
                </tbody>
              </table>
            </section>

            {treatments.length > 0 && (
              <section className="cert-section">
                <h3>{t("vet_treatRecord")}</h3>
                <table className="cert-table">
                  <thead><tr><th>{t("vet_treatmentName")}</th><th>{t("vet_dateGiven")}</th><th>{t("vet_validUntil")}</th><th>{t("vet_givenBy")}</th></tr></thead>
                  <tbody>
                    {treatments.slice(0, 12).map((l) => (
                      <tr key={l.id}><td><b>{l.name}</b></td><td>{shortDate(l.date)}</td><td>{l.valid_until ? shortDate(l.valid_until) : "—"}</td><td>{doc(l.staff)?.name ?? ""}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {p.notes.length > 0 && (
              <section className="cert-section">
                <h3>{t("vet_medical")}</h3>
                <table className="cert-table notes">
                  <thead><tr><th>{t("vet_date")}</th><th>{t("vet_reason")}</th><th>{t("vet_noteText")}</th></tr></thead>
                  <tbody>
                    {p.notes.slice(0, 8).map((n) => <tr key={n.id}><td>{shortDate(n.date)}</td><td>{n.reason ?? ""}</td><td className="text">{n.text}</td></tr>)}
                  </tbody>
                </table>
              </section>
            )}

            {p.weights.length > 0 && (
              <section className="cert-section">
                <h3>{t("vet_weightHistory")}</h3>
                <p className="cert-weights">{p.weights.slice(0, 8).map((w, i) => <span key={i}><b>{kgText(w.grams, lang)}</b> {shortDate(w.date)}</span>)}</p>
              </section>
            )}

            <section className="cert-sign">
              <p>{t("vet_certify")}</p>
              <div className="cert-lines">
                <div><span>{regular?.name ?? ""}</span><small>{t("vet_vetName")}</small></div>
                <div><span dir="ltr">{regular?.license ?? ""}</span><small>{t("vet_license")}</small></div>
                <div><span /><small>{t("vet_signature")}</small></div>
                <div><span /><small>{t("vet_date")}</small></div>
              </div>
            </section>
            <footer className="cert-foot">{data.title}{data.clinic.phone ? ` · ${data.clinic.phone}` : ""} · perkly.shop</footer>
          </article>
        );
      })}
    </div>
  );
}
