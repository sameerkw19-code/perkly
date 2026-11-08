// Where a visitor is, from Cloudflare's country header. Israel (and requests without the header, such
// as local development) get Hebrew and shekels; everywhere else gets English and dollars.
import type { Currency } from "../pricing";

export type Region = { israel: boolean; lang: "he" | "en"; currency: Currency };

export function regionFrom(headers: Headers): Region {
  const country = (headers.get("cf-ipcountry") ?? "").toUpperCase();
  const israel = !country || country === "IL" || country === "XX";
  return israel ? { israel, lang: "he", currency: "ILS" } : { israel, lang: "en", currency: "USD" };
}

/** The current request's region (server components and route handlers). */
export async function visitorRegion(): Promise<Region> {
  const { headers } = await import("next/headers");
  return regionFrom(await headers());
}
