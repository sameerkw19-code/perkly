import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is missing. Check d1_databases in wrangler.jsonc.");
  }
  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
