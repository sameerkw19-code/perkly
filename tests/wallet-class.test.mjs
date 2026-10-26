// Per-business Google Wallet class body. Run: node --test tests/wallet-class.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classBody } from "../lib/wallet-look.ts";

test("class body: name, color, logo and review are set", () => {
  const b = classBody("issuer.biz_1", { name: "Corner Cafe", color: "#7558e8", logoUrl: "https://perkly.shop/api/asset/abc" });
  assert.equal(b.id, "issuer.biz_1");
  assert.equal(b.programName, "Corner Cafe");
  assert.equal(b.hexBackgroundColor, "#7558E8");
  assert.equal(b.programLogo.sourceUri.uri, "https://perkly.shop/api/asset/abc");
  assert.equal(b.reviewStatus, "underReview");
});

test("class body: a bad color falls back, long names are cut", () => {
  const b = classBody("x", { name: "א".repeat(90), color: "red", logoUrl: "https://a/b" });
  assert.equal(b.hexBackgroundColor, "#1E1B2E");
  assert.equal(b.programName.length, 60);
});
