"use client";
import { useState } from "react";
import { Cake, Gift, LayoutDashboard, Palette, ScanLine, ShieldCheck, Store, Users, Wallet } from "lucide-react";
import { useLang } from "../lib/i18n";
import type { Lang } from "../lib/i18n-types";
import { LangSwitch } from "../components/lang-switch";
import { LoyaltyCard } from "../components/loyalty-card";
import { defaultDesign, type Design } from "../lib/design";

type Copy = Record<string, [string, string, string]>;

// Landing text in Hebrew, Arabic and English. Only features that exist today are listed.
const C: Copy = {
  signIn: ["כניסה", "دخول", "Sign in"],
  start: ["פתיחת חשבון", "فتح حساب", "Create account"],
  heroTitle: ["כרטיס נאמנות דיגיטלי לעסק שלך", "بطاقة ولاء رقمية لمشروعك", "A digital loyalty card for your business"],
  heroSub: [
    "בלי אפליקציה ובלי כרטיסי נייר. הלקוח מצטרף בסריקה, העובד מוסיף חותמת מהטלפון, וההטבה מחכה.",
    "بدون تطبيق وبدون بطاقات ورقية. الزبون ينضم بمسح الرمز، والموظف يضيف الختم من الهاتف، والمكافأة بانتظاره.",
    "No app and no paper cards. Customers join with a scan, staff add stamps from a phone, and the reward is waiting.",
  ],
  heroCta: ["מתחילים עכשיו", "ابدأ الآن", "Get started"],
  howLink: ["איך זה עובד", "كيف يعمل", "How it works"],
  howTitle: ["איך זה עובד", "كيف يعمل", "How it works"],
  step1t: ["פותחים חשבון ומעצבים כרטיס", "افتح حساباً وصمّم البطاقة", "Open an account and design your card"],
  step1d: ["שם, הטבה, צבעים ולוגו. כמה דקות וזה מוכן.", "الاسم، المكافأة، الألوان والشعار. دقائق وتكون جاهزة.", "Name, reward, colors and logo. Ready in minutes."],
  step2t: ["הלקוח סורק ומצטרף", "الزبون يمسح وينضم", "Customers scan and join"],
  step2d: ["קוד QR בקופה. שם וטלפון, והכרטיס אצלו בטלפון.", "رمز QR عند الصندوق. الاسم والهاتف، والبطاقة في هاتفه.", "A QR code at the counter. Name and phone, and the card is on their phone."],
  step3t: ["העובד מוסיף חותמת", "الموظف يضيف ختماً", "Staff add a stamp"],
  step3d: ["סורקים את הכרטיס ומאשרים. כשהכרטיס מתמלא, ההטבה מחכה.", "يمسح البطاقة ويؤكد. عندما تمتلئ، المكافأة بانتظار الزبون.", "Scan the card and confirm. When it fills up, the reward is waiting."],
  featTitle: ["מה מקבלים", "ماذا تحصل", "What you get"],
  f1t: ["עיצוב משלכם", "تصميم خاص بك", "Your own design"],
  f1d: ["צבעים, גרדיינט, תמונת רקע, גופן, אייקון חותמת או תמונת מוצר.", "ألوان، تدرج، صورة خلفية، خط، أيقونة ختم أو صورة منتج.", "Colors, gradients, a photo background, fonts, a stamp icon or product photo."],
  f2t: ["Google Wallet", "Google Wallet", "Google Wallet"],
  f2d: ["הלקוח שומר את הכרטיס בארנק, והחותמות מתעדכנות לבד.", "الزبون يحفظ البطاقة في المحفظة، والأختام تتحدث تلقائياً.", "Customers save the card to their wallet, and stamps update by themselves."],
  f3t: ["עמדת עובד", "محطة الموظف", "Staff station"],
  f3d: ["סריקה מהמצלמה או חיפוש לפי שם וטלפון. כל פעולה מאושרת ונרשמת.", "مسح بالكاميرا أو بحث بالاسم والهاتف. كل عملية مؤكدة ومسجّلة.", "Scan with the camera or search by name and phone. Every action is confirmed and logged."],
  f4t: ["צוות וסניפים", "طاقم وفروع", "Team and branches"],
  f4d: ["מזמינים עובדים, מחלקים לסניפים, ורואים מי עשה מה.", "دعوة موظفين، توزيع على فروع، ومعرفة من فعل ماذا.", "Invite staff, split by branch, and see who did what."],
  f5t: ["ימי הולדת", "أعياد الميلاد", "Birthdays"],
  f5d: ["רשימת ימי ההולדת של השבוע, כדי לפנק בזמן. אפשר לכבות.", "قائمة أعياد ميلاد الأسبوع لتدليل الزبائن في الوقت. يمكن إيقافها.", "This week's birthdays, so you can treat customers on time. Can be turned off."],
  f6t: ["נתונים והתראות", "بيانات وتنبيهات", "Data and alerts"],
  f6d: ["לקוחות, חותמות והטבות לפי תקופה, התראות על פעילות חריגה, וייצוא לאקסל.", "زبائن، أختام ومكافآت حسب الفترة، تنبيهات على نشاط غير عادي، وتصدير للإكسل.", "Customers, stamps and rewards by period, alerts on unusual activity, and Excel export."],
  priceTitle: ["מחיר", "السعر", "Pricing"],
  perMonth: ["לחודש", "شهرياً", "per month"],
  price1: ["בלי דמי הקמה", "بدون رسوم تأسيس", "No setup fee"],
  price2: ["ביטול בכל עת", "إلغاء في أي وقت", "Cancel anytime"],
  price3: ["כל התכונות כלולות", "كل الميزات مشمولة", "All features included"],
  trial: ["{n} ימי ניסיון בחינם", "{n} يوم تجربة مجانية", "{n}-day free trial"],
  faqTitle: ["שאלות נפוצות", "أسئلة شائعة", "Questions"],
  q1: ["הלקוחות צריכים להוריד אפליקציה?", "هل يحتاج الزبائن لتنزيل تطبيق؟", "Do customers need an app?"],
  a1: ["לא. הכרטיס נפתח בדפדפן, ואפשר לשמור אותו במסך הבית או ב-Google Wallet.", "لا. البطاقة تفتح في المتصفح، ويمكن حفظها في الشاشة الرئيسية أو Google Wallet.", "No. The card opens in the browser and can be saved to the home screen or Google Wallet."],
  q2: ["מה קורה עם הפרטים של הלקוחות?", "ماذا يحدث لبيانات الزبائن؟", "What happens to customer details?"],
  a2: ["הם שייכים לעסק שלכם בלבד. אנחנו לא שולחים להם פרסום ולא מוכרים מידע.", "هي لمشروعك فقط. لا نرسل لهم إعلانات ولا نبيع البيانات.", "They belong to your business only. We never send them ads or sell data."],
  q3: ["מה אם אפסיק את המנוי?", "ماذا لو أوقفت الاشتراك؟", "What if I cancel?"],
  a3: ["הנתונים נשמרים, והלקוחות יכולים לממש הטבות שכבר צברו. רק הוספת חותמות נעצרת.", "البيانات محفوظة، والزبائن يمكنهم استخدام المكافآت التي جمعوها. فقط إضافة الأختام تتوقف.", "Your data stays, and customers can still redeem rewards they earned. Only new stamps pause."],
  ctaTitle: ["מוכנים להתחיל?", "جاهز للبدء؟", "Ready to start?"],
  ctaSub: ["פותחים חשבון, מעצבים כרטיס ותולים QR בקופה.", "افتح حساباً، صمّم البطاقة وعلّق رمز QR عند الصندوق.", "Open an account, design your card and put a QR at the counter."],
  support: ["תמיכה", "الدعم", "Support"],
  terms: ["תנאי שימוש", "شروط الاستخدام", "Terms"],
  privacy: ["מדיניות פרטיות", "سياسة الخصوصية", "Privacy"],
};

