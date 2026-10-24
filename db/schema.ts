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
    // 1 = staff may correct a card's stamp count (always with a reason, always logged).
    staffAdjust: integer("staff_adjust").notNull().default(1),
    // 'bank' = a full card saves a reward and starts a new round; 'block' = redeem before collecting more.
    rewardMode: text("reward_mode").notNull().default("block"),
    // Days a saved reward stays valid (0 = no expiry). Applies to rewards earned after the change.
    rewardExpiryDays: integer("reward_expiry_days").notNull().default(0),
    // 1 = ask customers for a birthday (day and month) and show upcoming birthdays. Owner setting.
    birthdays: integer("birthdays").notNull().default(1),
    // Set by a platform admin. A suspended business cannot stamp or accept new customers.
    suspended: text("suspended"),
    suspendReason: text("suspend_reason"),
    // Free access granted by a platform admin, until this ISO time. Overrides the subscription.
    compUntil: text("comp_until"),
    // Archived by a platform admin: hidden from owners and staff, data kept, can be restored.
    archived: text("archived"),
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
    // Day and month only, "MM-DD". No year is stored. Optional.
    birthday: text("birthday"),
    // When the customer last opened "Add to Google Wallet". Only these passes get live updates.
    googleWallet: text("google_wallet"),
    source: text("source").notNull().default("staff"),
    // Set when the owner removes the customer. Hidden everywhere, history kept, card link disabled.
    archived: text("archived"),
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
  (t) => [index("events_business_created").on(t.business, t.created), index("events_business_branch").on(t.business, t.branch, t.created)],
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passHash: text("pass_hash").notNull(),
  created: text("created").notNull(),
  // Set by a platform admin. A blocked user cannot sign in and all sessions are ended.
  blocked: text("blocked"),
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
    // Staff tied to one branch record every action there. Null = may work in any branch.
    branch: text("branch"),
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
  branch: text("branch"),
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

// Branches of a business. Customers and cards are shared by all branches;
// every stamp, redemption and correction records the branch where it happened.
export const branches = sqliteTable(
  "branches",
  {
    id: text("id").primaryKey(),
    business: text("business").notNull().references(() => businesses.id),
    name: text("name").notNull(),
    created: text("created").notNull(),
    archived: text("archived"),
  },
  (t) => [index("branches_business").on(t.business)],
);

// Saved rewards (bank mode). One row per earned reward; never deleted.
export const rewards = sqliteTable(
  "rewards",
  {
    // `${requestId}:${n}` so repeating a request can never create a reward twice.
    id: text("id").primaryKey(),
    business: text("business").notNull().references(() => businesses.id),
    customer: text("customer").notNull().references(() => customers.id),
    earned: text("earned").notNull(),
    earnedEvent: text("earned_event").notNull(),
    expires: text("expires"),
    redeemed: text("redeemed"),
    redeemEvent: text("redeem_event"),
  },
  (t) => [index("rewards_customer").on(t.customer, t.redeemed), index("rewards_business").on(t.business, t.redeemed)],
);

// Subscription state per business, written only by the server from the payment provider's callbacks.
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    business: text("business").primaryKey().references(() => businesses.id),
    status: text("status").notNull().default("none"),
    plan: text("plan"),
    externalCustomer: text("external_customer"),
    externalSubscription: text("external_subscription"),
    currentPeriodEnd: text("current_period_end"),
    updated: text("updated").notNull(),
  },
  (t) => [uniqueIndex("subscriptions_external_subscription").on(t.externalSubscription)],
);

/** Every platform-admin action, for accountability. */
export const adminLog = sqliteTable(
  "admin_log",
  {
    id: text("id").primaryKey(),
    admin: text("admin").notNull(),
    business: text("business"),
    action: text("action").notNull(),
    detail: text("detail"),
    created: text("created").notNull(),
  },
  (t) => [index("admin_log_business").on(t.business, t.created)],
);

/** Platform-wide settings (see lib/server/settings.ts). Values are JSON. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated: text("updated").notNull(),
  updatedBy: text("updated_by"),
});

/** One-time password reset links, created by a platform admin. Only the SHA-256 of the token is stored. */
export const passwordResets = sqliteTable("password_resets", {
  id: text("id").primaryKey(),
  user: text("user").notNull().references(() => users.id),
  created: text("created").notNull(),
  createdBy: text("created_by").notNull(),
  expires: text("expires").notNull(),
  used: text("used"),
});
