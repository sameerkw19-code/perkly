import handler from "vinext/server/fetch-handler";

// Security headers added to every response.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Camera is needed only on our own pages (staff scanner).
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const response = await handler.fetch(request, env, ctx);
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
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
