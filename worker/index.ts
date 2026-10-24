import handler from "vinext/server/fetch-handler";

// Security headers added to every response.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Camera is needed only on our own pages (staff scanner).
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

/**
 * Byte ranges for videos. Safari (iPhone) only plays a video when the server answers
 * Range requests with 206. Static assets on workers.dev do not always do that, so slice here.
 */
async function rangeResponse(request: Request, response: Response, headers: Headers): Promise<Response | null> {
  const range = request.headers.get("range");
  headers.set("Accept-Ranges", "bytes");
  if (!range || response.status !== 200) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (!m[1] && !m[2])) return null;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (!m[1]) end = size - 1;
  if (start >= size || start > end) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    // Videos come straight from the static files (full file), then get sliced for Range requests.
    const assets = (env as unknown as { ASSETS?: Fetcher }).ASSETS;
    const response = path.startsWith("/videos/") && assets
      ? await assets.fetch(new Request(request.url, { method: request.method === "HEAD" ? "HEAD" : "GET" }))
      : await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    const url = new URL(request.url);
    if (url.protocol === "https:") {
      headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    // Card links carry a secret in the path: never send it to other sites.
    if (url.pathname.startsWith("/c/") || url.pathname.startsWith("/invite/")) {
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("Cache-Control", "no-store");
    }
    if (url.pathname.startsWith("/videos/")) {
      const partial = await rangeResponse(request, response, headers);
      if (partial) return partial;
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
