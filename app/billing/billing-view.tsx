"use client";

import { useEffect, useState } from "react";
import { useLang } from "../../lib/i18n";
import { withPrices, type Currency } from "../../lib/pricing";

export type BillingBusiness = {
  id: string; name: string; status: string; periodEnd: string | null; compUntil?: string | null;
  /** The current subscription's plan, when there is one. */
  plan?: "monthly" | "yearly" | null;
  /** Yearly plan's counter kit: owed ("due") or shipped ("sent"). */
  kit?: "due" | "sent" | null;
  /** Has a Polar subscription the owner can manage (card, invoices, cancel). */
  manage?: boolean;
  /** When a subscription started now would first charge (after the trial or the free access). */
  firstCharge?: string | null;
};

const FOREVER_YEAR = "9999";
const WHATSAPP = "972526028291";

// Hebrew in Israel; English abroad, or when the owner picked English.
const T = {
  he: {
    status: { none: "לא הופעל", trialing: "תקופת ניסיון", active: "פעיל", past_due: "תשלום נכשל", unpaid: "לא שולם", canceled: "בוטל", incomplete: "לא הושלם" } as Record<string, string>,
    back: "← חזרה ללוח הבקרה", title: "מנוי ותשלום",
    intro: "בלי דמי הקמה. למנוי חדש 14 ימי ניסיון חינם, והחיוב הראשון רק אחרי 14 ימים.",
    pick: "בחירת מסלול",
    plans: {
      monthly: { name: "חודשי", price: "{$m} לחודש", note: "מבטלים מתי שרוצים" },
      yearly: { name: "שנתי", price: "{$y} לשנה", note: "כ־{$ym} לחודש, וערכת הקופה כלולה (2 פוסטרים וסטנד QR)" },
    },
    paidWaiting: "התשלום התקבל. מעדכנים את סטטוס המנוי...", paidDone: "התשלום התקבל. אם הסטטוס עדיין לא עודכן, רענן את העמוד או פנה לתמיכה.",
    off: "התשלומים עדיין לא מופעלים. נסה שוב מאוחר יותר, או פנה אלינו ב-support@perkly.shop.",
    none: "אין לך עסקים שאתה בעלים שלהם.",
    statusLabel: "סטטוס", planLabel: "מסלול",
    kitAfter: "ערכת הקופה תישלח אחרי החיוב הראשון.", kitIncluded: "ערכת הקופה כלולה במנוי.", kitAddress: "שלחו לנו כתובת למשלוח בוואטסאפ",
    kitText: (name: string) => `היי, זו כתובת המשלוח לערכת הקופה של ${name}:`, kitSent: "ערכת הקופה נשלחה.",
    next: "החיוב הבא", comp: "גישה ללא מנוי", forever: "ללא הגבלת זמן", until: "עד",
    opening: "פותח דף תשלום...", start: (plan: string) => `הפעלת מנוי ${plan}`, failed: "לא הצלחנו לפתוח את דף התשלום. נסה שוב.", testSite: "זה אתר הבדיקה. תשלום אמיתי עושים רק ב־perkly.shop.",
    manage: "ניהול המנוי: כרטיס אשראי, חשבוניות וביטול", managing: "פותח את דף המנוי...", manageFailed: "לא הצלחנו לפתוח את דף המנוי. נסה שוב, או כתוב לנו ב־support@perkly.shop.",
    pastDue: "החיוב האחרון נכשל. עדכנו את כרטיס האשראי כדי שהכרטיסים ימשיכו לעבוד.",
    firstCharge: "אם תפעילו עכשיו, החיוב הראשון יהיה ב־{d}.",
    allSet: "המנוי פעיל. אין צורך לעשות כלום: החיוב מתחדש לבד.",
    invoices: "החשבוניות (PDF) נמצאות ב\"ניהול המנוי\". לפני ההורדה אפשר להוסיף שם חברה, כתובת ומספר עוסק או ח.פ.: אחרי שהחשבונית נוצרת הפרטים לא משתנים. החשבונית מונפקת על ידי Polar, חברה זרה שגובה את התשלום, בלי מע״מ ישראלי. כדאי לבדוק עם רואה החשבון איך לרשום אותה.",
    locale: "he-IL",
  },
  en: {
    status: { none: "Not started", trialing: "Free trial", active: "Active", past_due: "Payment failed", unpaid: "Unpaid", canceled: "Canceled", incomplete: "Incomplete" } as Record<string, string>,
    back: "← Back to dashboard", title: "Subscription and billing",
    intro: "No setup fee. A new subscription starts with a 14-day free trial; the first charge is after 14 days.",
    pick: "Choose a plan",
    plans: {
      monthly: { name: "Monthly", price: "{$m} a month", note: "Cancel anytime" },
      yearly: { name: "Yearly", price: "{$y} a year", note: "About {$ym} a month, with the counter kit included (2 posters and a QR stand)" },
    },
    paidWaiting: "Payment received. Updating your subscription...", paidDone: "Payment received. If the status hasn't updated yet, refresh the page or contact support.",
    off: "Payments aren't switched on yet. Try again later, or write to support@perkly.shop.",
    none: "You don't own any businesses.",
    statusLabel: "Status", planLabel: "plan",
    kitAfter: "The counter kit ships after the first charge.", kitIncluded: "The counter kit is included.", kitAddress: "Send us a shipping address on WhatsApp",
    kitText: (name: string) => `Hi, here is the shipping address for the ${name} counter kit:`, kitSent: "The counter kit has shipped.",
    next: "Next charge", comp: "Access without a subscription", forever: "no end date", until: "until",
    opening: "Opening the payment page...", start: (plan: string) => `Start the ${plan.toLowerCase()} plan`, failed: "We couldn't open the payment page. Please try again.", testSite: "This is the test site. Real payments are taken only on perkly.shop.",
    manage: "Manage subscription: card, invoices and cancel", managing: "Opening your subscription page...", manageFailed: "We couldn't open your subscription page. Try again, or write to support@perkly.shop.",
    pastDue: "The last charge failed. Update your card so the loyalty cards keep working.",
    firstCharge: "If you start now, the first charge is on {d}.",
    allSet: "Your subscription is active. Nothing to do: it renews on its own.",
    invoices: "Invoices (PDF) are under \"Manage subscription\". Before downloading you can add a company name, address and tax ID; once an invoice is created its details can't change. Invoices are issued by Polar, the company that takes the payment.",
    locale: "en-US",
  },
};

