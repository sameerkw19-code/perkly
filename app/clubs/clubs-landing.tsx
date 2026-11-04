// Public page of Perkly for Clubs (/clubs, /clubs/ar, /clubs/en). Uses the marketing page's look.
import "../landing/landing.css";
import "./clubs.css";
import { CalendarCheck, CircleCheck, IdCard, Plus, Send, ShieldCheck, Smartphone, Users, Wallet } from "lucide-react";
import { Logo } from "../landing/landing-client";
import { waLink, WHATSAPP_DISPLAY } from "../landing/content";
import type { SiteLang } from "../../lib/i18n-types";

const COPY = {
  he: {
    dir: "rtl",
    home: "Perkly, דף הבית של המועדונים",
    login: "כניסה",
    cta: "פתיחת מועדון",
    eyebrow: "Perkly for Clubs",
    title: "כרטיס חבר דיגיטלי למועדון שלכם.",
    lead: "חדרי כושר, סטודיו ומועדונים: כל חבר מקבל כרטיס בטלפון עם השם, המסלול והתוקף. אתם מעדכנים במקום אחד, והכרטיס מתעדכן אצלו.",
    free: "10 החברים הראשונים בחינם",
    talk: "דברו איתנו בוואטסאפ",
    points: ["בלי כרטיסי פלסטיק", "החבר לא מוריד אפליקציה", "בעברית, ערבית ואנגלית"],
    demoAlt: "דוגמה: כרטיס חבר של מועדון כושר בטלפון, בתוקף",
    demoClub: "מועדון כושר לדוגמה",
    demoKind: "כרטיס חבר",
    demoName: "נועה לוי",
    demoNo: "מספר חבר",
    demoPlan: "מסלול",
    demoPlanValue: "שנתי",
    demoValid: "בתוקף עד",
    demoStatus: "בתוקף",
    howEyebrow: "איך זה עובד",
    howTitle: "שלושה צעדים וזהו.",
    steps: [
      { title: "מוסיפים חבר", text: "שם, מסלול ותאריך תוקף. פתיחת המועדון לוקחת כמה דקות." },
      { title: "שולחים לו את הכרטיס", text: "קישור אישי בוואטסאפ. באנדרואיד שומרים אותו גם ב־Google Wallet." },
      { title: "הוא מציג אותו בכניסה", text: "על המסך רואים שם, מסלול וסטטוס: בתוקף או פג תוקף." },
    ],
    whatTitle: "מה מקבל המועדון",
    features: [
      { title: "ניהול חברים במקום אחד", text: "חיפוש לפי שם, טלפון או מספר חבר, וסינון לפי סטטוס." },
      { title: "הארכה בלחיצה", text: "חודש, 3 חודשים או שנה. התאריך החדש מגיע לכרטיס של החבר." },
      { title: "רואים מי מסתיים השבוע", text: "החברים שהמנוי שלהם נגמר בקרוב מופיעים בנפרד, כדי שתספיקו לחדש." },
      { title: "כרטיס בצבעים ובלוגו שלכם", text: "החברים רואים את המועדון שלכם, עם שורת Powered by Perkly קטנה." },
      { title: "Google Wallet", text: "הכרטיס נשמר בארנק באנדרואיד. Apple Wallet יגיע בקרוב, ובינתיים באייפון שומרים אותו במסך הבית." },
      { title: "התשלום נשאר אצלכם", text: "החברים ממשיכים לשלם לכם כרגיל. Perkly לא גובה מהם ולא נוגעת בכסף." },
    ],
    faqTitle: "שאלות נפוצות",
    faq: [
      { q: "זה קשור לכרטיסיית החותמות של Perkly?", a: "לא. Perkly for Clubs הוא מוצר נפרד, עם חברים ותוקף ובלי חותמות." },
      { q: "איך בודקים כרטיס בכניסה?", a: "החבר מציג את הכרטיס, והעובד רואה את השם והסטטוס. אין סריקה ואין קוד QR, ולכן אין צורך בציוד." },
      { q: "מה קורה כשהתוקף נגמר?", a: "הכרטיס מסומן כפג תוקף בלי שתעשו כלום. אחרי שתאריכו, הוא חוזר להיות בתוקף." },
      { q: "אפשר להשאיר את מערכת התשלומים שלנו?", a: "כן. Perkly לא גובה מהחברים. אחרי שחבר משלם אצלכם, מעדכנים את התאריך שלו כאן." },
      { q: "כמה זה עולה?", a: "10 החברים הראשונים בחינם. למחיר המסלול המלא דברו איתנו." },
    ],
    finalTitle: "מוכנים להיפרד מכרטיסי הפלסטיק?",
    finalText: "פותחים מועדון, מוסיפים את החברים הראשונים ושולחים להם את הכרטיס.",
    stamps: "מחפשים כרטיסיית חותמות?",
    rights: "© 2026 Perkly",
    support: "תמיכה בוואטסאפ",
  },
  ar: {
    dir: "rtl",
    home: "Perkly، الصفحة الرئيسية للنوادي",
    login: "دخول",
    cta: "فتح نادٍ",
    eyebrow: "Perkly for Clubs",
    title: "بطاقة عضوية رقمية لناديكم.",
    lead: "صالات رياضية واستوديوهات ونوادٍ: كل عضو يحصل على بطاقة في هاتفه فيها الاسم والباقة وتاريخ الانتهاء. تحدّثون في مكان واحد، وتتحدث البطاقة عنده.",
    free: "أول 10 أعضاء مجاناً",
    talk: "تحدثوا معنا عبر واتساب",
    points: ["بدون بطاقات بلاستيكية", "العضو لا يحتاج إلى تطبيق", "بالعبرية والعربية والإنجليزية"],
    demoAlt: "مثال: بطاقة عضوية لنادٍ رياضي في الهاتف، سارية",
    demoClub: "نادٍ رياضي للتجربة",
    demoKind: "بطاقة عضوية",
    demoName: "نور خطيب",
    demoNo: "رقم العضوية",
    demoPlan: "الباقة",
    demoPlanValue: "سنوية",
    demoValid: "سارية حتى",
    demoStatus: "سارية",
    howEyebrow: "كيف يعمل",
    howTitle: "ثلاث خطوات فقط.",
    steps: [
      { title: "أضيفوا عضواً", text: "الاسم والباقة وتاريخ الانتهاء. فتح النادي يستغرق بضع دقائق." },
      { title: "أرسلوا له البطاقة", text: "رابط شخصي عبر واتساب. على أندرويد يمكن حفظها أيضاً في Google Wallet." },
      { title: "يعرضها عند الدخول", text: "تظهر على الشاشة الاسم والباقة والحالة: سارية أو منتهية." },
    ],
    whatTitle: "ماذا يحصل عليه النادي",
    features: [
      { title: "إدارة الأعضاء في مكان واحد", text: "بحث بالاسم أو الهاتف أو رقم العضوية، وتصفية حسب الحالة." },
      { title: "تمديد بنقرة", text: "شهر أو 3 أشهر أو سنة. التاريخ الجديد يصل إلى بطاقة العضو." },
      { title: "من ينتهي اشتراكه هذا الأسبوع", text: "الأعضاء الذين يقترب انتهاء اشتراكهم يظهرون بشكل منفصل لتتمكنوا من التجديد." },
      { title: "بطاقة بألوانكم وشعاركم", text: "يرى الأعضاء ناديكم، مع سطر Powered by Perkly صغير." },
      { title: "Google Wallet", text: "تُحفظ البطاقة في المحفظة على أندرويد. Apple Wallet قريباً، وحتى ذلك الحين تُحفظ على الشاشة الرئيسية في الآيفون." },
      { title: "الدفع يبقى عندكم", text: "يواصل الأعضاء الدفع لكم كالمعتاد. Perkly لا تجبي منهم ولا تتعامل مع أموالهم." },
    ],
    faqTitle: "أسئلة شائعة",
    faq: [
      { q: "هل لهذا علاقة ببطاقة الأختام من Perkly؟", a: "لا. Perkly for Clubs منتج منفصل، فيه أعضاء وتواريخ انتهاء وبدون أختام." },
      { q: "كيف يتم فحص البطاقة عند الدخول؟", a: "يعرض العضو البطاقة، ويرى الموظف الاسم والحالة. لا يوجد مسح ولا رمز QR، لذلك لا حاجة إلى معدات." },
      { q: "ماذا يحدث عند انتهاء الصلاحية؟", a: "تظهر البطاقة كمنتهية تلقائياً. وبعد التمديد تعود سارية." },
      { q: "هل يمكننا الإبقاء على نظام الدفع لدينا؟", a: "نعم. Perkly لا تجبي من الأعضاء. بعد أن يدفع العضو لديكم، حدّثوا تاريخه هنا." },
      { q: "كم التكلفة؟", a: "أول 10 أعضاء مجاناً. لمعرفة سعر الباقة الكاملة تحدثوا معنا." },
    ],
    finalTitle: "مستعدون لتوديع البطاقات البلاستيكية؟",
    finalText: "افتحوا النادي، أضيفوا الأعضاء الأوائل وأرسلوا لهم البطاقة.",
    stamps: "تبحثون عن بطاقة أختام؟",
    rights: "© 2026 Perkly",
    support: "الدعم عبر واتساب",
  },
  en: {
    dir: "ltr",
    home: "Perkly for Clubs home",
    login: "Sign in",
    cta: "Start your club",
    eyebrow: "Perkly for Clubs",
    title: "A digital member card for your club.",
    lead: "Gyms, studios and clubs: every member gets a card on their phone with their name, plan and expiry date. You update one place, and their card follows.",
    free: "First 10 members free",
    talk: "Talk to us on WhatsApp",
    points: ["No plastic cards", "No app for members to download", "Hebrew, Arabic and English"],
    demoAlt: "Example: a gym member card on a phone, shown as valid",
    demoClub: "Sample Fitness Club",
    demoKind: "Member card",
    demoName: "Noa Levi",
    demoNo: "Member no.",
    demoPlan: "Plan",
    demoPlanValue: "Yearly",
    demoValid: "Valid until",
    demoStatus: "Valid",
    howEyebrow: "How it works",
    howTitle: "Three steps, and you're set.",
    steps: [
      { title: "Add a member", text: "Name, plan and expiry date. Setting up your club takes a few minutes." },
      { title: "Send them the card", text: "A personal link on WhatsApp. On Android they can also save it to Google Wallet." },
      { title: "They show it at the door", text: "The screen shows their name, plan and status: valid or expired." },
    ],
    whatTitle: "What your club gets",
    features: [
      { title: "All members in one place", text: "Search by name, phone or member number, and filter by status." },
      { title: "Extend with one tap", text: "One month, three months or a year. The new date reaches the member's card." },
      { title: "See who ends this week", text: "Members whose plan is ending soon appear on their own, so you can renew them in time." },
      { title: "Your colors and logo", text: "Members see your club, with a small Powered by Perkly line." },
      { title: "Google Wallet", text: "The card saves to the wallet on Android. Apple Wallet is coming soon; until then, iPhone users save it to the home screen." },
      { title: "Payments stay with you", text: "Members keep paying you as they do today. Perkly doesn't charge them or handle their money." },
    ],
    faqTitle: "Questions",
    faq: [
      { q: "Is this related to Perkly stamp cards?", a: "No. Perkly for Clubs is a separate product, with members and expiry dates and no stamps." },
      { q: "How is a card checked at the door?", a: "The member shows the card, and staff see the name and status. There's no scanning and no QR code, so you don't need any equipment." },
      { q: "What happens when a membership ends?", a: "The card shows as expired by itself. Once you extend it, it's valid again." },
      { q: "Can we keep our payment system?", a: "Yes. Perkly doesn't charge members. After a member pays you, update their date here." },
      { q: "How much does it cost?", a: "Your first 10 members are free. For the full plan price, talk to us." },
    ],
    finalTitle: "Ready to drop the plastic cards?",
    finalText: "Open your club, add your first members and send them their cards.",
    stamps: "Looking for stamp cards?",
    rights: "© 2026 Perkly",
    support: "WhatsApp support",
  },
} as const;

