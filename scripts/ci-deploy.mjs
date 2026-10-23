// CI helper: deploy the built Worker; on failure, show Wrangler's message as a GitHub annotation.
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["wrangler", "deploy", "--config", "dist/server/wrangler.json"], { encoding: "utf8" });
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
const url = /https:\/\/[^\s]+\.workers\.dev/.exec(r.stdout ?? "")?.[0];
if (url) console.log(`::notice title=Perkly is live::${url}`);
if (r.status !== 0) {
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.replace(/[A-Za-z0-9_-]{30,}/g, "[hidden]").split("\n").filter((l) => l.trim()).slice(-30).join("%0A");
  console.log(`::error title=Cloudflare deploy::${out.slice(0, 3000)}`);
  process.exit(r.status ?? 1);
}
