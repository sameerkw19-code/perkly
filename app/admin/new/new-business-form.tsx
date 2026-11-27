"use client";
import { useMemo, useState } from "react";
import { BookOpen, CalendarClock, Check, ClipboardCheck, Crown, Gift, ShoppingCart, Stamp, Ticket, TicketPercent, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { post } from "../../../lib/api";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { useLang } from "../../../lib/i18n";
import { startDesign, type Kind } from "../../../lib/start-design";
import { formatMoney } from "../../../lib/cashback";
import { isSimple, sampleFace, type SimpleProgram } from "../../../lib/programs";

type Program = "stamps" | "cashback" | "average" | "appointments" | "library" | SimpleProgram;

// Every card type: its name, who it is for, the line that starts the card, and what it does.
type CardType = { key: Program; icon: LucideIcon; name: string; fits: string; line: string; hint: string };
const CARD: Record<Program, CardType> = {
  stamps: { key: "stamps", icon: Stamp, name: "כרטיס חותמות", fits: "בתי קפה, מאפיות, פיצריות", line: "",
    hint: "כל ביקור מקבל חותמת, וכשהכרטיס מתמלא הלקוח מקבל את ההטבה." },
  cashback: { key: "cashback", icon: Wallet, name: "יתרה מכל קנייה", fits: "סופרמרקטים, חנויות, מכולות", line: "",
    hint: "בלי חותמות: אחוז מכל קנייה חוזר ללקוח כיתרה, והוא משתמש בה בקנייה הבאה." },
  average: { key: "average", icon: ShoppingCart, name: "קנה X, הבאה חינם", fits: "מסעדות וחנויות עם סל משתנה", line: "קונים 4, החמישית עלינו לפי ממוצע הקניות",
    hint: "סופרים קניות. אחרי מספר הקניות שקבעתם, הקנייה הבאה חינם בשווי ממוצע הקניות הקודמות, עם תקרה אם רוצים." },
  club: { key: "club", icon: Crown, name: "חבר מועדון", fits: "הנחה קבועה לכל חבר", line: "הנחה קבועה לחברי מועדון",
    hint: "הלקוח מציג את הכרטיס ומקבל אחוז הנחה קבוע. את האחוז קובעים בהגדרות העסק (ברירת מחדל 10%)." },
  pass: { key: "pass", icon: Ticket, name: "כרטיסייה מראש", fits: "חדרי כושר, שטיפת רכב, סטודיו", line: "כרטיסייה של 10 כניסות",
    hint: "הלקוח קונה בקופה כרטיסייה של כמה כניסות, והכרטיס סופר אחורה עם תאריך תוקף. תזכורת כשנשארות 2 כניסות ושבוע לפני שהתוקף נגמר. מספר הכניסות והתוקף בהגדרות העסק." },
  gift: { key: "gift", icon: Gift, name: "כרטיס מתנה", fits: "כל עסק שמוכר מתנות", line: "כרטיס מתנה לשימוש בעסק",
    hint: "קונים בקופה: העובד טוען סכום ושולח את הקישור למקבל המתנה. היתרה יורדת בכל קנייה עד שנגמרת." },
  coupon: { key: "coupon", icon: TicketPercent, name: "שובר חד־פעמי", fits: "קמפיין, פתיחה, אירוע", line: "קפה חינם",
    hint: "כל מי שמצטרף מהקישור או מה־QR מקבל את השובר פעם אחת. העובד מממש אותו בעמדה. תאריך התוקף בהגדרות העסק." },
  appointments: { key: "appointments", icon: CalendarClock, name: "כרטיס תורים", fits: "מספרות, קליניקות, קוסמטיקה", line: "תזכורת לפני כל תור",
    hint: "בלי חותמות והנחות: בכרטיס של הלקוח מופיע התור הבא שלו, והוא מקבל תזכורת יום לפני, בבוקר של אותו יום ושעה לפני. את התור קובעים בעמדת העובד." },
  service: { key: "service", icon: Wrench, name: "טיפול תקופתי", fits: "מוסכים, וטרינרים, מזגנים", line: "תזכורת לפני הטיפול הבא",
    hint: "בכרטיס מופיע תאריך הטיפול הבא, עם תזכורת חודש ושבוע לפני. \"הטיפול בוצע\" בעמדה קובע את הבא לפי מספר החודשים בהגדרות." },
  library: { key: "library", icon: BookOpen, name: "כרטיס ספרייה", fits: "ספריות והשאלת ציוד", line: "תזכורת לפני החזרת כל ספר",
    hint: "בלי חותמות: בכרטיס של הקורא מופיעים הספרים שאצלו ותאריך ההחזרה. תזכורת שבוע לפני, יום לפני וביום ההחזרה, והקורא יכול להאריך מהכרטיס. את ההשאלה רושמים בעמדת העובד." },
  attendance: { key: "attendance", icon: ClipboardCheck, name: "נוכחות בחוגים", fits: "חוגים ושיעורים קבועים", line: "נוכחות ותזכורת תשלום",
    hint: "העובד מסמן נוכחות בכל שיעור, וההורה רואה כמה שיעורים היו החודש ומתי התשלום הבא. תזכורת יום לפני התשלום." },
};

// The card types in three groups, in the order the arrow keys move through them.
const GROUPS: { id: string; title: string; keys: Program[] }[] = [
  { id: "loyal", title: "נאמנות", keys: ["stamps", "cashback", "average", "club"] },
  { id: "prepaid", title: "תשלום מראש ומתנות", keys: ["pass", "gift", "coupon"] },
  { id: "remind", title: "תזכורות", keys: ["appointments", "service", "library", "attendance"] },
];

// The business kind sets the starting design and suggests a card.
const KIND_OPTIONS: { key: Kind; label: string; card?: Program }[] = [
  { key: "cafe", label: "בית קפה", card: "stamps" },
  { key: "barber", label: "מספרה", card: "appointments" },
  { key: "pizza", label: "פיצריה", card: "stamps" },
  { key: "icecream", label: "גלידריה", card: "stamps" },
  { key: "studio", label: "סטודיו / קוסמטיקה", card: "appointments" },
  { key: "bakery", label: "מאפייה", card: "stamps" },
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
  // The card line was filled in by the card type (not typed), so a new card type may replace it.
  const [rewardAuto, setRewardAuto] = useState(true);
  const [target, setTarget] = useState(9);
  const [market, setMarket] = useState<"il" | "intl">("il");
  const [cardLang, setCardLang] = useState<"he" | "en">("he");
  const [program, setProgram] = useState<Program>("stamps");
  // Until the admin picks a card type, the business kind picks the suggested one.
  const [picked, setPicked] = useState(false);
  const [pct, setPct] = useState(2);
  const [cbMin, setCbMin] = useState(0);
  // The balance card's line follows the percentage until the admin writes their own.
  const cbLine = (p: number) => `${p}% מכל קנייה חוזרים אליכם ליתרה`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currency = market === "intl" ? "USD" : "ILS";
  const design = useMemo(() => startDesign(kind, name || "שם העסק", reward || "ההטבה", cardLang), [kind, name, reward, cardLang]);
  const suggested = KIND_OPTIONS.find((k) => k.key === kind)?.card;
  const usesTarget = program === "stamps" || program === "average";

  /** Switches the card type, with its starting line and its number of stamps or purchases. */
  function choose(p: Program) {
    if (p === program) return;
    setProgram(p);
    setTarget(p === "stamps" ? 9 : p === "average" ? 4 : 10);
    if (rewardAuto || !reward.trim()) {
      setReward(p === "cashback" ? cbLine(pct) : CARD[p].line);
      setRewardAuto(true);
    }
  }

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

  const rewardLabel = program === "cashback" ? "תיאור ההטבה בכרטיס" : program === "coupon" ? "מה השובר נותן (מופיע בכרטיס)" : program === "stamps" || program === "average" ? "ההטבה" : "שורה קצרה בכרטיס";

  return (
    <div className="admin-new">
      <form className="panel admin-new-form" onSubmit={submit}>
        <section className="anf-step" aria-labelledby="anf-1">
          <h2 id="anf-1"><span className="anf-num" aria-hidden="true">1</span>העסק</h2>
          <label>שם העסק<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: קפה רוטשילד" /></label>
          <fieldset className="anf-set">
            <legend>סוג העסק <small className="muted">(קובע את העיצוב ההתחלתי)</small></legend>
            <div className="anf-chips">
              {KIND_OPTIONS.map((k) => (
                <label key={k.key} className={"anf-chip" + (kind === k.key ? " is-on" : "")}>
                  <input type="radio" name="kind" value={k.key} className="sr-only" checked={kind === k.key}
                    onChange={() => { setKind(k.key); if (!picked && k.card) choose(k.card); }} />
                  {kind === k.key && <Check size={15} aria-hidden="true" />}{k.label}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="anf-step" aria-labelledby="anf-2">
          <h2 id="anf-2"><span className="anf-num" aria-hidden="true">2</span>סוג הכרטיס</h2>
          <fieldset className="anf-set">
            <legend className="sr-only">סוג הכרטיס</legend>
            {GROUPS.map((g) => (
              <div key={g.id} className="anf-group" role="group" aria-labelledby={`anf-g-${g.id}`}>
                <p className="anf-group-title" id={`anf-g-${g.id}`}>{g.title}</p>
                <div className="anf-grid">
                  {g.keys.map((key) => {
                    const c = CARD[key];
                    const on = program === key;
                    return (
                      <label key={key} className={"anf-type" + (on ? " is-on" : "")}>
                        <input type="radio" name="program" value={key} className="sr-only" checked={on} onChange={() => { choose(key); setPicked(true); }} />
                        <span className="anf-icon" aria-hidden="true"><c.icon size={19} /></span>
                        <span className="anf-text"><b>{c.name}</b><small>{c.fits}</small></span>
                        {suggested === key && <span className="anf-rec">מומלץ</span>}
                        {on && <span className="anf-tick" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
          <p className="anf-hint"><strong>{CARD[program].name}:</strong> {CARD[program].hint}</p>
          {program === "cashback" && (
            <div className="admin-new-row">
              <label>אחוז חזרה (%)<input type="number" inputMode="decimal" min={0.1} max={50} step={0.1} required dir="ltr" value={pct} onChange={(e) => { const v = Number(e.target.value); if (reward === cbLine(pct)) setReward(cbLine(v)); setPct(v); }} /></label>
              <label>יתרה מינימלית לשימוש<input name="cashbackMin" type="number" inputMode="decimal" min={0} step={0.01} dir="ltr" value={cbMin} onChange={(e) => setCbMin(Number(e.target.value))} /></label>
            </div>
          )}
          <label>{rewardLabel}<input required maxLength={160} value={reward} onChange={(e) => { setReward(e.target.value); setRewardAuto(false); }} placeholder="למשל: קפה חינם" /></label>
          {usesTarget && (
            <div className="admin-new-row">
              <label>{program === "average" ? "כמה קניות בסבב (4 = החמישית חינם)" : "חותמות להטבה"}<input type="number" required min={2} max={program === "average" ? 50 : 30} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
              {program === "average" && <label>תקרה להטבה (0 = בלי תקרה)<input name="avgCap" type="number" inputMode="decimal" min={0} step={0.01} dir="ltr" defaultValue={0} /></label>}
            </div>
          )}
        </section>

        <section className="anf-step" aria-labelledby="anf-3">
          <h2 id="anf-3"><span className="anf-num" aria-hidden="true">3</span>סניף והגדרות</h2>
          <div className="admin-new-row">
            <label>שם הסניף<input name="branchName" maxLength={60} placeholder="ריק = שם העסק" /></label>
            <label>כתובת הסניף<input name="branchAddress" maxLength={160} placeholder="רחוב, מספר ועיר" /></label>
          </div>
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
        </section>

        <div className="anf-foot">
          <small className="form-hint">העסק נבנה תחת החשבון שלך עד שבעל העסק מקבל אותו. בתקופת ההקמה יש גישה מלאה: לוגו, תמונות וחותמות.</small>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary anf-submit" disabled={busy}>{busy ? "בונה..." : "בניית העסק ומעבר לעיצוב"}</button>
        </div>
      </form>
      <div className="admin-new-preview" aria-label="תצוגה מקדימה של הכרטיס">
        <p className="muted">הכרטיס ההתחלתי. את העיצוב הסופי עושים במסך הבא.</p>
        <LoyaltyCard design={design} lang={cardLang} stamps={usesTarget ? Math.min(3, target) : 0} target={target} customerName={t("sampleCustomer")} t={t}
          balance={program === "cashback" ? { text: formatMoney(2450, currency, cardLang), pct: `${pct}%`, min: cbMin > 0 ? formatMoney(Math.round(cbMin * 100), currency, cardLang) : undefined } : undefined}
          average={program === "average" ? { soFar: formatMoney(3800, currency, cardLang) } : undefined}
          appointment={program === "appointments" ? { text: null } : undefined}
          library={program === "library" ? { next: null, count: 0 } : undefined}
          face={isSimple(program) ? sampleFace(program, cardLang, (m) => formatMoney(m, currency, cardLang), { club_pct: 10, reward }) : undefined} />
      </div>
    </div>
  );
}
