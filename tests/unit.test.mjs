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

import { sanitizeDesign, assetIds, defaultDesign } from "../lib/design.ts";
test("notification icon: kept by the design and counted as one of its pictures", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const base = defaultDesign({ name: "X", reward: "R", color: "#123456", target: 8 });
  const d = sanitizeDesign({ ...base, notifyIcon: id });
  assert.equal(d.notifyIcon, id);
  assert.ok(assetIds(d).includes(id));
  assert.equal(sanitizeDesign({ ...base, notifyIcon: "nope" }).notifyIcon, null);
});

import { trialDaysFor } from "../lib/server/polar.ts";
test("trial: the standard trial for a first subscription, and never a charge while free access lasts", () => {
  const now = Date.parse("2026-11-20T00:00:00Z");
  assert.equal(trialDaysFor(true, null, 14, now), 14);
  assert.equal(trialDaysFor(false, null, 14, now), 0);
  assert.equal(trialDaysFor(true, "2026-12-18T19:47:12Z", 14, now), 29);
  assert.equal(trialDaysFor(false, "2026-12-18T19:47:12Z", 14, now), 29);
  assert.equal(trialDaysFor(true, "2026-11-25T00:00:00Z", 14, now), 14);
  assert.equal(trialDaysFor(true, "2027-12-01T00:00:00Z", 14, now), 90);
  assert.equal(trialDaysFor(true, "9999-12-31T00:00:00Z", 14, now), 14);
  assert.equal(trialDaysFor(true, "2026-11-01T00:00:00Z", 14, now), 14);
});

import { noticeText, noticeOn } from "../lib/design.ts";
test("we miss you: off by default, its own wording or the default with the name", () => {
  const base = defaultDesign({ name: "תפוח", reward: "קפה חינם", color: "#123456" });
  assert.equal(base.walletMissYou, false);
  assert.equal(noticeOn(base, "missyou"), false);
  const on = sanitizeDesign({ ...base, walletMissYou: true });
  assert.equal(noticeOn(on, "missyou"), true);
  const texts = { ...on.texts.he, title: "תפוח", reward: "קפה חינם" };
  assert.match(noticeText(texts, "he", { kind: "missyou", name: "דנה כהן" }), /^התגעגענו אליך דנה! 💜 מחכים לך בתפוח/);
  assert.equal(noticeText({ ...texts, missYou: "חוזרים ל{business}, {name}?" }, "he", { kind: "missyou", name: "דנה" }), "חוזרים לתפוח, דנה?");
});

import { nearPhase, nearTemplate } from "../lib/near-text.ts";
test("near text by time: morning line from the morning hour, evening line from the evening hour until the next morning", () => {
  assert.equal(nearPhase(6, 6, 16), "morning");
  assert.equal(nearPhase(15, 6, 16), "morning");
  assert.equal(nearPhase(16, 6, 16), "evening");
  assert.equal(nearPhase(23, 6, 16), "evening");
  assert.equal(nearPhase(2, 6, 16), "evening");
  const b = { near_text: "בוקר טוב ☕", near_text_evening: "ערב טוב 🍰", near_morning_from: 7, near_evening_from: 18 };
  assert.equal(nearTemplate(b, 9), "בוקר טוב ☕");
  assert.equal(nearTemplate(b, 18), "ערב טוב 🍰");
  assert.equal(nearTemplate(b, 3), "ערב טוב 🍰");
  // No evening line: the one line all day; no lines: automatic (empty).
  assert.equal(nearTemplate({ near_text: "שלום" }, 20), "שלום");
  assert.equal(nearTemplate({ near_text: null, near_text_evening: "ערב" }, 9), "");
  assert.equal(nearTemplate({}, 20), "");
});

