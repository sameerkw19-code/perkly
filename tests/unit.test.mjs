// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, formatPhone, maskPhone } from "../lib/phone.ts";

test("Israeli numbers in every common form become the same value", () => {
  const forms = ["050-123 4567", "0501234567", "+972 50 123 4567", "972501234567", "+972-050-1234567", "00972501234567", "(050) 123-4567"];
  for (const f of forms) assert.equal(normalizePhone(f), "+972501234567", f);
});

test("landlines and foreign numbers", () => {
  assert.equal(normalizePhone("03-123-4567"), "+97231234567");
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
});

test("invalid input is rejected", () => {
  for (const bad of ["", "12345", "abc", "05012", "+972123", "1234567890123456789", null, undefined]) {
    assert.equal(normalizePhone(bad), null, String(bad));
  }
});

test("display helpers", () => {
  assert.equal(formatPhone("+972501234567"), "050-123-4567");
  assert.equal(maskPhone("+972501234567"), "•••-4567");
});

import { normalizeSocial, parseSocial, socialUrl } from "../lib/social.ts";

test("social links: usernames and profile URLs become the same value", () => {
  for (const f of ["@cafe.yafo", "cafe.yafo", "https://www.instagram.com/cafe.yafo/?hl=he", "instagram.com/cafe.yafo"]) {
    const r = normalizeSocial({ instagram: f });
    assert.equal(r.ok && r.value.instagram, "cafe.yafo", f);
  }
  const tt = normalizeSocial({ tiktok: "https://www.tiktok.com/@cafe_yafo?lang=he" });
  assert.equal(tt.ok && tt.value.tiktok, "cafe_yafo");
  const fb = normalizeSocial({ facebook: "https://m.facebook.com/profile.php?id=100012345678" });
  assert.equal(fb.ok && fb.value.facebook, "profile.php?id=100012345678");
  // A saved numeric page survives being read back (customer cards read the stored value).
  assert.deepEqual(parseSocial(JSON.stringify({ facebook: "profile.php?id=100012345678" })), { facebook: "profile.php?id=100012345678" });
  assert.equal(normalizeSocial({ facebook: "profile.php?id=12ab" }).ok, false);
  const wa = normalizeSocial({ whatsapp: "050-123 4567", website: "cafe.co.il", waze: "https://waze.com/ul/hsv8wrvkg9" });
  assert.deepEqual(wa.ok && wa.value, { whatsapp: "+972501234567", website: "https://cafe.co.il/", waze: "https://waze.com/ul/hsv8wrvkg9" });
  assert.equal(socialUrl("whatsapp", "+972501234567"), "https://wa.me/972501234567");
  assert.equal(socialUrl("tiktok", "cafe_yafo"), "https://www.tiktok.com/@cafe_yafo");
});

test("social links: empty fields are dropped, bad ones name the field", () => {
  const empty = normalizeSocial({ instagram: "  ", tiktok: "" });
  assert.deepEqual(empty.ok && empty.value, {});
  for (const [field, bad] of [
    ["instagram", "https://evil.example/cafe"], ["instagram", "has space"], ["tiktok", "a"], ["facebook", "https://facebook.evil.com/x"],
    ["whatsapp", "12345"], ["website", "javascript:alert(1)"], ["website", "https://user:pw@cafe.co.il"], ["waze", "https://maps.google.com/x"],
  ]) {
    const r = normalizeSocial({ [field]: bad });
    assert.equal(r.ok, false, `${field}: ${bad}`);
    assert.equal(!r.ok && r.field, field);
  }
  assert.deepEqual(parseSocial('{"instagram":"ok.name","website":"javascript:x"}'), { instagram: "ok.name" });
  assert.deepEqual(parseSocial("not json"), {});
});

test("average card wallet strip: a 1125×432 PNG whose bar fills from the right on Hebrew cards", async () => {
  const { progressStrip } = await import("../lib/server/progress-strip.ts");
  const { inflateSync } = await import("node:zlib");
  const png = await progressStrip({ bg: "#1F8A4C", bg2: "#156B3A", fg: "#FFFFFF", fill: "#D9F493", done: 23, target: 40, rtl: true });
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset);
  assert.equal(view.getUint32(16), 1125);
  assert.equal(view.getUint32(20), 432);
  const idatLen = view.getUint32(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  const pixel = (x, y) => [...raw.subarray(y * (1 + 1125 * 3) + 1 + x * 3, y * (1 + 1125 * 3) + 4 + x * 3)];
  const barY = 432 - 66 - 15;
  assert.deepEqual(pixel(1000, barY), [0xd9, 0xf4, 0x93], "filled on the right");
  assert.notDeepEqual(pixel(120, barY), [0xd9, 0xf4, 0x93], "empty on the left");
  const { passAverage } = await import("../lib/server/balance-pass.ts");
  assert.equal(passAverage({ program: "stamps" }, { stamps: 3 }, null), undefined);
  assert.deepEqual(passAverage({ program: "average", currency: "ILS", avg_cap: 0 }, { stamps: 0 }, null), { ready: false });
  assert.equal(passAverage({ program: "average", currency: "ILS", avg_cap: 25000 }, { stamps: 2, round_total: 60000 }, null).worth.replace(/\s/g, " "), "250 ₪");
  assert.equal(passAverage({ program: "average", currency: "ILS" }, { stamps: 0 }, 30300).ready, true);
});

