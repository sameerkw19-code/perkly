// Stripe subscriptions, without the Stripe SDK (it does not run on Cloudflare Workers well).
// Only the server ever holds the Stripe secret key; the browser just gets a checkout URL.

const encoder = new TextEncoder();
const STRIPE_API = "https://api.stripe.com/v1";
const TOLERANCE_SECONDS = 300;

export type BillingEnv = { STRIPE_SECRET_KEY?: string; STRIPE_PRICE_ID?: string; STRIPE_WEBHOOK_SECRET?: string };

export function billingConfigured(env: BillingEnv): boolean {
  return !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET);
}

/** Creates a hosted Stripe Checkout session for one business. Returns the URL to redirect to. */
export async function createCheckoutUrl(
  env: BillingEnv,
  businessId: string,
  origin: string,
  customerEmail: string | null,
): Promise<string> {
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": env.STRIPE_PRICE_ID as string,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/dashboard?billing=ok`,
    cancel_url: `${origin}/dashboard?billing=cancelled`,
    client_reference_id: businessId,
    "metadata[business]": businessId,
    "subscription_data[metadata][business]": businessId,
    "subscription_data[trial_period_days]": "14",
  });
  if (customerEmail) body.set("customer_email", customerEmail);
  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || !data?.url) throw new Error(`stripe_checkout_failed:${response.status}`);
  return data.url;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Checks Stripe's `Stripe-Signature` header: `t=<unix>,v1=<hmac>`, where the HMAC is over `t + "." + body`.
 * Rejects old timestamps to stop replays.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature || Math.abs(now - timestamp) > TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export type SubscriptionUpdate = {
  business: string;
  status: string;
  plan: string | null;
  stripeCustomer: string | null;
  stripeSubscription: string | null;
  currentPeriodEnd: string | null;
};

type StripeObject = Record<string, unknown> & { metadata?: Record<string, unknown>; items?: { data?: { current_period_end?: number; price?: { id?: string } }[] } };
type StripeEvent = { type: string; data: { object: StripeObject } };

/** Maps a Stripe event to a subscription row. Returns null for events we do not track. */
export function subscriptionFromEvent(event: StripeEvent): SubscriptionUpdate | null {
  const o = event.data.object;
  if (event.type === "checkout.session.completed") {
    if (o.mode !== "subscription" || typeof o.client_reference_id !== "string") return null;
    return {
      business: o.client_reference_id,
      status: "active",
      plan: null,
      stripeCustomer: typeof o.customer === "string" ? o.customer : null,
      stripeSubscription: typeof o.subscription === "string" ? o.subscription : null,
      currentPeriodEnd: null,
    };
  }
  if (event.type.startsWith("customer.subscription.")) {
    const business = o.metadata?.business;
    if (typeof business !== "string") return null;
    const periodEnd = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
    const deleted = event.type === "customer.subscription.deleted";
    return {
      business,
      status: deleted ? "canceled" : String(o.status ?? "none"),
      plan: o.items?.data?.[0]?.price?.id ?? null,
      stripeCustomer: typeof o.customer === "string" ? o.customer : null,
      stripeSubscription: typeof o.id === "string" ? o.id : null,
      currentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000).toISOString() : null,
    };
  }
  return null;
}

/** Whether a business may keep using paid features. Trialing and active count; everything else does not. */
export function isEntitled(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}