import { monthStart, prevMonth, nextMonth, lastMonth, validMonth, change, monthName } from "../lib/report-month.ts";
test("monthly report: months start at midnight in Israel; neighbours, last month, change", () => {
  assert.equal(monthStart("2026-11"), "2026-10-31T22:00:00.000Z"); // winter, UTC+2
  assert.equal(monthStart("2026-07"), "2026-06-30T21:00:00.000Z"); // summer, UTC+3
  assert.equal(prevMonth("2026-01"), "2025-12");
  assert.equal(nextMonth("2026-12"), "2027-01");
  assert.equal(lastMonth(new Date("2026-11-20T10:00:00Z")), "2026-10");
  // 23:30 UTC on Oct 31 is already Nov 1 in Israel.
  assert.equal(lastMonth(new Date("2026-10-31T23:30:00Z")), "2026-10");
  assert.ok(validMonth("2026-10"));
  assert.ok(!validMonth("2026-13") && !validMonth("26-10") && !validMonth(null));
  assert.equal(change(12, 10), "+20%");
  assert.equal(change(5, 10), "−50%");
  assert.equal(change(10, 10), "=");
  assert.equal(change(3, 0), "");
  assert.equal(monthName("2026-10", "he"), "אוקטובר 2026");
});

import { decodeGeohash } from "../lib/geo.ts";
test("place from Waze links: the app's share link (geohash), ll= and to=ll.", () => {
  const near = (p, lat, lng, tol) => assert.ok(p && Math.abs(p.lat - lat) < tol && Math.abs(p.lng - lng) < tol, JSON.stringify(p));
  near(decodeGeohash("sv8wx2zq6t"), 32.0853, 34.7818, 0.0001);
  near(parsePlace("https://waze.com/ul/hsv8wx2zq6t"), 32.0853, 34.7818, 0.0001);
  near(parsePlace("Let's meet here: https://waze.com/ul/hsv8wx2zq6t"), 32.0853, 34.7818, 0.0001);
  near(parsePlace("https://www.waze.com/he/ul/hsv8wx2z"), 32.0853, 34.7818, 0.001);
  assert.deepEqual(parsePlace("https://www.waze.com/ul?ll=32.08530000%2C34.78180000&navigate=yes&zoom=17"), { lat: 32.0853, lng: 34.7818 });
  assert.deepEqual(parsePlace("https://www.waze.com/live-map/directions?to=ll.32.0853%2C34.7818"), { lat: 32.0853, lng: 34.7818 });
  assert.equal(parsePlace("https://waze.com/ul/habc"), null);
});

import { israelTime, stageTimes, passedStages, dueStage, parseSent, formatAppt, reminderText } from "../lib/appointment.ts";
test("appointments: Israel time, reminder times, the one to send now", () => {
  const appt = israelTime("2026-11-25", "10:30");
  assert.equal(appt.toISOString(), "2026-11-25T08:30:00.000Z"); // winter: UTC+2
  assert.equal(israelTime("2026-07-01", "09:00").toISOString(), "2026-07-01T06:00:00.000Z"); // summer: UTC+3
  assert.equal(israelTime("2026-02-30", "10:00"), null);
  assert.equal(israelTime("2026-11-25", "25:00"), null);
  const t = stageTimes(appt);
  assert.equal(new Date(t.d1).toISOString(), "2026-11-24T08:30:00.000Z");
  assert.equal(new Date(t.am).toISOString(), "2026-11-25T06:00:00.000Z"); // 8:00 in Israel
  assert.equal(new Date(t.h1).toISOString(), "2026-11-25T07:30:00.000Z");
  // An early appointment has no morning reminder.
  assert.equal(stageTimes(israelTime("2026-11-25", "09:00")).am, undefined);
  // Set two days ahead: nothing has passed yet.
  assert.deepEqual(passedStages(appt, new Date("2026-11-23T10:00:00Z")), []);
  // The day before, after 10:30: the day-before reminder.
  assert.deepEqual(dueStage(appt, [], new Date("2026-11-24T09:00:00Z")), { stage: "d1", skip: [] });
  assert.equal(dueStage(appt, ["d1"], new Date("2026-11-24T20:00:00Z")), null);
  // The job was down overnight: only the morning one goes out, the missed one is marked.
  assert.deepEqual(dueStage(appt, [], new Date("2026-11-25T06:30:00Z")), { stage: "am", skip: ["d1"] });
  assert.deepEqual(dueStage(appt, ["d1", "am"], new Date("2026-11-25T07:35:00Z")), { stage: "h1", skip: [] });
  // After the appointment: nothing.
  assert.equal(dueStage(appt, [], new Date("2026-11-25T09:00:00Z")), null);
  assert.deepEqual(parseSent("d1,xx,h1"), ["d1", "h1"]);
  assert.equal(formatAppt(appt.toISOString(), "en", false), "25.11 · 10:30");
  assert.equal(reminderText("h1", "he", "קליניקה", appt.toISOString()), "⏰ בעוד שעה התור שלך בקליניקה (10:30). נתראה!");
});

