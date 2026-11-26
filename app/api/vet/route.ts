import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getMembership, getUser, isPlatformAdmin } from "../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { formatPhone, maskPhone } from "../../../lib/phone";
import { businessAccess } from "../../../lib/server/billing";
import { addDays, israelDate, validDate } from "../../../lib/library";
import { israelTime } from "../../../lib/appointment";
import { APPT_KINDS, CARE_KINDS, CARE_MAX, nextDue, parseKg, passedCareStages, PETS_MAX, SPECIES, validBirth } from "../../../lib/vet";
import { ensurePetKey, petsOf } from "../../../lib/server/vet";
import { syncCard } from "../../../lib/server/booking";

export const dynamic = "force-dynamic";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The vet's pet file (only while Perkly has it switched on for the business). Owners and staff both work in it:
 * the animals of a client, their weights, vaccines and treatments, and each animal's next appointment.
 */
export async function POST(request: Request) {
  const p = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  if (!p || typeof p.business !== "string") return fail("bad_request", 400);
  const admin = isPlatformAdmin(user, env);
  const role = admin ? "owner" : (await getMembership(db, user.id, p.business))?.role;
  if (!role) return fail("not_found", 404);
  const b = await db.prepare("SELECT id, vet_on, archived FROM businesses WHERE id = ?").bind(p.business).first<{ id: string; vet_on: number; archived: string | null }>();
  if (!b || b.archived || !b.vet_on) return fail("not_found", 404);
  if (!(await allow(db, `vet:${user.id}`, 600, 600))) return fail("rate_limited", 429);
  const action = String(p.action);
  const now = new Date();
  const nowIso = now.toISOString();
  const today = israelDate(now);
  if (action !== "pets" && action !== "due") {
    const access = await businessAccess(db, b.id);
    if (!access.ok && access.code === "business_suspended") return fail(access.code, 402, "Business is suspended");
  }

  // The client, checked to belong to this business.
  const customerOf = async (id: unknown) =>
    typeof id === "string" ? db.prepare("SELECT id FROM customers WHERE id = ? AND business = ? AND archived IS NULL").bind(id, b.id).first<{ id: string }>() : null;
  const petOf = async (id: unknown) =>
    typeof id === "string" ? db.prepare("SELECT id, customer, name FROM pets WHERE id = ? AND business = ? AND archived IS NULL").bind(id, b.id).first<{ id: string; customer: string; name: string }>() : null;
  const careOf = async (id: unknown) =>
    typeof id === "string"
      ? db.prepare("SELECT c.id, c.pet, c.months, c.next, p.customer FROM pet_care c JOIN pets p ON p.id = c.pet WHERE c.id = ? AND c.business = ? AND c.archived IS NULL")
          .bind(id, b.id).first<{ id: string; pet: string; months: number | null; next: string | null; customer: string }>()
      : null;
  const answer = async (customer: string) => json({ ok: true, pets: await petsOf(db, b.id, customer), key: await ensurePetKey(db, customer) });

  switch (action) {
    case "pets": {
      const c = await customerOf(p.customer);
      if (!c) return fail("not_found", 404);
      const pets = await petsOf(db, b.id, c.id);
      const key = pets.length ? await ensurePetKey(db, c.id) : null;
      return json({ pets, key, today });
    }
    case "pet_save": {
      const c = await customerOf(p.customer);
      if (!c) return fail("not_found", 404);
      const name = str(p.name, 40);
      const species = typeof p.species === "string" && (SPECIES as readonly string[]).includes(p.species) ? p.species : null;
      if (!name || !species) return fail("bad_details", 400, "A name and a species are needed");
      const breed = typeof p.breed === "string" ? p.breed.trim().slice(0, 60) || null : null;
      const birth = p.birth === null || p.birth === "" || p.birth === undefined ? null : validBirth(p.birth) && p.birth.slice(0, 7) <= today.slice(0, 7) ? p.birth : undefined;
      if (birth === undefined) return fail("bad_details", 400, "Invalid birth date");
      const sex = p.sex === "m" || p.sex === "f" ? p.sex : null;
      if (typeof p.id === "string" && p.id) {
        const r = await db.prepare("UPDATE pets SET name = ?, species = ?, breed = ?, birth = ?, sex = ? WHERE id = ? AND business = ? AND customer = ? AND archived IS NULL")
          .bind(name, species, breed, birth, sex, p.id, b.id, c.id).run();
        if (!r.meta.changes) return fail("not_found", 404);
      } else {
        const n = await db.prepare("SELECT COUNT(*) AS n FROM pets WHERE customer = ? AND archived IS NULL").bind(c.id).first<{ n: number }>();
        if ((n?.n ?? 0) >= PETS_MAX) return fail("pets_too_many", 409, "Too many animals");
        await db.prepare("INSERT INTO pets(id, business, customer, name, species, breed, birth, sex, created) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), b.id, c.id, name, species, breed, birth, sex, nowIso).run();
      }
      return answer(c.id);
    }
    case "pet_remove": {
      const pet = await petOf(p.id);
      if (!pet) return fail("not_found", 404);
      await db.prepare("UPDATE pets SET archived = ?, appt_at = NULL WHERE id = ?").bind(nowIso, pet.id).run();
      await syncCard(db, pet.customer, now);
      return answer(pet.customer);
    }
    case "weight": {
      // A new weight (today, or a date given), kept in the history; the latest shows on the file.
      const pet = await petOf(p.pet);
      if (!pet) return fail("not_found", 404);
      const grams = parseKg(p.kg);
      const date = typeof p.date === "string" && validDate(p.date) && p.date <= today ? p.date : today;
      if (!grams) return fail("bad_details", 400, "Invalid weight");
      await db.batch([
        db.prepare("INSERT INTO pet_weights(id, pet, grams, date, created) VALUES(?, ?, ?, ?, ?)").bind(crypto.randomUUID(), pet.id, grams, date, nowIso),
        db.prepare("UPDATE pets SET grams = ?, weighed = ? WHERE id = ? AND (weighed IS NULL OR weighed <= ?)").bind(grams, date, pet.id, date),
      ]);
      return answer(pet.customer);
    }
    case "care_save": {
      // A vaccine or periodic treatment: its name, when it was last given, every how many months, or a due date by hand.
      const pet = await petOf(p.pet);
      if (!pet) return fail("not_found", 404);
      const kind = typeof p.kind === "string" && (CARE_KINDS as readonly string[]).includes(p.kind) ? p.kind : null;
      const name = str(p.name, 60);
      if (!kind || !name) return fail("bad_details", 400, "A name is needed");
      const last = p.last ? (typeof p.last === "string" && validDate(p.last) && p.last <= today ? p.last : undefined) : null;
      const months = p.months === null || p.months === undefined || p.months === "" ? null : Number.isInteger(p.months) && (p.months as number) >= 1 && (p.months as number) <= 60 ? (p.months as number) : undefined;
      const manual = p.next ? (typeof p.next === "string" && validDate(p.next) ? p.next : undefined) : null;
      if (last === undefined || months === undefined || manual === undefined) return fail("bad_details", 400, "Invalid dates");
      const next = nextDue(last, months, manual);
      // Reminders whose time already passed for this date are marked, so none goes out late.
      const sent = next ? passedCareStages(next, now).join(",") || null : null;
      if (typeof p.id === "string" && p.id) {
        const care = await careOf(p.id);
        if (!care || care.pet !== pet.id) return fail("not_found", 404);
        // A new due date starts its reminders over.
        await db.prepare("UPDATE pet_care SET kind = ?, name = ?, last = ?, months = ?, next = ?, sent = CASE WHEN next IS ? THEN sent ELSE ? END WHERE id = ?")
          .bind(kind, name, last, months, next, next, sent, care.id).run();
      } else {
        const n = await db.prepare("SELECT COUNT(*) AS n FROM pet_care WHERE pet = ? AND archived IS NULL").bind(pet.id).first<{ n: number }>();
        if ((n?.n ?? 0) >= CARE_MAX) return fail("care_too_many", 409, "Too many items");
        const id = crypto.randomUUID();
        await db.batch([
          db.prepare("INSERT INTO pet_care(id, business, pet, kind, name, last, months, next, sent, created) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(id, b.id, pet.id, kind, name, last, months, next, sent, nowIso),
          ...(last ? [db.prepare("INSERT INTO pet_care_log(id, care, pet, date, actor, created) VALUES(?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, pet.id, last, user.id, nowIso)] : []),
        ]);
      }
      return answer(pet.customer);
    }
    case "care_done": {
      // Given today (or on a date): into the history, and the next one is due the set months later.
      const care = await careOf(p.id);
      if (!care) return fail("not_found", 404);
      const date = typeof p.date === "string" && validDate(p.date) && p.date <= today ? p.date : today;
      const note = typeof p.note === "string" ? p.note.trim().slice(0, 120) || null : null;
      const next = nextDue(date, care.months);
      await db.batch([
        db.prepare("INSERT INTO pet_care_log(id, care, pet, date, note, actor, created) VALUES(?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), care.id, care.pet, date, note, user.id, nowIso),
        db.prepare("UPDATE pet_care SET last = ?, next = ?, sent = ? WHERE id = ?").bind(date, next, next ? passedCareStages(next, now).join(",") || null : null, care.id),
      ]);
      return answer(care.customer);
    }
    case "care_remove": {
      const care = await careOf(p.id);
      if (!care) return fail("not_found", 404);
      await db.prepare("UPDATE pet_care SET archived = ? WHERE id = ?").bind(nowIso, care.id).run();
      return answer(care.customer);
    }
    case "appt_set": {
      // The animal's next appointment and what it is for (vaccine, treatment or a visit). Shows on the card, with reminders.
      const pet = await petOf(p.pet);
      if (!pet) return fail("not_found", 404);
      const date = typeof p.date === "string" && validDate(p.date) ? p.date : null;
      const time = typeof p.time === "string" && TIME.test(p.time) ? p.time : null;
      const kind = typeof p.kind === "string" && (APPT_KINDS as readonly string[]).includes(p.kind) ? p.kind : null;
      const at = date && time ? israelTime(date, time) : null;
      if (!at || !kind || at.getTime() < now.getTime() - 5 * 60_000 || date! > addDays(today, 400)) return fail("appt_invalid", 400, "Invalid date or time");
      const note = typeof p.note === "string" ? p.note.trim().slice(0, 80) || null : null;
      await db.prepare("UPDATE pets SET appt_at = ?, appt_kind = ?, appt_note = ? WHERE id = ?").bind(at.toISOString(), kind, note, pet.id).run();
      await syncCard(db, pet.customer, now, { kind: "booked", start: at.toISOString() });
      return answer(pet.customer);
    }
    case "appt_clear": {
      const pet = await petOf(p.pet);
      if (!pet) return fail("not_found", 404);
      await db.prepare("UPDATE pets SET appt_at = NULL, appt_kind = NULL, appt_note = NULL WHERE id = ?").bind(pet.id).run();
      await syncCard(db, pet.customer, now);
      return answer(pet.customer);
    }
    case "due": {
      // The clinic's list: vaccines and treatments overdue or due in the coming days, and the animals' appointments.
      const days = Number.isInteger(p.days) && (p.days as number) >= 1 && (p.days as number) <= 90 ? (p.days as number) : 30;
      const [care, appts] = await Promise.all([
        db.prepare(
          `SELECT c.id, c.kind, c.name, c.next, p.id AS pet, p.name AS pet_name, p.species, u.id AS customer, u.name AS owner, u.phone
           FROM pet_care c JOIN pets p ON p.id = c.pet JOIN customers u ON u.id = p.customer
           WHERE c.business = ? AND c.archived IS NULL AND p.archived IS NULL AND u.archived IS NULL AND c.next IS NOT NULL AND c.next <= ? AND c.next >= ?
           ORDER BY c.next LIMIT 300`,
        ).bind(b.id, addDays(today, days), addDays(today, -365)).all(),
        db.prepare(
          `SELECT p.id AS pet, p.name AS pet_name, p.species, p.appt_at, p.appt_kind, p.appt_note, u.id AS customer, u.name AS owner, u.phone
           FROM pets p JOIN customers u ON u.id = p.customer
           WHERE p.business = ? AND p.archived IS NULL AND u.archived IS NULL AND p.appt_at > ? AND p.appt_at <= ?
           ORDER BY p.appt_at LIMIT 300`,
        ).bind(b.id, new Date(now.getTime() - 3_600_000).toISOString(), israelTime(addDays(today, days + 1), "0:00")!.toISOString()).all(),
      ]);
      const phone = (v: unknown) => (role === "owner" ? formatPhone(String(v)) : maskPhone(String(v)));
      return json({
        today,
        care: (care.results ?? []).map((r) => ({ ...r, phone: phone(r.phone) })),
        appts: (appts.results ?? []).map((r) => ({ ...r, phone: phone(r.phone) })),
      });
    }
  }
  return fail("bad_request", 400, "Unknown action");
}
