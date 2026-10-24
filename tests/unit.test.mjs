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
