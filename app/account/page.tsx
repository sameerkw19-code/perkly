import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import AccountView from "./account-view";
import { getMemberships } from "../../lib/server/auth";
import { getD1 } from "../../db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perkly | החשבון שלי", robots: { index: false } };

// The signed-in person's own account: sign out everywhere, delete the account.
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  // Businesses where this person works as staff: they can make a new worker code for each.
  const staffIn = (await getMemberships(getD1(), user.id)).filter((m) => m.role === "staff").map((m) => ({ id: m.business, name: m.businessName }));
  return <AccountView name={user.name} email={user.email} staffIn={staffIn} />;
}
