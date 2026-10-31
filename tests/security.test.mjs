// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ipv6Prefix } from "../lib/server/http.ts";
import { sameText } from "../lib/server/crypto.ts";
import { verifyWebhook, subscriptionRow } from "../lib/server/polar.ts";

test("IPv6 addresses are grouped by their /64", () => {
  assert.equal(ipv6Prefix("2001:db8:1:2::5"), "2001:db8:1:2::/64");
  assert.equal(ipv6Prefix("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(ipv6Prefix("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(ipv6Prefix("2001:DB8:1:2:3:4:5:6"), ipv6Prefix("2001:db8:1:2:ffff::1"));
});

test("secret comparison", async () => {
  assert.equal(await sameText("abc", "abc"), true);
  assert.equal(await sameText("abc", "abd"), false);
  assert.equal(await sameText("", "abc"), false);
});

const sign = (key, id, ts, body) => createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");

test("Polar webhooks: signed with the secret's own bytes", async () => {
  const secret = "polar_whs_example_secret_value";
  const now = 1_800_000_000;
  const body = '{"type":"subscription.active"}';
  const sig = sign(Buffer.from(secret, "utf8"), "msg_1", now, body);
  const headers = { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` };
  assert.equal(await verifyWebhook(secret, headers, body, now), true);
  assert.equal(await verifyWebhook(secret, headers, body + " ", now), false, "body changed");
  assert.equal(await verifyWebhook(secret, headers, body, now + 1000), false, "too old");
  assert.equal(await verifyWebhook("other", headers, body, now), false, "wrong secret");
});

test("Standard Webhooks whsec_ secrets still work", async () => {
  const raw = Buffer.from("0123456789abcdef0123456789abcdef");
  const secret = `whsec_${raw.toString("base64")}`;
  const now = 1_800_000_000;
  const sig = sign(raw, "msg_2", now, "{}");
  assert.equal(await verifyWebhook(secret, { id: "msg_2", timestamp: String(now), signature: `v1,bad v1,${sig}` }, "{}", now), true);
  // A whsec_ value that is not base64 does not crash.
  assert.equal(await verifyWebhook("whsec_not*base64", { id: "m", timestamp: String(now), signature: "v1,x" }, "{}", now), false);
});

test("subscription events carry when they changed", () => {
  const row = subscriptionRow({ type: "subscription.updated", data: { id: "sub_1", status: "active", metadata: { business: "b1" }, modified_at: "2026-10-01T10:00:00Z" } });
  assert.equal(row.changedAt, "2026-10-01T10:00:00Z");
});
