import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db";
import { appleConfig, customerForPass, customerPass, passUpdated, validToken, PKPASS_TYPE } from "../../../../../lib/server/apple-wallet";

export const dynamic = "force-dynamic";

// Apple Wallet web service (PassKit), called by iPhones that saved a pass:
//   POST   v1/devices/<device>/registrations/<passType>/<serial>   register for updates (body: {pushToken})
//   DELETE v1/devices/<device>/registrations/<passType>/<serial>   unregister
//   GET    v1/devices/<device>/registrations/<passType>?passesUpdatedSince=<tag>   serials that changed
//   GET    v1/passes/<passType>/<serial>                           the latest pass
//   POST   v1/log                                                  error messages from Wallet
// Pass calls carry "Authorization: ApplePass <token>"; the token is checked against the serial.

type Ctx = { params: Promise<{ path: string[] }> };
const SAFE = /^[A-Za-z0-9._-]{1,128}$/;
const empty = (status: number) => new Response(null, { status });

async function route(request: Request, { params }: Ctx): Promise<Response> {
  const config = appleConfig(env);
  if (!config) return empty(404);
  const path = (await params).path ?? [];
  const db = getD1();
  const method = request.method;
  if (path[0] !== "v1") return empty(404);

  if (path[1] === "log" && method === "POST") {
    const body = (await request.json().catch(() => null)) as { logs?: unknown } | null;
    if (Array.isArray(body?.logs)) for (const l of body.logs.slice(0, 10)) console.warn("apple wallet:", String(l).slice(0, 300));
    return empty(200);
  }

  if (path[1] === "devices" && path[3] === "registrations") {
    const [, , device, , passType, serial] = path;
    if (!SAFE.test(device ?? "") || passType !== config.passTypeId) return empty(404);
    if (serial !== undefined) {
      if (!SAFE.test(serial) || !(await validToken(config, serial, request.headers.get("authorization")))) return empty(401);
      if (method === "POST") {
        const body = (await request.json().catch(() => null)) as { pushToken?: unknown } | null;
        const token = typeof body?.pushToken === "string" && SAFE.test(body.pushToken) ? body.pushToken : null;
        if (!token || !(await customerForPass(db, serial))) return empty(400);
        // 201 for a new registration, 200 when this device already had it (the push token is refreshed).
        const known = await db.prepare("SELECT 1 FROM apple_registrations WHERE device = ? AND serial = ?").bind(device, serial).first();
        await db
          .prepare("INSERT INTO apple_registrations(device, serial, push_token, created) VALUES(?, ?, ?, ?) ON CONFLICT(device, serial) DO UPDATE SET push_token = excluded.push_token")
          .bind(device, serial, token, new Date().toISOString())
          .run();
        return empty(known ? 200 : 201);
      }
      if (method === "DELETE") {
        await db.prepare("DELETE FROM apple_registrations WHERE device = ? AND serial = ?").bind(device, serial).run();
        return empty(200);
      }
      return empty(405);
    }
    if (method !== "GET") return empty(405);
    const since = new URL(request.url).searchParams.get("passesUpdatedSince") ?? "";
    const regs = await db.prepare("SELECT serial FROM apple_registrations WHERE device = ? LIMIT 200").bind(device).all<{ serial: string }>();
    const changed: string[] = [];
    let last = since;
    for (const { serial } of regs.results) {
      const c = await customerForPass(db, serial);
      if (!c) continue;
      const updated = await passUpdated(db, c);
      if (!since || updated > since) changed.push(serial);
      if (updated > last) last = updated;
    }
    if (!changed.length) return empty(204);
    return Response.json({ serialNumbers: changed, lastUpdated: last });
  }

  if (path[1] === "passes" && method === "GET") {
    const [, , passType, serial] = path;
    if (passType !== config.passTypeId || !SAFE.test(serial ?? "")) return empty(404);
    if (!(await validToken(config, serial, request.headers.get("authorization")))) return empty(401);
    const c = await customerForPass(db, serial);
    if (!c) return empty(404);
    const updated = await passUpdated(db, c);
    const lastModified = new Date(updated).toUTCString();
    const since = request.headers.get("if-modified-since");
    if (since && !Number.isNaN(Date.parse(since)) && Date.parse(since) >= Math.floor(Date.parse(updated) / 1000) * 1000) return empty(304);
    const pass = await customerPass(db, config, c, new URL(request.url).origin);
    return new Response(pass, { headers: { "Content-Type": PKPASS_TYPE, "Last-Modified": lastModified, "Cache-Control": "no-store" } });
  }

  return empty(404);
}

export const GET = route;
export const POST = route;
export const DELETE = route;
