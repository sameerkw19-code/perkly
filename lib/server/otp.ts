// One-time codes sent by SMS at sign-in. Codes are stored hashed, expire quickly, and allow a few tries.
import { sha256 } from "./crypto";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** A random 6-digit code. */
export function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

export async function hashCode(code: string): Promise<string> {
  return sha256(`otp:${code}`);
}

/**
 * Whether the second step applies. It applies only when an SMS sender is connected
 * (SMS_SENDER set) and the user has a phone. Until a sender is connected, nothing changes at sign-in.
 */
export function otpEnforced(env: { SMS_SENDER?: string }, phone: string | null | undefined): boolean {
  return !!env.SMS_SENDER && !!phone;
}

/**
 * Sends the code through the connected SMS provider. Returns false when no provider is connected
 * or the send fails. The provider integration is added when the SMS service is chosen.
 */
export async function sendCodeSms(env: { SMS_SENDER?: string }, phone: string, code: string): Promise<boolean> {
  if (!env.SMS_SENDER) return false;
  // Provider call goes here once the SMS service is connected.
  void phone; void code;
  return false;
}
