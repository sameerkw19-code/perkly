import { json, fail } from "../../../../lib/server/http";
import { adminRequest } from "../../../../lib/server/admin-api";
import { getSettings, saveSettings, settingsForAdmin as forAdmin } from "../../../../lib/server/settings";
import { hashPassword } from "../../../../lib/server/crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const a = await adminRequest(request, { mutate: false });
  if ("error" in a) return a.error;
  return json(forAdmin(await getSettings(a.db)));
}

// POST { settings: { key: value, ... } } — only known keys with valid values are saved; each change is logged.
export async function POST(request: Request) {
  const a = await adminRequest(request, { mutate: true });
  if ("error" in a) return a.error;
  const patch = a.body.settings;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return fail("bad_request", 400);
  const changes = { ...(patch as Record<string, unknown>) };
  // The free-access code comes in as text and is saved only as a hash ("" removes it).
  delete changes.freeCodeHash;
  if ("freeCode" in changes) {
    const code = typeof changes.freeCode === "string" ? changes.freeCode.trim() : null;
    delete changes.freeCode;
    if (code === null || (code && (code.length < 6 || code.length > 64))) return fail("bad_details", 400, "The code must be 6–64 characters");
    changes.freeCodeHash = code ? await hashPassword(code) : "";
  }
  const rejected = await saveSettings(a.db, changes, a.user.email);
  if (rejected.length) return fail("bad_details", 400, `Invalid: ${rejected.join(", ")}`);
  return json({ ok: true, settings: forAdmin(await getSettings(a.db)) });
}
