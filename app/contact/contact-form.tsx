"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- plain links on purpose: client-side navigation breaks on this server */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import "../landing/landing.css";
import { hrefs, waLink, WHATSAPP_DISPLAY, type Lang } from "../landing/content";
import { Logo } from "../landing/landing-client";
import { Icon } from "../landing/visuals";

// Pilot request form. Real: the request is saved (POST /api/lead) and shown on /admin.
// Online payment is not connected yet, so nothing is charged here.

const T = {
  he: {
    title: "דברו איתנו",
    intro: "רוצים שנעבור איתכם על המערכת לפני שמתחילים? השאירו פרטים ונחזור אליכם בוואטסאפ או בטלפון.",
    business: "שם העסק", contact: "שם איש הקשר", phone: "טלפון", email: "אימייל", optional: "(לא חובה)",
    kind: "סוג העסק", kindPick: "בחרו…", city: "עיר", note: "משהו שחשוב שנדע?",
    kinds: { cafe: "בית קפה", barber: "מספרה", food: "מסעדה או פיצרייה", icecream: "גלידרייה", studio: "סטודיו או חדר כושר", bar: "בר", other: "אחר" },
    kit: "מעוניינים גם בערכת קופה (99 ₪ חד־פעמי): 2 פוסטרים וסטנד QR",
    privacyBefore: "קראתי את ",
    privacyLink: "מדיניות הפרטיות",
    privacyAfter: " ואני מסכים/ה ש־Perkly תיצור איתי קשר",
    marketing: "אשמח לקבל מ־Perkly עדכונים והצעות (לא חובה)",
    submit: "שליחת הבקשה", sending: "שולח…",
    errSummary: "יש שדות שצריך לתקן:",
    err: { required: "שדה חובה", phone: "מספר טלפון לא תקין", email: "כתובת אימייל לא תקינה", privacy: "צריך לאשר כדי שנוכל לחזור אליכם" },
    errRate: "נשלחו יותר מדי בקשות. נסו שוב מאוחר יותר או כתבו לנו בוואטסאפ.",
    errNet: "השליחה נכשלה. בדקו את החיבור ונסו שוב.",
    doneTitle: "קיבלנו את הבקשה!",
    doneText: "נחזור אליכם בוואטסאפ או בטלפון. רוצים להתחיל כבר עכשיו? פותחים חשבון בשלוש דקות.",
    doneWa: "רוצים לזרז? שלחו לנו הודעה",
    doneWaText: (b: string) => `היי, השארתי פרטים באתר של Perkly (${b})`,
    askWaText: "היי, יש לי שאלה על Perkly",
    home: "חזרה לדף הבית",
    nextTitle: "או שמתחילים לבד",
    next: ["פותחים חשבון ומעצבים את הכרטיס", "משלמים 99 ₪ לחודש, בלי התחייבות", "מציבים QR בקופה ומתחילים להחתים"],
    price: "99 ₪ לחודש", priceNote: "בלי דמי הקמה",
    support: "שאלות? וואטסאפ",
    login: "כבר יש לי חשבון",
    start: "פתיחת חשבון עכשיו",
  },
  ar: {
    title: "تحدثوا معنا",
    intro: "تريدون أن نعرض عليكم النظام قبل البدء؟ اتركوا تفاصيلكم وسنعود إليكم عبر واتساب أو الهاتف.",
    business: "اسم المشروع", contact: "اسم الشخص المسؤول", phone: "الهاتف", email: "البريد الإلكتروني", optional: "(اختياري)",
    kind: "نوع المشروع", kindPick: "اختاروا…", city: "المدينة", note: "شيء مهم نعرفه؟",
    kinds: { cafe: "مقهى", barber: "صالون حلاقة", food: "مطعم أو بيتزا", icecream: "بوظة", studio: "ستوديو أو نادٍ رياضي", bar: "بار", other: "آخر" },
    kit: "مهتمون أيضاً بطقم الصندوق (99 ₪ لمرة واحدة): ملصقان وحامل QR",
    privacyBefore: "قرأت ",
    privacyLink: "سياسة الخصوصية",
    privacyAfter: " وأوافق على أن تتواصل معي Perkly",
    marketing: "يسعدني تلقي تحديثات وعروض من Perkly (اختياري)",
    submit: "إرسال الطلب", sending: "جارٍ الإرسال…",
    errSummary: "هناك حقول يجب تصحيحها:",
    err: { required: "حقل إلزامي", phone: "رقم هاتف غير صحيح", email: "بريد إلكتروني غير صحيح", privacy: "يجب الموافقة لكي نعود إليكم" },
    errRate: "تم إرسال طلبات كثيرة. حاولوا لاحقاً أو راسلونا عبر واتساب.",
    errNet: "فشل الإرسال. تحققوا من الاتصال وحاولوا مجدداً.",
    doneTitle: "استلمنا طلبكم!",
    doneText: "سنعود إليكم عبر واتساب أو الهاتف. تريدون البدء الآن؟ فتح الحساب يستغرق ثلاث دقائق.",
    doneWa: "تريدون التسريع؟ أرسلوا لنا رسالة",
    doneWaText: (b: string) => `مرحباً، تركت تفاصيلي في موقع Perkly (${b})`,
    askWaText: "مرحباً، لدي سؤال عن Perkly",
    home: "العودة للصفحة الرئيسية",
    nextTitle: "أو ابدأوا بأنفسكم",
    next: ["تفتحون حساباً وتصممون البطاقة", "تدفعون 99 ₪ شهرياً بدون التزام", "تضعون رمز QR عند الصندوق وتبدؤون بالأختام"],
    price: "99 ₪ شهرياً", priceNote: "بدون رسوم تأسيس",
    support: "أسئلة؟ واتساب",
    login: "لدي حساب",
    start: "فتح حساب الآن",
  },
  en: {
    title: "Talk to us",
    intro: "Want us to walk you through Perkly before you start? Leave your details and we'll get back to you on WhatsApp or by phone.",
    business: "Business name", contact: "Contact name", phone: "Phone", email: "Email", optional: "(optional)",
    kind: "Type of business", kindPick: "Choose…", city: "City", note: "Anything we should know?",
    kinds: { cafe: "Café", barber: "Barbershop", food: "Restaurant or pizzeria", icecream: "Ice cream shop", studio: "Studio or gym", bar: "Bar", other: "Other" },
    kit: "I'm also interested in a counter kit (₪99 one-time): 2 posters and a QR stand",
    privacyBefore: "I've read the ",
    privacyLink: "privacy policy",
    privacyAfter: " (in Hebrew) and agree that Perkly may contact me",
    marketing: "Send me updates and offers from Perkly (optional)",
    submit: "Send request", sending: "Sending…",
    errSummary: "Please fix these fields:",
    err: { required: "Required", phone: "Invalid phone number", email: "Invalid email address", privacy: "Please agree so we can get back to you" },
    errRate: "Too many requests. Try again later or message us on WhatsApp.",
    errNet: "Sending failed. Check your connection and try again.",
    doneTitle: "We got your request!",
    doneText: "We'll get back to you on WhatsApp or by phone. Want to start right away? Opening an account takes three minutes.",
    doneWa: "In a hurry? Send us a message",
    doneWaText: (b: string) => `Hi, I left my details on the Perkly site (${b})`,
    askWaText: "Hi, I have a question about Perkly",
    home: "Back to home",
    nextTitle: "Or start on your own",
    next: ["Open an account and design your card", "Pay ₪99 a month, no commitment", "Put up the QR code and start stamping"],
    price: "₪99 a month", priceNote: "No setup fee",
    support: "Questions? WhatsApp",
    login: "I have an account",
    start: "Create an account now",
  },
};

