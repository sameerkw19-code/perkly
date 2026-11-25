import { getD1 } from "../../../db";
import { liveDesign } from "../../../lib/server/designs";
import { openLoans } from "../../../lib/server/loans";
import { cardLang, textsFor } from "../../../lib/design";
import LoansView from "./loans-view";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { referrer: "no-referrer", robots: { index: false }, title: "Perkly" };
}

// Public: a reader's books, from the link on their library card's wallet pass. Shows only the titles and
// return dates, and lets the reader extend (within the library's limit). No name or phone.
export default async function LoansPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = getD1();
  const row = key.length <= 64
    ? await db
        .prepare(
          `SELECT c.id, b.id AS business_id, b.name, b.reward, b.color, b.loan_ext_days, b.loan_max_ext
           FROM customers c JOIN businesses b ON b.id = c.business
           WHERE c.loan_key = ? AND c.archived IS NULL AND b.archived IS NULL AND b.program = 'library'`,
        )
        .bind(key)
        .first<{ id: string; business_id: string; name: string; reward: string; color: string; loan_ext_days: number; loan_max_ext: number }>()
    : null;
  if (!row) return <LoansView data={null} />;
  const design = await liveDesign(db, { id: row.business_id, name: row.name, reward: row.reward, color: row.color });
  const lang = cardLang(design);
  return (
    <LoansView
      data={{ key, lang, library: textsFor(design, lang).title || row.name, color: design.colors.bg, loans: await openLoans(db, row.id), extDays: row.loan_ext_days, maxExt: row.loan_max_ext }}
    />
  );
}
