// Polar (merchant of record): creates checkout sessions and verifies webhooks (Standard Webhooks).
// The access token and webhook secret are never sent to the browser.

const encoder = new TextEncoder();
const TOLERANCE_SECONDS = 300;

export type PolarEnv = {
  POLAR_ACCESS_TOKEN?: string;
  POLAR_PRODUCT_ID?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_SANDBOX?: string;
};

export function polarConfigured(env: PolarEnv): boolean {
  return !!(env.POLAR_ACCESS_TOKEN && env.POLAR_PRODUCT_ID && env.POLAR_WEBHOOK_SECRET);
}

function apiBase(env: PolarEnv): string {
  return env.POLAR_SANDBOX === "1" ? "https://sandbox-api.polar.sh/v1" : "https://api.polar.sh/v1";
}

/** Creates a hosted Polar checkout for one business. Returns the URL to redirect the owner to. */
export async function createCheckoutUrl(env: PolarEnv, businessId: string, origin: string, customerEmail: string): Promise<string> {
  const response = await fetch(`${apiBase(env)}/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      products: [env.POLAR_PRODUCT_ID],
      success_url: `${origin}/billing?ok=1`,
      return_url: `${origin}/billing`,
      customer_email: customerEmail,
      // Copied to the subscription, so webhooks can find the business.
      metadata: { business: businessId },
    }),
  });
  const data = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || !data?.url) throw new Error(`polar_checkout_failed:${response.status}`);
  return data.url;
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/**
 * Verifies a Standard Webhooks signature: HMAC-SHA256 over `id.timestamp.body`, keyed with the
 * base64 part of the `whsec_` secret. The `webhook-signature` header may hold several `v1,<sig>` entries.
 */
export async function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!ts || Math.abs(now - ts) > TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToBase64(await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${body}`)));
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value || value.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ value.charCodeAt(i);
    return diff === 0;
  });
}

export type SubscriptionRow = {
  business: string;
  status: string;
  plan: string | null;
  externalCustomer: string | null;
  externalSubscription: string;
  currentPeriodEnd: string | null;
};

type PolarEvent = { type: string; data: Record<string, unknown> };

/** Maps a `subscription.*` event to the subscription row. Other events return null. */
export function subscriptionRow(event: PolarEvent): SubscriptionRow | null {
  if (!event.type.startsWith("subscription.")) return null;
  const d = event.data;
  const metadata = d.metadata as Record<string, unknown> | undefined;
  const business = metadata?.business;
  const id = d.id;
  if (typeof business !== "string" || typeof id !== "string") return null;
  const customer = d.customer as { id?: unknown } | undefined;
  const periodEnd = d.current_period_end;
  return {
    business,
    status: typeof d.status === "string" ? d.status : "none",
    plan: typeof d.product_id === "string" ? d.product_id : null,
    externalCustomer: typeof d.customer_id === "string" ? d.customer_id : typeof customer?.id === "string" ? customer.id : null,
    externalSubscription: id,
    currentPeriodEnd: typeof periodEnd === "string" ? periodEnd : null,
  };
}
