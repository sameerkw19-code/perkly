import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { currentUser } from "../../lib/server/page-session";
import AuthForm from "./auth-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <AuthForm needsCode={!!env.SIGNUP_CODE} />;
}
