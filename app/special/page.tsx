import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import SpecialView from "./special-view";

export const dynamic = "force-dynamic";

// Owner page: messages scheduled for a special day, sent to customers with the card in Google Wallet.
export default async function SpecialPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/special");
  return <SpecialView />;
}
