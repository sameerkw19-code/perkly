// Platform-wide settings, changed only from the admin control center.

export type Settings = {
  /** New business owners can create an account and a business. Staff invites always work. */
  signupsOpen: boolean;
  /** Maintenance: nothing changes (no stamps, no sign-ups) except for platform admins. Cards stay visible. */
  maintenance: boolean;
  maintenanceMessage: string;
  /** A message shown at the top of every business dashboard. Empty = none. */
  announcement: string;
  /** New businesses need a subscription after a free trial. Existing businesses are not affected. */
  requireSubscription: boolean;
  trialDays: number;
};

export const DEFAULT_SETTINGS: Settings = {
  signupsOpen: true,
  maintenance: false,
  maintenanceMessage: "",
  announcement: "",
  requireSubscription: false,
  trialDays: 14,
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

/** Validates one value. Returns undefined when invalid, so bad input never reaches the database. */
export function cleanSetting<K extends keyof Settings>(key: K, value: unknown): Settings[K] | undefined {
  const d = DEFAULT_SETTINGS[key];
  if (typeof d === "boolean") return (typeof value === "boolean" ? value : undefined) as Settings[K] | undefined;
  if (typeof d === "number") {
    return (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 365 ? value : undefined) as Settings[K] | undefined;
  }
  if (typeof value !== "string") return undefined;
  return value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300) as Settings[K];
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const rows = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows.results) {
    if (!(KEYS as string[]).includes(r.key)) continue;
    try {
      const v = cleanSetting(r.key as keyof Settings, JSON.parse(r.value));
      if (v !== undefined) (out as Record<string, unknown>)[r.key] = v;
    } catch {
      // A broken value falls back to the default.
    }
  }
  return out;
}

/** Saves the given settings and logs each change. Returns the keys that were rejected. */
export async function saveSettings(db: D1Database, patch: Record<string, unknown>, adminEmail: string): Promise<string[]> {
  const now = new Date().toISOString();
  // All or nothing: if any key is unknown or invalid, nothing is saved.
  const rejected = Object.entries(patch)
    .filter(([k, raw]) => !(KEYS as string[]).includes(k) || cleanSetting(k as keyof Settings, raw) === undefined)
    .map(([k]) => k);
  if (rejected.length) return rejected;
  const statements: D1PreparedStatement[] = [];
  for (const [k, raw] of Object.entries(patch)) {
    const v = cleanSetting(k as keyof Settings, raw)!;
    statements.push(
      db.prepare(
        `INSERT INTO settings(key, value, updated, updated_by) VALUES(?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated, updated_by = excluded.updated_by`,
      ).bind(k, JSON.stringify(v), now, adminEmail),
      db.prepare("INSERT INTO admin_log(id, admin, business, action, detail, created) VALUES(?, ?, NULL, 'setting', ?, ?)")
        .bind(crypto.randomUUID(), adminEmail, `${k} = ${JSON.stringify(v).slice(0, 120)}`, now),
    );
  }
  if (statements.length) await db.batch(statements);
  return [];
}
