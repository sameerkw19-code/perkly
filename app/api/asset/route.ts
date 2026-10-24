import { getD1 } from "../../../db";
import { getRole, getUser } from "../../../lib/server/auth";
import { businessAccess } from "../../../lib/server/billing";
import { getSettings } from "../../../lib/server/settings";
import { fail, json, sameOrigin } from "../../../lib/server/http";
import { imageInfo } from "../../../lib/server/image";
import { allow } from "../../../lib/server/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 800_000; // The editor shrinks images before upload; this is a safety cap.
const KINDS = new Set(["logo", "hero", "stamp"]);

// Upload one image (raw bytes in the body). Owner only. SVG is not accepted.
export async function POST(request: Request) {
  const bytes = new Uint8Array(await request.arrayBuffer()); // read first, always
  if (!sameOrigin(request)) return fail("bad_origin", 403);
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401);
  const url = new URL(request.url);
  const business = url.searchParams.get("business");
  const kind = url.searchParams.get("kind") ?? "";
  const role = await getRole(db, user.id, business);
  if (!role) return fail("not_found", 404);
  if (role !== "owner") return fail("forbidden", 403);
  if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");
  const access = await businessAccess(db, business!);
  if (!access.ok && access.code === "business_suspended") return fail(access.code, 402, "Business is suspended");
  if (!KINDS.has(kind)) return fail("bad_request", 400);
  if (!bytes.length || bytes.length > MAX_BYTES) return fail("image_too_big", 413);
  if (!(await allow(db, `upload:${user.id}`, 60, 3600))) return fail("rate_limited", 429);
  const info = imageInfo(bytes);
  if (!info || info.width < 1 || info.height < 1 || info.width > 6000 || info.height > 6000) return fail("image_type", 415);

  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO assets(id, business, kind, mime, width, height, bytes, data, created, created_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, business, kind, info.mime, info.width, info.height, bytes.length, bytes, new Date().toISOString(), user.id)
    .run();
  return json({ id, width: info.width, height: info.height });
}
