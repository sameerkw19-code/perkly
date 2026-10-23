import { getD1 } from "../../../../db";

export const dynamic = "force-dynamic";

// Public: logos and card images are shown on public customer cards. Ids are random and files never change.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const row = await getD1().prepare("SELECT mime, data FROM assets WHERE id = ?").bind(id).first<{ mime: string; data: ArrayBuffer | number[] }>();
  if (!row) return new Response("Not found", { status: 404 });
  const body = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data as number[]);
  return new Response(body, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
