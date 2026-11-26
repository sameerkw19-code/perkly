import { getD1 } from "../../../../db";
import { liveDesign } from "../../../../lib/server/designs";
import { bookingBusinessById, bookingByManage } from "../../../../lib/server/booking";
import ManageBooking from "./manage-booking";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "התור שלי" };

// A client's own appointment: see it, cancel it or move it (within the business's rules), from the link they got.
export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getD1();
  const bk = await bookingByManage(db, token);
  const b = bk ? await bookingBusinessById(db, bk.business) : null;
  if (!bk || !b || !b.booking_on) return <ManageBooking token={token} business={null} />;
  const design = await liveDesign(db, b);
  return <ManageBooking token={token} business={{ name: b.name, design, key: b.booking_key ?? "", currency: b.currency === "USD" ? "USD" : "ILS" }} />;
}
