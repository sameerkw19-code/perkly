/**
 * Moving a business from one Perkly (staging) to another (perkly.shop): the settings, the card design
 * (published and draft), its pictures and the branches, as one JSON file. No customers, staff, history
 * or payments move: the business starts fresh, owned by the admin who imports it, with a setup period,
 * and is handed to its owner with an owner link as usual.
 */
import { assetIds, sanitizeDesign, type Design } from "../design";
import { AMOUNT_MAX, AVG_TARGET_MAX, BP_MAX, BP_MIN } from "../cashback.ts";
import { normalizeSocial, parseSocial } from "../social";
import { randomCode } from "./crypto";
import { imageInfo } from "./image";
import { publishedDesign } from "./designs";
import { getSettings } from "./settings";

export const TRANSFER_FORMAT = "perkly-business";
export const TRANSFER_VERSION = 1;
/** One picture at most (the asset routes allow 800 KB; banners 400 KB). */
const ASSET_MAX = 800_000;
/** The design references at most 66 pictures (logos, stamps, 31 Google and 31 Apple banners). */
const ASSETS_MAX = 80;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f-]{36}$/;

type BusinessRow = {
  id: string; name: string; reward: string; target: number; color: string; reward_mode: string;
  reward_expiry_days: number; staff_adjust: number; social: string | null; birthdays: number; currency: string;
  owner_designs: number; program: string; cashback_bp: number; cashback_min: number; avg_cap: number;
  design_draft: string | null; owner_email: string | null;
};

