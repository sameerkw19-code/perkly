import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Landing from "../landing/landing";
import { COPY } from "../landing/content";
import { visitorRegion } from "../../lib/server/region";

export const dynamic = "force-dynamic";

const m = COPY.he.meta;
export const metadata: Metadata = {
  title: m.title,
  description: m.description,
  alternates: { canonical: "/he", languages: { he: "/he", ar: "/ar", en: "/en", "x-default": "/" } },
  openGraph: { type: "website", locale: "he_IL", url: "/he", siteName: "Perkly", title: m.title, description: m.description, images: [{ url: "/og-he.png", width: 1200, height: 630, alt: m.ogAlt }] },
  twitter: { card: "summary_large_image", title: m.title, description: m.description, images: ["/og-he.png"] },
};

// Hebrew marketing page, for Israel. Visitors abroad get the English page (the site is English only there).
export default async function HebrewPage() {
  const region = await visitorRegion();
  if (!region.israel) redirect("/en");
  return <Landing lang="he" currency={region.currency} />;
}
