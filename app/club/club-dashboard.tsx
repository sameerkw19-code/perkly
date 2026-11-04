"use client";
import "./club.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ImagePlus, LogOut, MessageCircle, Plus, Search, Settings, Wallet, X } from "lucide-react";
import { Brand } from "../../components/brand";
import { useLang } from "../../lib/i18n";
import { addMonths, israelToday, memberStatus, readableOn, renewFrom, showDate, type MemberStatus } from "../../lib/club";
import { CLUB_TEXT, fill, type ClubText } from "../../lib/club-text";

type Member = { id: string; memberNo: number; name: string; phone: string | null; plan: string | null; validUntil: string; wallet: boolean };
type Access = { ok: true; free?: { limit: number; used: number } } | { ok: false; code: string };
type Data = {
  me: { name: string };
  clubs: { id: string; name: string }[];
  hasStamps: boolean;
  club: null | { id: string; name: string; color: string; logo: string | null };
  members?: Member[];
  access?: Access;
  subscribed?: boolean;
  canSubscribe?: boolean;
};
type Reply = { ok: boolean; status: number; body: Record<string, unknown> };
type Filter = "all" | MemberStatus;

const SWATCHES = ["#7558E8", "#17132B", "#0F766E", "#B42318", "#C2410C", "#1D4ED8", "#BE185D", "#3F6212"];
const WHATSAPP = "972526028291";

async function post(body: Record<string, unknown>): Promise<Reply> {
  const r = await fetch("/api/club", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, body: ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
}

function errorText(t: ClubText, reply: Reply): string {
  return t.errors[String(reply.body.code ?? reply.body.error ?? "")] ?? t.error;
}

function waLink(phone: string | null, text: string) {
  return `https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(text)}`;
}

function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="club-swatches" role="radiogroup" aria-label={label}>
      {SWATCHES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toUpperCase() === c} aria-label={c} style={{ background: c, color: readableOn(c) }} onClick={() => onChange(c)}>
          {value.toUpperCase() === c && <Check size={16} />}
        </button>
      ))}
    </div>
  );
}

function CreateClub({ t, onDone }: { t: ClubText; onDone: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="club-panel club-create"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const r = await post({ action: "create_club", name, color });
        setBusy(false);
        if (r.ok) onDone();
        else setError(errorText(t, r));
      }}
    >
      <h1>{t.createTitle}</h1>
      <p className="club-hint">{t.createText}</p>
      <label>{t.clubName}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus /></label>
      <div className="club-field"><span>{t.clubColor}</span><Swatches value={color} onChange={setColor} label={t.clubColor} /></div>
      {error && <p className="club-error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy}>{t.createClub}</button>
    </form>
  );
}

function StatusPill({ status, t }: { status: MemberStatus; t: ClubText }) {
  const label = status === "expired" ? t.statusExpired : status === "expiring" ? t.statusExpiring : t.statusActive;
  return <span className={`club-pill ${status}`}>{label}</span>;
}

/** The link after adding a member or making a new one. It can't be shown again. */
function LinkReady({ t, link, phone, club, onClose }: { t: ClubText; link: string; phone: string | null; club: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="club-link" role="status">
      <h3>{t.cardReady}</h3>
      <p>{t.cardReadyText}</p>
      <code dir="ltr">{link}</code>
      <div className="club-actions">
        <a className="btn primary" href={waLink(phone, fill(t.whatsAppText, { club, link }))} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />{t.sendWhatsApp}</a>
        <button
          type="button"
          className="btn soft"
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => {});
            setCopied(true);
          }}
        >
          <Copy size={16} />{copied ? t.copied : t.copyLink}
        </button>
        <button type="button" className="btn soft" onClick={onClose}>{t.close}</button>
      </div>
    </div>
  );
}

