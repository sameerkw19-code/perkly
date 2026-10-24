import { env } from "cloudflare:workers";
import { fail, json, str } from "../../../../lib/server/http";
import { adminLog, adminRequest } from "../../../../lib/server/admin-api";
import { isPlatformAdmin } from "../../../../lib/server/auth";

export const dynamic = "force-dynamic";

// Platform admin actions on one user: block (with reason), unblock, signout (end all sessions).
export async function POST(request: Request) {
  const a = await adminRequest(request, { mutate: true });
  if ("error" in a) return a.error;
  const { db, user: me, body } = a;
  const id = str(body.user, 64);
  if (!id) return fail("bad_request", 400);
  const target = await db.prepare("SELECT id, email, name, blocked FROM users WHERE id = ?").bind(id).first<{ id: string; email: string; name: string; blocked: string | null }>();
  if (!target) return fail("not_found", 404, "User not found");
  const now = new Date().toISOString();

  switch (body.action) {
    case "block": {
      // Never lock out a platform admin (including yourself) from here.
      if (target.id === me.id || isPlatformAdmin(target, env)) return fail("cannot_block_admin", 409, "Platform admins cannot be blocked");
      const reason = str(body.reason, 200);
      if (!reason) return fail("reason_required", 400, "A reason is required");
      await db.batch([
        db.prepare("UPDATE users SET blocked = COALESCE(blocked, ?) WHERE id = ?").bind(now, id),
        db.prepare("DELETE FROM sessions WHERE user = ?").bind(id),
        adminLog(db, me.email, null, "user_block", `${target.email}: ${reason}`),
      ]);
      return json({ ok: true });
    }
    case "unblock": {
      await db.batch([
        db.prepare("UPDATE users SET blocked = NULL WHERE id = ?").bind(id),
        adminLog(db, me.email, null, "user_unblock", target.email),
      ]);
      return json({ ok: true });
    }
    case "signout": {
      const r = await db.batch([
        db.prepare("DELETE FROM sessions WHERE user = ?").bind(id),
        adminLog(db, me.email, null, "user_signout", target.email),
      ]);
      return json({ ok: true, ended: r[0].meta.changes });
    }
    default:
      return fail("bad_request", 400, "Unknown action");
  }
}