type FieldName = "business" | "contact" | "phone" | "email" | "privacy";
const ORDER: FieldName[] = ["business", "contact", "phone", "email", "privacy"];

const noSubscribe = () => () => {};

function readLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "ar" || q === "he" || q === "en") return q;
    const saved = localStorage.getItem("perkly-language");
    if (saved === "ar" || saved === "en") return saved;
  } catch {}
  return "he";
}

export default function ContactForm() {
  // Hebrew on the server; the browser picks ?lang= or the saved choice.
  const lang = useSyncExternalStore(noSubscribe, readLang, () => "he" as Lang);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const requestId = useRef<string>("");
  const sending = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    try { localStorage.setItem("perkly-language", lang); } catch {}
  }, [lang]);
  useEffect(() => { if (done) doneRef.current?.focus(); }, [done]);

  const t = T[lang];
  const h = hrefs(lang);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || sending.current) return;
    const f = new FormData(e.currentTarget);
    const data = {
      business: String(f.get("business") ?? "").trim(),
      contact: String(f.get("contact") ?? "").trim(),
      phone: String(f.get("phone") ?? "").trim(),
      email: String(f.get("email") ?? "").trim(),
      kind: String(f.get("kind") ?? ""),
      city: String(f.get("city") ?? "").trim(),
      note: String(f.get("note") ?? "").trim(),
      kit: f.get("kit") === "on",
      privacy: f.get("privacy") === "on",
      marketing: f.get("marketing") === "on",
    };
    // Quick checks in the browser; the server checks again.
    const errs: Partial<Record<FieldName, string>> = {};
    if (!data.business) errs.business = t.err.required;
    if (!data.contact) errs.contact = t.err.required;
    if (!/^[+\d][\d\s().-]{7,}$/.test(data.phone)) errs.phone = data.phone ? t.err.phone : t.err.required;
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errs.email = t.err.email;
    if (!data.privacy) errs.privacy = t.err.privacy;
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    // The same id on a retry or a double click: the server stores the request once.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    sending.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, lang, requestId: requestId.current }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; fields?: Record<string, string> };
      if (res.ok && body.ok) {
        setDone(data.business);
        return;
      }
      if (body.fields) {
        const map: Partial<Record<FieldName, string>> = {};
        for (const [k, v] of Object.entries(body.fields)) {
          if (!ORDER.includes(k as FieldName)) continue;
          map[k as FieldName] = v === "phone" ? t.err.phone : v === "email" ? t.err.email : k === "privacy" ? t.err.privacy : t.err.required;
        }
        setErrors(map);
        requestAnimationFrame(() => summaryRef.current?.focus());
      } else {
        setFormError(res.status === 429 ? t.errRate : t.errNet);
      }
    } catch {
      setFormError(t.errNet);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const err = (name: FieldName) => (errors[name] ? <span id={`${name}-err`} className="su-err">{errors[name]}</span> : null);
  const aria = (name: FieldName) => ({ "aria-invalid": errors[name] ? true : undefined, "aria-describedby": errors[name] ? `${name}-err` : undefined });
  const labels: Record<FieldName, string> = { business: t.business, contact: t.contact, phone: t.phone, email: t.email, privacy: t.privacyLink };

  return (
    <div className="lp su" lang={lang} dir={lang === "en" ? "ltr" : "rtl"}>
      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <a href={h.home} className="lp-home-link"><Logo label="Perkly" /></a>
          <a href={h.login} className="lp-login">{t.login}</a>
        </div>
      </header>
      <main className="lp-main lp-wrap su-main">
        {done ? (
          <section className="su-card su-done" aria-labelledby="done-title">
            <span className="su-done-icon" aria-hidden="true"><Icon name="check" size={40} stroke={2.8} /></span>
            <h1 id="done-title" ref={doneRef} tabIndex={-1} className="lp-h2">{t.doneTitle}</h1>
            <p className="lp-lead">{t.doneText}</p>
            <div className="su-done-actions">
              <a className="lp-btn lp-btn-primary" href={waLink(t.doneWaText(done))} target="_blank" rel="noopener noreferrer"><Icon name="message" size={18} />{t.doneWa}</a>
              <a className="lp-btn lp-btn-dark" href={h.signup}>{t.start}</a>
              <a className="lp-btn lp-btn-ghost" href={h.home}>{t.home}</a>
            </div>
          </section>
        ) : (
          <div className="su-grid">
            <form className="su-card" onSubmit={submit} noValidate aria-labelledby="su-title">
              <h1 id="su-title" className="lp-h2">{t.title}</h1>
              <p className="lp-body">{t.intro}</p>
              {Object.keys(errors).length ? (
                <div ref={summaryRef} tabIndex={-1} className="su-summary" role="alert">
                  <strong>{t.errSummary}</strong>
                  <ul>
                    {ORDER.filter((n) => errors[n]).map((n) => (
                      <li key={n}><a href={`#su-${n}`}>{labels[n]}: {errors[n]}</a></li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="su-row">
                <label className="su-field">{t.business}<input id="su-business" name="business" autoComplete="organization" maxLength={80} required {...aria("business")} />{err("business")}</label>
                <label className="su-field">{t.contact}<input id="su-contact" name="contact" autoComplete="name" maxLength={80} required {...aria("contact")} />{err("contact")}</label>
              </div>
              <div className="su-row">
                <label className="su-field">{t.phone}<input id="su-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={20} required {...aria("phone")} />{err("phone")}</label>
                <label className="su-field"><span>{t.email} <span className="su-opt">{t.optional}</span></span><input id="su-email" name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" maxLength={200} {...aria("email")} />{err("email")}</label>
              </div>
              <div className="su-row">
                <label className="su-field"><span>{t.kind} <span className="su-opt">{t.optional}</span></span>
                  <select name="kind" defaultValue="">
                    <option value="">{t.kindPick}</option>
                    {Object.entries(t.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="su-field"><span>{t.city} <span className="su-opt">{t.optional}</span></span><input name="city" autoComplete="address-level2" maxLength={60} /></label>
              </div>
              <label className="su-field"><span>{t.note} <span className="su-opt">{t.optional}</span></span><textarea name="note" rows={3} maxLength={500} /></label>
              <label className="su-check su-kit"><input type="checkbox" name="kit" /><span>{t.kit}</span></label>
              <div className="su-checks">
                <label className="su-check">
                  <input id="su-privacy" type="checkbox" name="privacy" required {...aria("privacy")} />
                  <span>{t.privacyBefore}<a href="/privacy" target="_blank" rel="noopener">{t.privacyLink}</a>{t.privacyAfter}</span>
                </label>
                {err("privacy")}
                <label className="su-check"><input type="checkbox" name="marketing" /><span>{t.marketing}</span></label>
              </div>
              {formError ? <p className="su-summary" role="alert">{formError}</p> : null}
              <button type="submit" className="lp-btn lp-btn-primary lp-btn-lg lp-btn-wide" disabled={busy} aria-busy={busy}>{busy ? t.sending : t.submit}</button>
            </form>
            <aside className="su-side" aria-labelledby="su-next">
              <h2 id="su-next" className="lp-h3">{t.nextTitle}</h2>
              <ol className="su-steps">
                {t.next.map((s, i) => <li key={s}><span>{i + 1}</span>{s}</li>)}
              </ol>
              <p className="su-price"><strong>{t.price}</strong> · {t.priceNote}</p>
              <a className="lp-btn lp-btn-dark lp-btn-wide" href={h.signup}>{t.start}</a>
              <a href={waLink(t.askWaText)} target="_blank" rel="noopener noreferrer" className="su-support"><Icon name="message" size={18} />{t.support}&nbsp;<bdi className="lp-num">{WHATSAPP_DISPLAY}</bdi></a>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
