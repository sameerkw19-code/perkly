import type { Metadata } from "next";
import Landing from "../landing/landing";
import { COPY } from "../landing/content";

const m = COPY.he.meta;
export const metadata: Metadata = {
  title: m.title,
  description: m.description,
  alternates: { canonical: "/he", languages: { en: "/", he: "/he", ar: "/ar", "x-default": "/" } },
  openGraph: { type: "website", locale: "he_IL", url: "/he", siteName: "Perkly", title: m.title, description: m.description, images: [{ url: "/og-he.png", width: 1200, height: 630, alt: m.ogAlt }] },
  twitter: { card: "summary_large_image", title: m.title, description: m.description, images: ["/og-he.png"] },
};

// Hebrew marketing page. Always public, also for signed-in users. (English is the default at "/".)
export default function HebrewPage() {
  return <Landing lang="he" />;
}
