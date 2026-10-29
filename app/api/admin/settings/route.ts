import { json, fail } from "../../../../lib/server/http";
import { adminRequest } from "../../../../lib/server/admin-api";
import { getSettings, saveSettings } from "../../../../lib/server/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const a = await adminRequest(request, { mutate: false });
  if ("error" in a) return a.error;
  return json(await getSettings(a.db));
}

// POST { settings: { key: value, ... } } — only known keys with valid values are saved; each change is logged.
export async function POST(request: Request) {
  const a = await adminRequest(request, { mutate: true });
  if ("error" in a) return a.error;
  const patch = a.body.settings;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return fail("bad_request", 400);
  const rejected = await saveSettings(a.db, patch as Record<string, unknown>, a.user.email);
  if (rejected.length) return fail("bad_details", 400, `Invalid: ${rejected.join(", ")}`);
  return json({ ok: true, settings: await getSettings(a.db) });
}
