import type { Metadata } from "next";
import Landing from "../landing/landing";
import { COPY } from "../landing/content";

const m = COPY.ar.meta;
export const metadata: Metadata = {
  title: m.title,
  description: m.description,
  alternates: { canonical: "/ar", languages: { he: "/", ar: "/ar", "x-default": "/" } },
  openGraph: { type: "website", locale: "ar_IL", url: "/ar", siteName: "Perkly", title: m.title, description: m.description, images: [{ url: "/og-ar.png", width: 1200, height: 630, alt: m.ogAlt }] },
  twitter: { card: "summary_large_image", title: m.title, description: m.description, images: ["/og-ar.png"] },
};

// Arabic marketing page. Always public, also for signed-in users.
export default function ArabicPage() {
  return <Landing lang="ar" />;
}
