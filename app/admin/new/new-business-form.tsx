"use client";
import { useMemo, useState } from "react";
import { post } from "../../../lib/api";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { useLang } from "../../../lib/i18n";
import { startDesign, type Kind } from "../../../lib/start-design";
import { formatMoney } from "../../../lib/cashback";
import { isSimple, sampleFace, type SimpleProgram } from "../../../lib/programs";

// The six simpler cards: the button, the line that starts the card, and what it does.
const SIMPLE_OPTIONS: { key: SimpleProgram; label: string; line: string; hint: string }[] = [
  { key: "pass", label: "כרטיסייה מראש (כניסות)", line: "כרטיסייה של 10 כניסות", hint: "הלקוח קונה בקופה כרטיסייה של כמה כניסות, והכרטיס סופר אחורה עם תאריך תוקף. תזכורת כשנשארות 2 כניסות ושבוע לפני שהתוקף נגמר. מספר הכניסות והתוקף בהגדרות העסק." },
  { key: "gift", label: "כרטיס מתנה", line: "כרטיס מתנה לשימוש בעסק", hint: "קונים בקופה: העובד טוען סכום ושולח את הקישור למקבל המתנה. היתרה יורדת בכל קנייה עד שנגמרת." },
  { key: "club", label: "חבר מועדון (הנחה קבועה)", line: "הנחה קבועה לחברי מועדון", hint: "הלקוח מציג את הכרטיס ומקבל אחוז הנחה קבוע. את האחוז קובעים בהגדרות העסק (ברירת מחדל 10%)." },
  { key: "service", label: "טיפול תקופתי (מוסכים, וטרינרים)", line: "תזכורת לפני הטיפול הבא", hint: "בכרטיס מופיע תאריך הטיפול הבא, עם תזכורת חודש ושבוע לפני. \"הטיפול בוצע\" בעמדה קובע את הבא לפי מספר החודשים בהגדרות." },
  { key: "coupon", label: "שובר חד־פעמי (קמפיין)", line: "קפה חינם", hint: "כל מי שמצטרף מהקישור או מה־QR מקבל את השובר פעם אחת. העובד מממש אותו בעמדה. תאריך התוקף בהגדרות העסק." },
  { key: "attendance", label: "נוכחות בחוגים", line: "נוכחות ותזכורת תשלום", hint: "העובד מסמן נוכחות בכל שיעור, וההורה רואה כמה שיעורים היו החודש ומתי התשלום הבא. תזכורת יום לפני התשלום." },
];

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
  const [program, setProgram] = useState<"stamps" | "cashback" | "average" | "appointments" | "library" | SimpleProgram>("stamps");
  const [pct, setPct] = useState(2);
  const [cbMin, setCbMin] = useState(0);
  // The balance card's line follows the percentage until the admin writes their own.
  const cbLine = (p: number) => `${p}% מכל קנייה חוזרים אליכם ליתרה`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currency = market === "intl" ? "USD" : "ILS";
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
      // To the business's build steps: design, branches, the QR sign, the owner and the staff.
      window.location.href = `/admin/b/${encodeURIComponent(r.data.id)}`;
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
          <button type="button" className={"btn small " + (program === "stamps" ? "primary" : "soft")} aria-pressed={program === "stamps"} onClick={() => { setProgram("stamps"); setTarget((n) => Math.min(n, 30)); if (program === "cashback" || program === "appointments" || program === "library" || isSimple(program)) setReward(""); }}>כרטיס חותמות</button>
          <button type="button" className={"btn small " + (program === "cashback" ? "primary" : "soft")} aria-pressed={program === "cashback"}
            onClick={() => { setProgram("cashback"); setTarget(10); setReward(cbLine(pct)); }}>כרטיס יתרה (אחוז מכל קנייה)</button>
          <button type="button" className={"btn small " + (program === "average" ? "primary" : "soft")} aria-pressed={program === "average"}
            onClick={() => { setProgram("average"); setTarget(4); if (!reward.trim()) setReward("קונים 4, החמישית עלינו לפי ממוצע הקניות"); }}>קנה X, הבאה חינם לפי ממוצע</button>
          <button type="button" className={"btn small " + (program === "appointments" ? "primary" : "soft")} aria-pressed={program === "appointments"}
            onClick={() => { setProgram("appointments"); setTarget(10); setReward("תזכורת לפני כל תור"); }}>כרטיס תורים (קליניקות)</button>
          <button type="button" className={"btn small " + (program === "library" ? "primary" : "soft")} aria-pressed={program === "library"}
            onClick={() => { setProgram("library"); setTarget(10); setReward("תזכורת לפני החזרת כל ספר"); }}>כרטיס ספרייה (השאלות)</button>
          {SIMPLE_OPTIONS.map((o) => (
            <button key={o.key} type="button" className={"btn small " + (program === o.key ? "primary" : "soft")} aria-pressed={program === o.key}
              onClick={() => { setProgram(o.key); setTarget(10); setReward(o.line); }}>{o.label}</button>
          ))}
        </fieldset>
        {isSimple(program) && <p className="form-hint">{SIMPLE_OPTIONS.find((o) => o.key === program)!.hint}</p>}
        {program === "appointments" && (
          <p className="form-hint">בלי חותמות והנחות: בכרטיס של הלקוח מופיע התור הבא שלו, והוא מקבל תזכורת יום לפני, בבוקר של אותו יום ושעה לפני. את התור קובעים בעמדת העובד.</p>
        )}
        {program === "library" && (
          <p className="form-hint">בלי חותמות: בכרטיס של הקורא מופיעים הספרים שאצלו ותאריך ההחזרה. תזכורת שבוע לפני, יום לפני וביום ההחזרה, והקורא יכול להאריך מהכרטיס. את ההשאלה רושמים בעמדת העובד.</p>
        )}
        {program === "cashback" && (
          <div className="admin-new-row">
            <label>אחוז חזרה (%)<input type="number" inputMode="decimal" min={0.1} max={50} step={0.1} required dir="ltr" value={pct} onChange={(e) => { const v = Number(e.target.value); if (reward === cbLine(pct)) setReward(cbLine(v)); setPct(v); }} /></label>
            <label>יתרה מינימלית לשימוש<input name="cashbackMin" type="number" inputMode="decimal" min={0} step={0.01} dir="ltr" value={cbMin} onChange={(e) => setCbMin(Number(e.target.value))} /></label>
          </div>
        )}
        <label>שם העסק<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>{program === "cashback" ? "תיאור ההטבה בכרטיס" : program === "coupon" ? "מה השובר נותן (מופיע בכרטיס)" : program === "appointments" || program === "library" || isSimple(program) ? "שורה קצרה בכרטיס" : "ההטבה"}<input required maxLength={160} value={reward} onChange={(e) => setReward(e.target.value)} placeholder="למשל: קפה חינם" /></label>
        {program !== "cashback" && program !== "appointments" && program !== "library" && !isSimple(program) && <label>{program === "average" ? "כמה קניות בסבב (למשל 4 = הקנייה החמישית חינם)" : "חותמות להטבה"}<input type="number" required min={2} max={program === "average" ? 50 : 30} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>}
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
        <LoyaltyCard design={design} lang={cardLang} stamps={program === "cashback" || program === "appointments" || program === "library" || isSimple(program) ? 0 : Math.min(3, target)} target={target} customerName={t("sampleCustomer")} t={t}
          balance={program === "cashback" ? { text: formatMoney(2450, currency, cardLang), pct: `${pct}%`, min: cbMin > 0 ? formatMoney(Math.round(cbMin * 100), currency, cardLang) : undefined } : undefined}
          average={program === "average" ? { soFar: formatMoney(3800, currency, cardLang) } : undefined}
          appointment={program === "appointments" ? { text: null } : undefined}
          library={program === "library" ? { next: null, count: 0 } : undefined}
          face={isSimple(program) ? sampleFace(program, cardLang, (m) => formatMoney(m, currency, cardLang), { club_pct: 10, reward }) : undefined} />
      </div>
    </div>
  );
}
