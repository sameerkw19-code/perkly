"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- plain links on purpose: client-side navigation breaks on this server */
// Guided setup: 1 business and card (live preview), 2 account, 3 activate (Polar trial), then the QR to print.
// The business comes first so the owner sees their card before being asked for anything; the full editor is in the dashboard.
// No QR to join until the business has paid: the server hides the join code until then.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "../landing/landing.css";
import { Logo } from "../landing/landing-client";
import { Icon } from "../landing/visuals";
import { COPY, waLink, type Lang } from "../landing/content";
import { LoyaltyCard } from "../../components/loyalty-card";
import { QrImage } from "../../components/qr";
import { startDesign, type Kind } from "../../lib/start-design";
import type { Design } from "../../lib/design";
import { errorText, translate } from "../../lib/i18n";
import { post } from "../../lib/api";
import { useRegion } from "../../components/region-context";
import { withPrices, type Currency } from "../../lib/pricing";

export type StartBusiness = { id: string; name: string; joinCode: string | null; paid: boolean; canWork: boolean; status: string };

type Step = "business" | "account" | "pay" | "wait" | "done";
const STEPS = ["business", "account", "pay"] as const;

const KIND_ICON: Record<Kind, string> = { cafe: "coffee", barber: "scissors", pizza: "pizza", icecream: "icecream", studio: "star", bakery: "cake", other: "store" };

