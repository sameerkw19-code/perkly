// Pulseem "direct send" SMS API (https://api.pulseem.com/swagger): POST /api/v1/SmsApi/SendSms,
// API key in the "APIKey" header. One request can carry many numbers, each with its own text.
// The key (PULSEEM_API_KEY, a secret) and the approved sender (PULSEEM_FROM) are set in Cloudflare.

export type PulseemEnv = { PULSEEM_API_KEY?: string; PULSEEM_FROM?: string };

const URL_SEND = "https://api.pulseem.com/api/v1/SmsApi/SendSms";
/** Numbers per request. */
export const SMS_BATCH = 100;

export function smsConfigured(env: PulseemEnv): boolean {
  return !!env.PULSEEM_API_KEY && validSender(env.PULSEEM_FROM);
}

/** Pulseem takes Israeli numbers as 05XXXXXXXX (or 9725XXXXXXXX); other numbers without the plus. */
export function pulseemNumber(phone: string): string {
  return phone.startsWith("+972") ? "0" + phone.slice(4) : phone.replace(/^\+/, "");
}

export type SmsItem = { to: string; text: string; ref: string };
export type SmsResult = { ok: boolean; status: number; detail: string; sent: number; failed: number };

/** Pulseem's sender: 3–11 letters or digits (an approved name or a virtual number). */
export function validSender(from: string | undefined): boolean {
  return !!from && /^[A-Za-z0-9]{3,11}$/.test(from);
}

/**
 * Sends one batch. Marketing messages get Pulseem's automatic unsubscribe link (the law requires
 * a way to opt out). Pulseem answers {status, error, successCount, failCount}. Never throws.
 */
export async function sendSmsBatch(env: PulseemEnv, items: SmsItem[], sendId: string, marketing: boolean): Promise<SmsResult> {
  try {
    const r = await fetch(URL_SEND, {
      method: "POST",
      headers: { APIKEY: env.PULSEEM_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sendId,
        isAsync: false,
        smsSendData: {
          fromNumber: env.PULSEEM_FROM,
          toNumberList: items.map((i) => pulseemNumber(i.to)),
          referenceList: items.map((i) => i.ref),
          textList: items.map((i) => i.text),
          isAutomaticUnsubscribeLink: marketing,
        },
      }),
    });
    const text = await r.text();
    let data: { status?: string; error?: string | null; successCount?: number; failCount?: number } = {};
    try { data = JSON.parse(text); } catch { /* not JSON: treated as a failure below */ }
    const accepted = r.ok && String(data.status ?? "").toLowerCase() === "success" && !data.error;
    const sent = accepted ? (typeof data.successCount === "number" ? data.successCount : items.length) : 0;
    const failed = accepted ? (typeof data.failCount === "number" ? data.failCount : 0) : items.length;
    return { ok: accepted && sent > 0, status: r.status, detail: text.slice(0, 300), sent, failed };
  } catch (e) {
    return { ok: false, status: 0, detail: (e as Error).message.slice(0, 300), sent: 0, failed: items.length };
  }
}
