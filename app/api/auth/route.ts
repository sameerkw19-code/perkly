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
import { DUMMY_HASH, hashPassword, sha256, verifyPassword } from "../../../lib/server/crypto";
import { clientIp, fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";

export const dynamic = "force-dynamic";

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
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
      if (env.SIGNUP_CODE && body.signupCode !== env.SIGNUP_CODE) return fail("signup_code", 403, "Signup code required");
      const name = str(body.name, 80);
      const email = normalizeEmail(body.email);
      if (!name || !email) return fail("bad_details", 400, "Invalid name or email");
      if (!validPassword(body.password)) return fail("weak_password", 400, "Password must be 8+ characters");
      const userId = await newUser(db, name, email, body.password);
      if (!userId) return fail("email_taken", 409, "Email already registered");
      const token = await createSession(db, userId);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, request) });
    }

    case "login": {
      const email = normalizeEmail(body.email);
      const okIp = await allow(db, `login-ip:${ip}`, 30, 600);
      const okEmail = await allow(db, `login-email:${email ?? "invalid"}`, 8, 600);
      if (!okIp || !okEmail) return fail("rate_limited", 429, "Too many attempts. Try again in 10 minutes.");
      const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
      const user = email
        ? await db.prepare("SELECT id, pass_hash FROM users WHERE email = ?").bind(email).first<{ id: string; pass_hash: string }>()
        : null;
      const valid = await verifyPassword(password, user?.pass_hash ?? DUMMY_HASH);
      if (!user || !valid) return fail("bad_login", 401, "Wrong email or password");
      const token = await createSession(db, user.id);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, request) });
    }

    case "logout": {
      await endSession(db, request.headers.get("cookie"));
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
    }

    case "accept_invite": {
      if (!(await allow(db, `invite:${ip}`, 20, 600))) return fail("rate_limited", 429, "Too many attempts");
      const tokenText = typeof body.token === "string" && body.token.length <= 100 ? body.token : "";
      const inviteId = await sha256(tokenText);
      const now = new Date().toISOString();
      const invite = await db
        .prepare("SELECT business, role, branch FROM invites WHERE id = ? AND used IS NULL AND revoked IS NULL AND expires > ?")
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
