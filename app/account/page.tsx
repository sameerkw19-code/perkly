import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import AccountView from "./account-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perkly | החשבון שלי", robots: { index: false } };

// The signed-in person's own account: sign out everywhere, delete the account.
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  return <AccountView name={user.name} email={user.email} />;
}
