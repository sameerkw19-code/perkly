import { env, waitUntil } from "cloudflare:workers";
import { updateLoyaltyObject, walletConfig } from "./google-wallet";
import { passLook } from "./designs";
import { queueSync } from "./customer-messages";
import type { StampNotice } from "../design";

/**
 * After a stamp, redemption or adjustment: update the customer's Google Wallet pass in the background.
 * Runs only for customers who opened "Add to Google Wallet". The staff response never waits for Google.
 * If Google says the pass was never saved, the customer is unmarked so we stop trying.
 */
export function syncGoogleWallet(
  db: D1Database,
  c: { id: string; business: string; stamps: number; target: number; scan_code: string; google_wallet?: string | null },
  rewards: number,
  /** The site address the stamp came from, for the banner image link. */
  origin: string,
  /** What just happened, for the phone notification (sent only when the business turned it on). */
  notice?: StampNotice,
): void {
  if (!c.google_wallet) return;
  const config = walletConfig(env);
  if (!config) return;
  waitUntil(
    (async () => {
      const business = await db.prepare("SELECT id, name, reward, color FROM businesses WHERE id = ?").bind(c.business)
        .first<{ id: string; name: string; reward: string; color: string }>();
      const full = business ? await passLook(db, business, origin, { stamps: c.stamps, target: c.target, notice }).catch(() => undefined) : undefined;
      const { notice: message, ...look } = full ?? { notice: null };
      const result = await updateLoyaltyObject(
        config,
        { customerId: c.id, businessId: c.business, stamps: c.stamps, target: c.target, scanCode: c.scan_code, rewards, look: full ? (look as typeof full) : undefined },
        message,
      );
      if (result === "not_saved") {
        await db.prepare("UPDATE customers SET google_wallet = NULL WHERE id = ? AND google_wallet = ?").bind(c.id, c.google_wallet).run();
      }
      // Google was unreachable or refused: the background job tries again (5, 10, 20… minutes), so the
      // pass does not stay behind the real card.
      if (result === "failed") await queueSync(db, c, origin, 5 * 60_000).run();
      console.log(`google wallet sync: ${result}`);
    })(),
  );
}
