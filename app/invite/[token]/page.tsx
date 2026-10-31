import { getD1 } from "../../../db";
import { sha256 } from "../../../lib/server/crypto";
import { currentUser } from "../../../lib/server/page-session";
import InviteForm from "./invite-form";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getD1();
  const invite =
    token.length <= 100
      ? await db
          .prepare(
            `SELECT b.name AS business, i.email FROM invites i JOIN businesses b ON b.id = i.business
             WHERE i.id = ? AND i.used IS NULL AND i.revoked IS NULL AND i.expires > ? AND b.archived IS NULL`,
          )
          .bind(await sha256(token), new Date().toISOString())
          .first<{ business: string; email: string | null }>()
      : null;
  const user = await currentUser();
  return <InviteForm token={token} business={invite?.business ?? null} inviteEmail={invite?.email ?? null} signedInEmail={user?.email ?? null} />;
}
