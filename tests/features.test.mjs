// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validMonthDay, parseBirthday, birthdayFromParts, formatBirthday, upcomingKeys } from "../lib/birthday.ts";
import { sanitizeDesign, defaultDesign, designChecks, FONTS, cardLang, textsFor, sanitizeLangs, walletStampPicture, assetIds, is3d, ICON_GROUPS, STAMP_ICONS, STAMP_3D } from "../lib/design.ts";
import { businessAccess, freeLimitReached, hasPaidDesign, TRIAL_DAYS, YEARLY_PRICE_ILS, MONTHLY_PRICE_ILS, planOf, monthlyValue } from "../lib/server/billing.ts";
import { existsSync, readFileSync } from "node:fs";
import { lookFields } from "../lib/wallet-look.ts";
import { usesPizza, slicePath, slicesPath, PIZZA_MAX } from "../lib/pizza.ts";

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
  assert.deepEqual(d.look, { bg2: "#00AA11", dir: "radial", overlay: 35, font: "rubik", text: "l", stamps: "s", stampStyle: "classic", progress: "stamps", logoSize: 100, logoFrame: "none", logoName: false });
  assert.ok(FONTS[d.look.font]);
});

test("design: stamp style is classic unless set to bright", () => {
  const bright = sanitizeDesign({ ...base, look: { ...base.look, stampStyle: "bright" } });
  assert.equal(bright.look.stampStyle, "bright");
  assert.equal(sanitizeDesign({ ...base, look: { ...base.look, stampStyle: "neon" } }).look.stampStyle, "classic");
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

test("design: logo size, frame and wallet banner are validated", () => {
  const base = defaultDesign({ name: "Cafe", reward: "Coffee", color: "#123456" });
  assert.equal(base.look.logoSize, 100);
  assert.equal(base.look.logoFrame, "none");
  assert.equal(base.walletHero, null);
  const d = sanitizeDesign({ ...base, walletHero: "../etc", look: { ...base.look, logoSize: 999, logoFrame: "star", logoName: "yes" } });
  assert.equal(d.look.logoSize, 200);
  assert.equal(d.look.logoFrame, "none");
  assert.equal(d.look.logoName, false);
  assert.equal(d.walletHero, null);
  const ok = sanitizeDesign({ ...base, look: { ...base.look, logoSize: 143, logoFrame: "circle", logoName: true } });
  assert.deepEqual([ok.look.logoSize, ok.look.logoFrame, ok.look.logoName], [140, "circle", true]);
});

// ---- Card languages: only the languages a business picks appear anywhere ----

const plainDesign = () => JSON.parse(JSON.stringify(defaultDesign({ name: "Cafe", reward: "Coffee", color: "#1E1B2E" })));

test("card languages: a new card is Hebrew only, and only Hebrew is checked", () => {
  const d = plainDesign();
  assert.deepEqual(d.langs, ["he"]);
  const checks = designChecks(d, []);
  assert.equal(checks.some((c) => c.key === "chkMissingText"), false);
});

test("card languages: a picked language without its own text blocks publishing", () => {
  const d = plainDesign();
  d.langs = ["he", "ru"];
  d.texts.ru.reward = "";
  const bad = designChecks(d, []).filter((c) => c.key === "chkMissingText");
  assert.deepEqual(bad.map((c) => c.vars.l), ["ru"]);
  // Arabic was not picked, so its empty text does not matter.
  assert.equal(bad.some((c) => c.vars.l === "ar"), false);
});

test("card languages: old cards (no list) show Hebrew and English only for now", () => {
  const d = plainDesign();
  delete d.langs;
  assert.deepEqual(sanitizeLangs(d.langs), ["he", "en"]);
  assert.deepEqual(sanitizeDesign(d).langs, ["he", "en"]);
});

test("card languages: languages not offered yet never reach a card, but their texts stay stored", () => {
  const d = plainDesign();
  d.langs = ["ar", "he", "ru"];
  d.texts.ar.reward = "مكافأة";
  const clean = sanitizeDesign(d);
  assert.deepEqual(clean.langs, ["he"]);
  assert.equal(clean.texts.ar.reward, "مكافأة");
});

test("card languages: sanitized in card order, unknown and repeated ones dropped, never empty", () => {
  const d = plainDesign();
  d.langs = ["en", "he", "xx", "he"];
  assert.deepEqual(sanitizeDesign(d).langs, ["he", "en"]);
  d.langs = [];
  assert.deepEqual(sanitizeDesign(d).langs, ["he"]);
});

test("card languages: a card shows a picked language, otherwise its first one", () => {
  const d = plainDesign();
  d.langs = ["he", "ru", "de"];
  assert.equal(cardLang(d, "ru"), "ru");
  assert.equal(cardLang(d, "ar"), "he");
  assert.equal(cardLang(d, undefined), "he");
  assert.equal(textsFor(d, "fr").title, "Cafe", "an unpicked language falls back to the first card language");
});

test("wallet pass: other picked languages get localized header and body", () => {
  const plain = lookFields({ title: "Cafe", reward: "Coffee", heroUrl: null, language: "he" });
  assert.equal(plain.textModulesData[0].localizedHeader, undefined);
  const multi = lookFields({
    title: "Cafe", reward: "Coffee", heroUrl: null, language: "he",
    translations: [{ language: "ru", title: "Кафе", reward: "Кофе" }],
  });
  assert.equal(multi.textModulesData[0].localizedHeader.translatedValues[0].language, "ru");
  assert.equal(multi.textModulesData[0].localizedBody.translatedValues[0].value, "Кофе");
});

// Optional customer message: a second text block on the pass, only when set.
test("pass: optional message adds a second text block only when set", () => {
  const base = { title: "Cafe", reward: "Free coffee", heroUrl: null };
  assert.equal(lookFields(base).textModulesData.length, 1);
  const withMsg = lookFields({ ...base, promo: "Double stamps on Friday" }).textModulesData;
  assert.equal(withMsg.length, 2);
  assert.equal(withMsg[1].body, "Double stamps on Friday");
});

// ---- Trial length: the checkout and every text say the same number of days ----

test("trial: 14 days at checkout and in all site texts", () => {
  assert.equal(TRIAL_DAYS, 14);
  const files = ["app/landing/content.ts", "app/start/start-flow.tsx", "app/contact/contact-form.tsx", "app/terms/page.tsx", "lib/i18n.ts", "app/billing/billing-view.tsx"];
  for (const f of files) {
    const text = readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.doesNotMatch(text, /\b3 ימי ניסיון|3-day|3 days free|3 أيام تجربة|אחרי 3 ימים|الأيام الثلاثة/, f);
  }
  const copy = readFileSync(new URL("../app/landing/content.ts", import.meta.url), "utf8");
  for (const phrase of ["14 ימי ניסיון", "14-day free trial", "14 يوماً"]) assert.match(copy, new RegExp(phrase));
});

// ---- Yearly plan: 999 ILS a year, counter kit included ----

test("yearly plan: only the configured yearly product counts as yearly", () => {
  const env = { POLAR_PRODUCT_ID_YEARLY: "prod_year" };
  assert.equal(planOf("prod_year", env), "yearly");
  assert.equal(planOf("prod_month", env), "monthly");
  assert.equal(planOf(null, env), "monthly");
  assert.equal(planOf("prod_year", {}), "monthly", "no yearly product set");
  assert.equal(planOf("", { POLAR_PRODUCT_ID_YEARLY: "" }), "monthly");
});

test("yearly plan: a twelfth of the price per month in the admin estimate", () => {
  assert.equal(YEARLY_PRICE_ILS, 999);
  assert.equal(monthlyValue("monthly"), MONTHLY_PRICE_ILS);
  assert.equal(monthlyValue("yearly"), 999 / 12);
});

test("yearly plan: the same price and the kit in every text that sells it", () => {
  const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  const copy = read("app/landing/content.ts");
  for (const phrase of ["999 ₪", "₪999", "מנוי שנתי", "اشتراك سنوي", "Yearly plan"]) assert.ok(copy.includes(phrase), phrase);
  assert.match(read("app/terms/page.tsx"), /מנוי שנתי: 999 ₪ לשנה.*ערכת קופה/);
  assert.match(read("app/start/start-flow.tsx"), /yearlyPrice: "999 ₪"/);
  assert.match(read("app/billing/billing-view.tsx"), /999 ₪ לשנה/);
  assert.ok(existsSync(new URL("../drizzle/0023_counter_kit.sql", import.meta.url)));
});

// ---- Wallet stamp banner: one picture per stamp count ----

const ids = (n) => Array.from({ length: n }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);

test("wallet banner: stamp pictures are kept only as a full valid set", () => {
  const d = sanitizeDesign({ ...base, walletBanner: "stamps", walletStamps: ids(11) });
  assert.equal(d.walletBanner, "stamps");
  assert.equal(d.walletStamps.length, 11);
  assert.deepEqual(sanitizeDesign({ ...base, walletStamps: [...ids(3), "bad"] }).walletStamps, []);
  assert.deepEqual(sanitizeDesign({ ...base, walletStamps: ids(32) }).walletStamps, []);
  assert.equal(sanitizeDesign({ ...base, walletBanner: "video" }).walletBanner, "image");
  assert.ok(assetIds(d).includes(ids(11)[10]));
});

test("wallet banner: the picture matches the stamp count, and only when the set fits the target", () => {
  const d = sanitizeDesign({ ...base, walletBanner: "stamps", walletStamps: ids(11) });
  assert.equal(walletStampPicture(d, 3, 10), ids(11)[3]);
  assert.equal(walletStampPicture(d, 14, 10), ids(11)[10]);
  assert.equal(walletStampPicture(d, 3, 12), null);
  assert.equal(walletStampPicture({ ...d, walletBanner: "image" }, 3, 10), null);
});

// ---- Pizza progress ----

test("pizza: only when chosen and the card has 2 to 12 stamps", () => {
  const d = sanitizeDesign({ ...base, look: { ...base.look, progress: "pizza" } });
  assert.equal(d.look.progress, "pizza");
  assert.equal(usesPizza(d, 8), true);
  assert.equal(usesPizza(d, PIZZA_MAX + 1), false);
  assert.equal(usesPizza(sanitizeDesign({ ...base, look: { ...base.look, progress: "cake" } }), 8), false);
});

test("pizza: slices are wedges from the center, one per stamp", () => {
  const first = slicePath(100, 100, 84, 0, 4);
  assert.match(first, /^M100,100 L100\.00,16\.00 A84,84 0 0 1 184\.00,100\.00 Z$/);
  assert.equal(slicesPath(100, 100, 84, 3, 8).split("Z").length - 1, 3);
  assert.equal(slicesPath(100, 100, 84, 12, 8).split("Z").length - 1, 8);
});

// ---- Icon table and 3D stamps ----

test("icons: 3D stamps are accepted only from the list", () => {
  assert.equal(sanitizeDesign({ ...base, stamp: { icon: "3d-coffee", image: null } }).stamp.icon, "3d-coffee");
  assert.equal(sanitizeDesign({ ...base, stamp: { icon: "3d-rocket", image: null } }), null);
  assert.equal(is3d("3d-pizza"), true);
  assert.equal(is3d("pizza"), false);
});

test("icons: every regular and 3D icon is in exactly one category", () => {
  const flat = ICON_GROUPS.flatMap((g) => g.flat);
  const d3 = ICON_GROUPS.flatMap((g) => g.d3);
  assert.deepEqual([...flat].sort(), [...STAMP_ICONS].sort());
  assert.deepEqual([...d3].sort(), STAMP_3D.map((k) => "3d-" + k).sort());
});

test("icons: every 3D icon has its picture and a faded one", () => {
  for (const k of STAMP_3D) {
    for (const f of [`${k}.png`, `${k}-empty.png`]) assert.ok(existsSync(new URL(`../public/stamps3d/${f}`, import.meta.url)), f);
  }
});

test("texts: an empty subtitle stays empty and does not repeat the title", () => {
  const d = sanitizeDesign({ ...base, texts: { ...base.texts, he: { ...base.texts.he, subtitle: "" } } });
  assert.equal(textsFor(d, "he").subtitle, "");
  assert.equal(textsFor(d, "he").title, d.texts.he.title);
});


// ---- Last visit ----

import { daysSince, isAway } from "../lib/visits.ts";

test("last visit: counts calendar days, never negative", () => {
  const now = new Date(2026, 9, 29, 21, 0);
  assert.equal(daysSince(new Date(2026, 9, 29, 8, 0).toISOString(), now), 0);
  assert.equal(daysSince(new Date(2026, 9, 28, 23, 30).toISOString(), now), 1);
  assert.equal(daysSince(new Date(2026, 8, 29, 12, 0).toISOString(), now), 30);
  assert.equal(daysSince(new Date(2026, 9, 30, 9, 0).toISOString(), now), 0);
});

test("away: over 30 days since the last visit, or since joining with no visits", () => {
  const now = new Date(2026, 9, 29, 12, 0);
  const ago = (d) => new Date(now.getTime() - d * 86_400_000).toISOString();
  assert.equal(isAway(ago(31), ago(200), now), true);
  assert.equal(isAway(ago(10), ago(200), now), false);
  assert.equal(isAway(null, ago(45), now), true);
  assert.equal(isAway(null, ago(5), now), false);
});

// ---- Summary (day / week / month) ----

import { weekChange } from "../lib/weekly.ts";

test("summary: change against the period before", () => {
  assert.deepEqual(weekChange(12, 10), { diff: 2, pct: 20, dir: "up" });
  assert.deepEqual(weekChange(5, 10), { diff: -5, pct: -50, dir: "down" });
  assert.deepEqual(weekChange(3, 0), { diff: 3, pct: null, dir: "up" });
  assert.deepEqual(weekChange(0, 0), { diff: 0, pct: null, dir: "same" });
});

test("wallet notification: default and own wording, with the business and customer name", async () => {
  const { noticeText, defaultDesign, sanitizeDesign } = await import("../lib/design.ts");
  const d = defaultDesign({ name: "קפה רוני", reward: "קפה חינם", color: "#000000" });
  assert.equal(d.walletNotify, false, "off unless the business turns it on");
  const he = d.texts.he;
  assert.equal(noticeText(he, "he", { kind: "stamp", added: 1, left: 8, name: "דנה כהן" }), "תודה שקנית בקפה רוני! נוספה לך חותמת, נשארו עוד 8 עד: קפה חינם");
  assert.match(noticeText(he, "he", { kind: "stamp", added: 3, left: 6, name: "" }), /נוספו לך 3 חותמות/);
  assert.match(noticeText(he, "he", { kind: "reward", name: "" }), /הגעת להטבה בקפה רוני: קפה חינם/);
  const own = { ...he, notify: "{name}, תודה! עוד {left} ל{reward} ☕", notifyReward: "" };
  assert.equal(noticeText(own, "he", { kind: "stamp", added: 1, left: 2, name: "דנה כהן" }), "דנה, תודה! עוד 2 לקפה חינם ☕");
  const saved = sanitizeDesign({ ...d, walletNotify: true, texts: { ...d.texts, he: { ...he, notify: "x".repeat(500) } } });
  assert.equal(saved.walletNotify, true);
  assert.equal(saved.texts.he.notify.length, 120);
  assert.equal(sanitizeDesign({ ...d, walletNotify: "yes" }).walletNotify, false);
});

test("welcome, birthday and special-day wording", async () => {
  const { noticeText, defaultDesign, noticeOn } = await import("../lib/design.ts");
  const d = defaultDesign({ name: "קפה רוני", reward: "קפה חינם", color: "#000000" });
  const he = d.texts.he;
  assert.equal(noticeText(he, "he", { kind: "welcome", name: "דנה כהן" }), "ברוכים הבאים לקפה רוני, דנה! כל קנייה מקרבת אותך ל: קפה חינם");
  assert.equal(noticeText(he, "he", { kind: "welcome", name: "" }), "ברוכים הבאים לקפה רוני! כל קנייה מקרבת אותך ל: קפה חינם", "no dangling comma without a name");
  assert.match(noticeText(he, "he", { kind: "birthday", name: "דנה", gift: false }), /^מזל טוב דנה! 🎂 כל הצוות של קפה רוני/);
  assert.match(noticeText(he, "he", { kind: "birthday", name: "דנה", gift: true }), /מחכה לך מתנה בקפה רוני: קפה חינם/);
  assert.equal(noticeText({ ...he, birthday: "{name} יום הולדת שמח מ{business}" }, "he", { kind: "birthday", name: "דנה", gift: true }), "דנה יום הולדת שמח מקפה רוני");
  assert.equal(noticeText(he, "he", { kind: "special", name: "דנה", text: "חג שמח {name}! היום חותמת כפולה ב{business}" }), "חג שמח דנה! היום חותמת כפולה בקפה רוני");
  assert.equal(noticeOn(d, "welcome"), false);
  assert.equal(noticeOn({ ...d, walletBirthday: true }, "birthday"), true);
  assert.equal(noticeOn(d, "special"), true, "scheduled by the business");
});

test("birthday dates in Israel time, Feb 29 in other years", async () => {
  const { israelNow, birthdayKeys } = await import("../lib/birthday.ts");
  // 22:30 UTC on Mar 14 is already Mar 15 in Israel (UTC+2).
  const n = israelNow(new Date("2026-03-14T22:30:00Z"));
  assert.equal(n.md, "03-15");
  assert.equal(n.date, "2026-03-15");
  assert.equal(n.hour, 0);
  assert.deepEqual(birthdayKeys("02-28", 2026), ["02-28", "02-29"]);
  assert.deepEqual(birthdayKeys("02-28", 2028), ["02-28"]);
  assert.deepEqual(birthdayKeys("07-01", 2026), ["07-01"]);
});
