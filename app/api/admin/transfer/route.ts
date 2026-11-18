import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { getUser, isPlatformAdmin } from "../../../../lib/server/auth";
import { fail, json, sameOrigin, str } from "../../../../lib/server/http";
import { allow } from "../../../../lib/server/rate-limit";
import { exportBusiness, importBusiness } from "../../../../lib/server/business-transfer";

export const dynamic = "force-dynamic";

/** A business with all its pictures: the 31 Google and 31 Apple banners make the file a few megabytes. */
const FILE_MAX = 60_000_000;

/**
 * Moving a business between Perkly sites (staging → perkly.shop), for platform admins only.
 * POST {"action":"export","business":id} returns the file; POST the file itself (format "perkly-business") imports it.
 */
export async function POST(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user || !isPlatformAdmin(user, env)) return fail("not_found", 404);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  if (Number(request.headers.get("content-length") ?? 0) > FILE_MAX) return fail("too_large", 413, "File is too large");
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > FILE_MAX) return fail("too_large", 413, "File is too large");
    body = JSON.parse(text);
  } catch {
    return fail("bad_file", 400, "Not a Perkly business file");
  }
  if (!body || typeof body !== "object") return fail("bad_file", 400, "Not a Perkly business file");

  if (body.action === "export") {
    const id = str(body.business, 64);
    if (!id) return fail("bad_request", 400);
    const file = await exportBusiness(db, id, new URL(request.url).host);
    if (!file) return fail("not_found", 404, "Business not found");
    await db.prepare("INSERT INTO admin_log(id, admin, business, action, detail, created) VALUES(?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, id, "export", `${file.assets.length} pictures`, new Date().toISOString()).run();
    return json(file);
  }

  if (!(await allow(db, `import-business:${user.id}`, 30, 86_400))) return fail("rate_limited", 429);
  const result = await importBusiness(db, user.id, body);
  if (!result.ok) return fail(result.code, 400, result.code === "bad_file" ? "Not a Perkly business file" : "Invalid business details");
  await db.prepare("INSERT INTO admin_log(id, admin, business, action, detail, created) VALUES(?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.email, result.id, "import", `from ${String(body.from ?? "?").slice(0, 80)}, ${result.pictures} pictures`, new Date().toISOString()).run();
  return json(result);
}
