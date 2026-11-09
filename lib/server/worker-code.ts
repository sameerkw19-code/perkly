// A worker's personal sign-in code: 8 digits, shown once to the worker, stored only as a hash.
// It signs in a staff-only account (never an owner), and wrong guesses are rate limited.
import { sha256 } from "./crypto";

export const WORKER_CODE_LENGTH = 8;

export function hashWorkerCode(code: string): Promise<string> {
  return sha256("worker-code:" + code);
}

function randomDigits(n: number): string {
  const bytes = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

/** "12345678" → "1234 5678" (easier to read aloud and type). */
export function formatWorkerCode(code: string): string {
  return code.slice(0, 4) + " " + code.slice(4);
}

/**
 * Gives the worker a new code in this business (replacing the old one). Returns the code, or null when
 * the user is not active staff there. Retries on the rare clash with another worker's code.
 */
export async function newWorkerCode(db: D1Database, business: string, user: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomDigits(WORKER_CODE_LENGTH);
    try {
      const r = await db
        .prepare("UPDATE memberships SET worker_code = ? WHERE business = ? AND user = ? AND role = 'staff' AND revoked IS NULL")
        .bind(await hashWorkerCode(code), business, user)
        .run();
      return r.meta.changes ? code : null;
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  return null;
}
