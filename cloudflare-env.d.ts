declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    /** Comma-separated emails that may open the platform admin page. */
    PLATFORM_ADMIN_EMAILS?: string;
    /** Optional. When set, creating a new owner account requires this code. Set with `wrangler secret put`. */
    SIGNUP_CODE?: string;
    /** Polar billing. Set with `wrangler secret put`. POLAR_SANDBOX=1 uses the sandbox API. */
    POLAR_ACCESS_TOKEN?: string;
    POLAR_PRODUCT_ID?: string;
    POLAR_WEBHOOK_SECRET?: string;
    POLAR_SANDBOX?: string;
  }
}