const LANG_INDEX: Record<Lang, number> = { he: 0, ar: 1, en: 2 };

/** A sample card for the hero, using the real card component. */
function sampleDesign(lang: Lang): Design {
  const d = defaultDesign({ name: "Café Shalom", reward: "", color: "#0E8A4F" });
  const reward = { he: "הקפה העשירי עלינו", ar: "القهوة العاشرة علينا", en: "Your 10th coffee is on us" };
  for (const l of ["he", "ar", "en"] as Lang[]) d.texts[l] = { ...d.texts[l], title: "Café Shalom", reward: reward[l] };
  d.colors = { bg: "#0E8A4F", fg: "#FFFFFF", stamp: "#F4BF34" };
  d.look = { ...d.look, bg2: "#043F2B", dir: "diag" };
  void lang;
  return d;
}

export default function Landing({ trialDays }: { trialDays: number | null }) {
  const { lang, setLang, t, dir } = useLang();
  const [design] = useState(() => sampleDesign("he"));
  const L = (key: keyof typeof C, vars?: Record<string, string | number>) => {
    let s = C[key][LANG_INDEX[lang]];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
  const features = [
    { icon: Palette, t: L("f1t"), d: L("f1d") },
    { icon: Wallet, t: L("f2t"), d: L("f2d") },
    { icon: ScanLine, t: L("f3t"), d: L("f3d") },
    { icon: Users, t: L("f4t"), d: L("f4d") },
    { icon: Cake, t: L("f5t"), d: L("f5d") },
    { icon: LayoutDashboard, t: L("f6t"), d: L("f6d") },
  ];

  return (
    <div className="lp" dir={dir}>
      <header className="lp-top">
        <a className="brand" href="/">perkly<span>.</span></a>
        <div className="lp-top-actions">
          <LangSwitch lang={lang} setLang={setLang} />
          <a className="lp-link" href="/login">{L("signIn")}</a>
          <a className="btn primary small" href="/login?mode=signup">{L("start")}</a>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <h1>{L("heroTitle")}</h1>
          <p>{L("heroSub")}</p>
          <div className="lp-hero-cta">
            <a className="btn primary" href="/login?mode=signup">{L("heroCta")}</a>
            <a className="btn soft" href="#how">{L("howLink")}</a>
          </div>
          <p className="lp-price-hint">99 ₪ / {L("perMonth")} · {L("price1")}{trialDays ? ` · ${L("trial", { n: trialDays })}` : ""}</p>
        </div>
        <div className="lp-hero-card" aria-hidden="true">
          <LoyaltyCard design={design} lang={lang} stamps={6} target={9} customerName={t("sampleCustomer")} t={t} />
        </div>
      </section>

      <section className="lp-section" id="how">
        <h2>{L("howTitle")}</h2>
        <ol className="lp-steps">
          {([["step1t", "step1d", Store], ["step2t", "step2d", ScanLine], ["step3t", "step3d", Gift]] as const).map(([tt, dd, Icon], i) => (
            <li key={tt}>
              <span className="lp-step-num">{i + 1}</span>
              <Icon size={22} aria-hidden="true" />
              <h3>{L(tt)}</h3>
              <p>{L(dd)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section">
        <h2>{L("featTitle")}</h2>
        <div className="lp-features">
          {features.map((f) => (
            <div className="lp-feature" key={f.t}>
              <span className="lp-feature-icon"><f.icon size={20} aria-hidden="true" /></span>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2>{L("priceTitle")}</h2>
        <div className="lp-price">
          <div className="lp-price-amount"><b>99 ₪</b><span>{L("perMonth")}</span></div>
          {trialDays ? <p className="lp-trial">{L("trial", { n: trialDays })}</p> : null}
          <ul>
            <li><ShieldCheck size={16} aria-hidden="true" />{L("price1")}</li>
            <li><ShieldCheck size={16} aria-hidden="true" />{L("price2")}</li>
            <li><ShieldCheck size={16} aria-hidden="true" />{L("price3")}</li>
          </ul>
          <a className="btn primary wide" href="/login?mode=signup">{L("heroCta")}</a>
        </div>
      </section>

      <section className="lp-section">
        <h2>{L("faqTitle")}</h2>
        <div className="lp-faq">
          {(["1", "2", "3"] as const).map((n) => (
            <details key={n}>
              <summary>{L(`q${n}` as keyof typeof C)}</summary>
              <p>{L(`a${n}` as keyof typeof C)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-cta">
        <h2>{L("ctaTitle")}</h2>
        <p>{L("ctaSub")}</p>
        <a className="btn lime" href="/login?mode=signup">{L("heroCta")}</a>
      </section>

      <footer className="lp-footer">
        <span className="brand">perkly<span>.</span></span>
        <nav>
          <a href="mailto:support@perkly.shop">{L("support")}</a>
          <a href="/terms">{L("terms")}</a>
          <a href="/privacy">{L("privacy")}</a>
        </nav>
      </footer>
    </div>
  );
}
