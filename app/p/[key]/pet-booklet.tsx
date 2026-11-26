"use client";
import { translate } from "../../../lib/i18n";
import type { Lang } from "../../../lib/i18n-types";
import { formatAppt } from "../../../lib/appointment";
import { shortDate } from "../../../lib/programs";
import { ageText, daysTo, kgText, kindName, SPECIES_ICON, speciesName } from "../../../lib/vet";

type Data = {
  title: string; lang: string; today: string; bg: string; fg: string;
  pets: {
    id: string; name: string; species: string; breed: string | null; birth: string | null; sex: string | null; grams: number | null; weighed: string | null;
    appt: { at: string; kind: string } | null;
    care: { id: string; kind: string; name: string; last: string | null; next: string | null; months: number | null }[];
    log: { id: string; date: string; name: string; kind: string }[];
  }[];
};

/** The client's animals booklet: read-only, in the card's language. */
export default function PetBooklet({ data }: { data: Data | null }) {
  const lang = (data?.lang ?? "he") as Lang;
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const dir = lang === "en" ? "ltr" : "rtl";
  if (!data) return <div className="center-page" dir={dir}><div className="panel"><h1>{t("vet_bookletGone")}</h1></div></div>;
  return (
    <div className="auth-page bk-page" dir={dir} style={{ "--bk": data.bg, "--bk-fg": data.fg } as React.CSSProperties}>
      <main id="main" className="page-main bk-main">
        <div className="bk-head"><div><small>{t("vet_booklet")}</small><h1>{data.title}</h1></div></div>
        {!data.pets.length && <p className="panel muted">{t("vet_none")}</p>}
        {data.pets.map((p) => {
          const age = ageText(p.birth, data.today, lang);
          return (
            <section key={p.id} className="panel vet-booklet">
              <div className="vet-facts">
                <span className="vet-icon" aria-hidden="true">{SPECIES_ICON[p.species as keyof typeof SPECIES_ICON] ?? "🐾"}</span>
                <div>
                  <b>{p.name}</b>
                  <small>{[speciesName(p.species, lang), p.breed, p.sex === "m" ? t("vet_male") : p.sex === "f" ? t("vet_female") : null, age].filter(Boolean).join(" · ")}</small>
                  {p.grams && <small>{t("vet_weight")}: {kgText(p.grams, lang)}{p.weighed ? ` (${shortDate(p.weighed, data.today)})` : ""}</small>}
                </div>
              </div>
              {p.appt && (
                <p className="vet-appt"><b>{t("vet_nextAppt")}:</b> <bdi>{formatAppt(p.appt.at, lang)}</bdi> <span className={"vet-kind is-" + p.appt.kind}>{kindName(p.appt.kind, lang)}</span></p>
              )}
              {(["vaccine", "treatment"] as const).map((kind) => {
                const items = p.care.filter((c) => c.kind === kind);
                if (!items.length) return null;
                return (
                  <div key={kind}>
                    <h2>{kind === "vaccine" ? t("vet_vaccines") : t("vet_treatments")}</h2>
                    <ul className="vet-care read">
                      {items.map((c) => {
                        const d = c.next ? daysTo(c.next, data.today) : null;
                        return (
                          <li key={c.id} className={d !== null && d < 0 ? "is-late" : d !== null && d <= 14 ? "is-soon" : ""}>
                            <div>
                              <b>{c.name}</b>
                              <small>{c.last ? t("vet_lastGiven", { d: shortDate(c.last, data.today) }) : t("vet_neverGiven")}</small>
                            </div>
                            {c.next && <span className={"vet-badge is-" + (d! < 0 ? "late" : d! <= 14 ? "soon" : "ok")}>{t("vet_nextDue", { d: shortDate(c.next, data.today) })}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {p.log.length > 0 && (
                <details>
                  <summary>{t("vet_history")}</summary>
                  <ul className="vet-log">{p.log.map((l) => <li key={l.id}><span>{shortDate(l.date)}</span><b>{l.name}</b><small>{kindName(l.kind, lang)}</small></li>)}</ul>
                </details>
              )}
            </section>
          );
        })}
        <p className="form-hint">{t("vet_bookletHint")}</p>
      </main>
    </div>
  );
}
