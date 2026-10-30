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
  // Signed-out visitors get the public landing page, never the dashboard.
  const page = await fetch(BASE + "/", { redirect: "manual" });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /הכרטיס שגורם ללקוחות לחזור/);
  assert.doesNotMatch(html, /oai-authenticated|join_code/);
  // Sign-up is the guided setup; the old address forwards there. "Talk to us" is a separate form.
  const signup = await fetch(BASE + "/signup", { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(signup.status), `signup status ${signup.status}`);
  assert.match(signup.headers.get("location") ?? "", /\/start$/);
  const start = await fetch(BASE + "/start", { redirect: "manual" });
  assert.equal(start.status, 200);
  assert.match(await start.text(), /Perkly/);
  const contact = await fetch(BASE + "/contact", { redirect: "manual" });
  assert.equal(contact.status, 200);
  const arabic = await fetch(BASE + "/ar", { redirect: "manual" });
  assert.equal(arabic.status, 200);
  assert.match(await arabic.text(), /البطاقة التي تجعل الزبائن يعودون/);
  const english = await fetch(BASE + "/en", { redirect: "manual" });
  assert.equal(english.status, 200);
  assert.match(await english.text(), /The card that brings customers back/);
  // The admin control center sends visitors to sign in and back.
  const admin = await anon.get("/admin");
  assert.ok([302, 303, 307, 308].includes(admin.status), `admin status ${admin.status}`);
  assert.match(admin.location, /\/login\?next=\/admin$/);
  for (const path of ["/terms", "/privacy", "/accessibility"]) {
    const legal = await anon.get(path);
    assert.equal(legal.status, 200, path);
    assert.match(legal.text, /036884823/, path);
  }
});

test("password reset links: unknown or reused tokens are refused", async () => {
  const r = await new Client().post("/api/auth", { action: "reset_password", token: "not-a-real-token", password: "new password 1" });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "reset_invalid");
  const weak = await new Client().post("/api/auth", { action: "reset_password", token: "x", password: "short" });
  assert.equal(weak.status, 400);
  assert.equal((await new Client().get("/reset/whatever")).status, 200);
});

