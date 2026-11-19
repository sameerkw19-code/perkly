import { isShortMapsLink, parsePlace, type Place } from "../geo";

/**
 * The place behind what was pasted. A short Google Maps share link is followed (a few redirects, Google's own
 * hosts only) to the full link that has the coordinates.
 */
export async function resolvePlace(input: string): Promise<Place | null> {
  const direct = parsePlace(input);
  if (direct || !isShortMapsLink(input)) return direct;
  let url = input.trim();
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (Perkly)" } }).catch(() => null);
    const next = r?.headers.get("location");
    if (!next) return null;
    url = new URL(next, url).toString();
    const host = new URL(url).hostname;
    if (!/(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$/.test(host)) return null;
    const place = parsePlace(url);
    if (place) return place;
  }
  return null;
}
