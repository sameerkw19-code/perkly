import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Old address of the sign-up form. Sign-up is now the guided setup at /start.
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang = (await searchParams).lang;
  const l = Array.isArray(lang) ? lang[0] : lang;
  redirect(l === "ar" || l === "en" ? `/start?lang=${l}` : "/start");
}
