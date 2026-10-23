import { sqliteTable, text, integer, uniqueIndex, index, blob } from "drizzle-orm/sqlite-core";

// Businesses. `owner` is kept only for data created under the old ChatGPT Sites pilot;
// access is decided by `memberships`, never by this column.
export const businesses = sqliteTable(
  "businesses",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    reward: text("reward").notNull(),
    target: integer("target").notNull(),
    color: text("color").notNull(),
    created: text("created").notNull(),
    joinCode: text("join_code"),
    // Card design being edited (JSON). Customers only ever see a published version (card_designs).
    designDraft: text("design_draft"),
  },
  (t) => [uniqueIndex("businesses_join_code").on(t.joinCode)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    business: text("business").notNull().references(() => businesses.id),
    name: text("name").notNull(),
    // Normalized phone, e.g. +972501234567. See lib/server/phone.ts.
    phone: text("phone").notNull(),
    // Legacy column from the pilot. New rows store the scan code here as well.
    token: text("token").notNull().unique(),
    stamps: integer("stamps").notNull().default(0),
    // Stamps needed for the current round. Fixed per card until the next redemption.
    target: integer("target").notNull(),
    created: text("created").notNull(),
    // SHA-256 of the secret card link. The secret itself is never stored.
    cardHash: text("card_hash"),
    // Value inside the QR that staff scan. Does not open the card.
    scanCode: text("scan_code"),
    consentTerms: text("consent_terms"),
    consentMarketing: integer("consent_marketing").notNull().default(0),
    source: text("source").notNull().default("staff"),
  },
  (t) => [
    uniqueIndex("business_phone").on(t.business, t.phone),
    uniqueIndex("customers_card_hash").on(t.cardHash),
    uniqueIndex("customers_scan_code").on(t.scanCode),
  ],
);

export const events = sqliteTable(
  "events",
  {
    // The request id sent by the client. Reusing it never applies an action twice.
    id: text("id").primaryKey(),
    customer: text("customer").notNull().references(() => customers.id),
    actor: text("actor").notNull(),
    kind: text("kind").notNull(),
    delta: integer("delta").notNull(),
    created: text("created").notNull(),
    business: text("business"),
    branch: text("branch"),
    actorRole: text("actor_role"),
    stampsAfter: integer("stamps_after"),
    note: text("note"),
  },
  (t) => [index("events_business_created").on(t.business, t.created)],
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passHash: text("pass_hash").notNull(),
  created: text("created").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 of the cookie value.
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    created: text("created").notNull(),
    expires: text("expires").notNull(),
  },
  (t) => [index("sessions_user").on(t.user)],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    business: text("business").notNull().references(() => businesses.id),
    user: text("user").notNull().references(() => users.id),
    role: text("role").notNull(), // 'owner' | 'staff'
    created: text("created").notNull(),
    revoked: text("revoked"),
  },
  (t) => [uniqueIndex("membership_unique").on(t.business, t.user)],
);

export const invites = sqliteTable("invites", {
  // SHA-256 of the invite token.
  id: text("id").primaryKey(),
  business: text("business").notNull().references(() => businesses.id),
  role: text("role").notNull(),
  label: text("label"),
  createdBy: text("created_by").notNull(),
  created: text("created").notNull(),
  expires: text("expires").notNull(),
  usedBy: text("used_by"),
  used: text("used"),
  revoked: text("revoked"),
});

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

// Every published card design, kept forever (never edited). The highest version is live.
export const cardDesigns = sqliteTable(
  "card_designs",
  {
    id: text("id").primaryKey(),
    business: text("business").notNull().references(() => businesses.id),
    version: integer("version").notNull(),
    data: text("data").notNull(),
    published: text("published").notNull(),
    publishedBy: text("published_by").notNull(),
  },
  (t) => [uniqueIndex("card_designs_version").on(t.business, t.version)],
);

// Uploaded images (logo, background, stamp image). Stored in D1 for the pilot; size-limited.
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    business: text("business").notNull().references(() => businesses.id),
    kind: text("kind").notNull(), // 'logo' | 'hero' | 'stamp'
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    created: text("created").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [index("assets_business").on(t.business)],
);
