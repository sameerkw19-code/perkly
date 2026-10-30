declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    /** Comma-separated emails that may open the platform admin page. */
    PLATFORM_ADMIN_EMAILS?: string;
    /** Comma-separated user ids of platform admins. When set, PLATFORM_ADMIN_EMAILS is ignored. Set as a secret. */
    PLATFORM_ADMIN_USER_IDS?: string;
    /** Optional. When set, creating a new owner account requires this code. Set with `wrangler secret put`. */
    SIGNUP_CODE?: string;
    /** Polar billing. Set with `wrangler secret put`. POLAR_SANDBOX=1 uses the sandbox API. */
    POLAR_ACCESS_TOKEN?: string;
    POLAR_PRODUCT_ID?: string;
    POLAR_WEBHOOK_SECRET?: string;
    POLAR_SANDBOX?: string;
    /** Pulseem SMS: API key (secret) and the approved sender name or number. */
    PULSEEM_API_KEY?: string;
    PULSEEM_FROM?: string;
    /** Full Google Wallet loyalty class id, exactly as Google lists it. */
    GOOGLE_WALLET_CLASS_ID?: string;
    /** Google Wallet. Issuer id is a Variable; the service-account JSON key is a Secret. */
    GOOGLE_WALLET_ISSUER_ID?: string;
    GOOGLE_WALLET_SA_KEY?: string;
  }
}
