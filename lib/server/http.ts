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

/** Client IP. On Cloudflare this header is set by the edge and cannot be forged by the visitor. */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "local";
}

export function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v && v.length <= max ? v : null;
}
