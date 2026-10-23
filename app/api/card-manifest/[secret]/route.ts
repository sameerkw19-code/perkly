export const dynamic = "force-dynamic";

// Web app manifest for one customer card, so "Add to home screen" opens that card.
export async function GET(_request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(secret)) return new Response("Not found", { status: 404 });
  const manifest = {
    name: "Perkly card",
    short_name: "My card",
    start_url: `/c/${secret}`,
    scope: `/c/${secret}`,
    display: "standalone",
    background_color: "#F7F7FA",
    theme_color: "#7558E8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
