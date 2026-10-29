import { getD1 } from "../../../../db";
import { getRole, getUser } from "../../../../lib/server/auth";
import { businessAccess, hasPaidDesign } from "../../../../lib/server/billing";
import { getSettings } from "../../../../lib/server/settings";
import { fail, json, sameOrigin } from "../../../../lib/server/http";
import { imageInfo } from "../../../../lib/server/image";
import { allow } from "../../../../lib/server/rate-limit";
import { publishedDesign } from "../../../../lib/server/designs";
import { MAX_WALLET_STAMPS } from "../../../../lib/design";

export const dynamic = "force-dynamic";

const MAX_BYTES = 400_000; // One banner picture (JPEG, 1032×336).

/**
 * Uploads the stamp banner set in one request: form fields s0, s1, … sN (picture for 0…N stamps).
 * Owner only, subscription feature. Older banner pictures that the published card does not use are removed.
 * Returns the new picture ids in stamp order.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null); // read first, always
  if (!sameOrigin(request)) return fail("bad_origin", 403);
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401);
  const business = new URL(request.url).searchParams.get("business");
  const role = await getRole(db, user.id, business);
  if (!role) return fail("not_found", 404);
  if (role !== "owner") return fail("forbidden", 403);
  if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");
  const access = await businessAccess(db, business!);
  if (!access.ok && access.code === "business_suspended") return fail(access.code, 402, "Business is suspended");
  if (!hasPaidDesign(access)) return fail("paid_feature", 402, "Available with a subscription");
  if (!form) return fail("bad_request", 400);
  if (!(await allow(db, `banners:${user.id}`, 20, 3600))) return fail("rate_limited", 429);

  const pictures: { bytes: Uint8Array; mime: string; width: number; height: number }[] = [];
  for (let i = 0; i < MAX_WALLET_STAMPS + 1; i++) {
    const file = form.get(`s${i}`);
    if (file === null) break;
    if (typeof file === "string") return fail("bad_request", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return fail("image_too_big", 413);
    const info = imageInfo(bytes);
    if (!info || (info.mime !== "image/jpeg" && info.mime !== "image/png") || info.width > 2100 || info.height > 700) return fail("image_type", 415);
    pictures.push({ bytes, ...info });
  }
  // 0…target stamps, and a card has 2 to 30 stamps.
  if (pictures.length < 3 || pictures.length > MAX_WALLET_STAMPS) return fail("bad_request", 400);

  // Remove banner pictures from earlier drafts. The published card's set stays until the next publish.
  const keep = new Set((await publishedDesign(db, business!))?.design.walletStamps ?? []);
  const old = await db.prepare("SELECT id FROM assets WHERE business = ? AND kind = 'banner'").bind(business).all<{ id: string }>();
  const remove = (old.results ?? []).map((r) => r.id).filter((id) => !keep.has(id));

  const now = new Date().toISOString();
  const ids = pictures.map(() => crypto.randomUUID());
  await db.batch([
    ...remove.map((id) => db.prepare("DELETE FROM assets WHERE id = ? AND business = ? AND kind = 'banner'").bind(id, business)),
    ...pictures.map((p, i) =>
      db
        .prepare("INSERT INTO assets(id, business, kind, mime, width, height, bytes, data, created, created_by) VALUES(?, ?, 'banner', ?, ?, ?, ?, ?, ?, ?)")
        .bind(ids[i], business, p.mime, p.width, p.height, p.bytes.length, p.bytes, now, user.id),
    ),
  ]);
  return json({ ids });
}
