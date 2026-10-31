export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { status, headers });
}

/** Error responses carry a stable `code` the UI translates, plus an English message for logs. */
export function fail(code: string, status: number, message = code): Response {
  return json({ error: message, code }, status);
}

/** Mutations must come from our own pages (blocks cross-site form posts). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}

export async function readJson(request: Request, maxBytes = 20_000): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Client IP for rate limits. On Cloudflare this header is set by the edge and cannot be forged.
 * An IPv6 visitor usually controls a whole /64, so IPv6 addresses are grouped by their first 64 bits.
 */
export function clientIp(request: Request): string {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  return ip.includes(":") ? ipv6Prefix(ip) : ip;
}

/** First four groups of an IPv6 address ("2001:db8:1:2::5" -> "2001:db8:1:2::/64"). */
export function ipv6Prefix(ip: string): string {
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

export function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v && v.length <= max ? v : null;
}
