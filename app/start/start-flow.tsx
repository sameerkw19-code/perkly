"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- plain links on purpose: client-side navigation breaks on this server */
// Guided setup: 1 account, 2 business and card (live preview), 3 payment (Polar), 4 QR and start.
// No QR to join until the business has paid: the server hides the join code until then.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "../landing/landing.css";
import { Logo } from "../landing/landing-client";
import { Icon, THEMES } from "../landing/visuals";
import { COPY, type ExampleKey, type Lang } from "../landing/content";
import { LoyaltyCard } from "../../components/loyalty-card";
import { QrImage } from "../../components/qr";
import { darken, defaultDesign, defaultLook, onColor, type Design, type PresetIcon } from "../../lib/design";
import { errorText, translate } from "../../lib/i18n";
import { post } from "../../lib/api";
import { CardEditor } from "../../components/card-editor";

export type StartBusiness = { id: string; name: string; joinCode: string | null; paid: boolean; canWork: boolean; status: string };

type Kind = ExampleKey | "other";
type Step = "account" | "business" | "design" | "pay" | "wait" | "done";
const STEPS: Exclude<Step, "wait">[] = ["account", "business", "design", "pay", "done"];

const ICON: Record<Kind, PresetIcon> = { cafe: "coffee", barber: "scissors", pizza: "pizza", icecream: "icecream", studio: "sparkle", bakery: "croissant", other: "star" };
const KIND_ICON: Record<Kind, string> = { cafe: "coffee", barber: "scissors", pizza: "pizza", icecream: "icecream", studio: "star", bakery: "cake", other: "store" };
const OTHER_THEME = { bg: "#2F2A4A", fg: "#FFFFFF", stamp: "#D9F493" };

