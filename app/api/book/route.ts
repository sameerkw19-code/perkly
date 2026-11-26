import { getD1 } from "../../../db";
import { clientIp, fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { normalizePhone } from "../../../lib/phone";
import { businessAccess, freeLimitReached } from "../../../lib/server/billing";
import { getSettings } from "../../../lib/server/settings";
import { validDate } from "../../../lib/library";
import { clientMayChange, NOTE_MAX, pickServices } from "../../../lib/booking";
import {
  activeStaff, bookingBusinessById, bookingBusinessByKey, bookingByManage, createBooking, customerForPhone, israelDateTime, manageSecret,
  moveBooking, openDays, parseBookServices, rulesOf, setStatus, syncCard, freeOn, type BookingBusiness,
} from "../../../lib/server/booking";
import { israelDate } from "../../../lib/library";

export const dynamic = "force-dynamic";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Upcoming appointments one client may hold from the booking page at once. */
const CLIENT_OPEN_MAX = 3;
/** Days shown on the booking page's day strip at most. */
const STRIP_MAX = 60;

function serviceIds(v: string | null): string[] {
  return (v ?? "").split(",").filter(Boolean).slice(0, 10);
}

/**
 * Public booking. GET ?key=… with services (comma ids) and staff: the days with free times, or with date=…: the free times.
 * GET ?m=<secret>: one appointment, for the client's own link.
 */
export async function GET(request: Request) {
  const db = getD1();
  const url = new URL(request.url);
  const ip = clientIp(request);
  if (!(await allow(db, `book-get:${ip}`, 240, 600))) return fail("rate_limited", 429);
  const now = new Date();

  const m = url.searchParams.get("m");
  if (m) {
    const bk = await bookingByManage(db, m);
    const b = bk ? await bookingBusinessById(db, bk.business) : null;
    if (!bk || !b || !b.booking_on) return fail("not_found", 404);
    const staff = (await activeStaff(db, b.id)).find((s) => s.id === bk.staff);
    return json({
      booking: { ...israelDateTime(bk.start), status: bk.status, minutes: bk.minutes, price: bk.price, services: JSON.parse(bk.services), staff: staff?.name ?? null, staffId: bk.staff },
      canChange: (bk.status === "confirmed" || bk.status === "pending") && clientMayChange(bk.start, now.getTime(), b.booking_cancel_hours),
      cancelHours: b.booking_cancel_hours, key: b.booking_key,
    });
  }

  const b = await bookingBusinessByKey(db, url.searchParams.get("key") ?? "");
  if (!b) return fail("not_found", 404);
  const picked = pickServices(parseBookServices(b.services), serviceIds(url.searchParams.get("services")));
  if (!picked) return fail("bad_details", 400, "Pick a service");
  const staff = url.searchParams.get("staff") ?? "";
  const skip = url.searchParams.get("move");
  // Moving: the client's own appointment does not block its own time.
  const skipBooking = skip ? (await bookingByManage(db, skip))?.id : undefined;
  const q = { business: b, minutes: picked.minutes, serviceIds: picked.list.map((s) => s.id), staff, now, skipBooking };
  const date = url.searchParams.get("date");
  if (date) {
    if (!validDate(date)) return fail("bad_details", 400);
    const f = await freeOn(db, { ...q, date });
    return json({ date, times: f.times });
  }
  const today = israelDate(now);
  return json({ today, days: await openDays(db, q, today, Math.min(STRIP_MAX, b.booking_days + 1)) });
}

/** Public booking: book (a client of the business picks a time), and the client's own cancel and move. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  if (!body) return fail("bad_request", 400);
  const db = getD1();
  const ip = clientIp(request);
  if (!(await allow(db, `book-ip:${ip}`, 12, 600))) return fail("rate_limited", 429, "Too many attempts");
  if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");
  const now = new Date();
  const nowIso = now.toISOString();

  if (body.action === "cancel" || body.action === "move") {
    const bk = await bookingByManage(db, typeof body.m === "string" ? body.m : "");
    const b = bk ? await bookingBusinessById(db, bk.business) : null;
    if (!bk || !b || !b.booking_on) return fail("not_found", 404);
    if (bk.status !== "confirmed" && bk.status !== "pending") return fail("booking_closed", 409, "This appointment is no longer active");
    if (!clientMayChange(bk.start, now.getTime(), b.booking_cancel_hours)) return fail("booking_too_late", 409, "Too late to change online");
    if (body.action === "cancel") {
      if (!(await setStatus(db, bk.id, ["pending", "confirmed"], "cancelled", nowIso, "client"))) return fail("booking_closed", 409);
      await syncCard(db, bk.customer, now, bk.status === "confirmed" ? { kind: "cancelled", start: bk.start } : undefined);
      return json({ ok: true });
    }
    const date = typeof body.date === "string" && validDate(body.date) ? body.date : null;
    const time = typeof body.time === "string" && TIME.test(body.time) ? body.time : null;
    if (!date || !time) return fail("bad_details", 400);
    const status = b.booking_auto ? "confirmed" : "pending";
    const moved = await moveBooking(db, b, bk, date, time, bk.staff, now, false, status);
    if (!moved) return fail("slot_taken", 409, "This time was just taken");
    await syncCard(db, bk.customer, now, { kind: status === "confirmed" ? "moved" : "pending", start: moved.start });
    return json({ ok: true, status, ...israelDateTime(moved.start) });
  }

  if (body.action !== "book") return fail("bad_request", 400);
  const b: BookingBusiness | null = await bookingBusinessByKey(db, typeof body.key === "string" ? body.key : "");
  if (!b) return fail("not_found", 404, "Booking is not available");
  if (!(await allow(db, `book-business:${b.id}`, 300, 3600))) return fail("rate_limited", 429);
  const access = await businessAccess(db, b.id);
  if (!access.ok) return fail(access.code, 402, "This business is not taking bookings right now");

  const name = str(body.name, 80);
  const phone = normalizePhone(body.phone);
  if (!name || !phone) return fail("bad_details", 400, "Invalid name or phone");
  if (body.terms !== true) return fail("terms_required", 400, "Terms must be accepted");
  const picked = pickServices(parseBookServices(b.services), body.services);
  if (!picked) return fail("bad_details", 400, "Pick a service");
  const date = typeof body.date === "string" && validDate(body.date) ? body.date : null;
  const time = typeof body.time === "string" && TIME.test(body.time) ? body.time : null;
  if (!date || !time) return fail("bad_details", 400, "Pick a time");
  const staff = typeof body.staff === "string" ? body.staff.slice(0, 64) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, NOTE_MAX) || null : null;
  if (!(await allow(db, `book-phone:${b.id}:${phone}`, 6, 3600))) return fail("rate_limited", 429);

  // The client's card at the business (new number: a new card, and a new customer counts toward the free plan).
  const known = await db.prepare("SELECT id FROM customers WHERE business = ? AND phone = ? AND archived IS NULL").bind(b.id, phone).first<{ id: string }>();
  if (!known && freeLimitReached(access)) return fail("subscription_required", 402, "This business is not taking new clients right now");
  if (known) {
    const open = await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE customer = ? AND status IN ('pending','confirmed') AND start > ?").bind(known.id, nowIso).first<{ n: number }>();
    if ((open?.n ?? 0) >= CLIENT_OPEN_MAX) return fail("booking_limit", 409, "Too many upcoming appointments");
  }
  const customer = known ? { id: known.id, created: false as const } : await customerForPhone(db, b, name, phone, { terms: true, marketing: body.marketing === true }, "booking");
  const status = rulesOf(b).auto ? "confirmed" : "pending";
  const { secret, hash } = await manageSecret();
  const made = await createBooking(db, {
    business: b, customer: customer.id, date, time, services: picked.list, minutes: picked.minutes, price: picked.price,
    staff, status, source: "online", note, actor: null, now, manageHash: hash,
  });
  if (!made) return fail("slot_taken", 409, "This time was just taken");
  await syncCard(db, customer.id, now, { kind: status === "confirmed" ? "booked" : "pending", start: made.start });
  return json({
    ok: true, status, ...israelDateTime(made.start),
    manage: `/book/m/${secret}`,
    ...("secret" in customer && customer.secret ? { cardPath: `/c/${customer.secret}?welcome=1` } : {}),
  });
}
