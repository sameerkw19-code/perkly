import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/page-session";
import SignupFlow from "./signup-flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perkly | הצטרפות ותשלום", robots: { index: false } };

// Business sign-up with payment. DEMO for now: nothing is charged and nothing is stored.
export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800&family=Heebo:wght@400;500;700&display=swap" precedence="default" />
      <SignupFlow />
    </>
  );
}
