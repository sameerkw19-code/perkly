import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import ReportView from "./report-view";

export const dynamic = "force-dynamic";

// Owner page: the monthly report (also emailed in the first days of every month).
export default async function ReportPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/report");
  return <ReportView />;
}
