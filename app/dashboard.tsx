"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Check, Copy, Download, Gift, LayoutDashboard, Link2, LogOut, Minus, Plus, QrCode,
  RefreshCw, ScanLine, Search, Settings, Share2, Store, Users, Wallet, X,
} from "lucide-react";
import jsQR from "jsqr";
import { errorText, useLang } from "../lib/i18n";
import { copyText, post, whatsappLink } from "../lib/api";
import { LangSwitch } from "../components/lang-switch";
import { LoyaltyCard, Num } from "../components/loyalty-card";
import { QrImage } from "../components/qr";

type Role = "owner" | "staff";
type Business = { id: string; name: string; reward: string; target: number; color: string; join_code: string | null };
type CardState = { id: string; name: string; stamps: number; target: number; rewardReady: boolean; phone?: string };
type Data = {
  me: { name: string; email: string };
  memberships: { business: string; role: Role; businessName: string }[];
  role: Role | null;
  business: Business | null;
  range?: number | "all";
  customers?: any[];
  events?: any[];
  stats?: { customers: number; new_customers: number; rewards_ready: number; stamps: number; redemptions: number };
  team?: any[];
  invites?: any[];
  alerts?: { type: "customer" | "staff"; name: string; count: number }[];
  myRecent?: any[];
};
type Modal =
  | { type: "customer" }
  | { type: "business" }
  | { type: "link"; url: string; title: string }
  | { type: "correct"; customer: any };

