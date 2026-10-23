import vinext from "vinext";
import { defineConfig } from "vite";

// Standalone build for Cloudflare Workers + D1.
// Bindings and environments (local / staging / production) live in wrangler.jsonc.
// Pick an environment at build time with CLOUDFLARE_ENV (see scripts/build.mjs).
export default defineConfig(async () => {
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
      }),
    ],
  };
});
