import { getD1 } from "../../../db";
import { liveDesign } from "../../../lib/server/designs";
import { activeStaff, bookingBusinessByKey, parseBookServices } from "../../../lib/server/booking";
import { staffServiceIds } from "../../../lib/booking";
import BookingFlow from "./booking-flow";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "קביעת תור" };

// The public booking page of a business (only while Perkly has booking switched on for it).
export default async function BookPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = getD1();
  const b = await bookingBusinessByKey(db, key);
  if (!b) return <BookingFlow bookingKey={key} business={null} />;
  const design = await liveDesign(db, b);
  const services = parseBookServices(b.services);
  const staff = (await activeStaff(db, b.id)).map((s) => ({ id: s.id, name: s.name, services: staffServiceIds(s) }));
  return (
    <BookingFlow bookingKey={key} business={{
      name: b.name, design, note: b.booking_note ?? "", cancelHours: b.booking_cancel_hours, prices: !!b.booking_prices,
      currency: b.currency === "USD" ? "USD" : "ILS",
      services: services.map((s) => ({ ...s, price: b.booking_prices ? s.price : 0 })),
      staff,
    }} />
  );
}
