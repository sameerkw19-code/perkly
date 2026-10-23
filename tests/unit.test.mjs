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
