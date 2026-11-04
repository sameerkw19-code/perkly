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

// ---- Perkly for Clubs ----
import { addMonths, endOfDay, israelToday, memberStatus, readableOn, renewFrom, showDate, validDate } from "../lib/club.ts";
import { memberFields } from "../lib/wallet-look.ts";

test("clubs: only real calendar days are valid", () => {
  assert.equal(validDate("2026-12-31"), true);
  assert.equal(validDate("2026-02-31"), false);
  assert.equal(validDate("31/12/2026"), false);
  assert.equal(validDate(20261231), false);
});

test("clubs: the last valid day counts in full, then the membership is expired", () => {
  assert.equal(memberStatus("2026-12-31", "2026-12-01"), "active");
  assert.equal(memberStatus("2026-12-31", "2026-12-24"), "expiring");
  assert.equal(memberStatus("2026-12-31", "2026-12-31"), "expiring");
  assert.equal(memberStatus("2026-12-31", "2027-01-01"), "expired");
});

test("clubs: today follows Israel, not UTC", () => {
  assert.equal(israelToday(new Date("2026-11-04T22:30:00Z")), "2026-11-05");
  assert.equal(israelToday(new Date("2026-11-04T21:30:00Z")), "2026-11-04");
});

test("clubs: adding months keeps the day when it can", () => {
  assert.equal(addMonths("2026-01-15", 1), "2026-02-15");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(addMonths("2026-12-31", 12), "2027-12-31");
});

test("clubs: a renewal counts from the end of the current membership, or from today", () => {
  assert.equal(renewFrom("2026-12-31", "2026-11-04"), "2026-12-31");
  assert.equal(renewFrom("2026-01-01", "2026-11-04"), "2026-11-04");
  assert.equal(renewFrom("", "2026-11-04"), "2026-11-04");
});

test("clubs: a membership ends at the end of its day in Israel, winter and summer", () => {
  assert.equal(endOfDay("2026-12-31"), "2026-12-31T23:59:59+02:00");
  assert.equal(endOfDay("2026-07-15"), "2026-07-15T23:59:59+03:00");
});

test("clubs: dates and card text colors", () => {
  assert.equal(showDate("2026-12-31"), "31/12/2026");
  assert.equal(readableOn("#17132B"), "#FFFFFF");
  assert.equal(readableOn("#FFD84A"), "#17132B");
});

test("clubs: the wallet pass has no barcode and follows the membership", () => {
  const base = { club: "Gym", memberNo: 7, name: "Dana", plan: "Yearly", validUntil: "31/12/2026", endsAt: "2026-12-31T23:59:59+02:00", active: true, removed: false };
  const pass = memberFields(base);
  assert.equal(pass.state, "ACTIVE");
  assert.equal(pass.accountId, "7");
  assert.equal(pass.loyaltyPoints.balance.string, "31/12/2026");
  assert.equal(pass.secondaryLoyaltyPoints.balance.string, "Yearly");
  assert.equal(pass.textModulesData[0].header, "Gym");
  assert.equal("barcode" in pass, false);
  assert.equal(memberFields({ ...base, active: false }).state, "EXPIRED");
  assert.equal(memberFields({ ...base, removed: true }).state, "INACTIVE");
  assert.equal("secondaryLoyaltyPoints" in memberFields({ ...base, plan: null }), false);
});