function MemberForm({ t, club, member, plans, today, onClose, onSaved }: {
  t: ClubText; club: { id: string; name: string }; member: Member | null; plans: string[]; today: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [plan, setPlan] = useState(member?.plan ?? "");
  const [validUntil, setValidUntil] = useState(member?.validUntil ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"link" | "remove" | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  // The date field keeps its value when the buttons are used, so each press adds to what is shown.
  const extend = (months: number) => setValidUntil(addMonths(renewFrom(validUntil, today), months));
  const done = async (r: Reply) => {
    setBusy(false);
    if (!r.ok) return setError(errorText(t, r));
    if (typeof r.body.link === "string") {
      // The server's version of the number, which WhatsApp can open.
      const saved = r.body.member as { phone?: string | null } | undefined;
      if (saved) setPhone(saved.phone ?? "");
      setLink(r.body.link);
      onSaved();
    } else {
      onSaved();
      onClose();
    }
  };
  const act = async (action: string) => {
    setBusy(true);
    setError("");
    await done(await post({ business: club.id, action, member: member?.id }));
  };

  return (
    <dialog ref={ref} className="club-dialog" onClose={onClose} aria-labelledby="club-dialog-title">
      <div className="club-dialog-head">
        <h2 id="club-dialog-title">{member ? t.editMember : t.addMember}</h2>
        <button type="button" className="icon-btn" aria-label={t.close} onClick={onClose}><X size={18} /></button>
      </div>
      {link ? (
        <LinkReady t={t} link={link} phone={phone ? phone : null} club={club.name} onClose={onClose} />
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            await done(await post({ business: club.id, action: member ? "update_member" : "add_member", member: member?.id, name, phone, plan, validUntil }));
          }}
        >
          {member && <p className="club-hint">{t.memberNo} {member.memberNo}</p>}
          <label>{t.fullName}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus={!member} /></label>
          <label>{t.phone}<input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} /><small>{t.phoneHint}</small></label>
          <label>
            {t.plan}
            <input list="club-plans" value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={40} placeholder={t.planHint} />
            <datalist id="club-plans">{plans.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <label>{t.validUntil}<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} required /></label>
          <div className="club-extend" role="group" aria-label={t.extend}>
            <span>{t.extend}</span>
            <button type="button" className="btn soft small" onClick={() => extend(1)}>{t.oneMonth}</button>
            <button type="button" className="btn soft small" onClick={() => extend(3)}>{t.threeMonths}</button>
            <button type="button" className="btn soft small" onClick={() => extend(12)}>{t.oneYear}</button>
          </div>
          {error && <p className="club-error" role="alert">{error}</p>}
          <button className="btn primary wide" disabled={busy}>{t.save}</button>
          {member && (
            <div className="club-more">
              {confirm === "link" ? (
                <div className="club-confirm">
                  <p>{t.newLinkWarn}</p>
                  <div className="club-actions">
                    <button type="button" className="btn primary" disabled={busy} onClick={() => act("new_link")}>{t.newLinkConfirm}</button>
                    <button type="button" className="btn soft" onClick={() => setConfirm(null)}>{t.cancel}</button>
                  </div>
                </div>
              ) : confirm === "remove" ? (
                <div className="club-confirm">
                  <p>{fill(t.removeWarn, { name: member.name })}</p>
                  <div className="club-actions">
                    <button type="button" className="btn danger" disabled={busy} onClick={() => act("archive_member")}>{t.removeConfirm}</button>
                    <button type="button" className="btn soft" onClick={() => setConfirm(null)}>{t.cancel}</button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className="text-btn" onClick={() => setConfirm("link")}>{t.newLink}</button>
                  <button type="button" className="text-btn club-danger" onClick={() => setConfirm("remove")}>{t.remove}</button>
                </>
              )}
            </div>
          )}
        </form>
      )}
    </dialog>
  );
}

