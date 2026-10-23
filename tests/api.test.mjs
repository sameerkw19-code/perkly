// End-to-end API checks against a running server.
// 1) npm run build   2) npm run db:migrate:local   3) npm run preview
// 4) in another window: npm run test:api      (BASE_URL defaults to http://127.0.0.1:8787)
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const run = Date.now().toString(36);
// Each test client looks like a different visitor, so per-IP limits don't mix between tests.
let ipCounter = 0;

class Client {
  constructor() { this.cookie = ""; this.ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${++ipCounter}`; }
  headers(extra = {}) {
    return { "content-type": "application/json", origin: BASE, cookie: this.cookie, "cf-connecting-ip": this.ip, ...extra };
  }
  keep(res) {
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
  }
  async post(path, body, extra) {
    const res = await fetch(BASE + path, { method: "POST", headers: this.headers(extra), body: JSON.stringify(body) });
    this.keep(res);
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  async get(path) {
    const res = await fetch(BASE + path, { headers: this.headers(), redirect: "manual" });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    return { status: res.status, body, text, location: res.headers.get("location") };
  }
  act(business, action, extra = {}) { return this.post("/api/loyalty", { action, business, ...extra }); }
}

const id = () => crypto.randomUUID();
const ownerA = new Client();
const ownerB = new Client();
const staff = new Client();
let bizA, bizB, dana, cardUrl;

async function signup(client, who) {
  const r = await client.post("/api/auth", { action: "signup", name: who, email: `${who}-${run}@test.perkly`, password: "correct horse 1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

async function stamps(client, business, customerId) {
  const r = await client.get(`/api/loyalty?business=${business}&days=all`);
  return r.body.customers.find((c) => c.id === customerId);
}

test("forged identity headers are ignored; pages require sign-in", async () => {
  const anon = new Client();
  const r = await anon.get("/api/loyalty");
  assert.equal(r.status, 401);
  const forged = await fetch(BASE + "/api/loyalty", { headers: { "oai-authenticated-user-id": "attacker", "oai-authenticated-user-email": "a@b.c" } });
  assert.equal(forged.status, 401);
  const page = await anon.get("/");
  assert.equal(page.status, 307);
  assert.match(page.location, /\/login$/);
});

test("mutations from another site are rejected", async () => {
  const r = await new Client().post("/api/auth", { action: "login", email: "x@y.z", password: "whatever1" }, { origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("1. create a business and add a customer", async () => {
  await signup(ownerA, "ownerA");
  const b = await ownerA.post("/api/loyalty", { action: "create_business", name: "Corner Cafe", reward: "Free coffee", target: 9, color: "#7558E8" });
  assert.equal(b.status, 200);
  bizA = b.body.id;
  const c = await ownerA.act(bizA, "register_customer", { name: "Dana", phone: "050-123 4567" });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  dana = c.body.id;
  cardUrl = c.body.cardUrl;
  assert.match(cardUrl, /\/c\/[A-Za-z0-9_-]{20,}$/);
});

test("2. duplicate phone in any format is blocked", async () => {
  for (const phone of ["0501234567", "+972 50 123 4567", "972501234567", "+972-050-1234567"]) {
    const r = await ownerA.act(bizA, "register_customer", { name: "Dup", phone });
    assert.equal(r.status, 409, phone);
    assert.equal(r.body.code, "phone_exists");
  }
});

test("3-4. card link opens the card without the phone; QR scan picks the right customer", async () => {
  const page = await new Client().get(new URL(cardUrl).pathname);
  assert.equal(page.status, 200);
  assert.match(page.text, /Dana/);
  assert.doesNotMatch(page.text, /501234567|123-4567/);
  const scan = /perkly:([A-Za-z0-9_-]{10,})/.exec(page.text) || /"scan_code":"([A-Za-z0-9_-]+)"/.exec(page.text.replace(/\\"/g, '"'));
  assert.ok(scan, "scan code present in card page");
  const found = await ownerA.act(bizA, "lookup", { scan: "perkly:" + scan[1] });
  assert.equal(found.status, 200);
  assert.equal(found.body.results[0].id, dana);
  const wrong = await new Client().get("/c/not-a-real-secret-aaaaaaaaaaaaaaaa");
  assert.doesNotMatch(wrong.text, /Dana/);
});

test("5. a stamp is saved and survives a reload; the same request id counts once", async () => {
  const requestId = id();
  const first = await ownerA.act(bizA, "stamp", { customer: dana, requestId });
  assert.equal(first.status, 200);
  const again = await ownerA.act(bizA, "stamp", { customer: dana, requestId });
  assert.equal(again.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal((await stamps(ownerA, bizA, dana)).stamps, 1);
});

test("6-7. reach 9 stamps with parallel requests; early redeem and a 10th stamp are blocked", async () => {
  const early = await ownerA.act(bizA, "redeem", { customer: dana, requestId: id() });
  assert.equal(early.status, 409);
  assert.equal(early.body.code, "not_ready");
  await Promise.all(Array.from({ length: 8 }, () => ownerA.act(bizA, "stamp", { customer: dana, requestId: id() })));
  assert.equal((await stamps(ownerA, bizA, dana)).stamps, 9);
  const tenth = await ownerA.act(bizA, "stamp", { customer: dana, requestId: id() });
  assert.equal(tenth.status, 409);
  assert.equal(tenth.body.code, "reward_ready");
});

test("8-9. three parallel redemptions: exactly one succeeds and a new round starts", async () => {
  const results = await Promise.all([1, 2, 3].map(() => ownerA.act(bizA, "redeem", { customer: dana, requestId: id() })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const c = await stamps(ownerA, bizA, dana);
  assert.equal(c.stamps, 0);
  assert.equal(c.target, 9);
});

test("history records business, actor, role, balance after and request id", async () => {
  const r = await ownerA.get(`/api/loyalty?business=${bizA}&days=all`);
  assert.equal(r.body.events.length, 10); // 9 stamps + 1 redeem
  const redeem = r.body.events.find((e) => e.kind === "redeem");
  assert.equal(redeem.actor_name, "ownerA");
  assert.equal(redeem.actor_role, "owner");
  assert.equal(redeem.stamps_after, 0);
  assert.equal(r.body.stats.redemptions, 1);
});

test("10. another business owner cannot see or change this business", async () => {
  await signup(ownerB, "ownerB");
  const b = await ownerB.post("/api/loyalty", { action: "create_business", name: "Other", reward: "Free cut", target: 5, color: "#123456" });
  bizB = b.body.id;
  const view = await ownerB.get(`/api/loyalty?business=${bizA}`);
  assert.equal(view.body.business.id, bizB, "falls back to own business");
  assert.ok(!view.body.customers.some((c) => c.id === dana));
  for (const action of ["stamp", "redeem", "lookup", "register_customer", "update_business", "invite_staff", "new_card_link"]) {
    const r = await ownerB.act(bizA, action, { customer: dana, requestId: id(), query: "Dana", name: "X", phone: "0529999999", reward: "x", target: 3, color: "#000000" });
    assert.equal(r.status, 404, action);
  }
  const cross = await ownerB.act(bizB, "stamp", { customer: dana, requestId: id() });
  assert.equal(cross.status, 404, "customer of A through B's business");
});

test("11. staff: invited, limited permissions, then revoked", async () => {
  const inv = await ownerA.act(bizA, "invite_staff", { label: "Barista" });
  assert.equal(inv.status, 200);
  const token = new URL(inv.body.inviteUrl).pathname.split("/").pop();
  const join = await staff.post("/api/auth", { action: "accept_invite", token, name: "Barista Noa", email: `noa-${run}@test.perkly`, password: "staff pass 1" });
  assert.equal(join.status, 200, JSON.stringify(join.body));
  const reuse = await new Client().post("/api/auth", { action: "accept_invite", token, name: "Eve", email: `eve-${run}@test.perkly`, password: "eve pass 12" });
  assert.equal(reuse.status, 404, "invite works only once");

  const view = await staff.get(`/api/loyalty?business=${bizA}`);
  assert.equal(view.body.role, "staff");
  assert.equal(view.body.customers, undefined, "staff get no customer list");
  assert.equal(view.body.team, undefined);

  const search = await staff.act(bizA, "lookup", { query: "Dan" });
  assert.equal(search.body.results[0].phone, "•••-4567", "staff see a masked phone");
  const s = await staff.act(bizA, "stamp", { customer: dana, requestId: id() });
  assert.equal(s.status, 200);

  for (const action of ["update_business", "invite_staff", "adjust", "new_card_link", "revoke_member", "new_join_code"]) {
    const r = await staff.act(bizA, action, { customer: dana, delta: 1, note: "x", requestId: id(), name: "Hack", reward: "x", target: 2, color: "#000000", user: "x" });
    assert.equal(r.status, 403, action);
  }

  const staffId = (await ownerA.get(`/api/loyalty?business=${bizA}`)).body.team.find((m) => m.role === "staff").id;
  const rev = await ownerA.act(bizA, "revoke_member", { user: staffId });
  assert.equal(rev.status, 200);
  const after = await staff.act(bizA, "stamp", { customer: dana, requestId: id() });
  assert.ok([401, 404].includes(after.status), "revoked staff cannot act");
});

test("owner correction is logged with a reason, never deletes history", async () => {
  const noReason = await ownerA.act(bizA, "adjust", { customer: dana, delta: -1, requestId: id() });
  assert.equal(noReason.status, 400);
  const fix = await ownerA.act(bizA, "adjust", { customer: dana, delta: -1, note: "Double tap by mistake", requestId: id() });
  assert.equal(fix.status, 200);
  const r = await ownerA.get(`/api/loyalty?business=${bizA}&days=all`);
  assert.equal(r.body.events.find((e) => e.kind === "adjust").note, "Double tap by mistake");
  assert.equal(r.body.events.length, 12);
});

test("changing the program does not change an existing card's round", async () => {
  await ownerA.act(bizA, "stamp", { customer: dana, requestId: id() });
  const upd = await ownerA.act(bizA, "update_business", { name: "Corner Cafe", reward: "Free coffee", target: 5, color: "#7558E8" });
  assert.equal(upd.status, 200);
  assert.equal((await stamps(ownerA, bizA, dana)).target, 9, "current round keeps 9");
  const fresh = await ownerA.act(bizA, "register_customer", { name: "Yossi", phone: "052-7654321" });
  assert.equal((await stamps(ownerA, bizA, fresh.body.id)).target, 5, "new card uses 5");
});

test("customer self-join: terms required, marketing off by default, no duplicates", async () => {
  const code = (await ownerA.get(`/api/loyalty?business=${bizA}`)).body.business.join_code;
  const visitor = new Client();
  const noTerms = await visitor.post("/api/join", { code, name: "Sara", phone: "0541112222" });
  assert.equal(noTerms.status, 400);
  const ok = await visitor.post("/api/join", { code, name: "Sara", phone: "0541112222", terms: true });
  assert.equal(ok.status, 200);
  assert.match(ok.body.cardPath, /^\/c\//);
  const dup = await visitor.post("/api/join", { code, name: "Sara again", phone: "+972541112222", terms: true });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.cardPath, undefined, "never hands out an existing card");
  const sara = (await ownerA.get(`/api/loyalty?business=${bizA}&days=all`)).body.customers.find((c) => c.name === "Sara");
  assert.equal(sara.consent_marketing, 0);
  assert.equal(sara.source, "self");
  const bad = await visitor.post("/api/join", { code: "nope", name: "X", phone: "0541113333", terms: true });
  assert.equal(bad.status, 404);
});

test("new card link replaces the old one", async () => {
  const r = await ownerA.act(bizA, "new_card_link", { customer: dana });
  assert.equal(r.status, 200);
  const oldPage = await new Client().get(new URL(cardUrl).pathname);
  assert.doesNotMatch(oldPage.text, /Dana/);
  const newPage = await new Client().get(new URL(r.body.cardUrl).pathname);
  assert.match(newPage.text, /Dana/);
});

test("login: wrong password rejected, then rate limited", async () => {
  const c = new Client();
  const email = `ownerA-${run}@test.perkly`;
  const wrong = await c.post("/api/auth", { action: "login", email, password: "wrong-password" });
  assert.equal(wrong.status, 401);
  let last;
  for (let i = 0; i < 10; i++) last = await c.post("/api/auth", { action: "login", email, password: "wrong-password" });
  assert.equal(last.status, 429);
});

test("sign out ends the session", async () => {
  const out = await ownerB.post("/api/auth", { action: "logout" });
  assert.equal(out.status, 200);
  const r = await ownerB.get("/api/loyalty");
  assert.equal(r.status, 401);
});

// ---------------- Card designs ----------------
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function upload(client, business, kind, bytes, type = "image/png") {
  const res = await fetch(`${BASE}/api/asset?business=${business}&kind=${kind}`, { method: "POST", headers: { ...client.headers(), "content-type": type }, body: bytes });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("design: upload, draft, publish checks, live card uses the published design", async () => {
  const up = await upload(ownerA, bizA, "logo", PNG_1x1);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.width, 1);
  const img = await fetch(`${BASE}/api/asset/${up.body.id}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");

  const svg = await upload(ownerA, bizA, "logo", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "image/svg+xml");
  assert.equal(svg.status, 415, "SVG and unknown files are refused");

  const before = (await ownerA.get(`/api/loyalty?business=${bizA}&days=all`)).body;
  const draft = structuredClone(before.editor.draft);
  draft.logo = up.body.id;
  draft.stamp = { icon: "pizza", image: null };
  draft.texts.he.title = "פיצה של רמי";
  draft.texts.en.title = "Rami's Pizza";
  draft.colors = { bg: "#FFFFFF", fg: "#FAFAFA", stamp: "#7558E8" }; // unreadable on purpose
  const saved = await ownerA.act(bizA, "save_design", { design: draft });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const blocked = await ownerA.act(bizA, "publish_design");
  assert.equal(blocked.status, 409, "low contrast blocks publishing");
  assert.ok(blocked.body.checks.some((c) => c.level === "bad"));

  // Customers still see the old design while the draft exists.
  const stillOld = await new Client().get(new URL(cardUrl.replace(/\/c\/.*/, "")).pathname || "/");
  assert.ok(stillOld.status < 500);

  draft.colors = { bg: "#8E1B12", fg: "#FFF4E6", stamp: "#FFC94A" };
  await ownerA.act(bizA, "save_design", { design: draft });
  const stampsBefore = (await stamps(ownerA, bizA, dana)).stamps;
  const pub = await ownerA.act(bizA, "publish_design");
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.equal(pub.body.version, 1);
  assert.equal((await stamps(ownerA, bizA, dana)).stamps, stampsBefore, "publishing never changes balances");

  const link = (await ownerA.act(bizA, "new_card_link", { customer: dana })).body.cardUrl;
  const card = await new Client().get(new URL(link).pathname);
  assert.match(card.text, /פיצה של רמי/);
  assert.match(card.text, /#8E1B12/);
  const pub2 = await ownerA.act(bizA, "publish_design");
  assert.equal(pub2.body.version, 2, "every publish is a new kept version");
});

test("design: staff and other businesses cannot edit or borrow images", async () => {
  const s2 = new Client();
  const inv = await ownerA.act(bizA, "invite_staff", { label: "Cashier" });
  await s2.post("/api/auth", { action: "accept_invite", token: new URL(inv.body.inviteUrl).pathname.split("/").pop(), name: "Cashier", email: `cash-${run}@test.perkly`, password: "cashier pass" });
  const view = await s2.get(`/api/loyalty?business=${bizA}`);
  assert.equal(view.body.editor, undefined, "staff get no editor data");
  assert.ok(view.body.design, "staff still see the live design");
  assert.equal((await s2.act(bizA, "save_design", { design: view.body.design })).status, 403);
  assert.equal((await s2.act(bizA, "publish_design")).status, 403);
  assert.equal((await upload(s2, bizA, "logo", PNG_1x1)).status, 403);

  const ownerC = new Client();
  await signup(ownerC, "ownerC");
  const bizC = (await ownerC.post("/api/loyalty", { action: "create_business", name: "C", reward: "x", target: 4, color: "#222222" })).body.id;
  const aLogo = (await ownerA.get(`/api/loyalty?business=${bizA}`)).body.editor.images[0].id;
  const cDesign = (await ownerC.get(`/api/loyalty?business=${bizC}`)).body.editor.draft;
  cDesign.logo = aLogo;
  assert.equal((await ownerC.act(bizC, "save_design", { design: cDesign })).status, 404, "cannot use another business's image");
  assert.equal((await upload(ownerC, bizA, "logo", PNG_1x1)).status, 404, "cannot upload into another business");
});
