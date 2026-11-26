import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getMembership, getUser, isPlatformAdmin } from "../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { formatPhone, maskPhone, normalizePhone } from "../../../lib/phone";
import { businessAccess, freeLimitReached } from "../../../lib/server/billing";
import { randomCode } from "../../../lib/server/crypto";
import { addDays, israelDate, validDate } from "../../../lib/library";
import { parseHours, SLOT_CHOICES } from "../../../lib/calendar";
import { cleanRules, hoursOn, NOTE_MAX, parseDayHours, pickServices, STAFF_MAX, staffServiceIds } from "../../../lib/booking";
import {
  activeStaff, bookingBusinessById, createBooking, customerForPhone, dayBounds, freeOn, israelDateTime, moveBooking, parseBookServices,
  rulesOf, setStatus, specialsBetween, syncCard, type Booking,
} from "../../../lib/server/booking";

export const dynamic = "force-dynamic";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Actions the staff may do; everything else (the rules, people, services, special days) is the owner's. */
const STAFF_ACTIONS = ["day", "pending", "free", "create", "confirm", "decline", "cancel", "move", "customer"];

function validWeek(v: unknown): v is ([string, string] | null)[] {
  return Array.isArray(v) && v.length === 7 && v.every((d) => d === null || (Array.isArray(d) && d.length === 2 && HM.test(String(d[0])) && HM.test(String(d[1])) && String(d[0]) < String(d[1])));
}

