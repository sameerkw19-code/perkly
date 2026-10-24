import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { currentUser } from "../../lib/server/page-session";
import AuthForm from "./auth-form";

export const dynamic = "force-dynamic";

/** Only same-site paths like "/admin" are allowed as a return address (no "//host" or full URLs). */
function safeNext(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && /^\/(?!\/)[A-Za-z0-9/_-]{0,100}$/.test(v) ? v : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return <AuthForm needsCode={!!env.SIGNUP_CODE} next={next} />;
}