const T = {
  he: {
    steps: ["העסק", "החשבון", "הפעלה"],
    backBiz: "חזרה לפרטי העסק", showPw: "הצגה", hidePw: "הסתרה",
    login: "כבר יש לי חשבון", home: "לדף הבית",
    accountTitle: "פותחים חשבון", accountIntro: "כדי לשמור את הכרטיס של {biz} ולנהל אותו מכל מכשיר.", accountIntroPlain: "שלוש דקות, ואתם מוכנים לחותמת הראשונה.", createAccount: "פתיחת החשבון",
    name: "השם שלך", email: "אימייל", password: "סיסמה", passwordHint: "לפחות 8 תווים", code: "קוד הרשמה",
    agree: "בהמשך אני מאשר/ת את", terms: "תנאי השימוש", and: "ואת", privacy: "מדיניות הפרטיות",
    next: "המשך", working: "רגע…",
    bizTitle: "מתחילים מהעסק", branchName: "שם הסניף", branchNamePh: "למשל: סניף מרכז", branchAddress: "כתובת הסניף", branchAddressPh: "רחוב, מספר ועיר", bizIntro: "בוחרים סוג עסק ושם, ואנחנו מכינים כרטיס מוכן. את העיצוב הסופי, עם הלוגו שלכם, נכין לכם אנחנו.",
    kind: "סוג העסק", bizName: "שם העסק", reward: "ההטבה", target: "חותמות להטבה", other: "אחר",
    preview: "כך הלקוחות יראו את הכרטיס", createBiz: "יצירת הכרטיס",
    payTitle: "14 ימים חינם", payIntro: "הכרטיס מוכן. מוסיפים אמצעי תשלום ומקבלים מיד את ה־QR לקופה.",
    today: "היום", todayAmount: "{$0}", chargeOn: "החל מ־{d}", cancelNote: "מבטלים לפני כן בלחיצה, ולא משלמים כלום.",
    plan: "מנוי Perkly", price: "{$m}", per: "לחודש", noSetup: "14 ימי ניסיון חינם. החיוב הראשון רק אחרי 14 ימים, ואם מבטלים לפני כן לא משלמים כלום. בלי דמי הקמה.",
    planPick: "בחירת מסלול", planMonthly: "חודשי", planYearly: "שנתי", yearlyPrice: "{$y}", yearlyPer: "לשנה",
    yearlyNote: "כ־{$ym} לחודש, וערכת הקופה כלולה: 2 פוסטרים וסטנד QR, שנשלחים אחרי החיוב הראשון.", thenYearly: ["Then {$y}/year", "אחר כך {$y} לשנה"] as [string, string],
    features: ["לקוחות ללא הגבלה", "לוגו, תמונות וחותמת משלכם", "כרטיס ב־Apple Wallet וב־Google Wallet", "עמדת עובד והזמנת עובדים"],
    englishNote: { title: "דף התשלום באנגלית. מה כתוב שם?", rows: [["14 days free", "14 ימים חינם"], ["Due today {$0}", "היום משלמים {$0}"], ["Then {$m}/month", "אחר כך {$m} לחודש"], ["Start trial", "התחלת הניסיון (הכפתור בסוף)"]] },
    pay: "התחלת 14 ימי ניסיון", paying: "פותחים את דף התשלום…", secure: "התשלום מתבצע אצל Polar, ספק תשלומים מאובטח. פרטי האשראי לא מגיעים אלינו.",
    later: "בינתיים בחינם, עד 10 לקוחות",
    freeNote: "בלי מנוי אפשר לצרף עד 10 לקוחות. כדי להמשיך מעבר לזה, מפעילים מנוי עם 14 ימי ניסיון חינם.", activate: "הפעלת מנוי", billingOff: "התשלום באתר עדיין לא מופעל. כתבו לנו ל־support@perkly.shop ונפעיל לכם את החשבון.",
    payFail: "לא הצלחנו לפתוח את דף התשלום. נסו שוב.",
    waitTitle: "מאשרים את הפרטים…", waitText: "זה לוקח בדרך כלל כמה שניות.",
    waitSlow: "הפרטים התקבלו, והאישור מתעכב. רעננו את הדף בעוד דקה. אם זה נמשך, כתבו ל־support@perkly.shop.",
    doneTitle: "הכל מוכן. אפשר להתחיל!", doneIntro: "תלו את ה־QR ליד הקופה. לקוח סורק, נרשם בשנייה ומקבל כרטיס אישי.",
    scan: "סרקו והצטרפו לכרטיס", print: "הדפסת ה־QR", dashboard: "ללוח הבקרה", station: "פתיחת עמדת עובד",
    staffOnly: "החשבון שלך הוא חשבון עובד. כדי לפתוח עסק משלך, אפשר להמשיך כאן.",
    tip: "את העיצוב הסופי של הכרטיס, עם הלוגו שלכם, נכין לכם אנחנו. נחזור אליכם בוואטסאפ.", designNow: "לכתוב לנו עכשיו", designMsg: "היי, פתחתי את {name} ב־Perkly. הנה הלוגו שלנו לעיצוב הכרטיס:",
  },
  ar: {
    steps: ["المشروع", "الحساب", "التفعيل"],
    backBiz: "رجوع إلى تفاصيل المشروع", showPw: "إظهار", hidePw: "إخفاء",
    login: "لدي حساب", home: "الصفحة الرئيسية",
    accountTitle: "إنشاء حساب", accountIntro: "لحفظ بطاقة {biz} وإدارتها من أي جهاز.", accountIntroPlain: "ثلاث دقائق وتكونون جاهزين للختم الأول.", createAccount: "إنشاء الحساب",
    name: "اسمك", email: "البريد الإلكتروني", password: "كلمة المرور", passwordHint: "8 أحرف على الأقل", code: "رمز التسجيل",
    agree: "بالمتابعة أوافق على", terms: "شروط الاستخدام", and: "و", privacy: "سياسة الخصوصية",
    next: "متابعة", working: "لحظة…",
    bizTitle: "نبدأ بالمشروع", branchName: "اسم الفرع", branchNamePh: "مثلاً: الفرع الرئيسي", branchAddress: "عنوان الفرع", branchAddressPh: "الشارع والرقم والمدينة", bizIntro: "اختاروا نوع المشروع واسمه ونجهّز لكم بطاقة جاهزة. التصميم النهائي مع شعاركم نجهّزه لكم نحن.",
    kind: "نوع المشروع", bizName: "اسم المشروع", reward: "المكافأة", target: "أختام للمكافأة", other: "آخر",
    preview: "هكذا يرى الزبائن البطاقة", createBiz: "إنشاء البطاقة",
    payTitle: "14 يوماً مجاناً", payIntro: "البطاقة جاهزة. أضيفوا وسيلة دفع واحصلوا فوراً على رمز QR للصندوق.",
    today: "اليوم", todayAmount: "{$0}", chargeOn: "ابتداءً من {d}", cancelNote: "ألغوا قبل ذلك بنقرة ولن تدفعوا شيئاً.",
    plan: "اشتراك Perkly", price: "{$m}", per: "شهرياً", noSetup: "تجربة مجانية لمدة 14 يوماً. أول دفعة بعد 14 يوماً فقط، وإن ألغيتم قبل ذلك لا تدفعون شيئاً. بدون رسوم تأسيس.",
    planPick: "اختيار الخطة", planMonthly: "شهري", planYearly: "سنوي", yearlyPrice: "{$y}", yearlyPer: "سنوياً",
    yearlyNote: "حوالي {$ym} شهرياً، وطقم الصندوق مشمول: ملصقان وحامل QR، يُرسلان بعد أول دفعة.", thenYearly: ["Then {$y}/year", "بعدها {$y} سنوياً"] as [string, string],
    features: ["زبائن بلا حدود", "الشعار والصور والختم الخاص بكم", "بطاقة في Apple Wallet وGoogle Wallet", "محطة موظف ودعوة موظفين"],
    englishNote: { title: "صفحة الدفع بالإنجليزية. ماذا يعني المكتوب؟", rows: [["14 days free", "14 يوماً مجاناً"], ["Due today {$0}", "تدفعون اليوم {$0}"], ["Then {$m}/month", "بعدها {$m} شهرياً"], ["Start trial", "بدء التجربة (الزر في الأسفل)"]] },
    pay: "ابدأوا تجربة 14 يوماً", paying: "نفتح صفحة الدفع…", secure: "الدفع يتم عبر Polar، مزود دفع آمن. تفاصيل البطاقة لا تصل إلينا.",
    later: "مجاناً حالياً، حتى 10 زبائن",
    freeNote: "بدون اشتراك يمكن إضافة حتى 10 زبائن. للمتابعة بعد ذلك فعّلوا الاشتراك مع تجربة مجانية لمدة 14 يوماً.", activate: "تفعيل الاشتراك", billingOff: "الدفع في الموقع غير مفعّل بعد. راسلونا على support@perkly.shop وسنفعّل حسابكم.",
    payFail: "لم نتمكن من فتح صفحة الدفع. حاولوا مجدداً.",
    waitTitle: "نؤكد الدفع…", waitText: "يستغرق ذلك عادة بضع ثوانٍ.",
    waitSlow: "تم استلام الدفع والتأكيد يتأخر. حدّثوا الصفحة بعد دقيقة. إن استمر ذلك راسلونا على support@perkly.shop.",
    doneTitle: "كل شيء جاهز. لنبدأ!", doneIntro: "علّقوا رمز QR بجانب الصندوق. الزبون يمسح، يسجل بثانية ويحصل على بطاقة شخصية.",
    scan: "امسحوا وانضموا للبطاقة", print: "طباعة رمز QR", dashboard: "إلى لوحة التحكم", station: "فتح محطة الموظف",
    staffOnly: "حسابك حساب موظف. لفتح مشروع خاص بك، تابع هنا.",
    tip: "سنجهّز لكم التصميم النهائي للبطاقة مع شعاركم. سنتواصل معكم عبر واتساب.", designNow: "راسلونا الآن", designMsg: "مرحباً، فتحت {name} في Perkly. هذا شعارنا لتصميم البطاقة:",
  },
  en: {
    steps: ["Business", "Account", "Activate"],
    backBiz: "Back to business details", showPw: "Show", hidePw: "Hide",
    login: "I have an account", home: "Home",
    accountTitle: "Create your account", accountIntro: "To save the {biz} card and manage it from any device.", accountIntroPlain: "Three minutes and you're ready for the first stamp.", createAccount: "Create account",
    name: "Your name", email: "Email", password: "Password", passwordHint: "At least 8 characters", code: "Sign-up code",
    agree: "By continuing I accept the", terms: "terms of use", and: "and the", privacy: "privacy policy",
    next: "Continue", working: "One moment…",
    bizTitle: "Start with your business", branchName: "Branch name", branchNamePh: "e.g. Main branch", branchAddress: "Branch address", branchAddressPh: "Street, number and city", bizIntro: "Pick your type of business and a name, and we'll prepare a ready card. We'll make the final design, with your logo, for you.",
    kind: "Type of business", bizName: "Business name", reward: "Reward", target: "Stamps for a reward", other: "Other",
    preview: "What your customers will see", createBiz: "Create my card",
    payTitle: "14 days free", payIntro: "Your card is ready. Add a payment method and get your QR code for the counter right away.",
    today: "Today", todayAmount: "{$0}", chargeOn: "From {d}", cancelNote: "Cancel before then in one click and pay nothing.",
    plan: "Perkly subscription", price: "{$m}", per: "a month", noSetup: "14-day free trial. You're first charged after 14 days, and if you cancel before then you pay nothing. No setup fee.",
    planPick: "Choose a plan", planMonthly: "Monthly", planYearly: "Yearly", yearlyPrice: "{$y}", yearlyPer: "a year",
    yearlyNote: "About {$ym} a month, with the counter kit included: 2 posters and a QR stand, shipped after the first payment.", thenYearly: ["Then {$y}/year", "Then {$y} a year"] as [string, string],
    features: ["Unlimited customers", "Your own logo, images and stamp", "Cards in Apple Wallet and Google Wallet", "Staff station and team invites"],
    englishNote: null,
    pay: "Start the 14-day trial", paying: "Opening the payment page…", secure: "Payment is handled by Polar, a secure payment provider. Your card details never reach us.",
    later: "Free for now, up to 10 customers",
    freeNote: "Without a subscription you can add up to 10 customers. To go beyond that, activate a subscription with a 14-day free trial.", activate: "Activate subscription", billingOff: "Online payment isn't switched on yet. Email support@perkly.shop and we'll activate your account.",
    payFail: "We couldn't open the payment page. Please try again.",
    waitTitle: "Confirming your payment…", waitText: "This usually takes a few seconds.",
    waitSlow: "Your payment went through and the confirmation is running late. Refresh in a minute. If it continues, email support@perkly.shop.",
    doneTitle: "All set. Let's start!", doneIntro: "Put the QR code by the register. A customer scans, signs up in seconds and gets a personal card.",
    scan: "Scan to join our card", print: "Print the QR code", dashboard: "Go to dashboard", station: "Open the staff station",
    staffOnly: "Your account is a staff account. To open a business of your own, continue here.",
    tip: "We'll prepare your card's final design, with your logo, for you. We'll be in touch on WhatsApp.", designNow: "Message us now", designMsg: "Hi, I just opened {name} on Perkly. Here is our logo for the card design:",
  },
};

