// CI helper: makes sure the D1 database for an environment exists and writes its id into wrangler.jsonc.
// Usage: node scripts/ci-prepare-d1.mjs staging|production
// Errors are printed as GitHub annotations so they show up on the run summary.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const env = process.argv[2];
const names = { staging: "perkly-staging", production: "perkly-production" };
const placeholders = { staging: "REPLACE_WITH_STAGING_DATABASE_ID", production: "REPLACE_WITH_PRODUCTION_DATABASE_ID" };
if (!names[env]) throw new Error("Usage: node scripts/ci-prepare-d1.mjs staging|production");

const annotate = (msg) => console.log(`::error title=Cloudflare D1::${String(msg).replace(/\r?\n/g, "%0A").slice(0, 1500)}`);

function wrangler(args) {
  try {
    return execSync(`npx wrangler ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.replace(/[A-Za-z0-9_-]{30,}/g, "[hidden]").trim();
    annotate(`wrangler ${args} failed:\n${out.split("\n").slice(-25).join("\n")}`);
    process.exit(1);
  }
}

function list() {
  const text = wrangler("d1 list --json");
  const start = text.indexOf("[");
  try {
    return JSON.parse(text.slice(start));
  } catch {
    annotate(`Unexpected output from d1 list: ${text.slice(0, 500)}`);
    process.exit(1);
  }
}

let db = list().find((d) => d.name === names[env]);
if (!db) {
  console.log(`Creating D1 database ${names[env]}…`);
  wrangler(`d1 create ${names[env]}`);
  db = list().find((d) => d.name === names[env]);
}
const id = db?.uuid ?? db?.id ?? db?.database_id;
if (!id) {
  annotate(`Could not find or create D1 database ${names[env]}. Got: ${JSON.stringify(db)}`);
  process.exit(1);
}

const config = readFileSync("wrangler.jsonc", "utf8");
writeFileSync("wrangler.jsonc", config.replace(placeholders[env], id));
console.log(`Using D1 database ${names[env]} (${id})`);
