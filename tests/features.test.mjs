// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validMonthDay, parseBirthday, birthdayFromParts, formatBirthday, upcomingKeys } from "../lib/birthday.ts";
import { sanitizeDesign, defaultDesign, designChecks, FONTS } from "../lib/design.ts";
import { businessAccess, freeLimitReached, hasPaidDesign } from "../lib/server/billing.ts";
import { lookFields } from "../lib/wallet-look.ts";

// ---- Birthdays ----

test("birthday: only real day and month, no year", () => {
  for (const ok of ["01-01", "02-29", "04-30", "12-31"]) assert.ok(validMonthDay(ok), ok);
  for (const bad of ["02-30", "04-31", "13-01", "00-10", "1-1", "2024-01-01", "ab-cd", ""]) assert.ok(!validMonthDay(bad), bad);
});

test("birthday: optional in requests, invalid is reported", () => {
  assert.equal(parseBirthday(undefined), null);
  assert.equal(parseBirthday(""), null);
  assert.equal(parseBirthday("03-15"), "03-15");
  assert.equal(parseBirthday("03-32"), "invalid");
  assert.equal(parseBirthday({}), "invalid");
});

test("birthday: form parts and display", () => {
  assert.equal(birthdayFromParts("5", "3"), "03-05");
  assert.equal(birthdayFromParts("", "3"), "");
  assert.equal(birthdayFromParts(null, "3"), "");
  assert.equal(formatBirthday("03-05"), "05/03");
  assert.equal(formatBirthday(null), "");
});

test("birthday: next 7 days use Israel time and cross the year", () => {
  // 23:30 UTC on Dec 30 is already Dec 31 in Israel.
  const keys = upcomingKeys(new Date("2026-12-30T23:30:00Z"));
  assert.equal(keys.get("12-31"), 0);
  assert.equal(keys.get("01-01"), 1);
  assert.equal(keys.size, 7);
  assert.equal(keys.has("12-30"), false);
});

test("birthday: Feb 29 is celebrated on Feb 28 in a non-leap year", () => {
  const keys = upcomingKeys(new Date("2027-02-27T10:00:00Z"));
  assert.equal(keys.get("02-28"), 1);
  assert.equal(keys.get("02-29"), 1);
  const leap = upcomingKeys(new Date("2028-02-27T10:00:00Z"));
  assert.equal(leap.get("02-29"), 2);
});

// ---- Card look ----

const base = defaultDesign({ name: "Cafe", reward: "Free coffee", color: "#1E1B2E" });

