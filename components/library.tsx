"use client";

// The library card: the librarian's side.
// LibraryStation — at the station, for one reader: their books (return, extend) and lending a new one.
// LibraryDesk — every book out now (late first), and for the owner the loan settings.

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarClock, Check, Plus, RotateCcw, Search, Settings2 } from "lucide-react";
import { post } from "../lib/api";
import { errorText } from "../lib/i18n";
import type { SiteLang } from "../lib/i18n-types";
import { addDays, daysLeft, formatDue, israelDate, TITLE_MAX, type Loan } from "../lib/library";

type T = (key: string, vars?: Record<string, string | number>) => string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each action answers with its own shape
type Call = (b: Record<string, unknown>) => Promise<any>;

export type LibraryBusiness = { id: string; loan_days?: number; loan_ext_days?: number; loan_max_ext?: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the station's card state, passed through
type Card = Record<string, any> & { id: string; loans?: Loan[] };

/** Today in Israel (outside render, so components stay pure). */
function todayIL(): string {
  return israelDate(new Date());
}

/** "Late 3 days", "Today", "In 5 days", in the station's words. */
function dueBadge(due: string, today: string, t: T): { text: string; tone: "late" | "soon" | "ok" } {
  const left = daysLeft(due, today);
  if (left < 0) return { text: t("libLateDays", { n: -left }), tone: "late" };
  if (left === 0) return { text: t("libDueToday"), tone: "soon" };
  if (left <= 3) return { text: t("libDueIn", { n: left }), tone: "soon" };
  return { text: t("libDueIn", { n: left }), tone: "ok" };
}

export function LibraryStation({ business, customer, t, lang, branch, notify, onCard }: {
  business: LibraryBusiness; customer: Card; t: T; lang: string; branch?: string;
  notify: (s: string, bad?: boolean) => void;
  /** The reader's card after an action (their books). */
  onCard: (card: Card, message: string) => void;
}) {
  const loans = customer.loans ?? [];
  const [today] = useState(todayIL);
  const loanDays = business.loan_days ?? 14;
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(() => addDays(todayIL(), loanDays));
  const [titles, setTitles] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [returnAsk, setReturnAsk] = useState<string | null>(null);
  // A retry after a network error reuses the request id, so nothing happens twice.
  const [pending, setPending] = useState<{ key: string; id: string } | null>(null);
  useEffect(() => {
    let live = true;
    post("/api/loyalty", { action: "loan_titles", business: business.id }).then((r) => { if (live && r.ok) setTitles(r.data.titles as string[]); });
    return () => { live = false; };
  }, [business.id]);

  async function act(action: "lend" | "return" | "renew", key: string, extra: Record<string, unknown>, done: (card: Card, data: Record<string, unknown>) => string) {
    if (busy) return;
    const requestId = pending?.key === key ? pending.id : crypto.randomUUID();
    setPending({ key, id: requestId });
    setBusy(key);
    const r = await post("/api/loyalty", { action, business: business.id, customer: customer.id, requestId, branch, ...extra });
    setBusy(null);
    if (r.ok) {
      setPending(null);
      onCard(r.data.card as Card, r.data.replayed ? t("replayed") : done(r.data.card as Card, r.data));
    } else if (r.network) {
      notify(t("err_network"), true);
    } else {
      setPending(null);
      if (r.data?.card) onCard(r.data.card as Card, "");
      notify(errorText(lang as SiteLang, r.code), true);
    }
  }

  const lend = () => {
    const name = title.trim();
    if (!name) { notify(t("libTitleNeeded"), true); return; }
    act("lend", `lend:${name}:${due}`, { title: name, due }, () => {
      setTitle("");
      setDue(addDays(today, loanDays));
      if (!titles.includes(name)) setTitles([name, ...titles]);
      return t("libLent", { title: name, date: formatDue(due, lang) });
    });
  };
  const quick = [7, 14, 21, 30].includes(loanDays) ? [7, 14, 21, 30] : [loanDays, 7, 14, 30].sort((a, b) => a - b);
  const matches = useMemo(() => {
    const q = title.trim().toLowerCase();
    return (q ? titles.filter((x) => x.toLowerCase().includes(q) && x !== title.trim()) : titles).slice(0, 8);
  }, [title, titles]);

  return (
    <div className="lib">
      <div className="sx-box">
        <div className="sx-box-head">
          <span className="sx-box-icon" aria-hidden="true"><BookOpen size={18} /></span>
          <strong>{loans.length === 1 ? t("libHasOne") : loans.length ? t("libHasBooks", { n: loans.length }) : t("libNoBooks")}</strong>
        </div>
        {loans.length > 0 && (
          <ul className="lib-loans">
            {loans.map((l) => {
              const badge = dueBadge(l.due, today, t);
              return (
                <li key={l.id} className={"lib-loan " + badge.tone}>
                  <div className="lib-loan-text">
                    <strong>{l.title}</strong>
                    <small><bdi>{t("libReturnBy")} {formatDue(l.due, lang)}</bdi> · <span className={"lib-badge " + badge.tone}>{badge.text}</span>
                      {l.extensions > 0 && <> · {t("libExtendedN", { n: l.extensions })}</>}</small>
                  </div>
                  <div className="lib-loan-actions">
                    <button className="btn soft small" disabled={!!busy} onClick={() => act("renew", `renew:${l.id}`, { loan: l.id }, (card) => {
                      const now = card.loans?.find((x) => x.id === l.id);
                      return t("libRenewed", { title: l.title, date: now ? formatDue(now.due, lang) : "" });
                    })}>
                      <RotateCcw size={14} />{busy === `renew:${l.id}` ? t("sending") : t("libRenew", { n: business.loan_ext_days ?? 7 })}
                    </button>
                    <button className={"btn small " + (returnAsk === l.id ? "lime" : "primary")} disabled={!!busy} onClick={() => {
                      if (returnAsk !== l.id) { setReturnAsk(l.id); return; }
                      setReturnAsk(null);
                      act("return", `return:${l.id}`, { loan: l.id }, () => t("libReturned", { title: l.title }));
                    }}>
                      <Check size={14} />{busy === `return:${l.id}` ? t("sending") : returnAsk === l.id ? t("libReturnAgain") : t("libReturn")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <h2 className="sx-label">{t("libLendTitle")}</h2>
      <form className="lib-lend" onSubmit={(e) => { e.preventDefault(); lend(); }}>
        <label className="lib-field">
          <span>{t("libBook")}</span>
          <input value={title} maxLength={TITLE_MAX} autoComplete="off" placeholder={t("libBookPh")} onChange={(e) => { setTitle(e.target.value); setPending(null); }} />
        </label>
        {matches.length > 0 && (
          <div className="lib-titles" role="group" aria-label={t("libRecent")}>
            {matches.map((x) => <button key={x} type="button" className="chip" onClick={() => { setTitle(x); setPending(null); }}>{x}</button>)}
          </div>
        )}
        <div className="lib-field">
          <span>{t("libReturnBy")}</span>
          <div className="appt-quick" role="group" aria-label={t("libReturnBy")}>
            {quick.map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={due === addDays(today, d)} onClick={() => { setDue(addDays(today, d)); setPending(null); }}>
                {t("libDays", { n: d })}
              </button>
            ))}
            <input type="date" aria-label={t("libOtherDate")} min={today} value={due} onChange={(e) => { if (e.target.value) { setDue(e.target.value); setPending(null); } }} />
          </div>
          <small className="muted"><CalendarClock size={13} /> <bdi>{formatDue(due, lang)}</bdi></small>
        </div>
        <button className="btn primary big sx-wide" disabled={!!busy || !title.trim()}>
          <Plus size={18} />{busy?.startsWith("lend") ? t("sending") : t("libLend")}
        </button>
      </form>
    </div>
  );
}

type DeskLoan = Loan & { customer: string; name: string; phone: string };

export function LibraryDesk({ business, owner, t, lang, call, reload }: {
  business: LibraryBusiness; owner: boolean; t: T; lang: string; call: Call; reload: () => void;
}) {
  const [loans, setLoans] = useState<DeskLoan[] | null>(null);
  const [q, setQ] = useState("");
  const [today] = useState(todayIL);
  async function refresh() {
    const r = await call({ action: "loan_list" });
    setLoans(r ? (r.loans as DeskLoan[]) : []);
  }
  // Once, when the desk opens (the dashboard's `call` is a new function on every render).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load once on open
  useEffect(() => { refresh(); }, []);
  const shown = (loans ?? []).filter((l) => !q.trim() || `${l.title} ${l.name} ${l.phone}`.toLowerCase().includes(q.trim().toLowerCase()));
  const groups: { key: string; label: string; items: DeskLoan[] }[] = [
    { key: "late", label: t("libGroupLate"), items: shown.filter((l) => daysLeft(l.due, today) < 0) },
    { key: "week", label: t("libGroupWeek"), items: shown.filter((l) => { const d = daysLeft(l.due, today); return d >= 0 && d <= 7; }) },
    { key: "later", label: t("libGroupLater"), items: shown.filter((l) => daysLeft(l.due, today) > 7) },
  ];
  return (
    <div className="lib-desk">
      <section className="panel">
        <div className="panel-head">
          <div><h2><BookOpen size={18} /> {t("libDeskTitle")}</h2><p className="muted">{loans ? t("libDeskCount", { n: loans.length, late: groups[0].items.length }) : t("loading")}</p></div>
        </div>
        <label className="lib-search">
          <Search size={16} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("libSearch")} aria-label={t("libSearch")} />
        </label>
        {loans && !loans.length && <p className="muted">{t("libDeskEmpty")}</p>}
        {groups.filter((g) => g.items.length).map((g) => (
          <div key={g.key} className={"lib-group " + g.key}>
            <h3>{g.label} <span className="muted">({g.items.length})</span></h3>
            <ul className="lib-loans">
              {g.items.map((l) => {
                const badge = dueBadge(l.due, today, t);
                return (
                  <li key={l.id} className={"lib-loan " + badge.tone}>
                    <div className="lib-loan-text">
                      <strong>{l.title}</strong>
                      <small>{l.name} · <bdi dir="ltr">{l.phone}</bdi></small>
                    </div>
                    <div className="lib-loan-due">
                      <bdi>{formatDue(l.due, lang)}</bdi>
                      <span className={"lib-badge " + badge.tone}>{badge.text}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
      {owner && <LoanSettings business={business} t={t} call={call} reload={reload} />}
    </div>
  );
}

function LoanSettings({ business, t, call, reload }: { business: LibraryBusiness; t: T; call: Call; reload: () => void }) {
  const [days, setDays] = useState(String(business.loan_days ?? 14));
  const [extDays, setExtDays] = useState(String(business.loan_ext_days ?? 7));
  const [maxExt, setMaxExt] = useState(String(business.loan_max_ext ?? 2));
  const [saved, setSaved] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await call({ action: "set_loans", days: Number(days), extDays: Number(extDays), maxExt: Number(maxExt) });
    if (r) { setSaved(true); reload(); }
  }
  return (
    <section className="panel">
      <h2><Settings2 size={18} /> {t("libSettings")}</h2>
      <form className="lib-settings" onSubmit={save}>
        <label><span>{t("libSetDays")}</span><input type="number" min={1} max={120} inputMode="numeric" value={days} onChange={(e) => { setDays(e.target.value); setSaved(false); }} /></label>
        <label><span>{t("libSetExtDays")}</span><input type="number" min={1} max={60} inputMode="numeric" value={extDays} onChange={(e) => { setExtDays(e.target.value); setSaved(false); }} /></label>
        <label><span>{t("libSetMaxExt")}</span><input type="number" min={0} max={10} inputMode="numeric" value={maxExt} onChange={(e) => { setMaxExt(e.target.value); setSaved(false); }} /></label>
        <small className="form-hint">{t("libSetHint", { ext: Number(extDays) || 0, max: Number(maxExt) || 0 })}</small>
        <button className="btn primary">{saved ? t("saved") : t("save")}</button>
      </form>
    </section>
  );
}
