"use client";
import { useMemo, useState } from "react";
import { post } from "../../../lib/api";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { useLang } from "../../../lib/i18n";
import { startDesign, type Kind } from "../../../lib/start-design";

const KIND_OPTIONS: { key: Kind; label: string }[] = [
  { key: "cafe", label: "בית קפה" },
  { key: "barber", label: "מספרה" },
  { key: "pizza", label: "פיצריה" },
  { key: "icecream", label: "גלידריה" },
  { key: "studio", label: "סטודיו / קוסמטיקה" },
  { key: "bakery", label: "מאפייה" },
  { key: "other", label: "אחר" },
];

const ERRORS: Record<string, string> = {
  bad_details: "חסרים פרטים: שם העסק, ההטבה ומספר החותמות (2 עד 30).",
  rate_limited: "נבנו יותר מדי עסקים היום. נסו שוב מחר.",
};

/** The details of a business Perkly builds for a client, with a live preview of the starting card. */
export default function NewBusinessForm() {
  const { t } = useLang();
  const [kind, setKind] = useState<Kind>("cafe");
  const [name, setName] = useState("");
  const [reward, setReward] = useState("");
  const [target, setTarget] = useState(9);
  const [market, setMarket] = useState<"il" | "intl">("il");
  const [cardLang, setCardLang] = useState<"he" | "en">("he");
  // The kind of card: stamps, or a balance card with a percentage of each purchase back.
  const [program, setProgram] = useState<"stamps" | "cashback" | "average">("stamps");
  const [pct, setPct] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const design = useMemo(() => startDesign(kind, name || "שם העסק", reward || "ההטבה", cardLang), [kind, name, reward, cardLang]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const r = await post<{ id: string }>("/api/loyalty", {
      action: "create_business", forClient: true, kind, name: name.trim(), reward: reward.trim(), target, color: design.colors.bg, rewardMode: "bank",
      lang: cardLang, market, setupDays: Number(f.get("setupDays")),
      program, cashbackBp: Math.round(pct * 100), cashbackMin: Math.round(Number(f.get("cashbackMin") || 0) * 100), avgCap: Math.round(Number(f.get("avgCap") || 0) * 100),
      branchName: String(f.get("branchName") ?? "").trim() || name.trim(), branchAddress: String(f.get("branchAddress") ?? "").trim(),
    });
    if (r.ok && r.data?.id) {
      // Straight to the card design of the new business.
      window.location.href = `/?business=${encodeURIComponent(r.data.id)}#design`;
      return;
    }
    setError((!r.ok && ERRORS[r.code ?? ""]) || "לא הצלחנו לבנות את העסק. נסו שוב.");
    setBusy(false);
  }

  return (
    <div className="admin-new">
      <form className="panel admin-new-form" onSubmit={submit}>
        <fieldset className="admin-kinds">
          <legend>סוג העסק</legend>
          {KIND_OPTIONS.map((k) => (
            <button key={k.key} type="button" className={"btn small " + (kind === k.key ? "primary" : "soft")} aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</button>
          ))}
        </fieldset>
        <fieldset className="admin-kinds">
          <legend>סוג הכרטיס</legend>
          <button type="button" className={"btn small " + (program === "stamps" ? "primary" : "soft")} aria-pressed={program === "stamps"} onClick={() => setProgram("stamps")}>כרטיס חותמות</button>
          <button type="button" className={"btn small " + (program === "cashback" ? "primary" : "soft")} aria-pressed={program === "cashback"}
            onClick={() => { setProgram("cashback"); if (!reward.trim()) setReward(`${pct}% מכל קנייה חוזרים אליכם ליתרה`); }}>כרטיס יתרה (אחוז מכל קנייה)</button>
          <button type="button" className={"btn small " + (program === "average" ? "primary" : "soft")} aria-pressed={program === "average"}
            onClick={() => { setProgram("average"); setTarget(4); if (!reward.trim()) setReward("קונים 4, החמישית עלינו לפי ממוצע הקניות"); }}>קנה X, הבאה חינם לפי ממוצע</button>
        </fieldset>
        {program === "cashback" && (
          <div className="admin-new-row">
            <label>אחוז חזרה (%)<input type="number" inputMode="decimal" min={0.1} max={50} step={0.1} required dir="ltr" value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
            <label>יתרה מינימלית לשימוש<input name="cashbackMin" type="number" inputMode="decimal" min={0} step={0.01} dir="ltr" defaultValue={0} /></label>
          </div>
        )}
        <label>שם העסק<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>{program === "cashback" ? "תיאור ההטבה בכרטיס" : "ההטבה"}<input required maxLength={160} value={reward} onChange={(e) => setReward(e.target.value)} placeholder="למשל: קפה חינם" /></label>
        {program !== "cashback" && <label>{program === "average" ? "כמה קניות בסבב (למשל 4 = הקנייה החמישית חינם)" : "חותמות להטבה"}<input type="number" required min={2} max={30} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>}
        {program === "average" && <label>תקרה להטבה (0 = בלי תקרה)<input name="avgCap" type="number" inputMode="decimal" min={0} step={0.01} dir="ltr" defaultValue={0} /></label>}
        <label>שם הסניף<input name="branchName" maxLength={60} placeholder="ריק = שם העסק" /></label>
        <label>כתובת הסניף<input name="branchAddress" maxLength={160} placeholder="רחוב, מספר ועיר" /></label>
        <div className="admin-new-row">
          <label>שוק
            <select value={market} onChange={(e) => { const m = e.target.value as "il" | "intl"; setMarket(m); setCardLang(m === "intl" ? "en" : "he"); }}>
              <option value="il">ישראל (₪)</option>
              <option value="intl">חו&quot;ל ($)</option>
            </select>
          </label>
          <label>שפת הכרטיס
            <select value={cardLang} onChange={(e) => setCardLang(e.target.value as "he" | "en")}>
              <option value="he">עברית</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>תקופת הקמה חינם
            <select name="setupDays" defaultValue="30">
              {[14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} ימים</option>)}
            </select>
          </label>
        </div>
        <small className="form-hint">העסק נבנה תחת החשבון שלך עד שבעל העסק מקבל אותו. בתקופת ההקמה יש גישה מלאה: לוגו, תמונות וחותמות.</small>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "בונה..." : "בניית העסק ומעבר לעיצוב"}</button>
      </form>
      <div className="admin-new-preview" aria-label="תצוגה מקדימה של הכרטיס">
        <p className="muted">הכרטיס ההתחלתי. את העיצוב הסופי עושים במסך הבא.</p>
        <LoyaltyCard design={design} lang={cardLang} stamps={Math.min(3, target)} target={target} customerName={t("sampleCustomer")} t={t} />
      </div>
    </div>
  );
}
