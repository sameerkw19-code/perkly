import PetBooklet from "./pet-booklet";
import { loadBooklet } from "./load";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { referrer: "no-referrer", robots: { index: false }, title: "Perkly" };
}

// Public: a client's animals as a booklet (from the link on their wallet card): each animal's details, the next
// appointment, what's due, the vaccination record (date, valid until, batch, by whom), treatments, the medical history
// the clinic shares, weights, and a printable vaccination certificate. No name or phone here.
export default async function PetBookletPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const data = await loadBooklet(key);
  if (data) data.owner = { name: "", phone: "" };
  return <PetBooklet data={data} />;
}
