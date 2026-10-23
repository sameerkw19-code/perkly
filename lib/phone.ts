// Phone rule (used for duplicate detection):
// every number is stored in international form. Israeli numbers become +972 without the leading 0.
//   050-123 4567      -> +972501234567
//   +972 50 123 4567  -> +972501234567
//   972501234567      -> +972501234567
//   +972 050 1234567  -> +972501234567
//   00972501234567    -> +972501234567
// Other countries are accepted only with a leading + (or 00) and 8-15 digits.

export function normalizePhone(input: unknown): string | null {
  let s = String(input ?? "").replace(/[\s().\-‎‏‪-‮]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{8,9}$/.test(s)) return "+972" + s.slice(1);
  if (/^972\d{8,9}$/.test(s)) return "+" + s;
  if (/^\+9720\d{8,9}$/.test(s)) return "+972" + s.slice(5);
  if (/^\+972\d{8,9}$/.test(s)) return s;
  if (/^\+[1-9]\d{7,14}$/.test(s) && !s.startsWith("+972")) return s;
  return null;
}

/** Local display: +972501234567 -> 050-123-4567. */
export function formatPhone(phone: string): string {
  const m = /^\+972(\d{2})(\d{3})(\d{4})$/.exec(phone);
  if (m) return `0${m[1]}-${m[2]}-${m[3]}`;
  const l = /^\+972(\d)(\d{3})(\d{4})$/.exec(phone);
  if (l) return `0${l[1]}-${l[2]}-${l[3]}`;
  return phone;
}

/** What staff see: only the last 4 digits. */
export function maskPhone(phone: string): string {
  return "•••-" + phone.slice(-4);
}
