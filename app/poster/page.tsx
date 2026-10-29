import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import PosterView from "./poster-view";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · שלט להדפסה" };

// Printable sign with the business's join QR (A4 sign or a 10×10 cm sticker). Owners only.
export default async function PosterPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <PosterView />;
}
