import { getD1 } from "../../../db";
import { liveDesign } from "../../../lib/server/designs";
import { petsOf } from "../../../lib/server/vet";
import { activeStaff } from "../../../lib/server/booking";
import { cardLang, textsFor } from "../../../lib/design";
import { israelDate } from "../../../lib/library";
import PetBooklet from "./pet-booklet";

export const dynamic = "force-dynamic";

/** An appointment not yet over (up to an hour after it started). */
function upcoming(at: string | null): boolean {
  return !!at && Date.parse(at) > Date.now() - 3_600_000;
}

export async function generateMetadata() {
  return { referrer: "no-referrer", robots: { index: false }, title: "Perkly" };
}

// Public: a client's animals as a booklet (from the link on their wallet card): each animal's details, weight,
// vaccines and treatments with their due dates, the next appointment and what was given when. No name or phone.
export default async function PetBookletPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = getD1();
  const row = /^[A-Za-z0-9_-]{16,64}$/.test(key)
    ? await db
        .prepare(
          `SELECT c.id, b.id AS business_id, b.name, b.reward, b.color FROM customers c JOIN businesses b ON b.id = c.business
           WHERE c.pet_key = ? AND c.archived IS NULL AND b.archived IS NULL AND b.vet_on = 1`,
        )
        .bind(key)
        .first<{ id: string; business_id: string; name: string; reward: string; color: string }>()
    : null;
  if (!row) return <PetBooklet data={null} />;
  const design = await liveDesign(db, { id: row.business_id, name: row.name, reward: row.reward, color: row.color });
  const lang = cardLang(design);
  const pets = await petsOf(db, row.business_id, row.id);
  // The clinic's doctors, by id, for "with Dr. …" (only names, nothing else).
  const docs = new Map((await activeStaff(db, row.business_id)).map((s) => [s.id, s.name]));
  return (
    <PetBooklet data={{
      title: textsFor(design, lang).title || row.name, lang, today: israelDate(new Date()), bg: design.colors.bg, fg: design.colors.fg,
      pets: pets.map((p) => ({
        id: p.id, name: p.name, species: p.species, breed: p.breed, birth: p.birth, sex: p.sex, grams: p.grams, weighed: p.weighed,
        appt: upcoming(p.appt_at) ? { at: p.appt_at!, kind: p.appt_kind ?? "visit", doctor: docs.get(p.appt_staff ?? "") ?? null } : null,
        care: p.care.map((c) => ({ id: c.id, kind: c.kind, name: c.name, last: c.last, next: c.next, months: c.months })),
        log: p.log.map((l) => ({ id: l.id, date: l.date, name: l.name, kind: l.kind, doctor: docs.get(l.staff ?? "") ?? null })),
      })),
    }} />
  );
}
