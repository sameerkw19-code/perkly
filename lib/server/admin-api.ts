import { env } from "cloudflare:workers";
import { getD1 } from "../../db";
import { getUser, isPlatformAdmin } from "./auth";
import { fail, readJson, sameOrigin } from "./http";

/**
 * Shared guard for admin API routes. Non-admins (and signed-out visitors) get the same 404 as a
 * missing route, checked before the body is read. Mutations also need a same-origin request.
 */
export async function adminRequest(request: Request, opts: { mutate: boolean }) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user || !isPlatformAdmin(user, env)) return { error: fail("not_found", 404) } as const;
  if (opts.mutate && !sameOrigin(request)) return { error: fail("bad_origin", 403, "Invalid origin") } as const;
  const body = opts.mutate ? await readJson(request) : null;
  if (opts.mutate && !body) return { error: fail("bad_request", 400) } as const;
  return { db, user, body: body ?? {} } as const;
}

export function adminLog(db: D1Database, admin: string, business: string | null, action: string, detail: string | null) {
  return db
    .prepare("INSERT INTO admin_log(id, admin, business, action, detail, created) VALUES(?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), admin, business, action, detail, new Date().toISOString());
}
