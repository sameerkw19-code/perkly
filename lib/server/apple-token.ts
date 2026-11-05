// Apple Wallet settings and the per-pass token. No other imports, so the unit tests can load it directly.
import { PASS_CERT_PEM, WWDR_G4_PEM } from "./apple-certs.ts";
import type { PassSigner } from "./apple-pass.ts";

export type AppleConfig = { passTypeId: string; teamId: string; signer: PassSigner };

type AppleEnv = { APPLE_PASS_KEY?: string; APPLE_PASS_TYPE_ID?: string; APPLE_TEAM_ID?: string; APPLE_PASS_CERT?: string };

/** Null until the APPLE_PASS_KEY secret is set (the private key of the Pass Type ID certificate). */
export function appleConfig(env: AppleEnv): AppleConfig | null {
  const keyPem = env.APPLE_PASS_KEY?.trim();
  if (!keyPem || !keyPem.includes("PRIVATE KEY")) return null;
  return {
    passTypeId: env.APPLE_PASS_TYPE_ID?.trim() || "pass.shop.perkly.loyalty",
    teamId: env.APPLE_TEAM_ID?.trim() || "MR969J2QHG",
    signer: { certPem: env.APPLE_PASS_CERT?.trim() || PASS_CERT_PEM, keyPem, wwdrPem: WWDR_G4_PEM },
  };
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/**
 * The pass's authentication token: an HMAC of its serial number keyed with the signing key, so it
 * never has to be stored and only this server can make or check it.
 */
export async function passToken(config: AppleConfig, serial: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.signer.keyPem), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`apple-pass:${serial}`))).slice(0, 40);
}

/** Checks an "ApplePass <token>" header in constant time. */
export async function validToken(config: AppleConfig, serial: string, header: string | null): Promise<boolean> {
  const given = header?.startsWith("ApplePass ") ? header.slice(10).trim() : "";
  const expected = await passToken(config, serial);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

