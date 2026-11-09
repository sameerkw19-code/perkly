import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getD1 } from "../db";
import { getMemberships, isPlatformAdmin } from "../lib/server/auth";
import { env } from "cloudflare:workers";
import { currentUser } from "../lib/server/page-session";
import Dashboard from "./dashboard";
import Landing from "./landing/landing";
import { COPY } from "./landing/content";
import { visitorRegion } from "../lib/server/region";

export const dynamic = "force-dynamic";

// The home page follows the visitor's market: Hebrew in Israel, English (and dollars) abroad.
export async function generateMetadata(): Promise<Metadata> {
  const region = await visitorRegion();
  const lang = region.lang;
  const m = COPY[lang].meta;
  const og = lang === "he" ? "/og-he.png" : "/og-en.png";
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: "/", languages: { he: "/he", ar: "/ar", en: "/en", "x-default": "/" } },
    openGraph: { type: "website", locale: lang === "he" ? "he_IL" : "en_US", url: "/", siteName: "Perkly", title: m.title, description: m.description, images: [{ url: og, width: 1200, height: 630, alt: m.ogAlt }] },
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: [og] },
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Visitors who are not signed in see the marketing page; owners and staff see their dashboard.
  const user = await currentUser();
  if (!user) {
    const region = await visitorRegion();
    return <Landing lang={region.lang} currency={region.currency} />;
  }
  // Signed in but no business yet (or the setup was left halfway): continue the guided setup.
  // Except Perkly (a platform admin) opening a business from the control center to manage it.
  const managing = isPlatformAdmin(user, env) && typeof (await searchParams).business === "string";
  if (!managing && (await getMemberships(getD1(), user.id)).length === 0) redirect("/start");
  return <Dashboard />;
}
