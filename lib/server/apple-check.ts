// The admin's Apple Wallet health check: whether the signing key in Cloudflare belongs to the Pass Type ID
// certificate, when the certificate expires, and whether update pushes can be sent. A key that does not match
// the certificate makes every pass fail on the iPhone ("Safari cannot download this file"), for all businesses.
import { certInfo, pemToDer, type Bytes } from "./apple-pass.ts";
import { appleConfig } from "./apple-token.ts";

type AppleEnv = Parameters<typeof appleConfig>[0];

export type AppleHealth =
  | { configured: false }
  | { configured: true; passTypeId: string; teamId: string; keyMatches: boolean; certExpires: string | null; certSoon: boolean; certFrom: "secret" | "code"; error?: string };

/** The certificate ends within 30 days: renew it in the Apple developer account. */
const soon = (iso: string | null) => (iso ? Date.parse(iso) - Date.now() < 30 * 86_400_000 : false);

export async function appleHealth(env: AppleEnv): Promise<AppleHealth> {
  const config = appleConfig(env);
  if (!config) return { configured: false };
  const base = {
    configured: true as const,
    passTypeId: config.passTypeId,
    teamId: config.teamId,
    certFrom: env.APPLE_PASS_CERT?.trim() ? ("secret" as const) : ("code" as const),
  };
  let certExpires: string | null = null;
  try {
    const info = certInfo(pemToDer(config.signer.certPem));
    certExpires = info.notAfter;
    const algo = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await crypto.subtle.importKey("pkcs8", pemToDer(config.signer.keyPem), algo, false, ["sign"]);
    const pub = await crypto.subtle.importKey("spki", info.spki, algo, false, ["verify"]);
    const data: Bytes = new TextEncoder().encode("perkly apple check");
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
    const keyMatches = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pub, sig, data);
    return { ...base, keyMatches, certExpires, certSoon: soon(certExpires) };
  } catch (e) {
    return { ...base, keyMatches: false, certExpires, certSoon: soon(certExpires), error: String((e as Error).message ?? e).slice(0, 200) };
  }
}