const STEP_ICONS = [Plus, Send, IdCard];
const FEATURE_ICONS = [Users, CalendarCheck, ShieldCheck, IdCard, Wallet, Smartphone];
const HOME: Record<SiteLang, string> = { he: "/clubs", ar: "/clubs/ar", en: "/clubs/en" };
const STAMPS: Record<SiteLang, string> = { he: "/", ar: "/ar", en: "/en" };

export function clubsMeta(lang: SiteLang) {
  const c = COPY[lang];
  return {
    title: `Perkly for Clubs | ${c.title}`,
    description: c.lead,
    alternates: { canonical: HOME[lang], languages: { he: "/clubs", ar: "/clubs/ar", en: "/clubs/en", "x-default": "/clubs" } },
  };
}

function SampleCard({ lang }: { lang: SiteLang }) {
  const c = COPY[lang];
  return (
    <div className="lc-phone" role="img" aria-label={c.demoAlt}>
      <div className="lc-screen" aria-hidden="true">
        <div className="lc-card">
          <span className="lc-kind">{c.demoKind}</span>
          <span className="lc-club">{c.demoClub}</span>
          <span className="lc-name">{c.demoName}</span>
          <div className="lc-facts">
            <span><small>{c.demoNo}</small><b>128</b></span>
            <span><small>{c.demoPlan}</small><b>{c.demoPlanValue}</b></span>
            <span><small>{c.demoValid}</small><b dir="ltr">31/12/2026</b></span>
          </div>
        </div>
        <div className="lc-status"><CircleCheck size={20} />{c.demoStatus}</div>
      </div>
    </div>
  );
}

