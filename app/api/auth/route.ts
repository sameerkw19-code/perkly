import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import {
  clearSessionCookie,
  createSession,
  endSession,
  getUser,
  normalizeEmail,
  sessionCookie,
} from "../../../lib/server/auth";
import { DUMMY_HASH, hashPassword, sameText, sha256, verifyPassword } from "../../../lib/server/crypto";
import { clientIp, fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow, limited } from "../../../lib/server/rate-limit";
import { getSettings } from "../../../lib/server/settings";

export const dynamic = "force-dynamic";

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
}

/** Passwords that are guessed first. Compared without case, spaces or a trailing "!". */
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "11111111", "00000000", "12341234", "87654321", "123123123",
  "password", "password1", "password123", "passw0rd", "qwertyui", "qwerty123", "qwertyuiop", "asdfghjk",
  "iloveyou", "abcd1234", "abc12345", "a1234567", "1q2w3e4r", "1qaz2wsx", "zaq12wsx", "letmein1",
  "welcome1", "admin123", "perkly123", "loyalty1", "shalom123", "israel123", "05050505", "0501234567",
]);

/** Not one of the most common passwords, not one repeated character, and not the email. */
function strongEnough(password: string, email: string | null): boolean {
  const p = password.toLowerCase().replace(/\s+/g, "").replace(/!+$/, "");
  if (COMMON_PASSWORDS.has(p) || /^(.)\1+$/.test(p)) return false;
  return !(email && (p === email || p === email.split("@")[0]));
}

async function newUser(db: D1Database, name: string, email: string, password: string) {
  const id = crypto.randomUUID();
  const result = await db
    .prepare("INSERT OR IGNORE INTO users(id, email, name, pass_hash, created) VALUES(?, ?, ?, ?, ?)")
    .bind(id, email, name, await hashPassword(password), new Date().toISOString())
    .run();
  return result.meta.changes ? id : null;
}

