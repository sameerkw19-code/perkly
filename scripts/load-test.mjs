// Load test against a LOCAL server filled by scripts/load-seed.py (never production).
//   node scripts/load-test.mjs http://localhost:8787 [seconds]
// Simulates at the same time: staff stamping in every business, customers opening their cards,
// and owners opening the dashboard (the big business included). Prints latency per request type.
import { readFileSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:8787";
const SECONDS = Number(process.argv[3] ?? 60);
const T = JSON.parse(readFileSync("scripts/load-tokens.json", "utf8"));
const stats = {};
const codes = {};
const record = (name, ms, ok) => { const s = (stats[name] ??= { ms: [], errors: 0 }); s.ms.push(ms); if (!ok) s.errors++; };
async function timed(name, fn) {
  const t0 = performance.now();
  let ok = false;
  try {
    const r = await fn();
    ok = r.ok;
    const body = await r.text();
    if (!ok) { const code = `${name}: ${r.status} ${(body.match(/"code":"([a-z_]+)"/) ?? [])[1] ?? ""}`; codes[code] = (codes[code] ?? 0) + 1; }
  } catch (e) { codes[`${name}: network`] = (codes[`${name}: network`] ?? 0) + 1; }
  record(name, performance.now() - t0, ok);
}
const cookie = (tok) => ({ cookie: `perkly_session=${tok}`, origin: BASE, "content-type": "application/json" });
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const end = Date.now() + SECONDS * 1000;

async function staffLoop(b) {
  while (Date.now() < end) {
    await timed("stamp", () => fetch(`${BASE}/api/loyalty`, { method: "POST", headers: cookie(b.staff),
      body: JSON.stringify({ action: "stamp", business: b.business, customer: pick(b.customers), requestId: crypto.randomUUID() }) }));
    await sleep(1500 + Math.random() * 1500); // a stamp every 1.5–3 s per business
  }
}
async function cardLoop(b) {
  while (Date.now() < end) {
    await timed("card page", () => fetch(`${BASE}/c/${pick(b.cards)}`));
    await sleep(500 + Math.random() * 1000);
  }
}
async function ownerLoop(b, name) {
  while (Date.now() < end) {
    await timed(name, () => fetch(`${BASE}/api/loyalty?business=${b.business}`, { headers: cookie(b.owner) }));
    await sleep(3000);
  }
}
const all = [T.big, ...T.small];
await Promise.all([
  ...all.map(staffLoop),
  ...all.slice(0, 20).map(cardLoop),
  ownerLoop(T.big, "dashboard (big: 5,000 customers)"),
  ...T.small.slice(0, 10).map((b) => ownerLoop(b, "dashboard (small)")),
]);
const pct = (a, p) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
console.log(`\n${SECONDS}s, ${all.length} businesses at once\n`);
console.log("request".padEnd(36), "count", "  p50", "  p95", "  p99", " errors");
for (const [k, s] of Object.entries(stats)) {
  console.log(k.padEnd(36), String(s.ms.length).padStart(5), ...[50, 95, 99].map((p) => String(Math.round(pct(s.ms, p))).padStart(5)), String(s.errors).padStart(7));
}
if (Object.keys(codes).length) console.log("\nerrors:", codes);
