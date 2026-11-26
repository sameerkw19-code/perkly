-- Online booking (a module next to any kind of card, switched on per business by Perkly).
-- Off (0): no booking screens, no booking link, the booking API answers "not found".
ALTER TABLE businesses ADD COLUMN booking_on INTEGER NOT NULL DEFAULT 0;
-- The public booking link (/book/<key>), random, made when booking is first switched on.
ALTER TABLE businesses ADD COLUMN booking_key TEXT;
CREATE UNIQUE INDEX businesses_booking_key ON businesses(booking_key);
-- The rules: confirm online bookings at once (1) or wait for the business (0); how many days ahead a client may book;
-- the shortest notice in minutes; until how many hours before the appointment a client may cancel or move it;
-- whether prices show on the booking page; a short note shown on the booking page.
ALTER TABLE businesses ADD COLUMN booking_auto INTEGER NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN booking_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE businesses ADD COLUMN booking_notice INTEGER NOT NULL DEFAULT 60;
ALTER TABLE businesses ADD COLUMN booking_cancel_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE businesses ADD COLUMN booking_prices INTEGER NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN booking_note TEXT;

-- The people clients book with (a calendar each). Hours: JSON per weekday like businesses.work_hours, NULL = the business's.
-- Services: JSON list of service ids this person gives, NULL = all of them.
CREATE TABLE booking_staff (
  id TEXT PRIMARY KEY NOT NULL,
  business TEXT NOT NULL,
  name TEXT NOT NULL,
  hours TEXT,
  services TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL,
  archived TEXT
);
CREATE INDEX booking_staff_business ON booking_staff(business, archived);

-- Special days (holidays, days off, short days): for the whole business (staff = '') or one person.
-- Hours: JSON ["09:00","13:00"], NULL = closed.
CREATE TABLE booking_days (
  id TEXT PRIMARY KEY NOT NULL,
  business TEXT NOT NULL,
  staff TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  hours TEXT,
  note TEXT,
  created TEXT NOT NULL
);
CREATE UNIQUE INDEX booking_days_unique ON booking_days(business, staff, date);

-- The appointments. A client may have several. Times are UTC ISO; the services are kept as booked (name, minutes, price).
-- Status: pending (waits for the business), confirmed, cancelled, declined. Source: online (the booking page) or staff.
-- manage_hash: the client's own link to see, cancel or move this appointment (sha256 of the secret in the link).
CREATE TABLE bookings (
  id TEXT PRIMARY KEY NOT NULL,
  business TEXT NOT NULL,
  customer TEXT NOT NULL,
  staff TEXT NOT NULL,
  services TEXT NOT NULL,
  start TEXT NOT NULL,
  "end" TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT,
  manage_hash TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  cancelled_by TEXT,
  actor TEXT
);
CREATE INDEX bookings_business_start ON bookings(business, start);
CREATE INDEX bookings_staff_start ON bookings(staff, start);
CREATE INDEX bookings_customer_start ON bookings(customer, start);
CREATE INDEX bookings_pending ON bookings(business, status) WHERE status = 'pending';
CREATE UNIQUE INDEX bookings_manage ON bookings(manage_hash);
