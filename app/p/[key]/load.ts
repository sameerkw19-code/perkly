// What the client's booklet and the vaccination certificate show: the client's animals (with only the medical history
// entries the clinic shares with the owner), the clinic's doctors with their licence numbers (also ones removed since,
// for past doses), the clinic's details and its logo.

import { getD1 } from "../../../db";
import { assetUrl, cardLang, textsFor } from "../../../lib/design";
import { israelDate } from "../../../lib/library";
import { liveDesign } from "../../../lib/server/designs";
import { parseVetInfo, petsOf, type PetFile } from "../../../lib/server/vet";

export type Booklet = {
  key: string; title: string; lang: string; today: string; bg: string; fg: string; logo: string | null;
  clinic: { address: string; phone: string };
  owner: { name: string; phone: string };
  doctors: Record<string, { name: string; license: string | null }>;
  pets: PetFile[];
};

export async function loadBooklet(key: string): Promise<Booklet | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return null;
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT c.id, c.name AS c_name, c.phone, b.id AS business_id, b.name, b.reward, b.color, b.vet_info FROM customers c JOIN businesses b ON b.id = c.business
       WHERE c.pet_key = ? AND c.archived IS NULL AND b.archived IS NULL AND b.vet_on = 1`,
    )
    .bind(key)
    .first<{ id: string; c_name: string; phone: string; business_id: string; name: string; reward: string; color: string; vet_info: string | null }>();
  if (!row) return null;
  const design = await liveDesign(db, { id: row.business_id, name: row.name, reward: row.reward, color: row.color });
  const lang = cardLang(design);
  const [pets, staff] = await Promise.all([
    petsOf(db, row.business_id, row.id, true),
    db.prepare("SELECT id, name, license FROM booking_staff WHERE business = ?").bind(row.business_id).all<{ id: string; name: string; license: string | null }>(),
  ]);
  return {
    key, title: textsFor(design, lang).title || row.name, lang, today: israelDate(new Date()), bg: design.colors.bg, fg: design.colors.fg,
    logo: assetUrl(design.logo),
    clinic: parseVetInfo(row.vet_info),
    owner: { name: row.c_name, phone: row.phone },
    doctors: Object.fromEntries((staff.results ?? []).map((s) => [s.id, { name: s.name, license: s.license }])),
    // Only an appointment not yet over (up to an hour after it started), decided here so the page renders the same twice.
    pets: pets.map((p) => (p.appt_at && Date.parse(p.appt_at) > Date.now() - 3_600_000 ? p : { ...p, appt_at: null })),
  };
}
