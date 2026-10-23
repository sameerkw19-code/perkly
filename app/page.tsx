import { currentUser } from "../lib/server/page-session";
import Dashboard from "./dashboard";
import Landing from "./landing/landing";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Visitors who are not signed in see the marketing landing page.
  if (!(await currentUser())) return <Landing />;
  return <Dashboard />;
}
