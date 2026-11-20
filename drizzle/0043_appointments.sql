-- The appointments card (a fourth kind of card, for clinics): the customer's next appointment,
-- which reminders already went out for it, and the last reminder's text (the iPhone shows it as a notification).
ALTER TABLE customers ADD COLUMN appt_at TEXT;
ALTER TABLE customers ADD COLUMN appt_sent TEXT;
ALTER TABLE customers ADD COLUMN appt_msg TEXT;
ALTER TABLE customers ADD COLUMN appt_updated TEXT;
CREATE INDEX IF NOT EXISTS customers_appt ON customers(appt_at) WHERE appt_at IS NOT NULL;
