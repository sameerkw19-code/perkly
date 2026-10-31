import { env, waitUntil } from "cloudflare:workers";
import { getD1 } from "../../../db";
import {
  clearSessionCookie,
  createSession,
  endSession,
  getUser,
  normalizeEmail,
  sessionCookie,
} from "../../../lib/server/auth";
import { DUMMY_HASH, hashPassword, randomToken, sameText, sha256, verifyPassword } from "../../../lib/server/crypto";
import { clientIp, fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow, limited } from "../../../lib/server/rate-limit";
import { getSettings } from "../../../lib/server/settings";
import { maskEmail, mailReady, sendMail, simpleMail } from "../../../lib/server/mailer";
import { CODE_MAX_ATTEMPTS, CODE_MAX_SENDS, CODE_TTL_MS, deviceTrusted, hashCode, newCode, trustDevice } from "../../../lib/server/login-code";

/** The sign-in code email. */
function codeMail(to: string, code: string) {
  return simpleMail(
    to,
    `קוד כניסה ל-Perkly: ${code}`,
    ["זה קוד הכניסה שלך ל-Perkly. הוא בתוקף ל-10 דקות.", "לא ניסית להיכנס? אפשר להתעלם מההודעה. מומלץ להחליף סיסמה."],
    ["Your Perkly sign-in code. It is valid for 10 minutes. If this wasn't you, ignore this email and change your password."],
    { text: code },
  );
}

