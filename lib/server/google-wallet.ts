// Google Wallet loyalty passes. Signs a "save to wallet" JWT with the service account key.
// Everything is off unless both GOOGLE_WALLET_SA_KEY and GOOGLE_WALLET_ISSUER_ID are set,
// so deploying this code before Google approves the account changes nothing for customers.

import { base64url } from "./crypto";
import { classBody, lookFields, type ClassLook, type PassLook } from "../wallet-look";

export type WalletConfig = { issuerId: string; serviceEmail: string; privateKeyPem: string; classId: string };

/**
 * GOOGLE_WALLET_CLASS_ID is the full class id exactly as Google has it. A class created in the
 * Google Pay console gets the issuer id added in front of what you type, so it can look like
 * "<issuer>.<issuer>.perkly_loyalty". Default: "<issuer>.perkly_loyalty".
 */
export function walletConfig(env: { GOOGLE_WALLET_SA_KEY?: string; GOOGLE_WALLET_ISSUER_ID?: string; GOOGLE_WALLET_CLASS_ID?: string }): WalletConfig | null {
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const raw = env.GOOGLE_WALLET_SA_KEY?.trim();
  if (!issuerId || !raw) return null;
  try {
    const key = JSON.parse(raw) as { client_email?: unknown; private_key?: unknown };
    if (typeof key.client_email !== "string" || typeof key.private_key !== "string") return null;
    const classId = env.GOOGLE_WALLET_CLASS_ID?.trim() || `${issuerId}.perkly_loyalty`;
    return { issuerId, serviceEmail: key.client_email, privateKeyPem: key.private_key, classId };
  } catch {
    return null;
  }
}

export type { PassLook };

