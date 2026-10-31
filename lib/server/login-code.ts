// The second sign-in step: a 6-digit code sent by email, asked on devices the user has not trusted yet.
// Codes are stored hashed, expire after 10 minutes and allow 5 tries. A trusted device keeps a random
// token in a cookie (stored hashed) for 90 days, so the code is asked once per device, not every time.
import { randomToken, sha256 } from "./crypto";
import { cookieAttributes, readCookie, secureCookie } from "./auth";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_MAX_SENDS = 3;
export const DEVICE_COOKIE = "perkly_device";
const DEVICE_DAYS = 90;

/** A random 6-digit code (uniform: values past the last full million are drawn again). */
export function newCode(): string {
  const limit = 4_294_000_000; // largest multiple of 1,000,000 below 2^32
  let n: number;
  do n = crypto.getRandomValues(new Uint32Array(1))[0]; while (n >= limit);
  return String(n % 1_000_000).padStart(6, "0");
}

export function hashCode(challenge: string, code: string): Promise<string> {
  return sha256(`login-code:${challenge}:${code}`);
}

/** Whether this browser is a device the user trusted after entering a code. */
export async function deviceTrusted(db: D1Database, cookieHeader: string | null, userId: string): Promise<boolean> {
  const token = readCookie(cookieHeader, DEVICE_COOKIE);
  if (!token || token.length > 100) return false;
  const row = await db
    .prepare("SELECT 1 AS ok FROM trusted_devices WHERE id = ? AND user = ? AND expires > ?")
    .bind(await sha256(token), userId, new Date().toISOString())
    .first<{ ok: number }>();
  return !!row;
}

/** Trusts this browser for DEVICE_DAYS. Returns the Set-Cookie value. */
export async function trustDevice(db: D1Database, userId: string, request: Request): Promise<string> {
  const token = randomToken(24);
  const now = new Date();
  await db
    .prepare("INSERT INTO trusted_devices(id, user, created, expires) VALUES(?, ?, ?, ?)")
    .bind(await sha256(token), userId, now.toISOString(), new Date(now.getTime() + DEVICE_DAYS * 86_400_000).toISOString())
    .run();
  return `${DEVICE_COOKIE}=${token}; ${cookieAttributes(secureCookie(request), DEVICE_DAYS * 86_400)}`;
}