function ClubSettings({ t, club, onClose, onSaved }: { t: ClubText; club: NonNullable<Data["club"]>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(club.name);
  const [color, setColor] = useState(club.color);
  const [logo, setLogo] = useState(club.logo);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/asset?business=${encodeURIComponent(club.id)}&kind=logo`, { method: "POST", credentials: "same-origin", body: file });
    const body = ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    setBusy(false);
    if (r.ok && typeof body.id === "string") setLogo(body.id);
    else setError(errorText(t, { ok: false, status: r.status, body }));
  };
  return (
    <dialog ref={ref} className="club-dialog" onClose={onClose} aria-labelledby="club-settings-title">
      <div className="club-dialog-head">
        <h2 id="club-settings-title">{t.settings}</h2>
        <button type="button" className="icon-btn" aria-label={t.close} onClick={onClose}><X size={18} /></button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const r = await post({ business: club.id, action: "update_club", name, color, logo });
          setBusy(false);
          if (!r.ok) return setError(errorText(t, r));
          onSaved();
          onClose();
        }}
      >
        <label>{t.clubName}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
        <div className="club-field"><span>{t.clubColor}</span><Swatches value={color} onChange={setColor} label={t.clubColor} /></div>
        <div className="club-field">
          <span>{t.logo}</span>
          {logo && <img className="club-logo-preview" src={`/api/asset/${logo}`} alt="" />}
          <div className="club-actions">
            <label className="btn soft small"><ImagePlus size={15} />{t.uploadLogo}<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} /></label>
            {logo && <button type="button" className="btn soft small" onClick={() => setLogo(null)}>{t.removeLogo}</button>}
          </div>
          <small className="club-hint">{t.logoHint}</small>
        </div>
        {error && <p className="club-error" role="alert">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{t.save}</button>
      </form>
    </dialog>
  );
}

export default function ClubDashboard() {
  const { lang, setLang } = useLang();
  const t = CLUB_TEXT[lang];
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [modal, setModal] = useState<null | "add" | "settings" | Member>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const today = useMemo(() => israelToday(), []);

  const load = useCallback(async () => {
    const r = await fetch("/api/club", { credentials: "same-origin" });
    if (r.status === 401) {
      window.location.href = "/club";
      return;
    }
    if (!r.ok) return setFailed(true);
    setFailed(false);
    setData((await r.json()) as Data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const members = useMemo(() => data?.members ?? [], [data]);
  const counts = useMemo(() => {
    const c = { active: 0, expiring: 0, expired: 0 };
    for (const m of members) c[memberStatus(m.validUntil, today)]++;
    return c;
  }, [members, today]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      const status = memberStatus(m.validUntil, today);
      // "Valid" includes members ending soon, the same way the numbers at the top count them.
      if (filter !== "all" && status !== filter && !(filter === "active" && status === "expiring")) return false;
      return !q || m.name.toLowerCase().includes(q) || (m.phone ?? "").includes(q) || String(m.memberNo) === q;
    });
  }, [members, query, filter, today]);
  const plans = useMemo(() => [...new Set(members.map((m) => m.plan).filter((p): p is string => !!p))], [members]);

  const signOut = async () => {
    await fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    window.location.href = "/clubs";
  };
  const subscribe = async () => {
    const r = await fetch("/api/billing/checkout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business: data?.club?.id }) });
    const body = ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    if (r.ok && typeof body.url === "string") window.location.href = body.url;
    else setNotice(errorText(t, { ok: false, status: r.status, body }));
  };

  const club = data?.club ?? null;
  const access = data?.access;
  const free = access?.ok ? access.free : undefined;
  const blocked = access && !access.ok;
  const filters: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: t.all, n: members.length },
    { key: "active", label: t.statusActive, n: counts.active + counts.expiring },
    { key: "expiring", label: t.statusExpiring, n: counts.expiring },
    { key: "expired", label: t.statusExpired, n: counts.expired },
  ];

  return (
    <div className="club-app">
      <header className="club-top">
        <Brand href="/club" />
        <span className="club-top-name">{t.title}</span>
        <div className="club-top-actions">
          <div className="seg" role="group" aria-label="Language">
            {(["he", "ar", "en"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l === "he" ? "עב" : l === "ar" ? "عر" : "EN"}</button>
            ))}
          </div>
          {club && <button className="icon-btn" aria-label={t.settings} title={t.settings} onClick={() => setModal("settings")}><Settings size={17} /></button>}
          <button className="icon-btn" aria-label={t.signOut} title={t.signOut} onClick={signOut}><LogOut size={17} /></button>
        </div>
      </header>
      <main id="main" className="club-main">
        {failed && <p className="club-error" role="alert">{t.error}</p>}
        {!failed && data && !club && <CreateClub t={t} onDone={load} />}
        {club && (
          <>
            <div className="club-head">
              <div className="club-head-name">
                <span className="club-mark" style={{ background: club.color, color: readableOn(club.color) }}>
                  {club.logo ? <img src={`/api/asset/${club.logo}`} alt="" /> : club.name.slice(0, 1)}
                </span>
                <h1>{club.name}</h1>
              </div>
              {!blocked && <button className="btn primary" onClick={() => setModal("add")}><Plus size={18} />{t.addMember}</button>}
            </div>

            {(free || blocked) && (
              <div className="club-plan" role="status">
                <span>{free ? fill(t.freeUsed, { used: free.used, limit: free.limit }) : t.errors[(access as { code: string }).code] ?? t.error}</span>
                {data?.canSubscribe
                  ? <button className="btn primary small" onClick={subscribe}>{t.subscribe}</button>
                  : <a className="btn soft small" href={waLink(WHATSAPP, t.title)} target="_blank" rel="noopener noreferrer">{t.contactUs}</a>}
                {!data?.canSubscribe && <small>{t.subscribeSoon}</small>}
              </div>
            )}
            {notice && <p className="club-error" role="alert">{notice}</p>}

            <section className="club-stats" aria-label={t.statMembers}>
              <div><span>{t.statMembers}</span><strong>{members.length}</strong></div>
              <div><span>{t.statActive}</span><strong>{counts.active + counts.expiring}</strong></div>
              <div><span>{t.statExpiring}</span><strong>{counts.expiring}</strong></div>
              <div><span>{t.statExpired}</span><strong>{counts.expired}</strong></div>
            </section>

            {members.length === 0 ? (
              <p className="club-empty">{t.empty}</p>
            ) : (
              <section className="club-panel club-list-panel" aria-label={t.statMembers}>
                <label className="club-search">
                  <Search size={17} aria-hidden="true" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} aria-label={t.search} />
                </label>
                <div className="club-filters" role="group" aria-label={t.all}>
                  {filters.map((f) => (
                    <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label} <bdi>{f.n}</bdi></button>
                  ))}
                </div>
                {shown.length === 0 ? (
                  <p className="club-empty">{t.noResults}</p>
                ) : (
                  <ul className="club-list">
                    {shown.map((m) => (
                      <li key={m.id}>
                        <button type="button" onClick={() => setModal(m)}>
                          <span className="club-row-main">
                            <strong>{m.name}</strong>
                            <small><bdi>#{m.memberNo}</bdi>{m.plan ? ` · ${m.plan}` : ""}{m.wallet && <> · <Wallet size={12} aria-hidden="true" /> {t.inWallet}</>}</small>
                          </span>
                          <span className="club-row-end">
                            <StatusPill status={memberStatus(m.validUntil, today)} t={t} />
                            <small><bdi>{showDate(m.validUntil)}</bdi></small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {data?.hasStamps && <a className="text-btn center" href="/">{t.stampsLink}</a>}
          </>
        )}
      </main>
      {club && modal === "settings" && <ClubSettings t={t} club={club} onClose={() => setModal(null)} onSaved={load} />}
      {club && modal && modal !== "settings" && (
        <MemberForm
          key={modal === "add" ? "add" : modal.id}
          t={t}
          club={club}
          member={modal === "add" ? null : modal}
          plans={plans}
          today={today}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