/** Starts the email-code step: stores the hashed code and emails it. Null when the email could not be sent. */
async function startCodeStep(db: D1Database, user: { id: string; email: string }) {
  const challenge = randomToken(18);
  const code = newCode();
  const now = new Date();
  await db
    .prepare("INSERT INTO login_challenges(id, user, code_hash, created, expires, last_sent) VALUES(?, ?, ?, ?, ?, ?)")
    .bind(challenge, user.id, await hashCode(challenge, code), now.toISOString(), new Date(now.getTime() + CODE_TTL_MS).toISOString(), now.toISOString())
    .run();
  if (!(await sendMail(env, codeMail(user.email, code)))) {
    await db.prepare("DELETE FROM login_challenges WHERE id = ?").bind(challenge).run();
    return null;
  }
  return challenge;
}

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
        ? await db.prepare("SELECT id, email, pass_hash, blocked FROM users WHERE email = ?").bind(email).first<{ id: string; email: string; pass_hash: string; blocked: string | null }>()
        : null;
      const valid = await verifyPassword(password, user?.pass_hash ?? DUMMY_HASH);
      if (!user || !valid) {
        await allow(db, `${failKey}:${ip}`, 8, 600);
        await allow(db, failKey, 50, 600);
        return fail("bad_login", 401, "Wrong email or password");
      }
      // Only after a correct password, so the message does not reveal which emails exist.
      if (user.blocked) return fail("account_blocked", 403, "This account is blocked");
      // Second step on a device the user has not trusted yet: a code sent to the account's email.
      // Applies once email sending is connected; until then sign-in works as before.
      if (mailReady(env) && !(await deviceTrusted(db, request.headers.get("cookie"), user.id))) {
        const challenge = await startCodeStep(db, user);
        if (!challenge) return fail("mail_unavailable", 503, "Could not send the sign-in code. Try again in a few minutes.");
        return json({ ok: true, code: true, challenge, sentTo: maskEmail(user.email) });
      }
      const token = await createSession(db, user.id);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, request) });
    }

    case "verify_code": {
      const challenge = typeof body.challenge === "string" && body.challenge.length <= 64 ? body.challenge : "";
      const code = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : "";
      if (!(await allow(db, `code-ip:${ip}`, 30, 600))) return fail("rate_limited", 429, "Too many attempts. Try again in 10 minutes.");
      const now = new Date().toISOString();
      const row = challenge
        ? await db
            .prepare(
              `SELECT c.id, c.user, c.code_hash, c.attempts, c.expires, c.used, u.blocked
               FROM login_challenges c JOIN users u ON u.id = c.user WHERE c.id = ?`,
            )
            .bind(challenge)
            .first<{ id: string; user: string; code_hash: string; attempts: number; expires: string; used: string | null; blocked: string | null }>()
        : null;
      if (!row || row.used || row.expires <= now || row.attempts >= CODE_MAX_ATTEMPTS || row.blocked) {
        return fail("code_invalid", 401, "The code is wrong or has expired");
      }
      if (code.length !== 6 || !(await sameText(await hashCode(challenge, code), row.code_hash))) {
        await db.prepare("UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?").bind(challenge).run();
        return fail("code_invalid", 401, "The code is wrong or has expired");
      }
      // Used before the session starts, so a code works once.
      const claimed = await db.prepare("UPDATE login_challenges SET used = ? WHERE id = ? AND used IS NULL").bind(now, challenge).run();
      if (!claimed.meta.changes) return fail("code_invalid", 401, "The code is wrong or has expired");
      await db.prepare("UPDATE users SET email_verified = COALESCE(email_verified, ?) WHERE id = ?").bind(now, row.user).run();
      const cookies: [string, string][] = [["Set-Cookie", sessionCookie(await createSession(db, row.user), request)]];
      if (body.remember !== false) cookies.push(["Set-Cookie", await trustDevice(db, row.user, request)]);
      return json({ ok: true }, 200, cookies);
    }

    case "resend_code": {
      const challenge = typeof body.challenge === "string" && body.challenge.length <= 64 ? body.challenge : "";
      if (!(await allow(db, `code-send-ip:${ip}`, 10, 600))) return fail("rate_limited", 429, "Too many attempts. Try again in 10 minutes.");
      const now = new Date();
      const row = challenge
        ? await db
            .prepare("SELECT c.user, c.sends, c.last_sent, c.used, u.email FROM login_challenges c JOIN users u ON u.id = c.user WHERE c.id = ?")
            .bind(challenge)
            .first<{ user: string; sends: number; last_sent: string | null; used: string | null; email: string }>()
        : null;
      if (!row || row.used) return fail("code_invalid", 401, "Sign in again");
      // Up to 3 emails per sign-in, at least 30 seconds apart.
      if (row.sends >= CODE_MAX_SENDS || (row.last_sent && now.getTime() - Date.parse(row.last_sent) < 30_000)) {
        return fail("rate_limited", 429, "Wait a little before asking for another code");
      }
      const code = newCode();
      await db
        .prepare("UPDATE login_challenges SET code_hash = ?, attempts = 0, sends = sends + 1, last_sent = ?, expires = ? WHERE id = ? AND used IS NULL")
        .bind(await hashCode(challenge, code), now.toISOString(), new Date(now.getTime() + CODE_TTL_MS).toISOString(), challenge)
        .run();
      if (!(await sendMail(env, codeMail(row.email, code)))) return fail("mail_unavailable", 503, "Could not send the code");
      return json({ ok: true });
    }

    // "Forgot password": emails a reset link. The answer is the same whether or not the email has an account.
    case "forgot_password": {
      if (!mailReady(env)) return fail("mail_unavailable", 503, "Password reset by email is not available yet");
      const email = normalizeEmail(body.email);
      if (!email) return fail("bad_details", 400, "Invalid email");
      if (!(await allow(db, `forgot-ip:${ip}`, 5, 3600))) return fail("rate_limited", 429, "Too many attempts");
      if (!(await allow(db, `forgot-email:${email}`, 3, 3600))) return json({ ok: true });
      const user = await db.prepare("SELECT id, email FROM users WHERE email = ? AND blocked IS NULL").bind(email).first<{ id: string; email: string }>();
      if (user) {
        const token = randomToken(24);
        const now = new Date();
        await db.batch([
          db.prepare("UPDATE password_resets SET used = ? WHERE user = ? AND used IS NULL").bind(now.toISOString(), user.id),
          db.prepare("INSERT INTO password_resets(id, user, created, created_by, expires) VALUES(?, ?, ?, 'email', ?)")
            .bind(await sha256(token), user.id, now.toISOString(), new Date(now.getTime() + 3_600_000).toISOString()),
        ]);
        const link = `${new URL(request.url).origin}/reset/${token}`;
        await sendMail(env, simpleMail(
          user.email,
          "איפוס סיסמה ל-Perkly",
          ["ביקשת לאפס את הסיסמה שלך ל-Perkly. הקישור בתוקף לשעה אחת.", "לא ביקשת? אפשר להתעלם מההודעה, הסיסמה לא תשתנה."],
          ["You asked to reset your Perkly password. The link is valid for one hour. If this wasn't you, ignore this email."],
          { text: "בחירת סיסמה חדשה", href: link },
        ));
      }
      return json({ ok: true });
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
        // Signs out every device that used the old password, and forgets trusted devices.
        db.prepare("DELETE FROM sessions WHERE user = ?").bind(reset.user),
        db.prepare("DELETE FROM trusted_devices WHERE user = ?").bind(reset.user),
      ]);
      const token = await createSession(db, reset.user);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, request) });
    }

    case "logout": {
      await endSession(db, request.headers.get("cookie"));
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
    }

    // Deletes the signed-in person's own account (after the password). A business owner closes or hands over
    // the business first, so a business never loses its owner by accident.
    case "delete_account": {
      const me = await getUser(db, request.headers.get("cookie"));
      if (!me) return fail("signin", 401, "Sign in required");
      if (!(await allow(db, `delete-account:${me.id}`, 5, 3600))) return fail("rate_limited", 429, "Too many attempts");
      const row = await db.prepare("SELECT pass_hash FROM users WHERE id = ?").bind(me.id).first<{ pass_hash: string }>();
      const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
      if (!row || !(await verifyPassword(password, row.pass_hash))) return fail("bad_login", 401, "Wrong password");
      const owns = await db
        .prepare("SELECT COUNT(*) AS n FROM memberships m JOIN businesses b ON b.id = m.business WHERE m.user = ? AND m.role = 'owner' AND m.revoked IS NULL AND b.archived IS NULL")
        .bind(me.id)
        .first<{ n: number }>();
      if (owns?.n) return fail("account_owns_business", 409, "Close or hand over your business first");
      const now = new Date().toISOString();
      // The account stops existing for sign-in; its name and email are removed. Past actions in a
      // business's history keep pointing at the (now anonymous) account.
      await db.batch([
        db.prepare("UPDATE memberships SET revoked = COALESCE(revoked, ?) WHERE user = ?").bind(now, me.id),
        db.prepare("DELETE FROM sessions WHERE user = ?").bind(me.id),
        db.prepare("DELETE FROM trusted_devices WHERE user = ?").bind(me.id),
        db.prepare("UPDATE password_resets SET used = COALESCE(used, ?) WHERE user = ?").bind(now, me.id),
        db.prepare("UPDATE users SET name = '—', email = 'deleted-' || id || '@deleted.invalid', pass_hash = ?, blocked = COALESCE(blocked, ?) WHERE id = ?")
          .bind(await hashPassword(randomToken(24)), now, me.id),
      ]);
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
    }

    // Ends every session of this user (all phones and computers), including this one.
    case "logout_all": {
      const me = await getUser(db, request.headers.get("cookie"));
      if (me) {
        await db.batch([
          db.prepare("DELETE FROM sessions WHERE user = ?").bind(me.id),
          // A lost phone must ask for a code again.
          db.prepare("DELETE FROM trusted_devices WHERE user = ?").bind(me.id),
        ]);
      }
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
          `SELECT i.business, i.role, i.branch, i.email, b.name AS business_name FROM invites i JOIN businesses b ON b.id = i.business
           WHERE i.id = ? AND i.used IS NULL AND i.revoked IS NULL AND i.expires > ? AND b.archived IS NULL`,
        )
        .bind(inviteId, now)
        .first<{ business: string; role: string; branch: string | null; email: string | null; business_name: string }>();
      if (!tokenText || !invite) return fail("invite_invalid", 404, "Invite expired or already used");

      let user = await getUser(db, request.headers.get("cookie"));
      let setCookie: string | undefined;
      // An invite made for an email works only for an account with that email.
      if (user && invite.email && user.email !== invite.email) return fail("invite_other_email", 403, "This invite is for another email");
      if (!user) {
        const name = str(body.name, 80);
        const email = normalizeEmail(body.email);
        if (!name || !email) return fail("bad_details", 400, "Invalid name or email");
        if (invite.email && email !== invite.email) return fail("invite_other_email", 403, "This invite is for another email");
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
      // The owners hear about it, so a join they did not expect does not go unnoticed.
      if (mailReady(env)) {
        const owners = await db
          .prepare("SELECT u.email FROM memberships m JOIN users u ON u.id = m.user WHERE m.business = ? AND m.role = 'owner' AND m.revoked IS NULL")
          .bind(invite.business)
          .all<{ email: string }>();
        const who = `${user.name} (${user.email})`;
        const origin = new URL(request.url).origin;
        waitUntil(Promise.all((owners.results ?? []).map((o) => sendMail(env, simpleMail(
          o.email,
          `עובד חדש הצטרף ל-${invite.business_name}`,
          [`${who} הצטרף/ה לצוות של ${invite.business_name} ב-Perkly.`, "לא הזמנת? אפשר להסיר אותו/ה בלשונית \"צוות\" בלוח הבקרה."],
          [`${who} joined the ${invite.business_name} team on Perkly. Didn't invite them? Remove them under "Team" in the dashboard.`],
          { text: "ללוח הבקרה", href: `${origin}/?business=${invite.business}` },
        )))));
      }
      return json({ ok: true, business: invite.business }, 200, setCookie ? { "Set-Cookie": setCookie } : undefined);
    }

    default:
      return fail("bad_request", 400, "Unknown action");
  }
}
