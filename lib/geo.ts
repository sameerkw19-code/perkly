// A branch's place on the map, from what people paste: "32.0853, 34.7818", a Google Maps link
// (…/@32.08,34.78,17z, ?q=32.08,34.78, ?ll=…, ?query=…, or the place link's !3d32.08!4d34.78),
// or a Waze link (the app's share link waze.com/ul/h<geohash>, ?ll=32.08,34.78, or ?to=ll.32.08,34.78).

export type Place = { lat: number; lng: number };

function valid(lat: number, lng: number): Place | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** The centre of a geohash cell (Waze share links: waze.com/ul/h + geohash). */
export function decodeGeohash(hash: string): Place | null {
  const lat: [number, number] = [-90, 90];
  const lng: [number, number] = [-180, 180];
  let even = true;
  for (const ch of hash.toLowerCase()) {
    const v = BASE32.indexOf(ch);
    if (v < 0) return null;
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lng : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((v >> bit) & 1) range[0] = mid; else range[1] = mid;
      even = !even;
    }
  }
  return valid((lat[0] + lat[1]) / 2, (lng[0] + lng[1]) / 2);
}

export function parsePlace(input: string): Place | null {
  const text = input.trim();
  if (!text) return null;
  let s = text;
  try { s = decodeURIComponent(text); } catch {}
  // The exact pin of a place link wins over the map's centre (@…).
  const pin = new RegExp(`!3d${NUM}!4d${NUM}`).exec(s);
  if (pin) return valid(Number(pin[1]), Number(pin[2]));
  // Waze: the app's share link carries a geohash (precise enough from 7 characters, about 150 m).
  const waze = /waze\.com\/(?:[a-z-]+\/)?ul\/h([0-9b-hjkmnp-z]{7,12})\b/i.exec(s);
  if (waze) return decodeGeohash(waze[1]);
  const param = new RegExp(`[?&](?:q|ll|query|center|destination|daddr|to|from)=(?:loc:|ll\\.)?${NUM}\\s*,\\s*${NUM}`).exec(s);
  if (param) return valid(Number(param[1]), Number(param[2]));
  const at = new RegExp(`@${NUM},${NUM}`).exec(s);
  if (at) return valid(Number(at[1]), Number(at[2]));
  const plain = new RegExp(`^${NUM}\\s*[, ]\\s*${NUM}$`).exec(s);
  if (plain) return valid(Number(plain[1]), Number(plain[2]));
  return null;
}

/** Short share links (maps.app.goo.gl, goo.gl/maps) hide the place behind a redirect. */
export function isShortMapsLink(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === "https:" && (u.hostname === "maps.app.goo.gl" || (u.hostname === "goo.gl" && u.pathname.startsWith("/maps")));
  } catch {
    return false;
  }
}
