import { redirect } from "next/navigation";
import { currentUser } from "../lib/server/page-session";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await currentUser())) redirect("/login");
  return <Dashboard />;
}
