import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";
import { TableLabels } from "../components/table-labels";
import { RegionProvider } from "../components/region-context";
import { visitorRegion } from "../lib/server/region";

export const metadata: Metadata = {
  metadataBase: new URL("https://perkly.shop"),
  title: "Perkly | כרטיס קטן. קשר גדול.",
  description: "כרטיסי נאמנות דיגיטליים לעסקים",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Perkly", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7558E8" };

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Israel: Hebrew first. Abroad: English only (lib/server/region.ts).
  const region = await visitorRegion();
  return (
    <html lang={region.lang} dir={region.lang === "en" ? "ltr" : "rtl"} data-region={region.israel ? "il" : "intl"}>
      <body>
        <RegionProvider value={{ intl: !region.israel, lang: region.lang, currency: region.currency }}>{children}</RegionProvider>
        <TableLabels />
      </body>
    </html>
  );
}
