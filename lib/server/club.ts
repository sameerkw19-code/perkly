import { randomToken, sha256 } from "./crypto";
import { updateMemberObject, walletConfig } from "./google-wallet";
import { endOfDay, israelToday, memberStatus, showDate } from "../club";
import type { MemberPass } from "../wallet-look";

type WalletEnv = { GOOGLE_WALLET_SA_KEY?: string; GOOGLE_WALLET_ISSUER_ID?: string; GOOGLE_WALLET_CLASS_ID?: string };

/** Member passes re-sent per cron run. */
const RETRY_BATCH = 12;

export type MemberRow = {
  id: string; business: string; member_no: number; name: string; phone: string | null; plan: string | null;
  valid_until: string; google_wallet: string | null; wallet_dirty: string | null; created: string; updated: string; archived: string | null;
};

/** A new secret for a card link. The link is shown once; only its hash is stored. */
export async function newMemberSecret(): Promise<{ secret: string; hash: string }> {
  const secret = randomToken();
  return { secret, hash: await sha256(secret) };
}

export function memberPass(m: MemberRow, club: string, today = israelToday()): MemberPass {
  return {
    club,
    memberNo: m.member_no,
    name: m.name,
    plan: m.plan,
    validUntil: showDate(m.valid_until),
    endsAt: endOfDay(m.valid_until),
    active: memberStatus(m.valid_until, today) !== "expired",
    removed: !!m.archived,
  };
}

/**
 * Sends a member's current details to their pass. A failed send keeps wallet_dirty, and the cron run
 * tries again, so a renewed member doesn't stay on an old date. Nothing is unmarked when Google has
 * no pass yet: the member may still finish saving it.
 */
export async function sendMemberPass(db: D1Database, env: WalletEnv, memberId: string): Promise<void> {
  const config = walletConfig(env);
  if (!config) return;
  const row = await db
    .prepare("SELECT m.*, b.name AS club FROM club_members m JOIN businesses b ON b.id = m.business WHERE m.id = ?")
    .bind(memberId)
    .first<MemberRow & { club: string }>();
  if (!row?.google_wallet || !row.wallet_dirty) return;
  const result = await updateMemberObject(config, row.id, memberPass(row, row.club));
  if (result === "failed") return;
  await db.prepare("UPDATE club_members SET wallet_dirty = NULL WHERE id = ? AND wallet_dirty = ?").bind(row.id, row.wallet_dirty).run();
}

/** Cron: passes whose update did not go through. */
export async function retryMemberPasses(db: D1Database, env: WalletEnv): Promise<void> {
  if (!walletConfig(env)) return;
  const due = await db
    .prepare("SELECT id FROM club_members WHERE wallet_dirty IS NOT NULL ORDER BY wallet_dirty LIMIT ?")
    .bind(RETRY_BATCH)
    .all<{ id: string }>();
  for (const m of due.results) await sendMemberPass(db, env, m.id);
}