export async function POST(request: Request) {
  // Always read the body first, so an early error never leaves the request half-read.
  const body = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const db = getD1();
  if (!body) return fail("bad_request", 400, "Invalid request");
  const ip = clientIp(request);

  switch (body.action) {
    case "signup": {
      if (!(await allow(db, `signup:${ip}`, 5, 3600))) return fail("rate_limited", 429, "Too many attempts");
      if (env.SIGNUP_CODE && !(await sameText(typeof body.signupCode === "string" ? body.signupCode : "", env.SIGNUP_CODE))) return fail("signup_code", 403, "Signup code required");
      const sys = await getSettings(db);
      const name = str(body.name, 80);
      const email = normalizeEmail(body.email);
      // No exception for admin emails: emails are not verified, so anyone could sign up with one.
      if (!sys.signupsOpen || sys.maintenance) return fail(sys.maintenance ? "maintenance" : "signups_closed", 403, "Sign-ups are closed");
      if (!name || !email) return fail("bad_details", 400, "Invalid name or email");
      if (!validPassword(body.password)) return fail("weak_password", 400, "Password must be 8+ characters");
      if (!strongEnough(body.password, email)) return fail("common_password", 400, "This password is too easy to guess");
      const userId = await newUser(db, name, email, body.password);
      if (!userId) return fail("email_taken", 409, "Email already registered");
      const token = await createSession(db, userId);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, request) });
    }

    case "login": {
      const email = normalizeEmail(body.email);
      // Only wrong passwords count toward the per-email limits, so nobody can lock an account by
      // guessing on purpose from one place: 8 per email from one network, 50 per email in total.
      const failKey = `login-fail:${email ?? "invalid"}`;
      const okIp = await allow(db, `login-ip:${ip}`, 30, 600);
      if (!okIp || (await limited(db, `${failKey}:${ip}`, 8, 600)) || (await limited(db, failKey, 50, 600))) {
        return fail("rate_limited", 429, "Too many attempts. Try again in 10 minutes.");
      }
      const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
      const user = email
        ? await db.prepare("SELECT id, pass_hash, blocked FROM users WHERE email = ?").bind(email).first<{ id: string; pass_hash: string; blocked: string | null }>()
        : null;
      const valid = await verifyPassword(password, user?.pass_hash ?? DUMMY_HASH);
      if (!user || !valid) {
        await allow(db, `${failKey}:${ip}`, 8, 600);
        await allow(db, failKey, 50, 600);
        return fail("bad_login", 401, "Wrong email or password");
      }
      // Only after a correct password, so the message does not reveal which emails exist.
      if (user.blocked) return fail("account_blocked", 403, "This account is blocked");
      const token = await createSession(db, user.id);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, request) });
    }

    case "reset_password": {
      if (!(await allow(db, `reset:${ip}`, 10, 600))) return fail("rate_limited", 429, "Too many attempts");
      const tokenText = typeof body.token === "string" && body.token.length <= 100 ? body.token : "";
      if (!validPassword(body.password)) return fail("weak_password", 400, "Password must be 8+ characters");
      if (!strongEnough(body.password, null)) return fail("common_password", 400, "This password is too easy to guess");
      const now = new Date().toISOString();
      const reset = tokenText
        ? await db
            .prepare(
              `SELECT r.id, r.user FROM password_resets r JOIN users u ON u.id = r.user
               WHERE r.id = ? AND r.used IS NULL AND r.expires > ? AND u.blocked IS NULL`,
            )
            .bind(await sha256(tokenText), now)
            .first<{ id: string; user: string }>()
        : null;
      if (!reset) return fail("reset_invalid", 404, "This reset link expired or was already used");
      const [used] = await db.batch([
        // Marks the link used first, so the same link cannot be used twice at the same time.
        db.prepare("UPDATE password_resets SET used = ? WHERE id = ? AND used IS NULL").bind(now, reset.id),
      ]);
      if (!used.meta.changes) return fail("reset_invalid", 404, "This reset link expired or was already used");
      await db.batch([
        db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").bind(await hashPassword(body.password), reset.user),
        // Signs out every device that used the old password.
        db.prepare("DELETE FROM sessions WHERE user = ?").bind(reset.user),
      ]);
      const token = await createSession(db, reset.user);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, request) });
    }

    case "logout": {
      await endSession(db, request.headers.get("cookie"));
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
    }

    // Ends every session of this user (all phones and computers), including this one.
    case "logout_all": {
      const me = await getUser(db, request.headers.get("cookie"));
      if (me) await db.prepare("DELETE FROM sessions WHERE user = ?").bind(me.id).run();
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
    }

    case "accept_invite": {
      if (!(await allow(db, `invite:${ip}`, 20, 600))) return fail("rate_limited", 429, "Too many attempts");
      const tokenText = typeof body.token === "string" && body.token.length <= 100 ? body.token : "";
      const inviteId = await sha256(tokenText);
      const now = new Date().toISOString();
      if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");
      // Invites to archived businesses do not work.
      const invite = await db
        .prepare(
          `SELECT i.business, i.role, i.branch FROM invites i JOIN businesses b ON b.id = i.business
           WHERE i.id = ? AND i.used IS NULL AND i.revoked IS NULL AND i.expires > ? AND b.archived IS NULL`,
        )
        .bind(inviteId, now)
        .first<{ business: string; role: string; branch: string | null }>();
      if (!tokenText || !invite) return fail("invite_invalid", 404, "Invite expired or already used");

      let user = await getUser(db, request.headers.get("cookie"));
      let setCookie: string | undefined;
      if (!user) {
        const name = str(body.name, 80);
        const email = normalizeEmail(body.email);
        if (!name || !email) return fail("bad_details", 400, "Invalid name or email");
        if (!validPassword(body.password)) return fail("weak_password", 400, "Password must be 8+ characters");
      if (!strongEnough(body.password, email)) return fail("common_password", 400, "This password is too easy to guess");
        const userId = await newUser(db, name, email, body.password);
        if (!userId) return fail("email_taken_signin", 409, "Email already registered. Sign in first, then open the invite again.");
        user = { id: userId, email, name };
        setCookie = sessionCookie(await createSession(db, userId), request);
      }

      // Use the invite and add the membership in one atomic step.
      const result = await db.batch([
        db.prepare("UPDATE invites SET used = ?, used_by = ? WHERE id = ? AND used IS NULL AND revoked IS NULL AND expires > ?")
          .bind(now, user.id, inviteId, now),
        db.prepare(
          `INSERT INTO memberships(id, business, user, role, created, branch)
           SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1
           ON CONFLICT(business, user) DO UPDATE SET revoked = NULL,
             role = CASE WHEN memberships.role = 'owner' THEN 'owner' ELSE excluded.role END,
             branch = CASE WHEN memberships.role = 'owner' THEN memberships.branch ELSE excluded.branch END`,
        ).bind(crypto.randomUUID(), invite.business, user.id, invite.role, now, invite.branch),
      ]);
      if (!result[0].meta.changes) return fail("invite_invalid", 404, "Invite expired or already used");
      return json({ ok: true, business: invite.business }, 200, setCookie ? { "Set-Cookie": setCookie } : undefined);
    }

    default:
      return fail("bad_request", 400, "Unknown action");
  }
}
