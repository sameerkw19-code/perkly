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

/** The loyalty object Google shows in the pass. The class must already exist (see the Google console). */
export function loyaltyObject(config: WalletConfig, card: LoyaltyCard, classSuffix: string) {
  const objectId = `${config.issuerId}.${safeId(card.customerId)}`;
  const classId = `${config.issuerId}.${safeId(classSuffix)}`;
  return {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountId: safeId(card.customerId),
    accountName: "Perkly",
    loyaltyPoints: {
      label: "Stamps",
      balance: { string: `${card.stamps}/${card.target}` },
    },
    barcode: { type: "QR_CODE", value: card.scanCode, alternateText: "" },
  };
}

/** Signs the "save to Google Wallet" token. Returns the full save URL. */
export async function saveUrl(config: WalletConfig, card: LoyaltyCard, classSuffix: string, origin: string): Promise<string> {
  const object = loyaltyObject(config, card, classSuffix);
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: config.serviceEmail,
    aud: "google",
    typ: "savetowallet",
    iat: now,
    origins: [origin],
    payload: { loyaltyObjects: [object] },
  };
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
  return `https://pay.google.com/gp/v/save/${unsigned}.${base64url(new Uint8Array(signature))}`;
}