const noSubscribe = () => () => {};
function readLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "he" || q === "en") return q;
    const saved = localStorage.getItem("perkly-language");
    if (saved === "en") return saved;
  } catch {}
  return "he";
}

function firstStep(signedIn: boolean, business: StartBusiness | null, billingOn: boolean, paidReturn: boolean): Step {
  if (!signedIn || !business) return "business";
  if (business.paid) return "done";
  if (paidReturn) return "wait";
  return billingOn || !business.canWork ? "pay" : "done";
}

export default function StartFlow({ signedIn, userName, needsCode, business: initialBusiness, isStaffOnly, billingOn, yearlyOn = false, paidReturn, currency = "ILS" }: {
  signedIn: boolean; userName: string; needsCode: boolean; business: StartBusiness | null; isStaffOnly: boolean; billingOn: boolean; yearlyOn?: boolean; paidReturn: boolean;
  /** The business's currency, or the visitor's market before there is a business. */
  currency?: Currency;
}) {
  const region = useRegion();
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  // Coming from the yearly side of the pricing switch on the home page: start on the yearly plan.
  useEffect(() => {
    if (yearlyOn && new URLSearchParams(window.location.search).get("plan") === "yearly") setPlan("yearly");
  }, [yearlyOn]);
  // Abroad: English only. In Israel: Hebrew, or English when picked.
  const picked = useSyncExternalStore(noSubscribe, region.intl ? () => "en" as Lang : readLang, () => region.lang as Lang);
  const lang: Lang = region.intl ? "en" : picked;
  const t = withPrices(T[lang], currency, lang);
  const tr = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const dir = lang === "en" ? "ltr" : "rtl";

  const [step, setStep] = useState<Step>(() => firstStep(signedIn, initialBusiness, billingOn, paidReturn));
  const [business, setBusiness] = useState<StartBusiness | null>(initialBusiness);
  const [authed, setAuthed] = useState(signedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Card being set up (step 2).
  const examples = COPY[lang].examples.list;
  const [kind, setKind] = useState<Kind>("cafe");
  const ex = kind === "other" ? null : examples.find((e) => e.key === kind)!;
  const [bizName, setBizName] = useState("");
  // Every business works by branches: the first branch's name and address.
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [reward, setReward] = useState("");
  const [rewardEdited, setRewardEdited] = useState(false);
  const [target, setTarget] = useState(10);
  const suggestedReward = ex ? ex.reward.charAt(0).toUpperCase() + ex.reward.slice(1) : "";
  const shownReward = rewardEdited ? reward : suggestedReward;
  const design = useMemo(() => startDesign(kind, bizName || (ex?.name ?? t.bizName), shownReward, lang), [kind, bizName, shownReward, ex, t.bizName, lang]);

  // Live card for the payment step, read from the server once the business exists.
  const [liveDesign, setLiveDesign] = useState<Design | null>(null);
  const [liveTarget, setLiveTarget] = useState(10);
  const [slow, setSlow] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
    setError("");
  }, [step]);

  // Load the business (card, join code, access) for the payment, waiting and done steps.
  useEffect(() => {
    if (!business || !["pay", "wait", "done"].includes(step)) return;
    let stop = false;
    let tries = 0;
    async function load() {
      try {
        const r = await fetch(`/api/loyalty?business=${encodeURIComponent(business!.id)}`, { credentials: "same-origin" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await r.json();
        if (stop || !data?.business) return;
        setLiveDesign(data.design ?? null);
        setLiveTarget(data.business.target ?? 10);
        const ok = !!data.access?.ok;
        // No "free" part means a subscription (or free access) covers the business.
        const paidNow = ok && !data.access.free;
        setBusiness((b) => (b ? { ...b, joinCode: data.business.join_code ?? null, canWork: ok, paid: b.paid || paidNow } : b));
        if (step === "wait") {
          if (paidNow && data.business.join_code) { setStep("done"); return; }
          tries += 1;
          if (tries > 24) { setSlow(true); return; }
          setTimeout(load, 2500);
        }
      } catch {
        if (step === "wait" && !stop) setTimeout(load, 4000);
      }
    }
    load();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, business?.id]);

  /** Creates the business with its starting card, then moves on to activation. */
  async function createBusiness(): Promise<boolean> {
    const name = bizName.trim();
    const rewardText = shownReward.trim();
    // The server builds the starting card for this type of business (later changes go through Perkly).
    const created = await post<{ id: string }>("/api/loyalty", { action: "create_business", name, reward: rewardText, target, color: design.colors.bg, rewardMode: "bank", kind, lang, branchName: branchName.trim() || name, branchAddress: branchAddress.trim() });
    if (!created.ok) { setError(errorText(lang, created.code)); return false; }
    const id = created.data.id;
    setBusiness({ id, name, joinCode: null, paid: false, canWork: false, status: "none" });
    setStep("pay");
    return true;
  }

  async function submitBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!bizName.trim() || !shownReward.trim()) { setError(errorText(lang, "bad_details")); return; }
    setError("");
    // Not signed in yet: the details wait here until the account exists.
    if (!authed) { setStep("account"); return; }
    setBusy(true);
    await createBusiness();
    setBusy(false);
  }

  async function submitAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const r = await post("/api/auth", { action: "signup", name: f.get("name"), email: f.get("email"), password: f.get("password"), signupCode: f.get("signupCode") || undefined });
    if (!r.ok) { setBusy(false); setError(errorText(lang, r.code)); return; }
    setAuthed(true);
    // The account exists; if the business fails, the owner fixes it on the first step (still signed in).
    if (!(await createBusiness())) setStep("business");
    setBusy(false);
  }

  async function pay() {
    if (!business || busy) return;
    setBusy(true);
    setError("");
    const r = await post<{ url: string }>("/api/billing/checkout", { business: business.id, from: "start", plan: yearlyOn ? plan : "monthly" });
    if (r.ok && r.data.url) { window.location.assign(r.data.url); return; }
    setBusy(false);
    setError(r.ok ? t.payFail : r.code === "billing_off" ? t.billingOff : t.payFail);
  }

  const current = step === "done" ? STEPS.length : STEPS.indexOf(step === "wait" ? "pay" : step);
  const chargeDate = new Date(Date.now() + 14 * 86_400_000).toLocaleDateString(lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "long" });
  // The server has no window: render without the link first, then fill it in after hydration (a mismatch otherwise).
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const joinUrl = business?.joinCode && origin ? `${origin}/join/${business.joinCode}` : "";

  return (
    <div className="lp su st" lang={lang} dir={dir}>
      <header className="lp-header st-noprint">
        <div className="lp-wrap lp-header-row">
          <a href={lang === "he" ? "/" : `/${lang}`} className="lp-home-link"><Logo label="Perkly" /></a>
          {!authed ? <a href={`/login?next=/start`} className="lp-login">{t.login}</a> : <a href="/" className="lp-login">{t.dashboard}</a>}
        </div>
      </header>
      <main className="lp-main lp-wrap su-main">
        <ol className="st-steps st-noprint" aria-label="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < current ? "is-done" : i === current ? "is-current" : ""} aria-current={i === current ? "step" : undefined}>
              <span className="st-dot" aria-hidden="true">{i < current ? <Icon name="check" size={14} stroke={3} /> : i + 1}</span>
              <span className="st-label">{t.steps[i]}</span>
            </li>
          ))}
        </ol>
        {step === "account" && (
          <form className="su-card st-narrow" onSubmit={submitAccount}>
            <h1 ref={headingRef} tabIndex={-1} className="lp-h2">{t.accountTitle}</h1>
            <p className="lp-body">{bizName.trim() ? t.accountIntro.replace("{biz}", bizName.trim()) : t.accountIntroPlain}</p>
            {bizName.trim() && (
              <div className="st-biz-chip">
                <Icon name={KIND_ICON[kind]} size={18} />
                <span><strong>{bizName.trim()}</strong><small>{shownReward} · {target}</small></span>
                <button type="button" className="st-later" onClick={() => setStep("business")}>{t.backBiz}</button>
              </div>
            )}
            <label className="su-field">{t.name}<input name="name" required maxLength={80} autoComplete="name" autoFocus /></label>
            <label className="su-field">{t.email}<input name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" inputMode="email" /></label>
            <label className="su-field">{t.password}
              <span className="st-pw">
                <input name="password" type={showPw ? "text" : "password"} required minLength={8} maxLength={200} autoComplete="new-password" dir="ltr" />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>{showPw ? t.hidePw : t.showPw}</button>
              </span>
              <span className="su-opt">{t.passwordHint}</span>
            </label>
            {needsCode && <label className="su-field">{t.code}<input name="signupCode" required maxLength={100} dir="ltr" autoComplete="off" /></label>}
            <p className="su-opt">{t.agree} <a href="/terms" target="_blank" rel="noopener">{t.terms}</a> {t.and} <a href="/privacy" target="_blank" rel="noopener">{t.privacy}</a>.</p>
            {error && <p className="su-summary" role="alert">{error}</p>}
            <button className="lp-btn lp-btn-primary lp-btn-lg lp-btn-wide" disabled={busy} aria-busy={busy}>{busy ? t.working : t.createAccount}</button>
            <p className="su-opt st-center"><a href="/login?next=/start">{t.login}</a></p>
          </form>
        )}

        {step === "business" && (
          <div className="st-grid">
            <form className="su-card" onSubmit={submitBusiness}>
              <h1 ref={headingRef} tabIndex={-1} className="lp-h2">{t.bizTitle}</h1>
              {isStaffOnly && <p className="su-kit">{t.staffOnly}</p>}
              {!isStaffOnly && userName && <p className="lp-body">{userName}, {t.bizIntro}</p>}
              {(isStaffOnly || !userName) && <p className="lp-body">{t.bizIntro}</p>}
              <fieldset className="st-kinds">
                <legend className="su-field">{t.kind}</legend>
                {[...examples.map((e) => ({ key: e.key as Kind, label: e.kind })), { key: "other" as Kind, label: t.other }].map((k) => (
                  <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => {
                    setKind(k.key);
                    const e2 = examples.find((e) => e.key === k.key);
                    if (e2) setTarget(e2.target);
                  }}>
                    <Icon name={KIND_ICON[k.key]} size={17} />{k.label}
                  </button>
                ))}
              </fieldset>
              <label className="su-field">{t.bizName}<input value={bizName} onChange={(e) => setBizName(e.target.value)} required maxLength={40} placeholder={ex?.name ?? ""} autoComplete="organization" /></label>
              <div className="su-row">
                <label className="su-field">{t.branchName}<input value={branchName} onChange={(e) => setBranchName(e.target.value)} maxLength={60} placeholder={t.branchNamePh} /></label>
                <label className="su-field">{t.branchAddress}<input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} required maxLength={160} placeholder={t.branchAddressPh} autoComplete="street-address" /></label>
              </div>
              <div className="su-row">
                <label className="su-field">{t.reward}<input value={shownReward} onChange={(e) => { setRewardEdited(true); setReward(e.target.value); }} required maxLength={80} /></label>
                <label className="su-field">{t.target}
                  <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                    {[4, 5, 6, 7, 8, 9, 10, 12, 15].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              {error && <p className="su-summary" role="alert">{error}</p>}
              <button className="lp-btn lp-btn-primary lp-btn-lg lp-btn-wide" disabled={busy} aria-busy={busy}>{busy ? t.working : authed ? t.createBiz : t.next}</button>
            </form>
            <aside className="st-preview" aria-label={t.preview}>
              <p className="su-opt">{t.preview}</p>
              <div className="lp-pcard">
                <LoyaltyCard design={design} lang={lang} stamps={Math.min(3, target)} target={target} customerName={tr("sampleCustomer")} t={tr} />
              </div>
            </aside>
          </div>
        )}

        {(step === "pay" || step === "wait") && (
          <div className="st-grid">
            <section className="su-card" aria-labelledby="st-pay">
              <h1 id="st-pay" ref={headingRef} tabIndex={-1} className="lp-h2">{step === "wait" ? t.waitTitle : t.payTitle}</h1>
              {step === "wait" ? (
                <>
                  <p className="lp-body" role="status">{slow ? t.waitSlow : t.waitText}</p>
                  {!slow && <span className="st-spinner" aria-hidden="true" />}
                </>
              ) : (
                <>
                  <p className="lp-body">{t.payIntro}</p>
                  {yearlyOn && (
                    <div className="st-plan-pick" role="group" aria-label={t.planPick}>
                      {(["monthly", "yearly"] as const).map((p) => (
                        <button key={p} type="button" aria-pressed={plan === p} className={plan === p ? "is-on" : ""} onClick={() => setPlan(p)}>
                          <strong>{p === "yearly" ? t.planYearly : t.planMonthly}</strong>
                          <span className="lp-num">{p === "yearly" ? t.yearlyPrice : t.price}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="st-timeline">
                    <div className="st-tl-row is-now"><span>{t.today}</span><b className="lp-num">{t.todayAmount}</b></div>
                    <div className="st-tl-row"><span>{t.chargeOn.replace("{d}", chargeDate)}</span><b><span className="lp-num">{plan === "yearly" ? t.yearlyPrice : t.price}</span> <small>{plan === "yearly" ? t.yearlyPer : t.per}</small></b></div>
                    <p className="su-opt">{t.cancelNote}</p>
                  </div>
                  {plan === "yearly" && <p className="su-opt st-yearly-note">{t.yearlyNote}</p>}
                  <ul className="st-feats">{t.features.map((f) => <li key={f}><Icon name="check" size={17} stroke={2.6} />{f}</li>)}</ul>
                  {t.englishNote && (
                    <details className="st-glossary">
                      <summary>{t.englishNote.title}</summary>
                      <dl>
                        {t.englishNote.rows.map(([en, local]) => (plan === "yearly" && en.startsWith("Then ") ? t.thenYearly : [en, local])).map(([en, local]) => (
                          <div key={en}><dt dir="ltr">{en}</dt><dd>{local}</dd></div>
                        ))}
                      </dl>
                    </details>
                  )}
                  {error && <p className="su-summary" role="alert">{error}</p>}
                  <button type="button" className="lp-btn lp-btn-primary lp-btn-lg lp-btn-wide" onClick={pay} disabled={busy || !billingOn} aria-busy={busy}>
                    <Icon name="lock" size={18} />{busy ? t.paying : t.pay}
                  </button>
                  {!billingOn && <p className="su-summary" role="status">{t.billingOff}</p>}
                  <p className="su-opt st-secure">{t.secure}</p>
                  {business?.canWork && <button type="button" className="st-later" onClick={() => setStep("done")}>{t.later}</button>}
                </>
              )}
            </section>
            <aside className="st-preview">
              {liveDesign && <div className="lp-pcard"><LoyaltyCard design={liveDesign} lang={lang} stamps={0} target={liveTarget} t={tr} /></div>}
            </aside>
          </div>
        )}

        {step === "done" && business && (
          <section className="su-card st-done" aria-labelledby="st-done">
            <span className="su-done-icon st-noprint" aria-hidden="true"><Icon name="check" size={40} stroke={2.8} /></span>
            <h1 id="st-done" ref={headingRef} tabIndex={-1} className="lp-h2 st-noprint">{t.doneTitle}</h1>
            <p className="lp-lead st-noprint">{t.doneIntro}</p>
            {joinUrl ? (
              <div className="st-poster">
                <strong className="st-poster-name">{business.name}</strong>
                <QrImage text={joinUrl} size={260} label={t.scan} />
                <span className="st-poster-scan">{t.scan}</span>
              </div>
            ) : (
              <p className="su-summary st-noprint">{t.billingOff}</p>
            )}
            {!business.paid && joinUrl && (
              <div className="su-kit st-noprint st-free">
                <span>{t.freeNote}</span>
                {billingOn && <button type="button" className="lp-btn lp-btn-dark lp-btn-sm" onClick={() => setStep("pay")}>{t.activate}</button>}
              </div>
            )}
            <div className="su-done-actions st-noprint">
              {joinUrl && <button type="button" className="lp-btn lp-btn-primary" onClick={() => window.print()}><Icon name="printer" size={18} />{t.print}</button>}
              <a className="lp-btn lp-btn-ghost" href="/">{t.dashboard}</a>
            </div>
            <p className="su-opt st-noprint">{t.tip} <a href={waLink(t.designMsg.replace("{name}", business.name))} target="_blank" rel="noopener noreferrer">{t.designNow}</a></p>
          </section>
        )}
      </main>
    </div>
  );
}
