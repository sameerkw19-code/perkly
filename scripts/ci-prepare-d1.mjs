// CI helper: makes sure the D1 database for an environment exists and writes its id into wrangler.jsonc.
// Usage: node scripts/ci-prepare-d1.mjs staging|production
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const env = process.argv[2];
const names = { staging: "perkly-staging", production: "perkly-production" };
const placeholders = { staging: "REPLACE_WITH_STAGING_DATABASE_ID", production: "REPLACE_WITH_PRODUCTION_DATABASE_ID" };
if (!names[env]) throw new Error("Usage: node scripts/ci-prepare-d1.mjs staging|production");

const wrangler = (args) => execSync(`npx wrangler ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const find = () => JSON.parse(wrangler("d1 list --json")).find((d) => d.name === names[env]);

let db = find();
if (!db) {
  console.log(`Creating D1 database ${names[env]}…`);
  wrangler(`d1 create ${names[env]}`);
  db = find();
}
if (!db?.uuid) throw new Error(`Could not find or create D1 database ${names[env]}`);

const config = readFileSync("wrangler.jsonc", "utf8");
writeFileSync("wrangler.jsonc", config.replace(placeholders[env], db.uuid));
console.log(`Using D1 database ${names[env]} (${db.uuid})`);