export type TransferFile = {
  format: typeof TRANSFER_FORMAT;
  version: number;
  exported: string;
  from: string;
  business: Omit<BusinessRow, "id" | "design_draft" | "owner_email">;
  ownerEmail: string | null;
  design: Design | null;
  draft: Design | null;
  branches: { name: string; address: string | null }[];
  assets: { id: string; kind: string; data: string }[];
};

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(text: string): Uint8Array | null {
  try {
    const s = atob(text);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function exportBusiness(db: D1Database, businessId: string, from: string): Promise<TransferFile | null> {
  const b = await db
    .prepare(
      `SELECT b.id, b.name, b.reward, b.target, b.color, b.reward_mode, b.reward_expiry_days, b.staff_adjust, b.social, b.birthdays,
         b.currency, b.owner_designs, b.program, b.cashback_bp, b.cashback_min, b.avg_cap, b.design_draft, u.email AS owner_email
       FROM businesses b LEFT JOIN users u ON u.id = b.owner WHERE b.id = ?`,
    )
    .bind(businessId)
    .first<BusinessRow>();
  if (!b) return null;
  const design = (await publishedDesign(db, businessId))?.design ?? null;
  let draft: Design | null = null;
  try {
    draft = b.design_draft ? sanitizeDesign(JSON.parse(b.design_draft)) : null;
  } catch {
    draft = null;
  }
  const ids = [...new Set([...(design ? assetIds(design) : []), ...(draft ? assetIds(draft) : [])])];
  const assets: TransferFile["assets"] = [];
  for (const id of ids) {
    const row = await db.prepare("SELECT id, kind, data FROM assets WHERE id = ? AND business = ?").bind(id, businessId).first<{ id: string; kind: string; data: ArrayBuffer }>();
    if (row) assets.push({ id: row.id, kind: row.kind, data: toBase64(new Uint8Array(row.data)) });
  }
  const branches = await db
    .prepare("SELECT name, address FROM branches WHERE business = ? AND archived IS NULL ORDER BY created")
    .bind(businessId)
    .all<{ name: string; address: string | null }>();
  const { id: _id, design_draft: _draft, owner_email, ...business } = b;
  return {
    format: TRANSFER_FORMAT, version: TRANSFER_VERSION, exported: new Date().toISOString(), from,
    business, ownerEmail: owner_email, design, draft: draft && JSON.stringify(draft) !== JSON.stringify(design) ? draft : null,
    branches: branches.results, assets,
  };
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, min: number, max: number, fallback: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fallback;

export type ImportResult = { ok: true; id: string; name: string; ownerEmail: string | null; pictures: number } | { ok: false; code: string };

/** Creates the business from an exported file, owned by `adminId`. New ids for everything, so a file can be imported twice. */
export async function importBusiness(db: D1Database, adminId: string, input: unknown): Promise<ImportResult> {
  const f = input as Partial<TransferFile> | null;
  if (!f || f.format !== TRANSFER_FORMAT || f.version !== TRANSFER_VERSION || !f.business || typeof f.business !== "object") return { ok: false, code: "bad_file" };
  const s = f.business as Record<string, unknown>;
  const program = s.program === "cashback" || s.program === "average" ? s.program : "stamps";
  const name = text(s.name, 80);
  const reward = text(s.reward, 160);
  const target = int(s.target, 2, program === "average" ? AVG_TARGET_MAX : 30, 0);
  const color = typeof s.color === "string" && COLOR.test(s.color) ? s.color : "";
  if (!name || !reward || !target || !color) return { ok: false, code: "bad_details" };

  // Pictures: new ids, checked as images like an upload.
  const files = Array.isArray(f.assets) ? f.assets.slice(0, ASSETS_MAX) : [];
  const idMap = new Map<string, string>();
  const pictures: { id: string; kind: string; mime: string; width: number; height: number; bytes: Uint8Array }[] = [];
  for (const a of files) {
    if (!a || typeof a.id !== "string" || !UUID.test(a.id) || typeof a.data !== "string") continue;
    const bytes = fromBase64(a.data);
    if (!bytes || !bytes.length || bytes.length > ASSET_MAX) continue;
    const info = imageInfo(bytes);
    if (!info) continue;
    const id = crypto.randomUUID();
    idMap.set(a.id, id);
    pictures.push({ id, kind: text(a.kind, 20) || "logo", mime: info.mime, width: info.width, height: info.height, bytes });
  }
  // The design with the new picture ids; a picture that did not come along is dropped by sanitizeDesign's checks.
  const remap = (d: unknown): Design | null => {
    if (!d) return null;
    let json = JSON.stringify(d);
    for (const [from, to] of idMap) json = json.split(from).join(to);
    const design = sanitizeDesign(JSON.parse(json));
    if (!design) return null;
    // Ids of pictures that were not in the file point nowhere here: clear them.
    const known = new Set(idMap.values());
    const missing = assetIds(design).filter((x) => !known.has(x));
    if (!missing.length) return design;
    let clean = JSON.stringify(design);
    for (const m of missing) clean = clean.split(`"${m}"`).join("null");
    return sanitizeDesign(JSON.parse(clean));
  };
  const design = remap(f.design);
  const draft = remap(f.draft);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sys = await getSettings(db);
  const setupUntil = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const parsed = normalizeSocial(parseSocial(typeof s.social === "string" ? s.social : null));
  const social = parsed.ok && Object.keys(parsed.value).length ? parsed.value : null;
  const branches = (Array.isArray(f.branches) ? f.branches : []).slice(0, 50)
    .map((x) => ({ name: text(x?.name, 60), address: text(x?.address, 160) || null }))
    .filter((x) => x.name);
  if (!branches.length) branches.push({ name, address: null });

  await db.batch([
    db.prepare(
      `INSERT INTO businesses(id, owner, name, reward, target, color, created, join_code, reward_mode, reward_expiry_days, staff_adjust,
         social, birthdays, currency, owner_designs, program, cashback_bp, cashback_min, avg_cap, comp_until, design_draft)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, adminId, name, reward, target, color, now, randomCode(10),
      program === "average" ? "bank" : s.reward_mode === "block" ? "block" : "bank",
      int(s.reward_expiry_days, 0, 3650, 0), s.staff_adjust === 0 ? 0 : 1,
      social ? JSON.stringify(social) : null, s.birthdays === 0 ? 0 : 1,
      s.currency === "USD" ? "USD" : "ILS", s.owner_designs === 1 ? 1 : 0, program,
      int(s.cashback_bp, BP_MIN, BP_MAX, 200), int(s.cashback_min, 0, AMOUNT_MAX, 0), int(s.avg_cap, 0, AMOUNT_MAX, 0),
      setupUntil, draft ? JSON.stringify(draft) : null,
    ),
    db.prepare("INSERT INTO memberships(id, business, user, role, created) VALUES(?, ?, ?, 'owner', ?)").bind(crypto.randomUUID(), id, adminId, now),
    ...branches.map((br) => db.prepare("INSERT INTO branches(id, business, name, address, created) VALUES(?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, br.name, br.address, now)),
    ...(sys.requireSubscription ? [db.prepare("INSERT OR IGNORE INTO subscriptions(business, status, updated) VALUES(?, 'none', ?)").bind(id, now)] : []),
  ]);
  // Pictures one by one (each can be hundreds of KB), then the design that points at them.
  for (const p of pictures) {
    await db
      .prepare("INSERT INTO assets(id, business, kind, mime, width, height, bytes, data, created, created_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p.id, id, p.kind, p.mime, p.width, p.height, p.bytes.length, p.bytes, now, adminId)
      .run();
  }
  if (design) {
    await db.prepare("INSERT INTO card_designs(id, business, version, data, published, published_by) VALUES(?, ?, 1, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, JSON.stringify(design), now, adminId).run();
  }
  return { ok: true, id, name, ownerEmail: typeof f.ownerEmail === "string" ? f.ownerEmail.slice(0, 200) : null, pictures: pictures.length };
}
