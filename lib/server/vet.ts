// The vet's pet file on the server: a client's animals with their vaccines, treatments, weights and next appointment.

import { randomToken } from "./crypto";

export type Pet = {
  id: string; customer: string; name: string; species: string; breed: string | null; birth: string | null; sex: string | null;
  grams: number | null; weighed: string | null; appt_at: string | null; appt_kind: string | null; appt_note: string | null; created: string;
  /** The regular doctor and the next appointment's doctor (booking_staff ids). */
  vet: string | null; appt_staff: string | null;
};
export type Care = { id: string; pet: string; kind: "vaccine" | "treatment"; name: string; last: string | null; months: number | null; next: string | null };
export type CareLog = { id: string; care: string; pet: string; date: string; note: string | null; staff: string | null };
export type PetFile = Pet & { care: Care[]; weights: { grams: number; date: string }[]; log: (CareLog & { name: string; kind: string })[] };

const PET_COLS = "id, customer, name, species, breed, birth, sex, grams, weighed, appt_at, appt_kind, appt_note, created, vet, appt_staff";

/** A client's animals (live ones), each with its vaccines and treatments, weights and what was given when. */
export async function petsOf(db: D1Database, businessId: string, customerId: string): Promise<PetFile[]> {
  const pets = (await db.prepare(`SELECT ${PET_COLS} FROM pets WHERE business = ? AND customer = ? AND archived IS NULL ORDER BY created`).bind(businessId, customerId).all<Pet>()).results ?? [];
  if (!pets.length) return [];
  const ids = pets.map((p) => p.id);
  const marks = ids.map(() => "?").join(",");
  const [care, weights, log] = await Promise.all([
    db.prepare(`SELECT id, pet, kind, name, last, months, next FROM pet_care WHERE pet IN (${marks}) AND archived IS NULL ORDER BY kind DESC, next IS NULL, next, name`).bind(...ids).all<Care>(),
    db.prepare(`SELECT pet, grams, date FROM pet_weights WHERE pet IN (${marks}) ORDER BY date DESC, created DESC LIMIT 400`).bind(...ids).all<{ pet: string; grams: number; date: string }>(),
    db.prepare(`SELECT l.id, l.care, l.pet, l.date, l.note, l.staff, c.name, c.kind FROM pet_care_log l JOIN pet_care c ON c.id = l.care WHERE l.pet IN (${marks}) ORDER BY l.date DESC, l.created DESC LIMIT 400`)
      .bind(...ids).all<CareLog & { name: string; kind: string }>(),
  ]);
  return pets.map((p) => ({
    ...p,
    care: (care.results ?? []).filter((c) => c.pet === p.id),
    weights: (weights.results ?? []).filter((w) => w.pet === p.id).slice(0, 12).map((w) => ({ grams: w.grams, date: w.date })),
    log: (log.results ?? []).filter((l) => l.pet === p.id).slice(0, 30),
  }));
}

/** The client's booklet link key, made with their first animal. */
export async function ensurePetKey(db: D1Database, customerId: string): Promise<string> {
  const row = await db.prepare("SELECT pet_key FROM customers WHERE id = ?").bind(customerId).first<{ pet_key: string | null }>();
  if (row?.pet_key) return row.pet_key;
  await db.prepare("UPDATE customers SET pet_key = ? WHERE id = ? AND pet_key IS NULL").bind(randomToken(18), customerId).run();
  return (await db.prepare("SELECT pet_key FROM customers WHERE id = ?").bind(customerId).first<{ pet_key: string }>())!.pet_key;
}

/** The nearest vaccine or treatment due among a client's animals (for the wallet card). */
export async function nextCareFor(db: D1Database, customerId: string, today: string): Promise<{ pet: string; name: string; next: string } | null> {
  return db
    .prepare(
      `SELECT p.name AS pet, c.name, c.next FROM pet_care c JOIN pets p ON p.id = c.pet
       WHERE p.customer = ? AND p.archived IS NULL AND c.archived IS NULL AND c.next IS NOT NULL AND c.next >= ?
       ORDER BY c.next LIMIT 1`,
    )
    .bind(customerId, today)
    .first<{ pet: string; name: string; next: string }>();
}
