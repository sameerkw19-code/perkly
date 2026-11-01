-- Yearly plan: the counter kit is included and shipped after the first yearly payment.
-- kit_due: when the business became owed a kit (set once, by the payment webhook).
-- kit_sent: when an admin marked it as shipped.
ALTER TABLE businesses ADD COLUMN kit_due TEXT;
ALTER TABLE businesses ADD COLUMN kit_sent TEXT;
