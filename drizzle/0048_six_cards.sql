-- Six more kinds of card: prepaid pass, gift card, club card, periodic service, one-time coupon, class attendance.
-- The gift card keeps its amount in customers.balance (like the balance card).
-- Owner settings.
ALTER TABLE businesses ADD COLUMN pass_size INTEGER NOT NULL DEFAULT 10;
ALTER TABLE businesses ADD COLUMN pass_days INTEGER NOT NULL DEFAULT 90;
ALTER TABLE businesses ADD COLUMN club_pct INTEGER NOT NULL DEFAULT 10;
ALTER TABLE businesses ADD COLUMN service_months INTEGER NOT NULL DEFAULT 6;
-- The last day the campaign coupon is good ("2026-12-31"), or none.
ALTER TABLE businesses ADD COLUMN coupon_until TEXT;
-- Per customer: entries left on the pass and until when.
ALTER TABLE customers ADD COLUMN pass_left INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN pass_until TEXT;
-- A date on the card with reminders: the next service (with its name) or the next class payment.
ALTER TABLE customers ADD COLUMN due_date TEXT;
ALTER TABLE customers ADD COLUMN due_label TEXT;
-- Reminders already sent for that date (or for the pass's expiry).
ALTER TABLE customers ADD COLUMN due_sent TEXT;
-- When the coupon was used (once).
ALTER TABLE customers ADD COLUMN coupon_used TEXT;
CREATE INDEX customers_due ON customers(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX customers_pass_until ON customers(pass_until) WHERE pass_until IS NOT NULL;