import { parseHours, DEFAULT_HOURS, slotsOf, slotOf, weekStart, weekdayOf, addDays, monthGrid } from "../lib/calendar.ts";
test("clinic calendar: hours, slots, weeks and months", () => {
  assert.deepEqual(parseHours(null), DEFAULT_HOURS);
  assert.deepEqual(parseHours('[["08:00","12:00"],null,null,null,null,null,null]')[0], ["08:00", "12:00"]);
  assert.deepEqual(parseHours('[["12:00","08:00"],null,null,null,null,null,null]'), DEFAULT_HOURS, "closing before opening is ignored");
  assert.equal(weekdayOf("2026-11-22"), 0); // a Sunday
  assert.equal(weekStart("2026-11-26"), "2026-11-22");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  const fri = slotsOf(DEFAULT_HOURS, "2026-11-27", 30);
  assert.deepEqual(fri, ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]);
  assert.deepEqual(slotsOf(DEFAULT_HOURS, "2026-11-28", 30), [], "Saturday is closed");
  assert.equal(slotsOf(DEFAULT_HOURS, "2026-11-22", 45).at(-1), "17:15", "the last slot ends by closing");
  assert.equal(slotOf(fri, "10:40", 30), "10:30");
  assert.equal(slotOf(fri, "13:00", 30), null);
  const nov = monthGrid("2026-11");
  assert.equal(nov[0][0], "2026-11-01"); // Nov 1, 2026 is a Sunday
  assert.equal(nov.length, 5);
  assert.equal(monthGrid("2026-12")[0][0], "2026-11-29");
});

import { parseServices, freeStarts, endOf } from "../lib/calendar.ts";
test("clinic services and the free times that fit them", () => {
  assert.deepEqual(parseServices('[{"id":"a","name":"Facial","min":45},{"id":"b","name":"","min":30},{"id":"c","name":"X","min":3}]'), [{ id: "a", name: "Facial", min: 45 }]);
  assert.deepEqual(parseServices("nope"), []);
  assert.equal(endOf("10:30", 45), "11:15");
  const hours = [["09:00", "12:00"], null, null, null, null, null, null];
  // Sunday 2026-11-22, 30-minute steps, a 60-minute service, busy 10:00-10:45.
  assert.deepEqual(freeStarts(hours, "2026-11-22", 30, 60, [[600, 645]]), ["09:00", "11:00"]);
  // 30 minutes: 10:45 isn't a step; 09:00, 09:30, 11:00, 11:30.
  assert.deepEqual(freeStarts(hours, "2026-11-22", 30, 30, [[600, 645]]), ["09:00", "09:30", "11:00", "11:30"]);
  // Today from 10:50 on.
  assert.deepEqual(freeStarts(hours, "2026-11-22", 30, 30, [], 650), ["11:00", "11:30"]);
  assert.deepEqual(freeStarts(hours, "2026-11-23", 30, 30, []), [], "closed on Monday");
});
