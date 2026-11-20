-- The appointments card: what it adds besides the next appointment (the owner's choice):
-- none, a gift punch card (a stamp per visit), points per visit, or a percentage of the payment as balance.
ALTER TABLE businesses ADD COLUMN appt_extra TEXT NOT NULL DEFAULT 'none';
ALTER TABLE businesses ADD COLUMN appt_points INTEGER NOT NULL DEFAULT 10;
-- The clinic's calendar: working hours per weekday (JSON, Sunday first; null = closed) and the length of a slot in minutes.
ALTER TABLE businesses ADD COLUMN work_hours TEXT;
ALTER TABLE businesses ADD COLUMN appt_slot INTEGER NOT NULL DEFAULT 30;
-- The clinic's services (JSON: [{ id, name, min }]), and the service and length of the customer's next appointment.
ALTER TABLE businesses ADD COLUMN services TEXT;
ALTER TABLE customers ADD COLUMN appt_service TEXT;
ALTER TABLE customers ADD COLUMN appt_min INTEGER;