const T = {
  he: {
    steps: ["חשבון", "העסק", "עיצוב", "תשלום", "מתחילים"],
    backDesign: "חזרה לעיצוב", forward: "המשך",
    login: "כבר יש לי חשבון", home: "לדף הבית",
    accountTitle: "פותחים חשבון", accountIntro: "שלוש דקות, ואתם מוכנים לחותמת הראשונה.",
    name: "השם שלך", email: "אימייל", password: "סיסמה", passwordHint: "לפחות 8 תווים", code: "קוד הרשמה",
    agree: "בהמשך אני מאשר/ת את", terms: "תנאי השימוש", and: "ואת", privacy: "מדיניות הפרטיות",
    next: "המשך", working: "רגע…",
    bizTitle: "העסק", bizIntro: "בוחרים סוג עסק, ואנחנו מכינים כרטיס מתאים. בשלב הבא מעצבים אותו בדיוק כמו שאתם רוצים.",
    kind: "סוג העסק", bizName: "שם העסק", reward: "ההטבה", target: "חותמות להטבה", other: "אחר",
    preview: "כך הלקוחות יראו את הכרטיס", createBiz: "שמירה והמשך לעיצוב",
    designTitle: "מעצבים את הכרטיס", designIntro: "צבעים, רקע, חותמת, גופן וטקסטים. כל שינוי מופיע מיד בתצוגה.",
    designPaid: "לוגו, תמונת רקע מעוצבת וחותמת מתמונה משלכם נפתחים עם המנוי, כבר בימי הניסיון.", designSave: "שמירה והמשך", designSkip: "להמשיך בלי שינויים",
    payTitle: "מפעילים את המנוי", payIntro: "הכרטיס שלכם מוכן. מזינים פרטי אשראי, מקבלים את ה־QR ומתחילים מיד.",
    plan: "מנוי Perkly", price: "$29", per: "לחודש", noSetup: "14 ימי ניסיון חינם. החיוב הראשון רק אחרי 14 ימים, ואם מבטלים לפני כן לא משלמים כלום. בלי דמי הקמה.",
    planPick: "בחירת מסלול", planMonthly: "חודשי", planYearly: "שנתי", yearlyPrice: "$290", yearlyPer: "לשנה",
    yearlyNote: "כ־$24 לחודש, וערכת הקופה כלולה: 2 פוסטרים וסטנד QR, שנשלחים אחרי החיוב הראשון.", thenYearly: ["Then $290/year", "אחר כך $290 לשנה"] as [string, string],
    features: ["לקוחות ללא הגבלה", "לוגו ותמונת רקע מעוצבת", "חותמת מתמונה משלכם", "באנר בעיצוב שלכם ב־Google Wallet", "עמדת עובד והזמנת עובדים", "לוח בקרה והתראות"],
    planMore: "במנוי מקבלים הרבה יותר:", freeCompare: "בלי מנוי: עד 10 לקוחות ועיצוב מהתבניות, הצבעים והאייקונים המוכנים.",
    englishNote: { title: "דף התשלום של Polar באנגלית. מה כתוב שם:", rows: [["14 days free", "14 ימים חינם"], ["Due today $0", "היום משלמים $0"], ["Then $29/month", "אחר כך $29 לחודש"], ["Start trial", "התחלת הניסיון (הכפתור בסוף)"]] },
    pay: "התחלת 14 ימי ניסיון", paying: "פותחים את דף התשלום…", secure: "התשלום מתבצע אצל Polar, ספק תשלומים מאובטח. פרטי האשראי לא מגיעים אלינו.",
    later: "להתחיל בלי מנוי (עד 10 לקוחות)",
    freeNote: "בלי מנוי אפשר לצרף עד 10 לקוחות. כדי להמשיך מעבר לזה, מפעילים מנוי עם 14 ימי ניסיון חינם.", activate: "הפעלת מנוי", billingOff: "התשלום באתר עדיין לא מופעל. כתבו לנו ל־support@perkly.shop ונפעיל לכם את החשבון.",
    payFail: "לא הצלחנו לפתוח את דף התשלום. נסו שוב.",
    waitTitle: "מאשרים את הפרטים…", waitText: "זה לוקח בדרך כלל כמה שניות.",
    waitSlow: "הפרטים התקבלו, והאישור מתעכב. רעננו את הדף בעוד דקה. אם זה נמשך, כתבו ל־support@perkly.shop.",
    doneTitle: "הכל מוכן. אפשר להתחיל!", doneIntro: "תלו את ה־QR ליד הקופה. לקוח סורק, נרשם בשנייה ומקבל כרטיס אישי.",
    scan: "סרקו והצטרפו לכרטיס", print: "הדפסת ה־QR", dashboard: "ללוח הבקרה", station: "פתיחת עמדת עובד",
    staffOnly: "החשבון שלך הוא חשבון עובד. כדי לפתוח עסק משלך, אפשר להמשיך כאן.",
    tip: "טיפ: אפשר להזמין עובדים ולשנות עיצוב בכל רגע מלוח הבקרה.", designNow: "להוספת לוגו ותמונת רקע",
  },
  ar: {
    steps: ["الحساب", "المشروع", "التصميم", "الدفع", "نبدأ"],
    backDesign: "رجوع إلى التصميم", forward: "متابعة",
    login: "لدي حساب", home: "الصفحة الرئيسية",
    accountTitle: "إنشاء حساب", accountIntro: "ثلاث دقائق وتكونون جاهزين للختم الأول.",
    name: "اسمك", email: "البريد الإلكتروني", password: "كلمة المرور", passwordHint: "8 أحرف على الأقل", code: "رمز التسجيل",
    agree: "بالمتابعة أوافق على", terms: "شروط الاستخدام", and: "و", privacy: "سياسة الخصوصية",
    next: "متابعة", working: "لحظة…",
    bizTitle: "المشروع", bizIntro: "اختاروا نوع المشروع ونجهّز لكم بطاقة مناسبة. في الخطوة التالية تصممونها كما تريدون تماماً.",
    kind: "نوع المشروع", bizName: "اسم المشروع", reward: "المكافأة", target: "أختام للمكافأة", other: "آخر",
    preview: "هكذا يرى الزبائن البطاقة", createBiz: "حفظ ومتابعة للتصميم",
    designTitle: "تصميم البطاقة", designIntro: "الألوان، الخلفية، الختم، الخط والنصوص. كل تغيير يظهر فوراً في المعاينة.",
    designPaid: "الشعار وصورة الخلفية المصممة والختم من صورتكم تُفتح مع الاشتراك، حتى خلال أيام التجربة.", designSave: "حفظ ومتابعة", designSkip: "المتابعة بدون تغيير",
    payTitle: "تفعيل الاشتراك", payIntro: "بطاقتكم جاهزة. أدخلوا تفاصيل البطاقة الائتمانية، احصلوا على رمز QR وابدؤوا فوراً.",
    plan: "اشتراك Perkly", price: "$29", per: "شهرياً", noSetup: "تجربة مجانية لمدة 14 يوماً. أول دفعة بعد 14 يوماً فقط، وإن ألغيتم قبل ذلك لا تدفعون شيئاً. بدون رسوم تأسيس.",
    planPick: "اختيار الخطة", planMonthly: "شهري", planYearly: "سنوي", yearlyPrice: "$290", yearlyPer: "سنوياً",
    yearlyNote: "حوالي $24 شهرياً، وطقم الصندوق مشمول: ملصقان وحامل QR، يُرسلان بعد أول دفعة.", thenYearly: ["Then $290/year", "بعدها $290 سنوياً"] as [string, string],
    features: ["زبائن بلا حدود", "الشعار وصورة خلفية مصممة", "ختم من صورتكم الخاصة", "بانر بتصميمكم في Google Wallet", "محطة موظف ودعوة موظفين", "لوحة تحكم وتنبيهات"],
    planMore: "مع الاشتراك تحصلون على الكثير:", freeCompare: "بدون اشتراك: حتى 10 زبائن وتصميم من القوالب والألوان والأيقونات الجاهزة.",
    englishNote: { title: "صفحة الدفع في Polar بالإنجليزية. ماذا يعني المكتوب:", rows: [["14 days free", "14 يوماً مجاناً"], ["Due today $0", "تدفعون اليوم $0"], ["Then $29/month", "بعدها $29 شهرياً"], ["Start trial", "بدء التجربة (الزر في الأسفل)"]] },
    pay: "ابدأوا تجربة 14 يوماً", paying: "نفتح صفحة الدفع…", secure: "الدفع يتم عبر Polar، مزود دفع آمن. تفاصيل البطاقة لا تصل إلينا.",
    later: "البدء بدون اشتراك (حتى 10 زبائن)",
    freeNote: "بدون اشتراك يمكن إضافة حتى 10 زبائن. للمتابعة بعد ذلك فعّلوا الاشتراك مع تجربة مجانية لمدة 14 يوماً.", activate: "تفعيل الاشتراك", billingOff: "الدفع في الموقع غير مفعّل بعد. راسلونا على support@perkly.shop وسنفعّل حسابكم.",
    payFail: "لم نتمكن من فتح صفحة الدفع. حاولوا مجدداً.",
    waitTitle: "نؤكد الدفع…", waitText: "يستغرق ذلك عادة بضع ثوانٍ.",
    waitSlow: "تم استلام الدفع والتأكيد يتأخر. حدّثوا الصفحة بعد دقيقة. إن استمر ذلك راسلونا على support@perkly.shop.",
    doneTitle: "كل شيء جاهز. لنبدأ!", doneIntro: "علّقوا رمز QR بجانب الصندوق. الزبون يمسح، يسجل بثانية ويحصل على بطاقة شخصية.",
    scan: "امسحوا وانضموا للبطاقة", print: "طباعة رمز QR", dashboard: "إلى لوحة التحكم", station: "فتح محطة الموظف",
    staffOnly: "حسابك حساب موظف. لفتح مشروع خاص بك، تابع هنا.",
    tip: "نصيحة: يمكن دعوة موظفين وتغيير التصميم في أي وقت من لوحة التحكم.", designNow: "لإضافة الشعار وصورة الخلفية",
  },
  en: {
    steps: ["Account", "Business", "Design", "Payment", "Start"],
    backDesign: "Back to design", forward: "Continue",
    login: "I have an account", home: "Home",
    accountTitle: "Create your account", accountIntro: "Three minutes and you're ready for the first stamp.",
    name: "Your name", email: "Email", password: "Password", passwordHint: "At least 8 characters", code: "Sign-up code",
    agree: "By continuing I accept the", terms: "terms of use", and: "and the", privacy: "privacy policy",
    next: "Continue", working: "One moment…",
    bizTitle: "Your business", bizIntro: "Pick your type of business and we'll prepare a matching card. Next, you design it exactly the way you want.",
    kind: "Type of business", bizName: "Business name", reward: "Reward", target: "Stamps for a reward", other: "Other",
    preview: "What your customers will see", createBiz: "Save and continue to design",
    designTitle: "Design your card", designIntro: "Colors, background, stamp, font and texts. Every change shows right away in the preview.",
    designPaid: "Your logo, a designed background image and a stamp from your own image unlock with a subscription, already during the trial.", designSave: "Save and continue", designSkip: "Continue without changes",
    payTitle: "Activate your subscription", payIntro: "Your card is ready. Add your payment card, get your QR code and start right away.",
    plan: "Perkly subscription", price: "$29", per: "a month", noSetup: "14-day free trial. You're first charged after 14 days, and if you cancel before then you pay nothing. No setup fee.",
    planPick: "Choose a plan", planMonthly: "Monthly", planYearly: "Yearly", yearlyPrice: "$290", yearlyPer: "a year",
    yearlyNote: "About $24 a month, with the counter kit included: 2 posters and a QR stand, shipped after the first payment.", thenYearly: ["Then $290/year", "Then $290 a year"] as [string, string],
    features: ["Unlimited customers", "Your logo and a designed background image", "A stamp from your own image", "Your own banner in Google Wallet", "Staff station and team invites", "Dashboard and alerts"],
    planMore: "A subscription gives you much more:", freeCompare: "Without a subscription: up to 10 customers, with the ready designs, colors and icons.",
    englishNote: null,
    pay: "Start the 14-day trial", paying: "Opening the payment page…", secure: "Payment is handled by Polar, a secure payment provider. Your card details never reach us.",
    later: "Start without a subscription (up to 10 customers)",
    freeNote: "Without a subscription you can add up to 10 customers. To go beyond that, activate a subscription with a 14-day free trial.", activate: "Activate subscription", billingOff: "Online payment isn't switched on yet. Email support@perkly.shop and we'll activate your account.",
    payFail: "We couldn't open the payment page. Please try again.",
    waitTitle: "Confirming your payment…", waitText: "This usually takes a few seconds.",
    waitSlow: "Your payment went through and the confirmation is running late. Refresh in a minute. If it continues, email support@perkly.shop.",
    doneTitle: "All set. Let's start!", doneIntro: "Put the QR code by the register. A customer scans, signs up in seconds and gets a personal card.",
    scan: "Scan to join our card", print: "Print the QR code", dashboard: "Go to dashboard", station: "Open the staff station",
    staffOnly: "Your account is a staff account. To open a business of your own, continue here.",
    tip: "Tip: invite staff and change the design anytime from the dashboard.", designNow: "Add your logo and background",
  },
};