test("design: older saved designs get default look settings", () => {
  const { look, ...old } = base;
  const d = sanitizeDesign(old);
  assert.ok(d);
  assert.equal(d.look.font, "system");
  assert.equal(d.look.dir, "diag");
  assert.equal(d.look.text, "m");
  assert.match(d.look.bg2, /^#[0-9A-F]{6}$/);
});

test("design: unknown or unsafe look values fall back, never pass through", () => {
  const d = sanitizeDesign({
    ...base,
    look: { bg2: "red;background:url(x)", dir: "sideways", overlay: 500, font: "constructor", text: "xl", stamps: "<b>" },
  });
  assert.ok(d);
  assert.match(d.look.bg2, /^#[0-9A-F]{6}$/);
  assert.equal(d.look.dir, "diag");
  assert.equal(d.look.overlay, 90);
  assert.equal(d.look.font, "system");
  assert.equal(d.look.text, "m");
  assert.equal(d.look.stamps, "m");
});

test("design: valid look values are kept", () => {
  const d = sanitizeDesign({ ...base, look: { bg2: "#00aa11", dir: "radial", overlay: 33, font: "rubik", text: "l", stamps: "s" } });
  assert.deepEqual(d.look, { bg2: "#00AA11", dir: "radial", overlay: 35, font: "rubik", text: "l", stamps: "s" });
  assert.ok(FONTS[d.look.font]);
});

test("design: gradient readability checks the weaker of the two colors", () => {
  // White text on dark-to-white gradient: fine on the first color, unreadable on the second.
  const d = { ...base, layout: "gradient", colors: { bg: "#111111", fg: "#FFFFFF", stamp: "#D9F493" }, look: { ...base.look, bg2: "#FFFFFF" } };
  const text = designChecks(d, []).find((c) => c.key.startsWith("chkText"));
  assert.equal(text.level, "bad");
  const solid = designChecks({ ...d, layout: "solid" }, []).find((c) => c.key.startsWith("chkText"));
  assert.equal(solid.level, "ok");
});

// ---- Access (subscription, suspension, free access) ----

function fakeDb(row, customers = 0) {
  return { prepare: (sql) => ({ bind: () => ({ first: async () => (sql.includes("COUNT(*)") ? { n: customers } : row) }) }) };
}
const NOW = "2026-10-24T12:00:00.000Z";

test("access: suspension blocks even with an active subscription or free access", async () => {
  const r = await businessAccess(fakeDb({ suspended: NOW, comp_until: "2027-01-01T00:00:00.000Z", status: "active" }), "b", NOW);
  assert.deepEqual(r, { ok: false, code: "business_suspended" });
});

test("access: free access allows without a subscription, until it ends", async () => {
  assert.deepEqual(await businessAccess(fakeDb({ suspended: null, comp_until: "2026-11-01T00:00:00.000Z", status: "canceled" }), "b", NOW), { ok: true });
  assert.deepEqual(
    await businessAccess(fakeDb({ suspended: null, comp_until: "2026-10-01T00:00:00.000Z", status: "canceled" }, 25), "b", NOW),
    { ok: false, code: "subscription_required" },
  );
});

test("access: subscription status, and pilot businesses without one", async () => {
  assert.deepEqual(await businessAccess(fakeDb({ suspended: null, comp_until: null, status: "active" }), "b", NOW), { ok: true });
  assert.deepEqual(await businessAccess(fakeDb({ suspended: null, comp_until: null, status: "trialing" }), "b", NOW), { ok: true });
  assert.deepEqual(await businessAccess(fakeDb({ suspended: null, comp_until: null, status: "past_due" }, 11), "b", NOW), { ok: false, code: "subscription_required" });
  assert.deepEqual(await businessAccess(fakeDb({ suspended: null, comp_until: null, status: null }), "b", NOW), { ok: true });
  assert.deepEqual(await businessAccess(fakeDb(null), "missing", NOW), { ok: false, code: "subscription_required" });
});

// ---- Platform settings ----
import { cleanSetting, saveSettings, DEFAULT_SETTINGS } from "../lib/server/settings.ts";

test("settings: values are validated by type", () => {
  assert.equal(cleanSetting("trialDays", 14), 14);
  for (const bad of [null, "", false, true, "14", -1, 366, 1.5]) assert.equal(cleanSetting("trialDays", bad), undefined, String(bad));
  assert.equal(cleanSetting("signupsOpen", false), false);
  assert.equal(cleanSetting("signupsOpen", "false"), undefined);
  assert.equal(cleanSetting("announcement", "  hi\u0007there  "), "hi there");
  assert.equal(cleanSetting("announcement", "x".repeat(500)).length, 300);
  assert.equal(DEFAULT_SETTINGS.signupsOpen, true);
});

test("settings: saving is all or nothing", async () => {
  const writes = [];
  const db = { prepare: () => ({ bind: (...a) => ({ a }) }), batch: async (s) => writes.push(...s) };
  assert.deepEqual(await saveSettings(db, { announcement: "ok", trialDays: null }, "a@b.c"), ["trialDays"]);
  assert.equal(writes.length, 0);
  assert.deepEqual(await saveSettings(db, { announcement: "ok", trialDays: 7 }, "a@b.c"), []);
  assert.equal(writes.length, 4); // two settings, each with a log entry
});

test("access: without a subscription, free up to 10 customers", async () => {
  const none = { suspended: null, comp_until: null, status: "none" };
  assert.deepEqual(await businessAccess(fakeDb(none, 0), "b", NOW), { ok: true, free: { limit: 10, used: 0 } });
  const at10 = await businessAccess(fakeDb(none, 10), "b", NOW);
  assert.deepEqual(at10, { ok: true, free: { limit: 10, used: 10 } });
  assert.equal(freeLimitReached(at10), true);
  assert.equal(freeLimitReached(await businessAccess(fakeDb(none, 9), "b", NOW)), false);
  assert.deepEqual(await businessAccess(fakeDb(none, 11), "b", NOW), { ok: false, code: "subscription_required" });
  // Paying, trialing and pre-billing businesses have no limit.
  for (const status of ["active", "trialing", null]) {
    assert.deepEqual(await businessAccess(fakeDb({ ...none, status }, 500), "b", NOW), { ok: true });
  }
});

test("design extras: logo and images only with a subscription, trial or free access", async () => {
  const none = { suspended: null, comp_until: null, status: "none" };
  assert.equal(hasPaidDesign(await businessAccess(fakeDb(none, 3), "b", NOW)), false);
  assert.equal(hasPaidDesign(await businessAccess(fakeDb(none, 11), "b", NOW)), false);
  for (const status of ["active", "trialing", null]) {
    assert.equal(hasPaidDesign(await businessAccess(fakeDb({ ...none, status }), "b", NOW)), true, String(status));
  }
  assert.equal(hasPaidDesign(await businessAccess(fakeDb({ ...none, comp_until: "2027-01-01T00:00:00.000Z" }), "b", NOW)), true);
  assert.equal(hasPaidDesign(await businessAccess(fakeDb({ ...none, status: "active", suspended: NOW }), "b", NOW)), false);
});

test("google wallet: each pass carries the business name, banner and Powered by Perkly", () => {
  const look = { title: "קפה רון", reward: "קפה חינם", heroUrl: "https://perkly.shop/api/asset/x" };
  const o = lookFields(look);
  assert.equal(o.heroImage.sourceUri.uri, look.heroUrl);
  assert.deepEqual(o.textModulesData, [{ id: "business", header: "קפה רון", body: "קפה חינם" }]);
  assert.equal(o.linksModuleData.uris[0].description, "Powered by Perkly");
  assert.equal(lookFields({ ...look, heroUrl: null }).heroImage, undefined);
});
