import { getD1 } from "../db";
import { currentUser } from "../lib/server/page-session";
import { getSettings } from "../lib/server/settings";
import Dashboard from "./dashboard";
import Landing from "./landing";

export const dynamic = "force-dynamic";

// Signed in: the dashboard. Visitors: the public landing page.
export default async function Page() {
  if (await currentUser()) return <Dashboard />;
  const s = await getSettings(getD1());
  return <Landing trialDays={s.requireSubscription && s.trialDays > 0 ? s.trialDays : null} />;
}
