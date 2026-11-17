import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import AccountView from "./account-view";
import { getMemberships } from "../../lib/server/auth";
import { getD1 } from "../../db";
import { formatPhone } from "../../lib/phone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perkly | החשבון שלי", robots: { index: false } };

// The signed-in person's own account: change the sign-in email, sign out everywhere, delete the account.
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  // Businesses where this person works as staff: they can make a new worker code for each.
  const staffIn = (await getMemberships(getD1(), user.id)).filter((m) => m.role === "staff").map((m) => ({ id: m.business, name: m.businessName }));
  const extra = await getD1().prepare("SELECT phone, worker_phone, worker_secret FROM users WHERE id = ?").bind(user.id)
    .first<{ phone: string | null; worker_phone: string | null; worker_secret: string | null }>();
  return (
    <AccountView name={user.name} email={user.email} staffIn={staffIn} phone={extra?.phone ? formatPhone(extra.phone) : ""}
      workerPhone={extra?.worker_phone && extra.worker_secret ? formatPhone(extra.worker_phone) : ""} />
  );
}
