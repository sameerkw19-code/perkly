import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { currentUser } from "../../lib/server/page-session";
import AuthForm from "./auth-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perkly | כניסה", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ signup?: string }> }) {
  if (await currentUser()) redirect("/");
  const { signup } = await searchParams;
  return <AuthForm needsCode={!!env.SIGNUP_CODE} startInSignup={signup === "1"} />;
}