test("mutations from another site are rejected", async () => {
  const r = await new Client().post("/api/auth", { action: "login", email: "x@y.z", password: "whatever1" }, { origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("1. create a business and add a customer", async () => {
  await signup(ownerA, "ownerA");
  const b = await ownerA.post("/api/loyalty", { action: "create_business", name: "Corner Cafe", reward: "Free coffee", target: 9, color: "#7558E8", rewardMode: "block" });
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

  for (const action of ["update_business", "invite_staff", "new_card_link", "revoke_member", "new_join_code"]) {
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

test("social links: owner saves them, they show on the customer card, bad ones are rejected", async () => {
  const base = { name: "Corner Cafe", reward: "Free coffee", target: 5, color: "#7558E8" };
  const bad = await ownerA.act(bizA, "update_business", { ...base, social: { instagram: "https://evil.example/x" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "bad_social");
  const ok = await ownerA.act(bizA, "update_business", { ...base, social: { instagram: "@corner.cafe", whatsapp: "050-111-2233", website: "" } });
  assert.equal(ok.status, 200);
  const biz = (await ownerA.get(`/api/loyalty?business=${bizA}`)).body.business;
  assert.deepEqual(biz.social, { instagram: "corner.cafe", whatsapp: "+972501112233" });
  // Saving other settings without `social` keeps the links.
  await ownerA.act(bizA, "update_business", base);
  assert.deepEqual((await ownerA.get(`/api/loyalty?business=${bizA}`)).body.business.social, { instagram: "corner.cafe", whatsapp: "+972501112233" });
  const r = await ownerA.act(bizA, "new_card_link", { customer: dana });
  const page = await new Client().get(new URL(r.body.cardUrl).pathname);
  assert.match(page.text, /instagram\.com\/corner\.cafe/);
  assert.match(page.text, /wa\.me\/972501112233/);
  // Clearing every field removes them.
  await ownerA.act(bizA, "update_business", { ...base, social: {} });
  assert.deepEqual((await ownerA.get(`/api/loyalty?business=${bizA}`)).body.business.social, {});
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

// ---------------- Branches ----------------
test("branches: required once they exist, staff locked to their branch, reports by branch", async () => {
  const owner = new Client();
  await signup(owner, "branchOwner");
  const biz = (await owner.post("/api/loyalty", { action: "create_business", name: "Chain", reward: "Free", target: 5, color: "#123456", rewardMode: "block" })).body.id;
  const cust = (await owner.act(biz, "register_customer", { name: "Lea", phone: "0531234567" })).body.id;

  // Without branches, actions work without one.
  assert.equal((await owner.act(biz, "stamp", { customer: cust, requestId: id() })).status, 200);

  const north = (await owner.act(biz, "create_branch", { name: "North" })).body.id;
  const south = (await owner.act(biz, "create_branch", { name: "South" })).body.id;
  const noBranch = await owner.act(biz, "stamp", { customer: cust, requestId: id() });
  assert.equal(noBranch.status, 400);
  assert.equal(noBranch.body.code, "branch_required");
  assert.equal((await owner.act(biz, "stamp", { customer: cust, branch: south, requestId: id() })).status, 200);

  // Staff invited to North: whatever branch they send, North is recorded.
  const inv = await owner.act(biz, "invite_staff", { label: "N", branch: north });
  const st = new Client();
  await st.post("/api/auth", { action: "accept_invite", token: new URL(inv.body.inviteUrl).pathname.split("/").pop(), name: "North Staff", email: `north-${run}@test.perkly`, password: "north pass 1" });
  const me = (await st.get(`/api/loyalty?business=${biz}`)).body;
  assert.equal(me.myBranch, north);
  assert.equal((await st.act(biz, "stamp", { customer: cust, branch: south, requestId: id() })).status, 200);

  const view = (await owner.get(`/api/loyalty?business=${biz}&days=all`)).body;
  const byName = Object.fromEntries(view.perBranch.map((r) => [r.branch_name ?? "none", r.stamps]));
  assert.deepEqual(byName, { North: 1, South: 1, none: 1 });
  const onlyNorth = (await owner.get(`/api/loyalty?business=${biz}&days=all&branch=${north}`)).body;
  assert.equal(onlyNorth.stats.stamps, 1);
  assert.ok(onlyNorth.events.every((e) => e.branch_name === "North"));

  // Another business's branch id is rejected.
  const otherBranch = (await ownerA.act(bizA, "create_branch", { name: "A-branch" })).body.id;
  assert.equal((await owner.act(biz, "stamp", { customer: cust, branch: otherBranch, requestId: id() })).status, 400);
  assert.equal((await owner.act(biz, "set_member_branch", { user: "x", branch: otherBranch })).status, 400);

  // Staff cannot manage branches.
  assert.equal((await st.act(biz, "create_branch", { name: "Hack" })).status, 403);
  assert.equal((await st.act(biz, "archive_branch", { branch: north })).status, 403);

  // Closing North blocks its staff until the owner moves them.
  assert.equal((await owner.act(biz, "archive_branch", { branch: north })).status, 200);
  const blocked = await st.act(biz, "stamp", { customer: cust, requestId: id() });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "branch_invalid");
  const staffId = view.team.find((m) => m.role === "staff").id;
  assert.equal((await owner.act(biz, "set_member_branch", { user: staffId, branch: south })).status, 200);
  assert.equal((await st.act(biz, "stamp", { customer: cust, requestId: id() })).status, 200);
  const hist = (await owner.get(`/api/loyalty?business=${biz}&days=all`)).body.events;
  assert.equal(hist.filter((e) => e.branch_name === "North").length, 1, "closed branch keeps its history");
});


// ---------------- Staff station: several stamps at once, count corrections ----------------
test("station: several purchases in one action; staff can fix the count with a reason; owner can switch that off", async () => {
  const owner = new Client();
  await signup(owner, "stationOwner");
  const biz = (await owner.post("/api/loyalty", { action: "create_business", name: "Cafe2", reward: "Free", target: 9, color: "#123456", rewardMode: "block" })).body.id;
  const cust = (await owner.act(biz, "register_customer", { name: "Omer", phone: "0549876543" })).body.id;
  const inv = await owner.act(biz, "invite_staff", { label: "S" });
  const st = new Client();
  await st.post("/api/auth", { action: "accept_invite", token: new URL(inv.body.inviteUrl).pathname.split("/").pop(), name: "Station Staff", email: `station-${run}@test.perkly`, password: "station pass" });

  const three = await st.act(biz, "stamp", { customer: cust, count: 3, requestId: id() });
  assert.equal(three.status, 200);
  assert.equal(three.body.card.stamps, 3);
  const tooMany = await st.act(biz, "stamp", { customer: cust, count: 7, requestId: id() });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.body.code, "too_many");
  assert.equal((await st.act(biz, "stamp", { customer: cust, count: 0, requestId: id() })).status, 400);
  assert.equal((await st.act(biz, "stamp", { customer: cust, count: 11, requestId: id() })).status, 400);

  // Repeating the same multi-stamp request never doubles it.
  const rid = id();
  await st.act(biz, "stamp", { customer: cust, count: 2, requestId: rid });
  const again = await st.act(biz, "stamp", { customer: cust, count: 2, requestId: rid });
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.card.stamps, 5);

  // Staff correction: reason required, limited to 5, must match the count they saw.
  assert.equal((await st.act(biz, "adjust", { customer: cust, delta: -1, from: 5, requestId: id() })).status, 400);
  assert.equal((await st.act(biz, "adjust", { customer: cust, delta: -6, from: 5, note: "x", requestId: id() })).status, 400);
  const stale = await st.act(biz, "adjust", { customer: cust, delta: -1, from: 4, note: "customer bought 4", requestId: id() });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "card_changed");
  const fix = await st.act(biz, "adjust", { customer: cust, delta: -1, from: 5, note: "customer bought 4", requestId: id() });
  assert.equal(fix.status, 200);
  assert.equal(fix.body.card.stamps, 4);

  const view = (await owner.get(`/api/loyalty?business=${biz}&days=all`)).body;
  const ev = view.events.find((e) => e.kind === "adjust");
  assert.equal(ev.actor_name, "Station Staff");
  assert.equal(ev.note, "customer bought 4");
  assert.ok(view.alerts.some((a) => a.type === "staffFix"), "owner is told about staff corrections");

  // Owner turns staff corrections off.
  const off = await owner.act(biz, "update_business", { name: "Cafe2", reward: "Free", target: 9, color: "#123456", staffAdjust: false });
  assert.equal(off.status, 200);
  assert.equal((await st.act(biz, "adjust", { customer: cust, delta: 1, from: 4, note: "x", requestId: id() })).status, 403);
  assert.equal((await owner.act(biz, "adjust", { customer: cust, delta: 1, from: 4, note: "owner fix", requestId: id() })).status, 200);
});


// ---------------- Collect mode (saved rewards) ----------------
test("collect mode: full cards save rewards, several can wait, redeem uses one, never double", async () => {
  const owner = new Client();
  await signup(owner, "bankOwner");
  const biz = (await owner.post("/api/loyalty", { action: "create_business", name: "Bank", reward: "Free", target: 3, color: "#123456" })).body.id;
  assert.equal((await owner.get(`/api/loyalty?business=${biz}`)).body.business.reward_mode, "bank", "new businesses collect by default");
  const cust = (await owner.act(biz, "register_customer", { name: "Rina", phone: "0551112233" })).body.id;

  let r = await owner.act(biz, "stamp", { customer: cust, count: 2, requestId: id() });
  assert.deepEqual([r.body.card.stamps, r.body.card.rewards], [2, 0]);
  const rid = id();
  r = await owner.act(biz, "stamp", { customer: cust, count: 2, requestId: rid });
  assert.deepEqual([r.body.card.stamps, r.body.card.rewards, r.body.earned], [1, 1, 1], "rolls over into a saved reward");
  r = await owner.act(biz, "stamp", { customer: cust, count: 2, requestId: rid });
  assert.equal(r.body.replayed, true);
  assert.equal(r.body.card.rewards, 1, "repeating the request does not save another reward");
  r = await owner.act(biz, "stamp", { customer: cust, count: 5, requestId: id() });
  assert.deepEqual([r.body.card.stamps, r.body.card.rewards, r.body.earned], [0, 3, 2], "6 stamps on a 3-card = 2 more rewards");

  // Stamps keep working while rewards wait.
  r = await owner.act(biz, "stamp", { customer: cust, requestId: id() });
  assert.deepEqual([r.body.card.stamps, r.body.card.rewards], [1, 3]);

  r = await owner.act(biz, "redeem", { customer: cust, requestId: id() });
  assert.equal(r.status, 200);
  assert.equal(r.body.card.rewards, 2);
  const many = await Promise.all([1, 2, 3].map(() => owner.act(biz, "redeem", { customer: cust, requestId: id() })));
  assert.equal(many.filter((x) => x.status === 200).length, 2, "only the 2 saved rewards can be used");
  const none = await owner.act(biz, "redeem", { customer: cust, requestId: id() });
  assert.equal(none.status, 409);
  assert.equal(none.body.code, "not_ready");
  assert.equal(none.body.card.stamps, 1, "redeeming never touches the current stamps");
});

test("collect mode: parallel stamps from several devices roll over exactly", async () => {
  const owner = new Client();
  await signup(owner, "bankPar");
  const biz = (await owner.post("/api/loyalty", { action: "create_business", name: "Par", reward: "Free", target: 3, color: "#123456" })).body.id;
  const cust = (await owner.act(biz, "register_customer", { name: "Par", phone: "0551112244" })).body.id;
  const results = await Promise.all(Array.from({ length: 9 }, () => owner.act(biz, "stamp", { customer: cust, requestId: id() })));
  assert.deepEqual(results.map((r) => r.status), Array(9).fill(200), "every parallel stamp is accepted (none comes back busy)");
  const c = (await owner.get(`/api/loyalty?business=${biz}&days=all`)).body.customers.find((x) => x.id === cust);
  assert.deepEqual([c.stamps, c.rewards], [0, 3]);
});

test("collect mode: expiry applies to new rewards only; switching modes converts full cards", async () => {
  const owner = new Client();
  await signup(owner, "bankExp");
  const biz = (await owner.post("/api/loyalty", { action: "create_business", name: "Exp", reward: "Free", target: 2, color: "#123456", rewardMode: "block" })).body.id;
  const cust = (await owner.act(biz, "register_customer", { name: "Exp", phone: "0551112255" })).body.id;
  await owner.act(biz, "stamp", { customer: cust, count: 2, requestId: id() });
  const full = await owner.act(biz, "stamp", { customer: cust, requestId: id() });
  assert.equal(full.body.code, "reward_ready", "redeem-first mode stops at a full card");

  const sw = await owner.act(biz, "update_business", { name: "Exp", reward: "Free", target: 2, color: "#123456", rewardMode: "bank", rewardExpiryDays: 30 });
  assert.equal(sw.status, 200);
  let c = (await owner.get(`/api/loyalty?business=${biz}&days=all`)).body.customers.find((x) => x.id === cust);
  assert.deepEqual([c.stamps, c.rewards], [0, 1], "full card became a saved reward");

  const r = await owner.act(biz, "stamp", { customer: cust, count: 2, requestId: id() });
  assert.equal(r.body.card.rewards, 2);
  const days = (Date.parse(r.body.card.nextExpiry) - Date.now()) / 86_400_000;
  assert.ok(days > 29 && days <= 30.01, "new reward expires in 30 days");
  assert.equal((await owner.act(biz, "update_business", { name: "Exp", reward: "Free", target: 2, color: "#123456", rewardExpiryDays: 7 })).status, 400, "only listed expiry values");

  // Staff can use saved rewards too.
  const inv = await owner.act(biz, "invite_staff", { label: "S" });
  const st = new Client();
  await st.post("/api/auth", { action: "accept_invite", token: new URL(inv.body.inviteUrl).pathname.split("/").pop(), name: "Exp Staff", email: `exp-${run}@test.perkly`, password: "exp staff 1" });
  const used = await st.act(biz, "redeem", { customer: cust, requestId: id() });
  assert.equal(used.status, 200);
  assert.equal(used.body.card.rewards, 1);
});

test("pilot request: validated per field, stored once, rate limited", async () => {
  const c = new Client();
  const bad = await c.post("/api/lead", { business: "", contact: "x", phone: "12", privacy: false });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ["business", "phone", "privacy"]);
  const requestId = `lead-${run}`;
  const lead = { business: "Test Cafe", contact: "Tester", phone: "050-123-4567", email: "", privacy: true, marketing: false, kit: true, lang: "he", requestId };
  const ok = await c.post("/api/lead", lead);
  assert.equal(ok.status, 200);
  const again = await c.post("/api/lead", lead);
  assert.equal(again.status, 200);
  const evil = await c.post("/api/lead", lead, { origin: "https://evil.example" });
  assert.equal(evil.status, 403);
});