export default function Dashboard() {
  const { lang, setLang, t, dir } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [days, setDays] = useState<string>("30");
  const [view, setView] = useState("overview");
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [query, setQuery] = useState("");
  const [stationPick, setStationPick] = useState<CardState | null>(null);

  const notify = (text: string, bad = false) => setToast({ text, bad });
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("business");
    let saved: string | null = null;
    try { saved = localStorage.getItem("perkly-business"); } catch {}
    setBusinessId(fromUrl || saved || "");
  }, []);

  const load = useCallback(async () => {
    if (businessId === null) return;
    try {
      const params = new URLSearchParams();
      if (businessId) params.set("business", businessId);
      params.set("days", days);
      const r = await fetch("/api/loyalty?" + params, { credentials: "same-origin" });
      if (r.status === 401) { window.location.href = "/login"; return; }
      if (!r.ok) throw new Error();
      const next: Data = await r.json();
      setData(next);
      setLoadError("");
      if (next.business && next.business.id !== businessId) setBusinessId(next.business.id);
      if (next.role === "staff") setView("station");
    } catch {
      setLoadError(t("err_network"));
    }
  }, [businessId, days]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (businessId) try { localStorage.setItem("perkly-business", businessId); } catch {}
  }, [businessId]);

  async function call(body: Record<string, unknown>) {
    if (!data?.business) return null;
    setBusy(true);
    const result = await post("/api/loyalty", { business: data.business.id, ...body });
    setBusy(false);
    if (!result.ok) {
      notify(errorText(lang, result.code), true);
      if (result.code === "signin") window.location.href = "/login";
      return null;
    }
    return result.data;
  }

  async function signOut() {
    await post("/api/auth", { action: "logout" });
    window.location.href = "/login";
  }

  const role = data?.role;
  const b = data?.business;
  const isOwner = role === "owner";
  const nav: [any, string][] = isOwner
    ? [[LayoutDashboard, "overview"], [Users, "customers"], [ScanLine, "station"], [Users, "team"], [Settings, "settings"]]
    : [[ScanLine, "station"]];

  // ---------- Loading / empty states ----------
  if (!data) {
    return (
      <div className="center-page" dir={dir}>
        {loadError ? (
          <div className="empty">{loadError}<button className="btn primary" onClick={load}>{t("retry")}</button></div>
        ) : (
          <div className="empty"><RefreshCw className="spin" />{t("loading")}</div>
        )}
      </div>
    );
  }

  if (!b) {
    return (
      <div className="center-page" dir={dir}>
        <div className="onboarding">
          <div className="auth-top"><span className="brand">perkly<span>.</span></span><LangSwitch lang={lang} setLang={setLang} /></div>
          <span className="welcome-icon"><Store size={38} /></span>
          <h2>{t("welcome")}</h2>
          <p>{t("welcomeHint")}</p>
          <BusinessForm t={t} busy={busy} onSubmit={async (values) => {
            setBusy(true);
            const r = await post("/api/loyalty", { action: "create_business", ...values });
            setBusy(false);
            if (r.ok) { setBusinessId(r.data.id); load(); } else notify(errorText(lang, r.code), true);
          }} submitLabel={t("createBusiness")} />
          <p className="form-hint">{t("noAccess")}</p>
          <button className="text-btn center" onClick={signOut}><LogOut size={15} />{t("signOut")}</button>
        </div>
        {toast && <div className={"toast" + (toast.bad ? " bad" : "")} role="status">{toast.text}</div>}
      </div>
    );
  }

  const customers = data.customers ?? [];
  const filtered = customers.filter((c) => (c.name + " " + c.phone).toLowerCase().includes(query.toLowerCase()) || c.phone.replace(/\D/g, "").includes(query.replace(/\D/g, "") || "\u0000"));

  function exportCSV() {
    const safe = (s: unknown) => '"' + String(s ?? "").replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
    const rows = [["Name", "Phone", "Stamps", "Target", "Marketing consent", "Joined", "Source"],
      ...customers.map((c) => [c.name, c.phone, c.stamps, c.target, c.consent_marketing ? "yes" : "no", c.created, c.source])];
    const csv = "﻿" + rows.map((r) => r.map(safe).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `perkly-${b!.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-customers.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app" dir={dir}>
      <aside className="sidebar">
        <span className="brand">perkly<span>.</span></span>
        <div className="workspace">
          <span className="mini-logo" style={{ background: b.color, color: "white" }}>{b.name.charAt(0)}</span>
          <div><strong>{b.name}</strong><small>{isOwner ? t("roleOwner") : t("roleStaff")}</small></div>
        </div>
        <nav style={{ "--nav-count": nav.length } as React.CSSProperties}>
          {nav.map(([Icon, key]) => (
            <button key={key} className={"nav-item" + (view === key ? " selected" : "")} onClick={() => { setView(key); setQuery(""); }}>
              <Icon size={18} />{t(key)}{view === key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="profile"><span>{data.me.name.charAt(0)}</span><div><strong>{data.me.name}</strong><small dir="ltr">{data.me.email}</small></div></div>
          <button className="text-btn" onClick={signOut}><LogOut size={15} />{t("signOut")}</button>
        </div>
      </aside>

      <div className="shell">
        <header className="topbar">
          <div className="breadcrumb">{b.name}<span>/</span>{t(view)}</div>
          <div className="top-actions">
            {data.memberships.length > 1 && (
              <select aria-label={t("choose")} value={b.id} onChange={(e) => { setBusinessId(e.target.value); setStationPick(null); }}>
                {data.memberships.map((m) => <option key={m.business} value={m.business}>{m.businessName}</option>)}
              </select>
            )}
            <LangSwitch lang={lang} setLang={setLang} />
            <button className="icon-btn mobile-only" aria-label={t("signOut")} title={t("signOut")} onClick={signOut}><LogOut size={16} /></button>
          </div>
        </header>
        {!online && <div className="offline-bar" role="alert">{t("offline")}</div>}

        <main>
          {view === "overview" && isOwner && (
            <>
              <div className="page-head">
                <div><h1>{t("hello")}</h1><p className="muted">{t("subtitle")}</p></div>
                <div className="head-actions">
                  <select aria-label="Range" value={days} onChange={(e) => setDays(e.target.value)}>
                    <option value="7">{t("range7")}</option><option value="30">{t("range30")}</option>
                    <option value="90">{t("range90")}</option><option value="all">{t("rangeAll")}</option>
                  </select>
                  <button className="btn primary" onClick={() => setModal({ type: "customer" })}><Plus size={18} />{t("newCustomer")}</button>
                </div>
              </div>
              {!!data.alerts?.length && (
                <div className="alert-panel" role="status">
                  <strong><AlertTriangle size={16} />{t("alerts")}</strong>
                  <ul>{data.alerts.map((a, i) => <li key={i}>{t(a.type === "customer" ? "alertCustomer" : "alertStaff", { name: a.name, n: a.count })}</li>)}</ul>
                </div>
              )}
              <section className="stats">
                <Stat icon={Users} color="violet" label={t("statCustomers")} value={data.stats!.customers} note={t("statNew", { n: data.stats!.new_customers })} />
                <Stat icon={Plus} color="peach" label={t("statStamps")} value={data.stats!.stamps} note={t("inRange")} />
                <Stat icon={Gift} color="green" label={t("statReady")} value={data.stats!.rewards_ready} note={t("rightNow")} />
                <Stat icon={Check} color="blue" label={t("statRedeemed")} value={data.stats!.redemptions} note={t("inRange")} />
              </section>
              <section className="overview-grid">
                <div className="panel card-panel">
                  <div className="section-head"><h2>{t("card")}</h2></div>
                  <LoyaltyCard businessName={b.name} reward={b.reward} color={b.color} stamps={3} target={b.target} t={t} />
                  <p className="wallet-note"><Wallet size={15} />{t("walletHint")}</p>
                </div>
                <div className="panel activity-panel">
                  <div className="section-head"><h2>{t("history")}</h2></div>
                  <EventList events={data.events ?? []} t={t} lang={lang} />
                </div>
              </section>
            </>
          )}

          {view === "customers" && isOwner && (
            <section className="panel customer-panel">
              <div className="section-head">
                <h2>{t("all")} <span className="count"><Num>{customers.length}</Num></span></h2>
                <div className="table-tools">
                  <label className="search"><Search size={17} /><input value={query} placeholder={t("search")} onChange={(e) => setQuery(e.target.value)} /></label>
                  <button className="btn soft small" onClick={exportCSV} disabled={!customers.length}><Download size={15} />{t("export")}</button>
                  <button className="btn primary small" onClick={() => setModal({ type: "customer" })}><Plus size={15} />{t("newCustomer")}</button>
                </div>
              </div>
              {!filtered.length ? (
                <div className="empty compact">{t("noCustomer")}</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t("name")}</th><th>{t("phone")}</th><th>{t("balance")}</th><th>{t("marketingCol")}</th><th>{t("actions")}</th></tr></thead>
                    <tbody>
                      {filtered.map((c) => (
                        <tr key={c.id}>
                          <td><span className="customer-avatar">{c.name.charAt(0)}</span><strong>{c.name}</strong></td>
                          <td dir="ltr" className="start">{c.phone}</td>
                          <td>
                            <div className="progress-cell">
                              <span className="progress-track"><i style={{ width: Math.min(100, (c.stamps / c.target) * 100) + "%" }} /></span>
                              <Num>{c.stamps}/{c.target}</Num>
                              {c.stamps >= c.target && <span className="pill ready-pill">{t("statReady")}</span>}
                            </div>
                          </td>
                          <td>{c.consent_marketing ? t("yes") : t("no")}</td>
                          <td>
                            <div className="row-actions">
                              <button className="btn soft small" onClick={() => { setStationPick({ id: c.id, name: c.name, stamps: c.stamps, target: c.target, rewardReady: c.stamps >= c.target, phone: c.phone }); setView("station"); }}>
                                <ScanLine size={14} />{t("station")}
                              </button>
                              <button className="icon-btn" title={t("newLink")} aria-label={t("newLink")} disabled={busy} onClick={async () => {
                                if (!confirm(t("newLinkConfirm"))) return;
                                const r = await call({ action: "new_card_link", customer: c.id });
                                if (r) setModal({ type: "link", url: r.cardUrl, title: c.name });
                              }}><Link2 size={16} /></button>
                              <button className="icon-btn" title={t("correct")} aria-label={t("correct")} onClick={() => setModal({ type: "correct", customer: c })}><Activity size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="form-hint">{t("privacy")}</p>
            </section>
          )}

          {view === "station" && (
            <Station key={b.id} business={b} t={t} lang={lang} initial={stationPick} onDone={() => load()} notify={notify}
              onRegister={() => setModal({ type: "customer" })} myRecent={data.myRecent} />
          )}

          {view === "team" && isOwner && (
            <Team data={data} t={t} lang={lang} busy={busy} call={call} reload={load}
              showLink={(url) => setModal({ type: "link", url, title: t("inviteStaff") })} />
          )}

          {view === "settings" && isOwner && (
            <div className="settings-grid">
              <section className="panel">
                <div className="section-head"><h2>{t("settings")}</h2></div>
                <BusinessForm key={b.id} t={t} busy={busy} initial={b} submitLabel={t("save")} onSubmit={async (values) => {
                  const r = await call({ action: "update_business", ...values });
                  if (r) { notify(t("saved")); load(); }
                }} />
                <p className="form-hint">{t("targetNote")}</p>
              </section>
              <section className="panel join-panel">
                <div className="section-head"><h2><QrCode size={18} /> {t("joinQr")}</h2></div>
                {b.join_code && <QrImage text={`${window.location.origin}/join/${b.join_code}`} size={200} label={t("joinQr")} />}
                <p className="muted">{t("joinQrHint")}</p>
                {b.join_code && <LinkBox url={`${window.location.origin}/join/${b.join_code}`} t={t} notify={notify} />}
                <button className="btn soft small" disabled={busy} onClick={async () => {
                  if (!confirm(t("newJoinConfirm"))) return;
                  if (await call({ action: "new_join_code" })) load();
                }}><RefreshCw size={14} />{t("newJoinCode")}</button>
              </section>
              <section className="panel">
                <button className="btn soft" onClick={() => setModal({ type: "business" })}><Store size={16} />{t("newBusiness")}</button>
              </section>
            </div>
          )}

          <footer><span>perkly. <span className="muted">Small card. Big connection.</span></span><span>{t("pilot")} · v0.2</span></footer>
        </main>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => !busy && setModal(null)}>
          <section className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="close" aria-label={t("close")} onClick={() => setModal(null)}><X size={22} /></button>

            {modal.type === "customer" && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const r = await call({ action: "register_customer", name: form.get("name"), phone: form.get("phone") });
                if (r) { load(); setModal({ type: "link", url: r.cardUrl, title: String(form.get("name")) }); }
              }}>
                <span className="modal-icon"><Plus /></span>
                <h2>{t("newCustomer")}</h2>
                <label>{t("name")}<input name="name" required maxLength={80} autoFocus /></label>
                <label>{t("phone")}<input name="phone" type="tel" required maxLength={20} dir="ltr" placeholder={t("phoneHint")} /></label>
                <p className="form-hint">{t("privacy")} {t("phoneNotVerified")}</p>
                <div className="form-actions">
                  <button className="btn primary" disabled={busy}>{t("save")}</button>
                  <button type="button" className="btn soft" onClick={() => setModal(null)}>{t("cancel")}</button>
                </div>
              </form>
            )}

            {modal.type === "link" && (
              <div>
                <span className="modal-icon"><Share2 /></span>
                <h2>{modal.title}</h2>
                <p>{modal.url.includes("/invite/") ? t("inviteCreated") : t("customerCreated")}</p>
                <LinkBox url={modal.url} t={t} notify={notify} />
                {!modal.url.includes("/invite/") && <p className="form-hint">{t("cardLinkHint")}</p>}
              </div>
            )}

            {modal.type === "correct" && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const delta = Number(form.get("delta"));
                const r = await call({ action: "adjust", customer: modal.customer.id, delta, note: form.get("note"), requestId: crypto.randomUUID() });
                if (r) { notify(t("saved")); load(); setModal(null); }
              }}>
                <span className="modal-icon"><Activity /></span>
                <h2>{t("correctTitle")}</h2>
                <p><strong>{modal.customer.name}</strong> · <Num>{modal.customer.stamps}/{modal.customer.target}</Num></p>
                <div className="choice-row">
                  <label className="check"><input type="radio" name="delta" value="1" defaultChecked /><Plus size={14} />{t("addOne")}</label>
                  <label className="check"><input type="radio" name="delta" value="-1" /><Minus size={14} />{t("removeOne")}</label>
                </div>
                <label>{t("reason")}<input name="note" required maxLength={200} /></label>
                <p className="form-hint">{t("correctHint")}</p>
                <div className="form-actions">
                  <button className="btn primary" disabled={busy}>{t("save")}</button>
                  <button type="button" className="btn soft" onClick={() => setModal(null)}>{t("cancel")}</button>
                </div>
              </form>
            )}

            {modal.type === "business" && (
              <div>
                <span className="modal-icon"><Store /></span>
                <h2>{t("newBusiness")}</h2>
                <BusinessForm t={t} busy={busy} submitLabel={t("createBusiness")} onSubmit={async (values) => {
                  setBusy(true);
                  const r = await post("/api/loyalty", { action: "create_business", ...values });
                  setBusy(false);
                  if (r.ok) { setModal(null); setBusinessId(r.data.id); setView("overview"); } else notify(errorText(lang, r.code), true);
                }} />
              </div>
            )}
          </section>
        </div>
      )}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")} role="status">{toast.text}</div>}
    </div>
  );
}

// ---------- Pieces ----------

function Stat({ icon: Icon, color, label, value, note }: { icon: any; color: string; label: string; value: number; note: string }) {
  return (
    <article className="stat">
      <div><span className={"stat-icon " + color}><Icon size={18} /></span><span className="stat-label">{label}</span></div>
      <strong><Num>{value}</Num></strong>
      <small>{note}</small>
    </article>
  );
}

function EventList({ events, t, lang }: { events: any[]; t: any; lang: string }) {
  if (!events.length) return <div className="activity-empty"><Activity /><p>{t("empty")}</p></div>;
  const locale = lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB";
  return (
    <div>
      {events.slice(0, 12).map((e: any, i: number) => (
        <div className="activity-row" key={e.id ?? i}>
          <span className={"activity-icon" + (e.kind === "redeem" ? " reward-icon" : "")}>{e.kind === "redeem" ? <Gift size={16} /> : e.kind === "adjust" ? <Activity size={16} /> : <Plus size={16} />}</span>
          <div>
            <strong>{e.customer}</strong>
            <small>
              {t("ev_" + e.kind)} <Num>{e.delta > 0 ? "+" + e.delta : e.delta}</Num>
              {e.actor_name ? " · " + t("by", { name: e.actor_name }) : ""}
              {e.note ? " · " + e.note : ""}
            </small>
          </div>
          <time dateTime={e.created}>{new Date(e.created).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</time>
        </div>
      ))}
    </div>
  );
}

function LinkBox({ url, t, notify }: { url: string; t: any; notify: (s: string, bad?: boolean) => void }) {
  return (
    <div className="link-box">
      <input readOnly value={url} dir="ltr" onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
      <div className="row-actions">
        <button type="button" className="btn soft small" onClick={async () => notify((await copyText(url)) ? t("copied") : t("err_generic"))}><Copy size={14} />{t("copy")}</button>
        <a className="btn lime small" href={whatsappLink(url)} target="_blank" rel="noreferrer"><Share2 size={14} />{t("whatsapp")}</a>
      </div>
    </div>
  );
}

function BusinessForm({ t, busy, initial, submitLabel, onSubmit }: {
  t: any; busy: boolean; initial?: Business; submitLabel: string;
  onSubmit: (v: { name: string; reward: string; target: number; color: string }) => void;
}) {
  return (
    <form className="stack-form" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      onSubmit({ name: String(f.get("name")), reward: String(f.get("reward")), target: Number(f.get("target")), color: String(f.get("color")) });
    }}>
      <label>{t("businessName")}<input name="name" required maxLength={80} defaultValue={initial?.name} /></label>
      <label>{t("rewardText")}<input name="reward" required maxLength={160} defaultValue={initial?.reward ?? ""} /></label>
      <div className="form-row">
        <label>{t("target")}<input name="target" type="number" min={2} max={30} required defaultValue={initial?.target ?? 9} /></label>
        <label>{t("color")}<input name="color" type="color" defaultValue={initial?.color ?? "#7558E8"} /></label>
      </div>
      <button className="btn primary" disabled={busy}>{submitLabel}</button>
    </form>
  );
}

// ---------- Staff station: scan or search, then confirm. The server is the source of truth. ----------

function Station({ business, t, lang, initial, onDone, notify, onRegister, myRecent }: {
  business: Business; t: any; lang: any; initial: CardState | null; onDone: () => void;
  notify: (s: string, bad?: boolean) => void; onRegister: () => void; myRecent?: any[];
}) {
  const [selected, setSelected] = useState<CardState | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardState[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  // Kept after a network failure so a retry reuses the same request id and can never count twice.
  const [pending, setPending] = useState<{ kind: string; customer: string; requestId: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setScanning(false);
  }, []);
  useEffect(() => stop, [stop]);

  async function lookup(body: Record<string, unknown>) {
    const r = await post("/api/loyalty", { action: "lookup", business: business.id, ...body });
    if (!r.ok) { notify(errorText(lang, r.code), true); return []; }
    return r.data.results as CardState[];
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => setResults(await lookup({ query: q })), 300);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { notify(t("cameraError"), true); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setScanning(true);
    } catch {
      stop();
      notify(t("cameraError"), true);
    }
  }

  useEffect(() => {
    if (!scanning) return;
    const v = video.current;
    if (v && stream.current) { v.srcObject = stream.current; v.play().catch(() => {}); }
    const canvas = document.createElement("canvas");
    const timer = setInterval(async () => {
      const el = video.current;
      if (!el || el.readyState < 2) return;
      canvas.width = el.videoWidth;
      canvas.height = el.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(el, 0, 0);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(frame.data, frame.width, frame.height);
      if (code?.data) {
        stop();
        const found = await lookup({ scan: code.data });
        if (found[0]) { setSelected(found[0]); setPending(null); }
      }
    }, 400);
    return () => clearInterval(timer);
  }, [scanning]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(kind: "stamp" | "redeem") {
    if (!selected || busy) return;
    if (kind === "redeem" && !confirm(t("confirmRedeem", { name: selected.name }))) return;
    const requestId = pending && pending.kind === kind && pending.customer === selected.id ? pending.requestId : crypto.randomUUID();
    setPending({ kind, customer: selected.id, requestId });
    setBusy(true);
    const r = await post("/api/loyalty", { action: kind, business: business.id, customer: selected.id, requestId });
    setBusy(false);
    if (r.ok) {
      setPending(null);
      setSelected({ ...selected, ...r.data.card });
      notify(r.data.replayed ? t("replayed") : kind === "stamp" ? t("stampOk") : t("redeemOk"));
      onDone();
    } else if (r.network) {
      notify(t("err_network"), true); // outcome unknown: keep the request id for a safe retry
    } else {
      setPending(null);
      if (r.data?.card) setSelected({ ...selected, ...r.data.card });
      notify(errorText(lang, r.code), true);
    }
  }

  const retrying = pending && selected && pending.customer === selected.id;

  return (
    <>
      <div className="page-head"><div><h1>{t("stationTitle")}</h1><p className="muted">{t("stationSubtitle")}</p></div>
        <div className="head-actions"><button className="btn soft" onClick={onRegister}><Plus size={16} />{t("newCustomer")}</button></div>
      </div>
      <section className="staff-grid">
        <div className="panel scanner">
          <span className="scan-icon"><ScanLine size={30} /></span>
          <h2>{t("scan")}</h2>
          <p>{t("scanHint")}</p>
          {scanning ? (
            <div className="video-wrap"><video ref={video} muted playsInline /><div className="scan-frame" /></div>
          ) : (
            <div className="scanner-art"><ScanLine size={70} strokeWidth={1} /></div>
          )}
          <button className="btn primary" onClick={scanning ? stop : start}>{scanning ? t("stop") : t("camera")}</button>
          <p className="divider">{t("manual")}</p>
          <label className="search"><Search size={17} /><input value={query} placeholder={t("search")} onChange={(e) => setQuery(e.target.value)} /></label>
          <small className="form-hint">{t("searchHint")}</small>
          <div className="staff-results">
            {results.map((c) => (
              <button key={c.id} className={"customer-result" + (selected?.id === c.id ? " active-result" : "")} onClick={() => { setSelected(c); setPending(null); }}>
                <span><strong>{c.name}</strong><small dir="ltr">{c.phone}</small></span>
                <span><Num>{c.stamps}/{c.target}</Num></span>
              </button>
            ))}
            {query.trim().length >= 2 && !results.length && <p className="form-hint">{t("noCustomer")}</p>}
          </div>
        </div>

        <div className="panel staff-card">
          {!selected ? (
            <><ScanLine size={60} strokeWidth={1} /><p>{t("selectHint")}</p></>
          ) : (
            <>
              <LoyaltyCard businessName={business.name} reward={business.reward} color={business.color} stamps={selected.stamps} target={selected.target} customerName={selected.name} t={t} />
              {selected.phone && <p className="muted" dir="ltr">{selected.phone}</p>}
              {selected.stamps >= selected.target ? (
                <button className="btn lime big" disabled={busy} onClick={() => act("redeem")}><Gift size={18} />{busy ? t("sending") : retrying ? t("retry") : t("redeem")}</button>
              ) : (
                <button className="btn primary big" disabled={busy} onClick={() => act("stamp")}><Plus size={18} />{busy ? t("sending") : retrying ? t("retry") : t("addStamp")}</button>
              )}
              <button className="text-btn" onClick={() => { setSelected(null); setPending(null); }}><X size={14} />{t("close")}</button>
            </>
          )}
        </div>
      </section>
      {!!myRecent?.length && (
        <section className="panel" style={{ marginTop: 22 }}>
          <div className="section-head"><h2>{t("myRecent")}</h2></div>
          <EventList events={myRecent} t={t} lang={lang} />
        </section>
      )}
    </>
  );
}

// ---------- Team: invite staff, revoke access ----------

function Team({ data, t, lang, busy, call, reload, showLink }: {
  data: Data; t: any; lang: string; busy: boolean; call: (b: Record<string, unknown>) => Promise<any>; reload: () => void; showLink: (url: string) => void;
}) {
  const locale = lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB";
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="section-head"><h2>{t("team")}</h2></div>
        <p className="form-hint">{t("teamHint")}</p>
        <div className="table-wrap">
          <table>
            <tbody>
              {(data.team ?? []).map((m: any) => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong><br /><small dir="ltr">{m.email}</small></td>
                  <td><span className="pill">{m.role === "owner" ? t("roleOwner") : t("roleStaff")}</span></td>
                  <td>
                    {m.revoked ? <span className="muted">{t("revokedOn")}</span> : m.role === "staff" ? (
                      <button className="btn soft small danger" disabled={busy} onClick={async () => {
                        if (!confirm(t("revokeConfirm", { name: m.name }))) return;
                        if (await call({ action: "revoke_member", user: m.id })) reload();
                      }}>{t("revoke")}</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="section-head"><h2>{t("inviteStaff")}</h2></div>
        <form className="stack-form" onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const r = await call({ action: "invite_staff", label: new FormData(form).get("label") });
          if (r) { form.reset(); reload(); showLink(r.inviteUrl); }
        }}>
          <label>{t("inviteLabel")}<input name="label" required maxLength={60} /></label>
          <button className="btn primary" disabled={busy}><Plus size={16} />{t("inviteStaff")}</button>
        </form>
        {!!data.invites?.length && (
          <>
            <h3 className="sub-head">{t("pendingInvites")}</h3>
            {data.invites.map((i: any) => (
              <div className="invite-row" key={i.id}>
                <span><strong>{i.label}</strong><small>{t("expiresOn", { d: new Date(i.expires).toLocaleDateString(locale) })}</small></span>
                <button className="btn soft small" disabled={busy} onClick={async () => { if (await call({ action: "revoke_invite", invite: i.id })) reload(); }}>{t("cancelInvite")}</button>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
