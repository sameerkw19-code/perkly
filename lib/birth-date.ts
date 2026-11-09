// A worker's date of birth as 8 digits (DDMMYYYY), used with their phone to sign in at the counter.

/** "15/03/1995", "15.3.1995" or "15031995" → "15031995"; null when it is not a real date for an adult worker. */
export function normalizeBirthDate(input: unknown, now = new Date()): string | null {
  const raw = String(input ?? "").trim();
  let d: number, m: number, y: number;
  const parts = raw.split(/[^\d]+/).filter(Boolean);
  if (parts.length === 3) [d, m, y] = parts.map(Number);
  else if (/^\d{8}$/.test(raw)) { d = Number(raw.slice(0, 2)); m = Number(raw.slice(2, 4)); y = Number(raw.slice(4)); }
  else return null;
  if (y < 1920 || y > now.getFullYear() - 14) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return String(d).padStart(2, "0") + String(m).padStart(2, "0") + String(y);
}

