import { env, waitUntil } from "cloudflare:workers";
import { updateLoyaltyObject, walletConfig } from "./google-wallet";
import { passLook } from "./designs";

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
): void {
  if (!c.google_wallet) return;
  const config = walletConfig(env);
  if (!config) return;
  waitUntil(
    (async () => {
      const business = await db.prepare("SELECT id, name, reward, color FROM businesses WHERE id = ?").bind(c.business)
        .first<{ id: string; name: string; reward: string; color: string }>();
      const look = business ? await passLook(db, business, origin).catch(() => undefined) : undefined;
      const result = await updateLoyaltyObject(config, {
        customerId: c.id, businessId: c.business, stamps: c.stamps, target: c.target, scanCode: c.scan_code, rewards, look,
      });
      if (result === "not_saved") {
        await db.prepare("UPDATE customers SET google_wallet = NULL WHERE id = ? AND google_wallet = ?").bind(c.id, c.google_wallet).run();
      }
      console.log(`google wallet sync: ${result}`);
    })(),
  );
}
