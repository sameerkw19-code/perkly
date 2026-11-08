import type { Metadata } from "next";
import Landing from "../landing/landing";
import { COPY } from "../landing/content";
import { visitorRegion } from "../../lib/server/region";

export const dynamic = "force-dynamic";

const m = COPY.en.meta;
export const metadata: Metadata = {
  title: m.title,
  description: m.description,
  alternates: { canonical: "/en", languages: { he: "/he", ar: "/ar", en: "/en", "x-default": "/" } },
  openGraph: { type: "website", locale: "en_US", url: "/en", siteName: "Perkly", title: m.title, description: m.description, images: [{ url: "/og-en.png", width: 1200, height: 630, alt: m.ogAlt }] },
  twitter: { card: "summary_large_image", title: m.title, description: m.description, images: ["/og-en.png"] },
};

// English marketing page. Always public, also for signed-in users.
export default async function EnglishPage() {
  return <Landing lang="en" currency={(await visitorRegion()).currency} />;
}
