import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getD1 } from "../db";
import { getMemberships } from "../lib/server/auth";
import { currentUser } from "../lib/server/page-session";
import Dashboard from "./dashboard";
import Landing from "./landing/landing";
import { COPY } from "./landing/content";

export const dynamic = "force-dynamic";

const m = COPY.he.meta;
export const metadata: Metadata = {
  title: m.title,
  description: m.description,
  alternates: { canonical: "/", languages: { he: "/", en: "/en", "x-default": "/" } },
  openGraph: { type: "website", locale: "he_IL", url: "/", siteName: "Perkly", title: m.title, description: m.description, images: [{ url: "/og-he.png", width: 1200, height: 630, alt: m.ogAlt }] },
  twitter: { card: "summary_large_image", title: m.title, description: m.description, images: ["/og-he.png"] },
};

export default async function Page() {
  // Visitors who are not signed in see the marketing page; owners and staff see their dashboard.
  const user = await currentUser();
  if (!user) return <Landing lang="he" />;
  // Signed in but no business yet (or the setup was left halfway): continue the guided setup.
  if ((await getMemberships(getD1(), user.id)).length === 0) redirect("/start");
  return <Dashboard />;
}
