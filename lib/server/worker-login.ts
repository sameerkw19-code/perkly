// Staff sign-in at the counter: phone number + date of birth (8 digits, DDMMYYYY).
// The phone finds the worker; the date of birth is checked like a password (stored only as a PBKDF2 hash).
// Wrong attempts are limited per phone and per network (see the worker_login action), and an account that
// owns a business never signs in this way.
import { normalizePhone } from "../phone";
import { hashPassword } from "./crypto";
import { normalizeBirthDate } from "../birth-date";

export { normalizeBirthDate };

export type WorkerLoginInput = { phone: string; secret: string };

/** Validates and prepares phone + date of birth for saving. */
export async function workerLoginFields(phoneInput: unknown, birthInput: unknown): Promise<WorkerLoginInput | "bad_phone" | "bad_birth"> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return "bad_phone";
  const birth = normalizeBirthDate(birthInput);
  if (!birth) return "bad_birth";
  return { phone, secret: await hashPassword(birth) };
}