/** The business side of booking: the day's calendar, requests to approve, booking for a client, and the owner's settings. */
export async function POST(request: Request) {
  const p = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  if (!p || typeof p.business !== "string") return fail("bad_request", 400);
  const admin = isPlatformAdmin(user, env);
  const own = await getMembership(db, user.id, p.business);
  const role = admin ? "owner" : own?.role;
  if (!role) return fail("not_found", 404);
  const b = await bookingBusinessById(db, p.business);
  // Booking switched off (or never on): there is nothing here.
  if (!b || b.archived || !b.booking_on) return fail("not_found", 404);
  const action = String(p.action);
  if (role !== "owner" && !STAFF_ACTIONS.includes(action)) return fail("forbidden", 403, "Owner permission required");
  if (!(await allow(db, `booking:${user.id}`, 600, 600))) return fail("rate_limited", 429);
  const now = new Date();
  const nowIso = now.toISOString();
  if (action !== "day" && action !== "pending" && action !== "free") {
    const access = await businessAccess(db, b.id);
    if (!access.ok && access.code === "business_suspended") return fail(access.code, 402, "Business is suspended");
  }
  const loadBooking = async (): Promise<Booking | null> =>
    typeof p.id === "string" ? db.prepare("SELECT * FROM bookings WHERE id = ? AND business = ?").bind(p.id, b.id).first<Booking>() : null;
  const services = parseBookServices(b.services);

  switch (action) {
    case "day": {
      // One day: each person's hours that day, the appointments (with the client), and the special days around it.
      const date = typeof p.date === "string" && validDate(p.date) ? p.date : israelDate(now);
      const staff = await activeStaff(db, b.id);
      const specials = await specialsBetween(db, b.id, date, date);
      const { from, to } = dayBounds(date);
      const { results } = await db
        .prepare(
          `SELECT k.id, k.staff, k.start, k."end", k.minutes, k.price, k.status, k.source, k.note, k.services, k.customer, c.name, c.phone
           FROM bookings k JOIN customers c ON c.id = k.customer
           WHERE k.business = ? AND k.start < ? AND k."end" > ? AND k.status IN ('pending','confirmed','cancelled') ORDER BY k.start`,
        )
        .bind(b.id, to, from)
        .all<Booking & { name: string; phone: string }>();
      const hours = parseHours(b.work_hours);
      return json({
        date, today: israelDate(now), slot: b.appt_slot || 30, services,
        staff: staff.map((s) => ({ id: s.id, name: s.name, hours: hoursOn(date, s, hours, specials), weekly: s.hours ? parseHours(s.hours) : null, services: staffServiceIds(s) })),
        specials,
        bookings: (results ?? []).map((r) => ({
          id: r.id, staff: r.staff, ...israelDateTime(r.start), end: israelDateTime(r.end).time, minutes: r.minutes, price: r.price, status: r.status, source: r.source,
          note: r.note, services: JSON.parse(r.services), customer: r.customer, name: r.name, phone: role === "owner" ? formatPhone(r.phone) : maskPhone(r.phone),
        })),
      });
    }
    case "pending": {
      // Requests from the booking page waiting for the business (only when automatic confirmation is off).
      const { results } = await db
        .prepare(
          `SELECT k.id, k.staff, k.start, k.minutes, k.services, k.note, c.name, c.phone FROM bookings k JOIN customers c ON c.id = k.customer
           WHERE k.business = ? AND k.status = 'pending' AND k.start > ? ORDER BY k.start LIMIT 200`,
        )
        .bind(b.id, nowIso)
        .all<{ id: string; staff: string; start: string; minutes: number; services: string; note: string | null; name: string; phone: string }>();
      return json({
        pending: (results ?? []).map((r) => ({ id: r.id, staff: r.staff, ...israelDateTime(r.start), minutes: r.minutes, services: JSON.parse(r.services), note: r.note, name: r.name, phone: role === "owner" ? formatPhone(r.phone) : maskPhone(r.phone) })),
      });
    }
    case "free": {
      const picked = pickServices(services, p.services);
      const date = typeof p.date === "string" && validDate(p.date) ? p.date : null;
      if (!picked || !date) return fail("bad_details", 400);
      const skip = typeof p.skip === "string" ? p.skip : undefined;
      const f = await freeOn(db, { business: b, date, minutes: p.minutes && Number.isInteger(p.minutes) ? (p.minutes as number) : picked.minutes, serviceIds: picked.list.map((s) => s.id), staff: typeof p.staff === "string" ? p.staff : "", now, asBusiness: true, skipBooking: skip });
      return json({ times: f.times, free: Object.fromEntries(f.free) });
    }
    case "customer": {
      // Find a client by name or phone, to book for them.
      const q = str(p.q, 40);
      if (!q) return json({ customers: [] });
      const phone = normalizePhone(q);
      const { results } = await db
        .prepare(`SELECT id, name, phone FROM customers WHERE business = ? AND archived IS NULL AND (name LIKE ? OR phone = ?) ORDER BY created DESC LIMIT 8`)
        .bind(b.id, `%${q.replace(/[%_]/g, "")}%`, phone ?? "")
        .all<{ id: string; name: string; phone: string }>();
      return json({ customers: (results ?? []).map((c) => ({ id: c.id, name: c.name, phone: role === "owner" ? formatPhone(c.phone) : maskPhone(c.phone) })) });
    }
    case "create": {
      const picked = pickServices(services, p.services);
      const date = typeof p.date === "string" && validDate(p.date) ? p.date : null;
      const time = typeof p.time === "string" && TIME.test(p.time) ? p.time : null;
      if (!picked || !date || !time) return fail("bad_details", 400, "Pick a service and a time");
      let customer: string | null = null;
      let cardPath: string | undefined;
      if (typeof p.customer === "string" && p.customer) {
        const c = await db.prepare("SELECT id FROM customers WHERE id = ? AND business = ? AND archived IS NULL").bind(p.customer, b.id).first<{ id: string }>();
        if (!c) return fail("not_found", 404, "Client not found");
        customer = c.id;
      } else {
        const name = str(p.name, 80);
        const phone = normalizePhone(p.phone);
        if (!name || !phone) return fail("bad_details", 400, "Invalid name or phone");
        const exists = await db.prepare("SELECT id FROM customers WHERE business = ? AND phone = ? AND archived IS NULL").bind(b.id, phone).first<{ id: string }>();
        if (!exists && freeLimitReached(await businessAccess(db, b.id))) return fail("free_limit", 402, "Free customer limit reached");
        const made = await customerForPhone(db, b, name, phone, { terms: false, marketing: false }, "staff");
        customer = made.id;
        if (made.secret) cardPath = `/c/${made.secret}`;
      }
      const note = typeof p.note === "string" ? p.note.trim().slice(0, NOTE_MAX) || null : null;
      const made = await createBooking(db, {
        business: b, customer, date, time, services: picked.list, minutes: picked.minutes, price: picked.price,
        staff: typeof p.staff === "string" ? p.staff : "", status: "confirmed", source: "staff", note, actor: user.id, now, asBusiness: true,
      });
      if (!made) return fail("slot_taken", 409, "This time is taken");
      await syncCard(db, customer, now, { kind: "booked", start: made.start });
      return json({ ok: true, id: made.id, cardPath });
    }
    case "confirm":
    case "decline":
    case "cancel": {
      const bk = await loadBooking();
      if (!bk) return fail("not_found", 404);
      const to = action === "confirm" ? "confirmed" : action === "decline" ? "declined" : "cancelled";
      const from: Booking["status"][] = action === "cancel" ? ["pending", "confirmed"] : ["pending"];
      if (!(await setStatus(db, bk.id, from, to, nowIso, "business"))) return fail("booking_closed", 409, "Already changed");
      // The client hears about it on their card (a pending request that was cancelled is the same as declined).
      const kind = action === "confirm" ? "booked" : bk.status === "pending" ? "declined" : "cancelled";
      if (Date.parse(bk.start) > now.getTime()) await syncCard(db, bk.customer, now, { kind, start: bk.start });
      return json({ ok: true });
    }
    case "move": {
      const bk = await loadBooking();
      if (!bk) return fail("not_found", 404);
      if (bk.status !== "pending" && bk.status !== "confirmed") return fail("booking_closed", 409);
      const date = typeof p.date === "string" && validDate(p.date) ? p.date : null;
      const time = typeof p.time === "string" && TIME.test(p.time) ? p.time : null;
      if (!date || !time) return fail("bad_details", 400);
      const moved = await moveBooking(db, b, bk, date, time, typeof p.staff === "string" ? p.staff : bk.staff, now, true, "confirmed");
      if (!moved) return fail("slot_taken", 409, "This time is taken");
      await syncCard(db, bk.customer, now, { kind: "moved", start: moved.start });
      return json({ ok: true });
    }

    // ---------- The owner's settings ----------
    case "settings": {
      const staff = await activeStaff(db, b.id);
      const today = israelDate(now);
      const specials = (await db.prepare("SELECT id, staff, date, hours, note FROM booking_days WHERE business = ? AND date >= ? ORDER BY date LIMIT 200").bind(b.id, addDays(today, -1)).all()).results ?? [];
      return json({
        key: b.booking_key, rules: rulesOf(b), note: b.booking_note ?? "", hours: parseHours(b.work_hours), slot: b.appt_slot || 30, services,
        staff: staff.map((s) => ({ id: s.id, name: s.name, hours: s.hours ? parseHours(s.hours) : null, services: staffServiceIds(s) })),
        specials,
      });
    }
    case "rules": {
      const r = cleanRules(p, rulesOf(b));
      const note = typeof p.note === "string" ? p.note.trim().slice(0, NOTE_MAX) || null : b.booking_note;
      await db.prepare("UPDATE businesses SET booking_auto = ?, booking_days = ?, booking_notice = ?, booking_cancel_hours = ?, booking_prices = ?, booking_note = ? WHERE id = ?")
        .bind(r.auto ? 1 : 0, r.days, r.notice, r.cancelHours, r.prices ? 1 : 0, note, b.id).run();
      return json({ ok: true, rules: r });
    }
    case "hours": {
      // The business's weekly hours (everyone's, unless a person has their own) and the step between start times.
      if (!validWeek(p.hours)) return fail("bad_details", 400, "Invalid working hours");
      if (!SLOT_CHOICES.includes(p.slot as number)) return fail("bad_details", 400, "Invalid slot length");
      await db.prepare("UPDATE businesses SET work_hours = ?, appt_slot = ? WHERE id = ?").bind(JSON.stringify(p.hours), p.slot, b.id).run();
      return json({ ok: true });
    }
    case "services": {
      // The services: a name, minutes (5 to 480, steps of 5) and a price in agorot/cents (0 = none).
      const list = Array.isArray(p.services) ? (p.services as Record<string, unknown>[]) : null;
      if (!list || list.length > 30) return fail("bad_details", 400, "Invalid services");
      const clean: { id: string; name: string; min: number; price: number }[] = [];
      for (const item of list) {
        const name = str(item?.name, 60);
        const min = item?.min;
        const price = item?.price ?? 0;
        if (!name || !Number.isInteger(min) || (min as number) < 5 || (min as number) > 480 || (min as number) % 5) return fail("bad_details", 400, "Each service needs a name and a length");
        if (!Number.isInteger(price) || (price as number) < 0 || (price as number) > 10_000_000) return fail("bad_details", 400, "Invalid price");
        const sid = typeof item.id === "string" && /^[a-z0-9]{6,16}$/.test(item.id) ? item.id : randomCode(8).toLowerCase();
        clean.push({ id: sid, name, min: min as number, price: price as number });
      }
      await db.prepare("UPDATE businesses SET services = ? WHERE id = ?").bind(clean.length ? JSON.stringify(clean) : null, b.id).run();
      return json({ ok: true, services: clean });
    }
    case "staff_save": {
      // A person clients book with: their name, their own weekly hours (or the business's) and the services they give (or all).
      const name = str(p.name, 60);
      if (!name) return fail("bad_details", 400, "A name is needed");
      const hours = p.hours === null || p.hours === undefined ? null : validWeek(p.hours) ? JSON.stringify(p.hours) : undefined;
      if (hours === undefined) return fail("bad_details", 400, "Invalid working hours");
      const ids = p.services === null || p.services === undefined ? null : Array.isArray(p.services) ? (p.services as unknown[]).filter((x): x is string => typeof x === "string" && services.some((s) => s.id === x)) : null;
      const svc = ids && ids.length ? JSON.stringify(ids) : null;
      if (typeof p.id === "string" && p.id) {
        const r = await db.prepare("UPDATE booking_staff SET name = ?, hours = ?, services = ? WHERE id = ? AND business = ? AND archived IS NULL").bind(name, hours, svc, p.id, b.id).run();
        if (!r.meta.changes) return fail("not_found", 404);
        return json({ ok: true, id: p.id });
      }
      const count = await db.prepare("SELECT COUNT(*) AS n FROM booking_staff WHERE business = ? AND archived IS NULL").bind(b.id).first<{ n: number }>();
      if ((count?.n ?? 0) >= STAFF_MAX) return fail("staff_too_many", 409, "Too many people");
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO booking_staff(id, business, name, hours, services, sort, created) VALUES(?, ?, ?, ?, ?, ?, ?)").bind(id, b.id, name, hours, svc, (count?.n ?? 0) + 1, nowIso).run();
      return json({ ok: true, id });
    }
    case "staff_remove": {
      // A person with upcoming appointments stays until those are moved or cancelled. The last one always stays.
      if (typeof p.id !== "string") return fail("bad_request", 400);
      const staff = await activeStaff(db, b.id);
      if (staff.length <= 1) return fail("staff_last", 409, "At least one calendar is needed");
      const busy = await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE staff = ? AND status IN ('pending','confirmed') AND start > ?").bind(p.id, nowIso).first<{ n: number }>();
      if ((busy?.n ?? 0) > 0) return fail("staff_busy", 409, "This person has upcoming appointments");
      await db.prepare("UPDATE booking_staff SET archived = ? WHERE id = ? AND business = ?").bind(nowIso, p.id, b.id).run();
      return json({ ok: true });
    }
    case "special_save": {
      // A special day: closed (hours null) or short hours, for everyone (staff "") or one person.
      const date = typeof p.date === "string" && validDate(p.date) ? p.date : null;
      if (!date) return fail("bad_details", 400, "Pick a date");
      const staff = typeof p.staff === "string" ? p.staff : "";
      if (staff && !(await activeStaff(db, b.id)).some((s) => s.id === staff)) return fail("not_found", 404);
      const hours = p.hours === null ? null : parseDayHours(JSON.stringify(p.hours));
      if (p.hours !== null && !hours) return fail("bad_details", 400, "Invalid hours");
      const note = typeof p.note === "string" ? p.note.trim().slice(0, 60) || null : null;
      await db
        .prepare(
          `INSERT INTO booking_days(id, business, staff, date, hours, note, created) VALUES(?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(business, staff, date) DO UPDATE SET hours = excluded.hours, note = excluded.note`,
        )
        .bind(crypto.randomUUID(), b.id, staff, date, hours ? JSON.stringify(hours) : null, note, nowIso)
        .run();
      return json({ ok: true });
    }
    case "special_remove": {
      if (typeof p.id !== "string") return fail("bad_request", 400);
      await db.prepare("DELETE FROM booking_days WHERE id = ? AND business = ?").bind(p.id, b.id).run();
      return json({ ok: true });
    }
  }
  return fail("bad_request", 400, "Unknown action");
}
