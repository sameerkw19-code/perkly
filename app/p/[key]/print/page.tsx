import { loadBooklet } from "../load";
import Certificate from "./certificate";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { referrer: "no-referrer", robots: { index: false }, title: "Perkly" };
}

// Public (the client's booklet link): a printable A4 vaccination certificate, one page per animal. The clinic's header
// (logo, name, address, phone), the owner and the animal, the vaccination table (date given, valid until, batch, by
// which doctor and their licence), treatments, the medical history the clinic shares, weights, and the vet's
// certification with lines for a signature, stamp and date. "?pet=" picks one animal.
export default async function PetCertificatePage({ params, searchParams }: {
  params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  return <Certificate data={await loadBooklet(key)} only={typeof sp.pet === "string" ? sp.pet : null} />;
}