test("real Polar payments only on the live site; any site with the sandbox", async () => {
  const { liveCheckoutAllowed } = await import("../lib/server/polar.ts");
  assert.equal(liveCheckoutAllowed({}, "perkly.shop"), true);
  assert.equal(liveCheckoutAllowed({}, "www.perkly.shop"), true);
  assert.equal(liveCheckoutAllowed({}, "perkly-staging.perklysameer.workers.dev"), false);
  assert.equal(liveCheckoutAllowed({ POLAR_SANDBOX: "1" }, "perkly-staging.perklysameer.workers.dev"), true);
  assert.equal(liveCheckoutAllowed({}, "localhost:8787"), true);
});

// Apple Wallet health check: a key that does not belong to the certificate is caught.
import { appleHealth } from "../lib/server/apple-check.ts";
test("apple health: no key, wrong key", async () => {
  assert.deepEqual(await appleHealth({}), { configured: false });
  const { privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");
  const h = await appleHealth({ APPLE_PASS_KEY: `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----` });
  assert.equal(h.configured, true);
  assert.equal(h.keyMatches, false);
  assert.equal(h.certExpires, "2027-12-05T16:16:13Z");
});

// A branch's place on the map, from a pasted Google Maps link or coordinates.
import { parsePlace, isShortMapsLink } from "../lib/geo.ts";
import { lookFields } from "../lib/wallet-look.ts";
test("branch place: links, coordinates, and the Google nearby field", () => {
  assert.deepEqual(parsePlace("32.0853, 34.7818"), { lat: 32.0853, lng: 34.7818 });
  assert.deepEqual(parsePlace("https://www.google.com/maps/place/X/@32.07,34.77,17z/data=!3m1!4m6!3m5!8m2!3d32.0779!4d34.7745"), { lat: 32.0779, lng: 34.7745 });
  assert.deepEqual(parsePlace("https://maps.google.com/?q=31.7683,35.2137"), { lat: 31.7683, lng: 35.2137 });
  assert.equal(parsePlace("Herzl 10, Tel Aviv"), null);
  assert.equal(parsePlace("0, 0"), null);
  assert.equal(parsePlace("95, 34"), null);
  assert.equal(isShortMapsLink("https://maps.app.goo.gl/AbC123"), true);
  assert.equal(isShortMapsLink("https://evil.example/maps"), false);
  const base = { title: "T", reward: "R", heroUrl: null };
  assert.deepEqual(lookFields({ ...base, places: [{ lat: 32, lng: 34.5 }] }).merchantLocations, [{ latitude: 32, longitude: 34.5 }]);
  assert.deepEqual(lookFields({ ...base, places: [] }).merchantLocations, []);
  assert.equal(lookFields(base).merchantLocations, undefined);
});

// A business's Google Wallet class names the business as the issuer (the sender of its notifications).
import { classBody } from "../lib/wallet-look.ts";
test("google class: the issuer is the business, not Perkly", () => {
  const body = classBody("1.biz_x", { name: "תפוח", color: "#6a4de3", logoUrl: "https://perkly.shop/x.png" });
  assert.equal(body.issuerName, "תפוח");
  assert.equal(body.programName, "תפוח");
});

// The business's own lock-screen line, with the customer's numbers filled in.
import { fillNearText } from "../lib/near-text.ts";
test("near text: tags are filled, unknown ones left, length capped", () => {
  assert.equal(fillNearText("עובר ליד? עוד {missing} ל{reward} ב{business}", { missing: 3, reward: "קפה", business: "תפוח" }), "עובר ליד? עוד 3 לקפה בתפוח");
  assert.equal(fillNearText("עוד {חסר} ל{הטבה} ב{עסק}", { missing: 2, reward: "קפה", business: "תפוח" }), "עוד 2 לקפה בתפוח");
  assert.equal(fillNearText("باقي {باقي}", { missing: 4, reward: "x", business: "y" }), "باقي 4");
  assert.equal(fillNearText("Balance {balance}", { reward: "x", business: "y", balance: "₪20" }), "Balance ₪20");
  assert.equal(fillNearText("{missing} left", { missing: null, reward: "x", business: "y" }), "left");
  assert.equal(fillNearText("a".repeat(200), { reward: "x", business: "y" }).length, 120);
});

import { stampEmoji } from "../lib/near-text.ts";
test("near text: the stamp's emoji for the automatic line; emojis are never split", () => {
  assert.equal(stampEmoji("coffee"), "☕");
  assert.equal(stampEmoji("3d-pizza"), "🍕");
  assert.equal(stampEmoji("logo"), "⭐");
  const long = "א".repeat(119) + "☕☕";
  assert.equal(fillNearText(long, { reward: "x", business: "y" }), "א".repeat(119) + "☕");
});
