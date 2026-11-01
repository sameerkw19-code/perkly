import { getD1 } from "../../../db";
import { normalizeEmail } from "../../../lib/server/auth";
import { clientIp, fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { normalizePhone } from "../../../lib/phone";

export const dynamic = "force-dynamic";

const KINDS = new Set(["cafe", "barber", "food", "icecream", "studio", "bar", "other"]);

// Public: a business owner asks to join the pilot. Stored for the platform admin (/admin).
// Field errors are returned per field so the form can show them next to the inputs.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  if (!body) return fail("bad_request", 400, "Invalid request");
  const db = getD1();
  if (!(await allow(db, `lead-ip:${clientIp(request)}`, 5, 3600))) return fail("rate_limited", 429, "Too many requests");

  const business = str(body.business, 80);
  const contact = str(body.contact, 80);
  const phone = normalizePhone(body.phone);
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : null;
  const city = typeof body.city === "string" ? str(body.city, 60) : null;
  const note = typeof body.note === "string" ? str(body.note, 500) : null;
  const lang = body.lang === "ar" ? "ar" : body.lang === "he" ? "he" : "en";

  const fields: Record<string, string> = {};
  if (!business) fields.business = "required";
  if (!contact) fields.contact = "required";
  if (!phone) fields.phone = "phone";
  if (emailRaw && !email) fields.email = "email";
  if (body.privacy !== true) fields.privacy = "required";
  if (Object.keys(fields).length) return json({ error: "Invalid details", code: "bad_details", fields }, 400);

  // The same request sent twice (double click, retry) is stored once.
  const requestId = typeof body.requestId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.requestId) ? body.requestId : crypto.randomUUID();
  await db
    .prepare(
      `INSERT OR IGNORE INTO leads(id, created, business, contact, phone, email, kind, city, kit, note, lang, consent_marketing)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(requestId, new Date().toISOString(), business, contact, phone, email, kind, city, body.kit === true ? 1 : 0, note, lang, body.marketing === true ? 1 : 0)
    .run();
  return json({ ok: true });
}
