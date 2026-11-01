// Polar (merchant of record): creates checkout sessions and verifies webhooks (Standard Webhooks).
// The access token and webhook secret are never sent to the browser.

const encoder = new TextEncoder();
const TOLERANCE_SECONDS = 300;

export type PolarEnv = {
  POLAR_ACCESS_TOKEN?: string;
  POLAR_PRODUCT_ID?: string;
  /** Optional: the yearly product ($290 a year, counter kit included). Without it only the monthly plan is offered. */
  POLAR_PRODUCT_ID_YEARLY?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_SANDBOX?: string;
};

export function polarConfigured(env: PolarEnv): boolean {
  return !!(env.POLAR_ACCESS_TOKEN && env.POLAR_PRODUCT_ID && env.POLAR_WEBHOOK_SECRET);
}

/** Whether the yearly plan can be sold: billing works and a yearly product is set. */
export function yearlyConfigured(env: PolarEnv): boolean {
  return polarConfigured(env) && !!env.POLAR_PRODUCT_ID_YEARLY;
}

function apiBase(env: PolarEnv): string {
  return env.POLAR_SANDBOX === "1" ? "https://sandbox-api.polar.sh/v1" : "https://api.polar.sh/v1";
}

/**
 * Creates a hosted Polar checkout for one business. Returns the URL to redirect the owner to.
 * `from: "start"` returns the owner to the guided setup (/start) instead of the billing page.
 */
export async function createCheckoutUrl(env: PolarEnv, businessId: string, origin: string, customerEmail: string, from: "billing" | "start" = "billing", trialDays = 0, plan: "monthly" | "yearly" = "monthly"): Promise<string> {
  const b = encodeURIComponent(businessId);
  const success = from === "start" ? `${origin}/start?paid=1&b=${b}` : `${origin}/billing?ok=1`;
  const back = from === "start" ? `${origin}/start?b=${b}` : `${origin}/billing`;
  const response = await fetch(`${apiBase(env)}/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      products: [plan === "yearly" && env.POLAR_PRODUCT_ID_YEARLY ? env.POLAR_PRODUCT_ID_YEARLY : env.POLAR_PRODUCT_ID],
      // Free trial: the card is collected now and first charged when the trial ends.
      ...(trialDays > 0 ? { allow_trial: true, trial_interval: "day", trial_interval_count: trialDays } : {}),
      success_url: success,
      return_url: back,
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
 * Verifies a Standard Webhooks signature: HMAC-SHA256 over `id.timestamp.body`.
 * Polar keys the HMAC with the secret's own bytes (its SDK base64-encodes the secret before handing
 * it to Standard Webhooks, which decodes it again). A `whsec_<base64>` secret is also accepted, keyed
 * with its decoded bytes. The `webhook-signature` header may hold several `v1,<sig>` entries.
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
  const keys: Uint8Array<ArrayBuffer>[] = [encoder.encode(secret) as Uint8Array<ArrayBuffer>];
  if (secret.startsWith("whsec_")) {
    try {
      keys.push(base64ToBytes(secret.slice(6)));
    } catch {
      // Not base64 after all: only the plain form applies.
    }
  }
  const signed = encoder.encode(`${id}.${timestamp}.${body}`);
  for (const raw of keys) {
    const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = bytesToBase64(await crypto.subtle.sign("HMAC", key, signed));
    const match = signature.split(" ").some((part) => {
      const [version, value] = part.split(",", 2);
      if (version !== "v1" || !value || value.length !== expected.length) return false;
      let diff = 0;
      for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ value.charCodeAt(i);
      return diff === 0;
    });
    if (match) return true;
  }
  return false;
}

export type SubscriptionRow = {
  business: string;
  status: string;
  plan: string | null;
  externalCustomer: string | null;
  externalSubscription: string;
  currentPeriodEnd: string | null;
  /** When Polar last changed this subscription; older events never overwrite newer ones. */
  changedAt: string | null;
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
    changedAt: typeof d.modified_at === "string" ? d.modified_at : typeof d.created_at === "string" ? d.created_at : null,
  };
}

export type PolarOrder = {
  id: string;
  created: string;
  amount: number; // in major units (e.g. shekels)
  currency: string;
  status: string;
  reason: string;
  customerEmail: string | null;
  business: string | null;
};

/**
 * Recent orders (payments) from Polar, newest first, for the admin billing page.
 * Reads up to `pages` pages of 100. Field names are read defensively, since the API evolves.
 * Throws "polar_orders_<status>" on an API error (e.g. 401/403 when the token lacks orders:read).
 */
export async function listOrders(env: PolarEnv, pages = 3): Promise<PolarOrder[]> {
  if (!env.POLAR_ACCESS_TOKEN) throw new Error("polar_not_configured");
  const out: PolarOrder[] = [];
  for (let page = 1; page <= pages; page++) {
    const r = await fetch(`${apiBase(env)}/orders/?limit=100&page=${page}&sorting=-created_at`, {
      headers: { Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`, Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`polar_orders_${r.status}`);
    const data = (await r.json()) as { items?: Record<string, any>[]; pagination?: { max_page?: number } };
    for (const o of data.items ?? []) {
      const cents = Number(o.total_amount ?? o.amount ?? o.net_amount ?? 0);
      out.push({
        id: String(o.id ?? ""),
        created: String(o.created_at ?? ""),
        amount: Number.isFinite(cents) ? cents / 100 : 0,
        currency: String(o.currency ?? "").toUpperCase(),
        status: String(o.status ?? (o.paid ? "paid" : "")),
        reason: String(o.billing_reason ?? ""),
        customerEmail: typeof o.customer?.email === "string" ? o.customer.email : null,
        business: typeof o.metadata?.business === "string" ? o.metadata.business : typeof o.subscription?.metadata?.business === "string" ? o.subscription.metadata.business : null,
      });
    }
    if (!data.pagination?.max_page || page >= data.pagination.max_page) break;
  }
  return out;
}

/**
 * Stops a subscription from renewing: it stays active until the paid period ends, then ends.
 * Needs the subscriptions:write scope on POLAR_ACCESS_TOKEN. Returns false when Polar refuses.
 */
export async function cancelAtPeriodEnd(env: PolarEnv, subscriptionId: string): Promise<boolean> {
  if (!env.POLAR_ACCESS_TOKEN) return false;
  const r = await fetch(`${apiBase(env)}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_period_end: true }),
  }).catch(() => null);
  if (!r?.ok) console.warn(`polar cancel failed: HTTP ${r?.status ?? "network"}`);
  return !!r?.ok;
}