export default function ClubsLanding({ lang }: { lang: SiteLang }) {
  const c = COPY[lang];
  const signup = `/club?lang=${lang}`;
  const contact = waLink(c.eyebrow);
  return (
    <div className="lp lc" dir={c.dir} lang={lang}>
      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <a href={HOME[lang]} className="lp-home-link"><Logo label={c.home} /></a>
          <div className="lp-header-actions">
            <span className="lp-langs" role="group" aria-label="Language">
              <a href="/clubs" lang="he" hrefLang="he" aria-current={lang === "he" ? "true" : undefined}>עברית</a>
              <a href="/clubs/ar" lang="ar" hrefLang="ar" aria-current={lang === "ar" ? "true" : undefined}>العربية</a>
              <a href="/clubs/en" lang="en" hrefLang="en" aria-current={lang === "en" ? "true" : undefined}>English</a>
            </span>
            <a href="/login?next=/club" className="lc-login">{c.login}</a>
            <a href={signup} className="lp-btn lp-btn-primary lp-btn-sm">{c.cta}</a>
          </div>
        </div>
      </header>
      <main id="main">
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lc-hero-text">
              <span className="lp-eyebrow">{c.eyebrow}</span>
              <h1 className="lp-h1">{c.title}</h1>
              <p className="lp-lead">{c.lead}</p>
              <div className="lc-ctas">
                <a href={signup} className="lp-btn lp-btn-primary lp-btn-lg">{c.cta}</a>
                <a href={contact} target="_blank" rel="noopener noreferrer" className="lc-talk">{c.talk}</a>
              </div>
              <p className="lc-free">{c.free}</p>
              <ul className="lc-points">
                {c.points.map((p) => <li key={p}><CircleCheck size={18} aria-hidden="true" />{p}</li>)}
              </ul>
            </div>
            <SampleCard lang={lang} />
          </div>
        </section>

        <section className="lp-section lc-soft">
          <div className="lp-wrap">
            <span className="lp-eyebrow">{c.howEyebrow}</span>
            <h2 className="lp-h2">{c.howTitle}</h2>
            <ol className="lc-steps">
              {c.steps.map((s, i) => {
                const Icon = STEP_ICONS[i];
                return (
                  <li key={s.title}>
                    <span className="lc-icon"><Icon size={22} aria-hidden="true" /></span>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-h2">{c.whatTitle}</h2>
            <ul className="lc-features">
              {c.features.map((f, i) => {
                const Icon = FEATURE_ICONS[i];
                return (
                  <li key={f.title}>
                    <Icon size={22} aria-hidden="true" />
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="lp-section lc-soft">
          <div className="lp-wrap lp-faq-wrap">
            <h2 className="lp-h2">{c.faqTitle}</h2>
            <div className="lp-faq">
              {c.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}<Plus size={20} className="lp-faq-icon" aria-hidden="true" /></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-final">
              <h2 className="lp-h2">{c.finalTitle}</h2>
              <p className="lp-lead">{c.finalText}</p>
              <div className="lp-final-ctas"><a href={signup} className="lp-btn lc-btn-light lp-btn-lg">{c.cta}</a></div>
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap lc-footer">
          <Logo label="Perkly" />
          <a href={STAMPS[lang]}>{c.stamps}</a>
          <a href={contact} target="_blank" rel="noopener noreferrer">{c.support}&nbsp;<bdi>{WHATSAPP_DISPLAY}</bdi></a>
          <span>{c.rights}</span>
        </div>
      </footer>
    </div>
  );
}
