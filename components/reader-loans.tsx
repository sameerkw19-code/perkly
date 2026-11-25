"use client";

// The library card, the reader's side: their books, each return date, and "extend" (within the library's limit).
// On the web card and on the page the wallet pass links to.

import { useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import { post } from "../lib/api";
import { daysLeft, formatDue, israelDate, type Loan } from "../lib/library";

type T = (key: string, vars?: Record<string, string | number>) => string;

export function ReaderLoans({ loanKey, loans: initial, maxExt, extDays, t, lang }: {
  loanKey: string | null; loans: Loan[]; maxExt: number; extDays: number; t: T; lang: string;
}) {
  const [loans, setLoans] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  // A retry after a network error reuses the request id, so a book is never extended twice.
  const [pending, setPending] = useState<{ loan: string; id: string } | null>(null);
  const [today] = useState(() => israelDate(new Date()));
  async function extend(l: Loan) {
    if (!loanKey || busy) return;
    const requestId = pending?.loan === l.id ? pending.id : crypto.randomUUID();
    setPending({ loan: l.id, id: requestId });
    setBusy(l.id);
    setMsg(null);
    const r = await post("/api/loans", { key: loanKey, loan: l.id, requestId });
    setBusy(null);
    if (r.data?.loans) setLoans(r.data.loans as Loan[]);
    if (r.ok) {
      setPending(null);
      const now = (r.data.loans as Loan[]).find((x) => x.id === l.id);
      setMsg({ text: t("libRenewed", { title: l.title, date: now ? formatDue(now.due, lang) : "" }) });
    } else if (r.network) {
      setMsg({ text: t("err_network"), bad: true });
    } else {
      setPending(null);
      setMsg({ text: t(r.code === "ext_limit" ? "err_ext_limit" : r.code === "unknown_loan" ? "err_unknown_loan" : "err_generic"), bad: true });
    }
  }
  return (
    <section className="panel reader-loans" aria-labelledby="reader-loans-h">
      <h2 id="reader-loans-h"><BookOpen size={18} /> {t("libYourBooks")}</h2>
      {!loans.length && <p className="muted">{t("libNoBooksCard")}</p>}
      <ul className="lib-loans">
        {loans.map((l) => {
          const left = daysLeft(l.due, today);
          const tone = left < 0 ? "late" : left <= 3 ? "soon" : "ok";
          const canExtend = !!loanKey && l.extensions < maxExt;
          return (
            <li key={l.id} className={"lib-loan " + tone}>
              <div className="lib-loan-text">
                <strong>{l.title}</strong>
                <small>
                  <bdi>{t("libReturnBy")} {formatDue(l.due, lang)}</bdi>
                  {" · "}
                  <span className={"lib-badge " + tone}>{left < 0 ? t("libLateDays", { n: -left }) : left === 0 ? t("libDueToday") : t("libDueIn", { n: left })}</span>
                </small>
              </div>
              {canExtend
                ? <button className="btn soft small" disabled={!!busy} onClick={() => extend(l)}><RotateCcw size={14} />{busy === l.id ? t("sending") : t("libRenew", { n: extDays })}</button>
                : maxExt > 0 && <small className="muted lib-no-ext">{t("libNoMoreExt")}</small>}
            </li>
          );
        })}
      </ul>
      {msg && <p className={msg.bad ? "form-error" : "form-ok"} role="status">{msg.text}</p>}
      {maxExt > 0 && loans.length > 0 && <small className="muted">{t("libReaderHint", { ext: extDays, max: maxExt })}</small>}
    </section>
  );
}