export default function BillingView({ businesses, configured, yearly = false, currency = "ILS" }: { businesses: BillingBusiness[]; configured: boolean; yearly?: boolean; currency?: Currency }) {
  const { lang } = useLang();
  const L = lang === "en" ? "en" : "he";
  const t = withPrices(T[L], currency, L);
  const PLANS = t.plans;
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [error, setError] = useState("");
  const [returned, setReturned] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // Returning from Polar with ?ok=1: the webhook may land a few seconds later, so retry the page a few times.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ok") !== "1") return;
    setReturned(true);
    const active = businesses.some((b) => ["active", "trialing"].includes(b.status));
    if (active) return;
    const attempt = Number(sessionStorage.getItem("billing-attempts") ?? "0");
    if (attempt >= 5) return;
    setWaiting(true);
    sessionStorage.setItem("billing-attempts", String(attempt + 1));
    const timer = setTimeout(() => window.location.reload(), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function manage(businessId: string) {
    setError("");
    setBusy("m" + businessId);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: businessId }),
      });
      const data = (await response.json().catch(() => null)) as { url?: string; code?: string } | null;
      if (response.ok && data?.url) { window.location.assign(data.url); return; }
      setError(data?.code === "billing_test_site" ? t.testSite : t.manageFailed);
    } catch {
      setError(t.manageFailed);
    }
    setBusy(null);
  }

  // The plan choice only matters while some business can still start a subscription.
  const anyToStart = configured && businesses.some((b) => !["active", "trialing"].includes(b.status) && !b.compUntil?.startsWith(FOREVER_YEAR));
  const allLive = businesses.length > 0 && businesses.every((b) => ["active", "trialing"].includes(b.status) || !!b.compUntil?.startsWith(FOREVER_YEAR));
  const day = (iso: string) => new Date(iso).toLocaleDateString(t.locale);

  async function subscribe(businessId: string) {
    const chosen = yearly ? plan : "monthly";
    setError("");
    setBusy(businessId);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: businessId, plan: chosen }),
      });
      const data = (await response.json().catch(() => null)) as { url?: string; code?: string } | null;
      if (response.ok && data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data?.code === "billing_test_site" ? t.testSite : t.failed);
    } catch {
      setError(t.failed);
    }
    setBusy(null);
  }

  return (
    <main className="card" lang={L} dir={L === "en" ? "ltr" : "rtl"} style={{ maxWidth: 560, margin: "32px auto", padding: 24 }}>
      <a href="/" style={{ fontSize: 14, display: "inline-block", marginBottom: 12 }}>{t.back}</a>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t.title}</h1>
      <p style={{ marginBottom: 12 }}>{allLive ? t.allSet : t.intro}</p>
      {anyToStart && (
        <fieldset className="plan-pick" style={{ border: 0, padding: 0, margin: "0 0 16px", display: "grid", gap: 8 }}>
          <legend className="sr-only">{t.pick}</legend>
          {(yearly ? (["monthly", "yearly"] as const) : (["monthly"] as const)).map((p) => (
            <label key={p} className="check" style={{ alignItems: "flex-start", border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, borderColor: plan === p ? "#7558E8" : "#e5e5e5" }}>
              <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} />
              <span><strong>{PLANS[p].name} · {PLANS[p].price}</strong><br /><small className="muted">{PLANS[p].note}</small></span>
            </label>
          ))}
        </fieldset>
      )}
      {returned && <p role="status" style={{ marginBottom: 16 }}>{waiting ? t.paidWaiting : t.paidDone}</p>}
      {!configured && <p style={{ marginBottom: 16 }}>{t.off}</p>}
      {businesses.length === 0 && <p>{t.none}</p>}
      {businesses.map((b) => {
        const canSubscribe = configured && !["active", "trialing"].includes(b.status);
        // Free access without an end date (given by an admin): nothing to pay.
        const forever = !!b.compUntil?.startsWith(FOREVER_YEAR);
        return (
          <section key={b.id} style={{ borderTop: "1px solid #e5e5e5", padding: "16px 0" }}>
            <strong>{b.name}</strong>
            <div style={{ margin: "6px 0" }}>{t.statusLabel}: {t.status[b.status] ?? b.status}{b.plan && ["active", "trialing", "past_due"].includes(b.status) ? (L === "en" ? ` · ${PLANS[b.plan].name} ${t.planLabel}` : ` · ${t.planLabel} ${PLANS[b.plan].name}`) : ""}</div>
            {b.plan === "yearly" && b.status === "trialing" && <div style={{ fontSize: 14, marginBottom: 6 }}>{t.kitAfter}</div>}
            {b.kit === "due" && (
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                {t.kitIncluded}{" "}
                <a href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(t.kitText(b.name))}`} target="_blank" rel="noreferrer">{t.kitAddress}</a>
              </div>
            )}
            {b.kit === "sent" && <div style={{ fontSize: 14, marginBottom: 6 }}>{t.kitSent}</div>}
            {b.periodEnd && <div style={{ fontSize: 14, marginBottom: 6 }}>{t.next}: {new Date(b.periodEnd).toLocaleDateString(t.locale)}</div>}
            {b.compUntil && (
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                {t.comp}: {b.compUntil.startsWith(FOREVER_YEAR) ? t.forever : `${t.until} ${new Date(b.compUntil).toLocaleDateString(t.locale)}`}
              </div>
            )}
            {b.status === "past_due" && <p role="alert" style={{ fontSize: 14, margin: "6px 0", color: "#b00020", fontWeight: 600 }}>{t.pastDue}</p>}
            {canSubscribe && !forever && (
              <>
                {b.firstCharge && <div style={{ fontSize: 14, marginBottom: 6 }}>{t.firstCharge.replace("{d}", day(b.firstCharge))}</div>}
                <button className="btn primary" disabled={busy === b.id} onClick={() => subscribe(b.id)}>
                  {busy === b.id ? t.opening : t.start(PLANS[yearly ? plan : "monthly"].name)}
                </button>
              </>
            )}
            {b.manage && configured && (
              <div style={{ marginTop: 8 }}>
                <p className="muted" style={{ fontSize: 13, margin: "0 0 8px", lineHeight: 1.5 }}>{t.invoices}</p>
                <button className={"btn " + (b.status === "past_due" ? "primary" : "soft")} disabled={busy === "m" + b.id} onClick={() => manage(b.id)}>
                  {busy === "m" + b.id ? t.managing : t.manage}
                </button>
              </div>
            )}
          </section>
        );
      })}
      {error && <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>{error}</p>}
    </main>
  );
}
