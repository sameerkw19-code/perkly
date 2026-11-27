import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { applyWaStatus, sendText, setWaOptOut, verifyMetaSignature, waConfig } from "../../../../lib/server/whatsapp";
import { waCommand, waFrom } from "../../../../lib/whatsapp.ts";

export const dynamic = "force-dynamic";

// Meta's WhatsApp webhook. GET: Meta checks the verify token once when the webhook is set up. POST (signed with the app
// secret): delivery news for our messages, and clients' replies; "STOP" / "הסר" / "إيقاف" stops their reminders and
// "START" / "הפעל" brings them back.
export async function GET(request: Request) {
  const u = new URL(request.url);
  const token = env.WHATSAPP_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

type Change = {
  value?: {
    statuses?: { id: string; status: string; errors?: { code?: number; title?: string }[] }[];
    messages?: { from: string; type: string; text?: { body?: string }; button?: { text?: string } }[];
  };
};

const REPLY = {
  stop: { he: "הוסרת מתזכורות הוואטסאפ. לחידוש השיבו: הפעל", ar: "تم إيقاف تذكيرات واتساب. للتشغيل من جديد أرسل: تشغيل", en: "You won't get WhatsApp reminders anymore. Reply START to turn them back on." },
  start: { he: "תזכורות הוואטסאפ חודשו.", ar: "تم تشغيل تذكيرات واتساب من جديد.", en: "WhatsApp reminders are back on." },
};

export async function POST(request: Request) {
  if (!env.WHATSAPP_APP_SECRET) return new Response("not configured", { status: 503 });
  const raw = await request.text();
  if (!(await verifyMetaSignature(env.WHATSAPP_APP_SECRET, raw, request.headers.get("x-hub-signature-256")))) return new Response("bad signature", { status: 403 });
  let body: { entry?: { changes?: Change[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const db = getD1();
  const nowIso = new Date().toISOString();
  const cfg = waConfig(env);
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const e = s.errors?.[0];
        await applyWaStatus(db, s.id, s.status, e ? `${e.code ?? ""} ${e.title ?? ""}`.trim().slice(0, 300) : null);
      }
      for (const m of change.value?.messages ?? []) {
        const phone = waFrom(m.from);
        const text = m.text?.body ?? m.button?.text ?? "";
        const cmd = waCommand(text);
        if (!phone || !cmd) continue;
        await setWaOptOut(db, phone, cmd === "stop", nowIso);
        const lang = /[֐-׿]/.test(text) ? "he" : /[؀-ۿ]/.test(text) ? "ar" : "en";
        if (cfg) await sendText(cfg, phone, REPLY[cmd][lang]);
      }
    }
  }
  return new Response("ok");
}
