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
    opening: "פותח דף תשלום...", start: (plan: string) => `הפעלת מנוי ${plan}`, failed: "לא הצלחנו לפתוח את דף התשלום. נסה שוב.",
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
    opening: "Opening the payment page...", start: (plan: string) => `Start the ${plan.toLowerCase()} plan`, failed: "We couldn't open the payment page. Please try again.",
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
      const data = (await response.json().catch(() => null)) as { url?: string } | null;
      if (response.ok && data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError(t.failed);
    } catch {
      setError(t.failed);
    }
    setBusy(null);
  }

  return (
    <main className="card" lang={L} dir={L === "en" ? "ltr" : "rtl"} style={{ maxWidth: 560, margin: "32px auto", padding: 24 }}>
      <a href="/" style={{ fontSize: 14, display: "inline-block", marginBottom: 12 }}>{t.back}</a>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t.title}</h1>
      <p style={{ marginBottom: 12 }}>{t.intro}</p>
      {configured && (
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
            {canSubscribe && !forever && (
              <button className="btn soft" disabled={busy === b.id} onClick={() => subscribe(b.id)}>
                {busy === b.id ? t.opening : t.start(PLANS[yearly ? plan : "monthly"].name)}
              </button>
            )}
          </section>
        );
      })}
      {error && <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>{error}</p>}
    </main>
  );
}
