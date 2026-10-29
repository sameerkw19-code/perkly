import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import AccountView from "./account-view";

export const dynamic = "force-dynamic";

// Account security: the phone used for sign-in codes, and signing out of every device.
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <AccountView />;
}
