import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "perkly_session";
const SESSION_DAYS = 30;

export type User = { id: string; email: string; name: string };
export type Role = "owner" | "staff";
export type Membership = { business: string; role: Role; businessName: string; branch: string | null };

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function cookieAttributes(secure: boolean, maxAge: number): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** Secure everywhere except local development (http://localhost or 127.0.0.1). */
export function secureCookie(request: Request): boolean {
  const { hostname } = new URL(request.url);
  return !(hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]");
}

export function sessionCookie(token: string, request: Request): string {
  const secure = secureCookie(request);
  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(secure, SESSION_DAYS * 86_400)}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = secureCookie(request);
  return `${SESSION_COOKIE}=; ${cookieAttributes(secure, 0)}`;
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db
    .prepare("INSERT INTO sessions(id, user, created, expires) VALUES(?, ?, ?, ?)")
    .bind(await sha256(token), userId, now.toISOString(), expires.toISOString())
    .run();
  if (Math.random() < 0.05) {
    await db.prepare("DELETE FROM sessions WHERE expires < ?").bind(now.toISOString()).run();
  }
  return token;
}

export async function endSession(db: D1Database, cookieHeader: string | null): Promise<void> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
}

/** The signed-in user, based only on the server-issued session cookie. */
export async function getUser(db: D1Database, cookieHeader: string | null): Promise<User | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  return db
    .prepare(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user
       WHERE s.id = ? AND s.expires > ? AND u.blocked IS NULL`,
    )
    .bind(await sha256(token), new Date().toISOString())
    .first<User>();
}

/** Active (not revoked) memberships of a user. */
export async function getMemberships(db: D1Database, userId: string): Promise<Membership[]> {
  const rows = await db
    .prepare(
      `SELECT m.business, m.role, m.branch, b.name AS businessName FROM memberships m
       JOIN businesses b ON b.id = m.business
       WHERE m.user = ? AND m.revoked IS NULL AND b.archived IS NULL ORDER BY b.created`,
    )
    .bind(userId)
    .all<Membership>();
  return rows.results;
}

/** Role and branch of the user in one business, or null. Checked on every request. */
export async function getMembership(db: D1Database, userId: string, businessId: unknown): Promise<{ role: Role; branch: string | null } | null> {
  if (typeof businessId !== "string" || !businessId) return null;
  return db
    // Archived businesses are invisible to their members.
    .prepare(
      `SELECT m.role, m.branch FROM memberships m JOIN businesses b ON b.id = m.business
       WHERE m.user = ? AND m.business = ? AND m.revoked IS NULL AND b.archived IS NULL`,
    )
    .bind(userId, businessId)
    .first<{ role: Role; branch: string | null }>();
}

/** Role of the user in one business, or null. */
export async function getRole(db: D1Database, userId: string, businessId: unknown): Promise<Role | null> {
  if (typeof businessId !== "string" || !businessId) return null;
  const row = await db
    .prepare(
      `SELECT m.role FROM memberships m JOIN businesses b ON b.id = m.business
       WHERE m.user = ? AND m.business = ? AND m.revoked IS NULL AND b.archived IS NULL`,
    )
    .bind(userId, businessId)
    .first<{ role: Role }>();
  return row?.role ?? null;
}

/**
 * Platform admins. Prefer PLATFORM_ADMIN_USER_IDS: emails are not verified at signup, so an admin
 * email that has no account yet could be claimed by anyone. When user ids are set, emails are ignored.
 */
export function isPlatformAdmin(user: User, cfg: { PLATFORM_ADMIN_USER_IDS?: string; PLATFORM_ADMIN_EMAILS?: string }): boolean {
  const list = (v: string | undefined) => (v ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const ids = list(cfg.PLATFORM_ADMIN_USER_IDS);
  if (ids.length) return ids.includes(user.id.toLowerCase());
  return list(cfg.PLATFORM_ADMIN_EMAILS).includes(user.email.toLowerCase());
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
