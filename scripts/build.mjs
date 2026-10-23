// Build for one Cloudflare environment from wrangler.jsonc ("staging" or "production").
// Works the same on Windows CMD, PowerShell, macOS and Linux.
import { spawnSync } from "node:child_process";

const target = process.argv[2];
if (!["staging", "production"].includes(target)) {
  console.error('Usage: node scripts/build.mjs staging|production');
  process.exit(1);
}
const result = spawnSync("npx", ["vinext", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, CLOUDFLARE_ENV: target },
});
process.exit(result.status ?? 1);
