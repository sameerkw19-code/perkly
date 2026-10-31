import { env } from "cloudflare:workers";
import { fail, json, str } from "../../../../lib/server/http";
import { adminLog, adminRequest } from "../../../../lib/server/admin-api";
import { isPlatformAdmin } from "../../../../lib/server/auth";
import { randomToken, sha256 } from "../../../../lib/server/crypto";

export const dynamic = "force-dynamic";

// Platform admin actions on one user: block (with reason), unblock, signout (end all sessions),
// reset_link (a one-time password reset link, valid 24 hours, shown to the admin once).
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
    case "reset_link": {
      if (target.blocked) return fail("user_blocked", 409, "Unblock the user first");
      // A reset link takes over the account, so it is never issued for another platform admin.
      if (target.id !== me.id && isPlatformAdmin(target, env)) return fail("cannot_reset_admin", 409, "Platform admins reset their own password");
      const token = randomToken(24);
      const expires = new Date(Date.now() + 24 * 3_600_000).toISOString();
      await db.batch([
        // Older unused links for this user stop working.
        db.prepare("UPDATE password_resets SET used = ? WHERE user = ? AND used IS NULL").bind(now, id),
        db.prepare("INSERT INTO password_resets(id, user, created, created_by, expires) VALUES(?, ?, ?, ?, ?)")
          .bind(await sha256(token), id, now, me.email, expires),
        adminLog(db, me.email, null, "user_reset_link", target.email),
      ]);
      return json({ ok: true, url: `${new URL(request.url).origin}/reset/${token}`, expires });
    }
    default:
      return fail("bad_request", 400, "Unknown action");
  }
}
