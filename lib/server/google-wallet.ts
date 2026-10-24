// Google Wallet loyalty passes. Signs a "save to wallet" JWT with the service account key.
// Everything is off unless both GOOGLE_WALLET_SA_KEY and GOOGLE_WALLET_ISSUER_ID are set,
// so deploying this code before Google approves the account changes nothing for customers.

import { base64url } from "./crypto";

export type WalletConfig = { issuerId: string; serviceEmail: string; privateKeyPem: string };

export function walletConfig(env: { GOOGLE_WALLET_SA_KEY?: string; GOOGLE_WALLET_ISSUER_ID?: string }): WalletConfig | null {
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const raw = env.GOOGLE_WALLET_SA_KEY?.trim();
  if (!issuerId || !raw) return null;
  try {
    const key = JSON.parse(raw) as { client_email?: unknown; private_key?: unknown };
    if (typeof key.client_email !== "string" || typeof key.private_key !== "string") return null;
    return { issuerId, serviceEmail: key.client_email, privateKeyPem: key.private_key };
  } catch {
    return null;
  }
}

export type LoyaltyCard = {
  customerId: string;
  businessId: string;
  stamps: number;
  target: number;
  scanCode: string;
  /** Rewards the customer can use now. */
  rewards?: number;
};

const encoder = new TextEncoder();

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** Object ids may only contain letters, digits, '.', '_' and '-'. */
export function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function objectIdFor(config: WalletConfig, customerId: string): string {
  return `${config.issuerId}.${safeId(customerId)}`;
}

/** A label Google shows in the phone's language (Hebrew, Arabic, or English otherwise). */
function label(en: string, he: string, ar: string) {
  return {
    defaultValue: { language: "en-US", value: en },
    translatedValues: [{ language: "he", value: he }, { language: "iw", value: he }, { language: "ar", value: ar }],
  };
}

/** The fields that change with every stamp. Used both when saving and when updating a pass. */
function liveFields(card: LoyaltyCard) {
  return {
    loyaltyPoints: {
      label: "Stamps",
      localizedLabel: label("Stamps", "חותמות", "أختام"),
      balance: { string: `${card.stamps}/${card.target}` },
    },
    secondaryLoyaltyPoints: {
      label: "Rewards",
      localizedLabel: label("Rewards", "הטבות זמינות", "مكافآت متاحة"),
      balance: { int: Math.max(0, card.rewards ?? 0) },
    },
  };
}

/** The loyalty object Google shows in the pass. The class must already exist (see the Google console). */
export function loyaltyObject(config: WalletConfig, card: LoyaltyCard, classSuffix: string) {
  return {
    id: objectIdFor(config, card.customerId),
    classId: `${config.issuerId}.${safeId(classSuffix)}`,
    state: "ACTIVE",
    accountId: safeId(card.customerId),
    accountName: "Perkly",
    ...liveFields(card),
    barcode: { type: "QR_CODE", value: card.scanCode, alternateText: "" },
  };
}

/** RS256-signs a JWT with the service account key. */
async function signJwt(config: WalletConfig, claims: Record<string, unknown>): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(claims)))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(config.privateKeyPem) as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/** Signs the "save to Google Wallet" token. Returns the full save URL. */
export async function saveUrl(config: WalletConfig, card: LoyaltyCard, classSuffix: string, origin: string): Promise<string> {
  const object = loyaltyObject(config, card, classSuffix);
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(config, {
    iss: config.serviceEmail,
    aud: "google",
    typ: "savetowallet",
    iat: now,
    origins: [origin],
    payload: { loyaltyObjects: [object] },
  });
  return `https://pay.google.com/gp/v/save/${token}`;
}

// ---- Server-to-Google updates (REST API) ----

const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://walletobjects.googleapis.com/walletobjects/v1";

// One access token per Worker instance, reused until a minute before it expires.
let cachedToken: { email: string; token: string; expires: number } | null = null;

async function accessToken(config: WalletConfig): Promise<string> {
  const nowMs = Date.now();
  if (cachedToken && cachedToken.email === config.serviceEmail && cachedToken.expires - 60_000 > nowMs) return cachedToken.token;
  const iat = Math.floor(nowMs / 1000);
  const assertion = await signJwt(config, { iss: config.serviceEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`google_token_${r.status}`);
  const data = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("google_token_missing");
  cachedToken = { email: config.serviceEmail, token: data.access_token, expires: nowMs + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

export type UpdateResult = "updated" | "not_saved" | "failed";

/**
 * Pushes the current stamps and rewards to a pass the customer already saved.
 * "not_saved": Google has no such pass (the customer opened the link but never saved it).
 * Never throws, so a Google outage can't break stamping.
 */
export async function updateLoyaltyObject(config: WalletConfig, card: LoyaltyCard): Promise<UpdateResult> {
  try {
    const token = await accessToken(config);
    const r = await fetch(`${API}/loyaltyObject/${encodeURIComponent(objectIdFor(config, card.customerId))}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(liveFields(card)),
    });
    if (r.status === 404) return "not_saved";
    if (!r.ok) {
      console.warn(`google wallet update failed: HTTP ${r.status}`);
      return "failed";
    }
    return "updated";
  } catch (e) {
    console.warn(`google wallet update failed: ${(e as Error).message}`);
    return "failed";
  }
}

// ---- Loyalty class (shared by all businesses for now) ----

export const LOYALTY_CLASS_SUFFIX = "perkly_loyalty";

export type ClassStatus = { status: "draft" | "underReview" | "approved" | "rejected" | "unknown" | "missing"; raw?: string };

function normalizeReview(v: unknown): ClassStatus["status"] {
  const s = String(v ?? "").toLowerCase().replace(/_/g, "");
  if (s === "draft") return "draft";
  if (s === "underreview") return "underReview";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return "unknown";
}

function classId(config: WalletConfig): string {
  return `${config.issuerId}.${safeId(LOYALTY_CLASS_SUFFIX)}`;
}

/** The class's review status at Google. */
export async function getClassStatus(config: WalletConfig): Promise<ClassStatus> {
  const token = await accessToken(config);
  const r = await fetch(`${API}/loyaltyClass/${encodeURIComponent(classId(config))}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return { status: "missing" };
  if (!r.ok) throw new Error(`google_class_${r.status}`);
  const data = (await r.json()) as { reviewStatus?: string };
  return { status: normalizeReview(data.reviewStatus), raw: data.reviewStatus };
}

/** Asks Google to review the class. Only valid from draft (or after a rejection was fixed). */
export async function submitClassForReview(config: WalletConfig): Promise<ClassStatus> {
  const token = await accessToken(config);
  const r = await fetch(`${API}/loyaltyClass/${encodeURIComponent(classId(config))}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reviewStatus: "UNDER_REVIEW" }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`google_class_${r.status}: ${text.slice(0, 300)}`);
  }
  const data = (await r.json()) as { reviewStatus?: string };
  return { status: normalizeReview(data.reviewStatus), raw: data.reviewStatus };
}
