// Pulseem "direct send" SMS API (https://api.pulseem.com/swagger): POST /api/v1/SmsApi/SendSms,
// API key in the "APIKey" header. One request can carry many numbers, each with its own text.
// The key (PULSEEM_API_KEY, a secret) and the approved sender (PULSEEM_FROM) are set in Cloudflare.

export type PulseemEnv = { PULSEEM_API_KEY?: string; PULSEEM_FROM?: string };

const URL_SEND = "https://api.pulseem.com/api/v1/SmsApi/SendSms";
/** Numbers per request. */
export const SMS_BATCH = 100;

export function smsConfigured(env: PulseemEnv): boolean {
  return !!env.PULSEEM_API_KEY && !!env.PULSEEM_FROM;
}

/** Pulseem takes Israeli numbers in local form (0501234567); other numbers without the plus. */
export function pulseemNumber(phone: string): string {
  return phone.startsWith("+972") ? "0" + phone.slice(4) : phone.replace(/^\+/, "");
}

export type SmsItem = { to: string; text: string; ref: string };
export type SmsResult = { ok: boolean; status: number; detail: string };

/**
 * Sends one batch. Marketing messages get Pulseem's automatic unsubscribe link (the law requires
 * a way to opt out). Never throws: a network error comes back as ok: false.
 */
export async function sendSmsBatch(env: PulseemEnv, items: SmsItem[], sendId: string, marketing: boolean): Promise<SmsResult> {
  try {
    const r = await fetch(URL_SEND, {
      method: "POST",
      headers: { APIKey: env.PULSEEM_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
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
    const body = (await r.text()).slice(0, 300);
    // Pulseem may answer 200 with an error inside the body.
    const bodyError = /"(status|Status)"\s*:\s*"?(error|Error|failed|Failed)/.test(body) || /"error"\s*:\s*"[^"]+"/i.test(body);
    return { ok: r.ok && !bodyError, status: r.status, detail: body };
  } catch (e) {
    return { ok: false, status: 0, detail: (e as Error).message.slice(0, 300) };
  }
}
