import type { Metadata } from "next";
import Landing from "../landing/landing";
import { COPY } from "../landing/content";
import { visitorRegion } from "../../lib/server/region";

export const dynamic = "force-dynamic";

const m = COPY.ar.meta;
export const metadata: Metadata = {
  title: m.title,
  description: m.description,
  alternates: { canonical: "/ar", languages: { he: "/he", ar: "/ar", en: "/en", "x-default": "/" } },
  openGraph: { type: "website", locale: "ar_IL", url: "/ar", siteName: "Perkly", title: m.title, description: m.description, images: [{ url: "/og-ar.png", width: 1200, height: 630, alt: m.ogAlt }] },
  twitter: { card: "summary_large_image", title: m.title, description: m.description, images: ["/og-ar.png"] },
};

// Arabic marketing page. Always public, also for signed-in users.
export default async function ArabicPage() {
  return <Landing lang="ar" currency={(await visitorRegion()).currency} />;
}
