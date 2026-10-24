// Social links: one shape shared by the server (validation) and every page that shows them.
import { normalizePhone } from "./phone.ts";

export const SOCIAL_KEYS = ["instagram", "tiktok", "facebook", "whatsapp", "website", "waze"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
/** What is stored: instagram/tiktok usernames, a facebook path, a +972… phone, full https URLs for website and waze. */
export type Social = Partial<Record<SocialKey, string>>;

export const SOCIAL_LABEL: Record<SocialKey, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  website: "Website",
  waze: "Waze",
};

/** Brand colors, used as the icon tint on light backgrounds. */
export const SOCIAL_COLOR: Record<SocialKey, string> = {
  instagram: "#E4405F",
  tiktok: "#111111",
  facebook: "#0866FF",
  whatsapp: "#1FA855",
  website: "#5B3FD6",
  waze: "#1AA6D9",
};

function asUrl(raw: string): URL | null {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : "https://" + raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

function onHost(u: URL, hosts: string[]) {
  const h = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  return hosts.includes(h);
}

/** "@name", "name" or a profile URL -> the bare username, or null. */
function handle(raw: string, hosts: string[], pattern: RegExp): string | null {
  let s = raw.trim();
  if (/[/.]/.test(s) && /(^https?:\/\/|\/)/i.test(s)) {
    const u = asUrl(s);
    if (!u || !onHost(u, hosts)) return null;
    s = u.pathname.split("/").filter(Boolean)[0] ?? "";
  }
  s = s.replace(/^@/, "");
  return pattern.test(s) ? s : null;
}

const NORMALIZE: Record<SocialKey, (raw: string) => string | null> = {
  instagram: (s) => handle(s, ["instagram.com", "instagr.am"], /^[A-Za-z0-9._]{1,30}$/),
  tiktok: (s) => handle(s, ["tiktok.com"], /^[A-Za-z0-9._]{2,24}$/),
  facebook: (s) => {
    const t = s.trim();
    if (/^[A-Za-z0-9.\-]{3,80}$/.test(t)) return t;
    const u = asUrl(t);
    if (!u || !onHost(u, ["facebook.com", "fb.com"])) return null;
    const id = u.searchParams.get("id");
    if (u.pathname === "/profile.php" && id && /^\d{5,20}$/.test(id)) return `profile.php?id=${id}`;
    const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[A-Za-z0-9.\-]{3,80}$/.test(first) ? first : null;
  },
  whatsapp: (s) => normalizePhone(s),
  website: (s) => {
    const u = asUrl(s.trim());
    if (!u || !u.hostname.includes(".") || u.username || u.password) return null;
    const href = u.href.replace(/^http:/, "https:");
    return href.length <= 200 ? href : null;
  },
  waze: (s) => {
    const u = asUrl(s.trim());
    if (!u || !onHost(u, ["waze.com", "ul.waze.com"])) return null;
    const href = u.href.replace(/^http:/, "https:");
    return href.length <= 300 ? href : null;
  },
};

/** Validates what an owner typed. Empty fields are dropped. Returns the first bad field on error. */
export function normalizeSocial(input: unknown): { ok: true; value: Social } | { ok: false; field: SocialKey } {
  const value: Social = {};
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  for (const key of SOCIAL_KEYS) {
    const raw = typeof src[key] === "string" ? (src[key] as string).trim().slice(0, 300) : "";
    if (!raw) continue;
    const v = NORMALIZE[key](raw);
    if (!v) return { ok: false, field: key };
    value[key] = v;
  }
  return { ok: true, value };
}

/** Reads the stored JSON without trusting it: anything that no longer validates is skipped. */
export function parseSocial(json: string | null | undefined): Social {
  if (!json) return {};
  try {
    const raw = JSON.parse(json);
    const out: Social = {};
    for (const key of SOCIAL_KEYS) {
      if (typeof raw?.[key] !== "string") continue;
      const v = NORMALIZE[key](raw[key]);
      if (v) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** The address each stored value opens. */
export function socialUrl(key: SocialKey, value: string, whatsappText?: string): string {
  switch (key) {
    case "instagram": return `https://www.instagram.com/${value}/`;
    case "tiktok": return `https://www.tiktok.com/@${value}`;
    case "facebook": return `https://www.facebook.com/${value}`;
    case "whatsapp": return `https://wa.me/${value.replace(/\D/g, "")}${whatsappText ? `?text=${encodeURIComponent(whatsappText)}` : ""}`;
    default: return value;
  }
}

/** How a stored value appears in a form field. */
export function socialDisplay(key: SocialKey, value: string): string {
  if (key === "instagram" || key === "tiktok") return "@" + value;
  if (key === "facebook") return "facebook.com/" + value;
  if (key === "whatsapp") return value.startsWith("+972") ? "0" + value.slice(4) : value;
  return value;
}

export function socialLinks(social: Social, whatsappText?: string) {
  return SOCIAL_KEYS.filter((k) => social[k]).map((key) => ({ key, label: SOCIAL_LABEL[key], url: socialUrl(key, social[key]!, whatsappText) }));
}