const noSubscribe = () => () => {};
function readLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "he" || q === "en" || q === "ar") return q;
    const saved = localStorage.getItem("perkly-lang");
    if (saved === "he" || saved === "en") return saved;
  } catch {}
  return "en";
}

/** The card a new business starts with: the example look for its type, with the owner's own texts. */
function startDesign(kind: Kind, name: string, reward: string): Design {
  const th = kind === "other" ? OTHER_THEME : THEMES[kind];
  const base = defaultDesign({ name: name || "Perkly", reward: reward || "-", color: th.bg });
  const light = onColor(th.bg) !== "#FFFFFF";
  return {
    ...base,
    colors: { bg: th.bg, fg: th.fg, stamp: th.stamp },
    stamp: { icon: ICON[kind], image: null },
    look: { ...defaultLook(th.bg), bg2: light ? darken(th.bg, 0.1) : darken(th.bg, 0.32) },
  };
}

function firstStep(signedIn: boolean, business: StartBusiness | null, billingOn: boolean, paidReturn: boolean): Step {
  if (!signedIn) return "account";
  if (!business) return "business";
  if (business.paid) return "done";
  if (paidReturn) return "wait";
  return billingOn || !business.canWork ? "pay" : "done";
}

export default function StartFlow({ signedIn, userName, needsCode, business: initialBusiness, isStaffOnly, billingOn, yearlyOn = false, paidReturn }: {
  signedIn: boolean; userName: string; needsCode: boolean; business: StartBusiness | null; isStaffOnly: boolean; billingOn: boolean; yearlyOn?: boolean; paidReturn: boolean;
}) {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  // Coming from the yearly side of the pricing switch on the home page: start on the yearly plan.
  useEffect(() => {
    if (yearlyOn && new URLSearchParams(window.location.search).get("plan") === "yearly") setPlan("yearly");
  }, [yearlyOn]);
  const lang = useSyncExternalStore(noSubscribe, readLang, () => "en" as Lang);
  const t = T[lang];
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
  const [reward, setReward] = useState("");
  const [rewardEdited, setRewardEdited] = useState(false);
  const [target, setTarget] = useState(10);
  const suggestedReward = ex ? ex.reward.charAt(0).toUpperCase() + ex.reward.slice(1) : "";
  const shownReward = rewardEdited ? reward : suggestedReward;
  const design = useMemo(() => startDesign(kind, bizName || (ex?.name ?? t.bizName), shownReward), [kind, bizName, shownReward, ex, t.bizName]);

  // Full card editor (step 3), loaded once the business exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editorData, setEditorData] = useState<{ editor: any; target: number; paid: boolean } | null>(null);
  const afterDesign: Step = business?.paid ? "done" : "pay";
  useEffect(() => {
    if (step !== "design" || !business) return;
    let stop = false;
    fetch(`/api/loyalty?business=${encodeURIComponent(business.id)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((data: any) => {
        if (stop) return;
        if (!data?.editor) { setStep(afterDesign); return; }
        setEditorData({ editor: data.editor, target: data.business?.target ?? 10, paid: !!data.access?.ok && !data.access.free });
      })
      .catch(() => { if (!stop) setError(tr("err_network")); });
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, business?.id]);

  // Live card for the payment step, read from the server once the business exists.
  const [liveDesign, setLiveDesign] = useState<Design | null>(null);
  const [liveTarget, setLiveTarget] = useState(10);
  const [slow, setSlow] = useState(false);

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

  async function submitAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const r = await post("/api/auth", { action: "signup", name: f.get("name"), email: f.get("email"), password: f.get("password"), signupCode: f.get("signupCode") || undefined });
    setBusy(false);
    if (!r.ok) { setError(errorText(lang, r.code)); return; }
    setAuthed(true);
    setStep("business");
  }

  async function submitBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const name = bizName.trim();
    const rewardText = shownReward.trim();
    if (!name || !rewardText) { setError(errorText(lang, "bad_details")); return; }
    setBusy(true);
    setError("");
    const created = await post<{ id: string }>("/api/loyalty", { action: "create_business", name, reward: rewardText, target, color: design.colors.bg, rewardMode: "bank" });
    if (!created.ok) { setBusy(false); setError(errorText(lang, created.code)); return; }
    const id = created.data.id;
    // The card look for this type of business. If saving it fails, the business still has the default card.
    const finalDesign = startDesign(kind, name, rewardText);
    const saved = await post("/api/loyalty", { business: id, action: "save_design", design: finalDesign });
    if (saved.ok) await post("/api/loyalty", { business: id, action: "publish_design" });
    setBusiness({ id, name, joinCode: null, paid: false, canWork: false, status: "none" });
    setBusy(false);
    setStep("design");
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

  const visible: Exclude<Step, "wait"> = step === "wait" ? "pay" : step;
  const current = STEPS.indexOf(visible);
  const joinUrl = business?.joinCode && typeof window !== "undefined" ? `${window.location.origin}/join/${business.joinCode}` : "";

  return (
    <div className="lp su st" lang={lang} dir={dir}>
      <header className="lp-header st-noprint">
        <div className="lp-wrap lp-header-row">
          <a href={lang === "en" ? "/" : `/${lang}`} className="lp-home-link"><Logo label="Perkly" /></a>
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
        {business && (step === "pay" || step === "done") && (
          <nav className="st-nav st-noprint" aria-label="steps navigation">
            <button type="button" className="st-later" onClick={() => setStep("design")}>{t.backDesign}</button>
          </nav>
        )}
        {business && step === "design" && (
          <nav className="st-nav st-noprint" aria-label="steps navigation">
            <button type="button" className="st-later" onClick={() => setStep(afterDesign)}>{t.forward}</button>
          </nav>
        )}

        {step === "account" && (
          <form className="su-card st-narrow" onSubmit={submitAccount}>
            <h1 ref={headingRef} tabIndex={-1} className="lp-h2">{t.accountTitle}</h1>
            <p className="lp-body">{t.accountIntro}</p>
            <label className="su-field">{t.name}<input name="name" required maxLength={80} autoComplete="name" /></label>
            <label className="su-field">{t.email}<input name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" inputMode="email" /></label>
            <label className="su-field">{t.password}<input name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" dir="ltr" /><span className="su-opt">{t.passwordHint}</span></label>
            {needsCode && <label className="su-field">{t.code}<input name="signupCode" required maxLength={100} dir="ltr" autoComplete="off" /></label>}
            <p className="su-opt">{t.agree} <a href="/terms" target="_blank" rel="noopener">{t.terms}</a> {t.and} <a href="/privacy" target="_blank" rel="noopener">{t.privacy}</a>.</p>
            {error && <p className="su-summary" role="alert">{error}</p>}
            <button className="lp-btn lp-btn-primary lp-btn-lg lp-btn-wide" disabled={busy} aria-busy={busy}>{busy ? t.working : t.next}</button>
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
                <label className="su-field">{t.reward}<input value={shownReward} onChange={(e) => { setRewardEdited(true); setReward(e.target.value); }} required maxLength={80} /></label>
                <label className="su-field">{t.target}
                  <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                    {[4, 5, 6, 7, 8, 9, 10, 12, 15].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              {error && <p className="su-summary" role="alert">{error}</p>}
              <button className="lp-btn lp-btn-primary lp-btn-lg lp-btn-wide" disabled={busy} aria-busy={busy}>{busy ? t.working : t.createBiz}</button>
            </form>
            <aside className="st-preview" aria-label={t.preview}>
              <p className="su-opt">{t.preview}</p>
              <div className="lp-pcard">
                <LoyaltyCard design={design} lang={lang} stamps={Math.min(3, target)} target={target} customerName={tr("sampleCustomer")} t={tr} />
              </div>
            </aside>
          </div>
        )}

        {step === "design" && business && (
          <section className="st-design" aria-labelledby="st-design">
            <div className="su-card st-design-head">
              <div>
                <h1 id="st-design" ref={headingRef} tabIndex={-1} className="lp-h2">{t.designTitle}</h1>
                <p className="lp-body">{t.designIntro}</p>
                {editorData && !editorData.paid && <p className="paid-note">{t.designPaid}</p>}
                {error && <p className="su-summary" role="alert">{error}</p>}
              </div>
              <button type="button" className="st-later" onClick={() => setStep(afterDesign)}>{t.designSkip}</button>
            </div>
            {editorData ? (
              <div className="st-editor">
                <CardEditor businessId={business.id} target={editorData.target} editor={editorData.editor} t={tr} lang={lang}
                  notify={(msg, bad) => { if (bad) setError(msg); }} reload={() => setStep(afterDesign)}
                  paid={editorData.paid} setup={{ publishLabel: t.designSave }} />
              </div>
            ) : (
              !error && <span className="st-spinner" aria-hidden="true" />
            )}
          </section>
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
                  <div className="st-plan">
                    <div className="st-plan-head"><strong>{t.plan}</strong><span><b className="lp-num">{plan === "yearly" ? t.yearlyPrice : t.price}</b> {plan === "yearly" ? t.yearlyPer : t.per}</span></div>
                    {plan === "yearly" && <p className="su-opt st-yearly-note">{t.yearlyNote}</p>}
                    <p className="st-plan-more">{t.planMore}</p>
                    <ul>{t.features.map((f) => <li key={f}><Icon name="check" size={17} stroke={2.6} />{f}</li>)}</ul>
                    <p className="su-opt">{t.noSetup}</p>
                    <p className="su-opt st-free-compare">{t.freeCompare}</p>
                  </div>
                  {t.englishNote && (
                    <div className="st-glossary">
                      <p>{t.englishNote.title}</p>
                      <dl>
                        {t.englishNote.rows.map(([en, local]) => (plan === "yearly" && en.startsWith("Then ") ? t.thenYearly : [en, local])).map(([en, local]) => (
                          <div key={en}><dt dir="ltr">{en}</dt><dd>{local}</dd></div>
                        ))}
                      </dl>
                    </div>
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
            <p className="su-opt st-noprint">{t.tip} {business.paid && <a href="/#design">{t.designNow}</a>}</p>
          </section>
        )}
      </main>
    </div>
  );
}