export type LoyaltyCard = {
  customerId: string;
  businessId: string;
  stamps: number;
  target: number;
  scanCode: string;
  /** Rewards the customer can use now. */
  rewards?: number;
  /** The business's own look on the pass (see passLook). */
  look?: PassLook;
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
function label(en: string, he: string, ar: string, others: [ru: string, de: string, fr: string]) {
  return {
    defaultValue: { language: "en-US", value: en },
    translatedValues: [
      { language: "he", value: he }, { language: "iw", value: he }, { language: "ar", value: ar },
      { language: "ru", value: others[0] }, { language: "de", value: others[1] }, { language: "fr", value: others[2] },
    ],
  };
}

/** The fields that change with every stamp. Used both when saving and when updating a pass. */
function liveFields(card: LoyaltyCard) {
  return {
    loyaltyPoints: {
      label: "Stamps",
      localizedLabel: label("Stamps", "חותמות", "أختام", ["Печати", "Stempel", "Tampons"]),
      balance: { string: `${card.stamps}/${card.target}` },
    },
    secondaryLoyaltyPoints: {
      label: "Rewards",
      localizedLabel: label("Rewards", "הטבות זמינות", "مكافآت متاحة", ["Награды", "Prämien", "Récompenses"]),
      balance: { int: Math.max(0, card.rewards ?? 0) },
    },
  };
}

/** The loyalty object Google shows in the pass. The class must already exist (see the Google console). */
export function loyaltyObject(config: WalletConfig, card: LoyaltyCard) {
  return {
    id: objectIdFor(config, card.customerId),
    classId: config.classId,
    state: "ACTIVE",
    accountId: safeId(card.customerId),
    accountName: "Perkly",
    ...liveFields(card),
    ...(card.look ? lookFields(card.look) : {}),
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
export async function saveUrl(config: WalletConfig, card: LoyaltyCard, origin: string): Promise<string> {
  const object = loyaltyObject(config, card);
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

/** A message that shows as a phone notification and stays on the back of the pass. */
export type WalletNotice = { header: string; body: string; language: string; translations: { language: string; header: string; body: string }[] };

/** The message body Google takes; `notify` false keeps it on the pass without a phone notification. */
export function noticeMessage(notice: WalletNotice, notify: boolean, id = `notice-${Date.now()}`) {
  const tr = notice.translations;
  return {
    message: {
      id,
      header: notice.header,
      body: notice.body,
      messageType: notify ? "TEXT_AND_NOTIFY" : "TEXT",
      ...(tr.length
        ? {
            localizedHeader: { defaultValue: { language: notice.language, value: notice.header }, translatedValues: tr.map((x) => ({ language: x.language, value: x.header })) },
            localizedBody: { defaultValue: { language: notice.language, value: notice.body }, translatedValues: tr.map((x) => ({ language: x.language, value: x.body })) },
          }
        : {}),
    },
  };
}

/**
 * Google allows 3 notifications per pass per day. Past that it answers with a quota error,
 * and the message is added again without the notification, so the pass still shows it.
 */
async function addNotice(token: string, objectUrl: string, notice: WalletNotice): Promise<void> {
  const send = (notify: boolean) =>
    fetch(`${objectUrl}/addMessage`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(noticeMessage(notice, notify)),
    });
  const r = await send(true);
  if (r.ok) return;
  const text = await r.text().catch(() => "");
  if (r.status === 429 || /quota/i.test(text)) {
    const again = await send(false);
    console.log(`google wallet notice: daily limit, added silently (${again.status})`);
    return;
  }
  console.warn(`google wallet notice failed: HTTP ${r.status}`);
}

/**
 * Pushes the current stamps and rewards to a pass the customer already saved.
 * "not_saved": Google has no such pass (the customer opened the link but never saved it).
 * Never throws, so a Google outage can't break stamping.
 */
export async function updateLoyaltyObject(config: WalletConfig, card: LoyaltyCard, notice?: WalletNotice | null): Promise<UpdateResult> {
  try {
    const token = await accessToken(config);
    const objectUrl = `${API}/loyaltyObject/${encodeURIComponent(objectIdFor(config, card.customerId))}`;
    const r = await fetch(objectUrl, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // A new notification replaces the previous one on the back of the pass.
      body: JSON.stringify({ ...liveFields(card), ...(card.look ? lookFields(card.look) : {}), ...(notice ? { messages: [] } : {}) }),
    });
    if (r.status === 404) return "not_saved";
    if (!r.ok) {
      console.warn(`google wallet update failed: HTTP ${r.status}`);
      return "failed";
    }
    if (notice) await addNotice(token, objectUrl, notice);
    return "updated";
  } catch (e) {
    console.warn(`google wallet update failed: ${(e as Error).message}`);
    return "failed";
  }
}

// ---- Loyalty class (shared by all businesses for now) ----

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
  return config.classId;
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

/** All loyalty class ids this issuer has at Google (admin diagnostics). */
export async function listClassIds(config: WalletConfig): Promise<string[]> {
  const token = await accessToken(config);
  const r = await fetch(`${API}/loyaltyClass?issuerId=${encodeURIComponent(config.issuerId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`google_list_${r.status}`);
  const data = (await r.json()) as { resources?: { id?: string; reviewStatus?: string }[] };
  return (data.resources ?? []).map((c) => `${c.id} (${c.reviewStatus ?? "?"})`);
}

// ---- A class per business ----

/** The business's own class id. Passes saved after this use it; older passes keep the shared class. */
export function businessClassId(config: WalletConfig, businessId: string): string {
  return `${config.issuerId}.biz_${safeId(businessId)}`;
}

/**
 * Creates or updates the business's own class so its name, color and logo show on new passes.
 * Returns the class id to use, or null when there is no PNG/JPEG logo or Google refused; then the shared class is used.
 * Never throws, so a Google problem can't block a customer from saving a pass.
 */
export async function ensureBusinessClass(config: WalletConfig, businessId: string, look: ClassLook | null): Promise<string | null> {
  if (!look) return null;
  const id = businessClassId(config, businessId);
  try {
    const token = await accessToken(config);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const body = JSON.stringify(classBody(id, look));
    const current = await fetch(`${API}/loyaltyClass/${encodeURIComponent(id)}`, { headers });
    const r = current.status === 404
      ? await fetch(`${API}/loyaltyClass`, { method: "POST", headers, body })
      : await fetch(`${API}/loyaltyClass/${encodeURIComponent(id)}`, { method: "PATCH", headers, body });
    if (!r.ok) {
      console.warn(`google wallet class ${id} not saved: HTTP ${r.status}`);
      return null;
    }
    return id;
  } catch (e) {
    console.warn(`google wallet class failed: ${(e as Error).message}`);
    return null;
  }
}
