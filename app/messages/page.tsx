import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import MessagesView from "./messages-view";

export const dynamic = "force-dynamic";

// Owner's text-message page (draft, not linked from the site yet). Recipients come from /api/messages.
export default async function MessagesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <MessagesView />;
}
