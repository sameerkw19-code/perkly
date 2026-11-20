-- When the customer last got the automatic "we miss you" message (sent once per quiet spell).
ALTER TABLE customers ADD COLUMN missyou_at TEXT;
CREATE INDEX IF NOT EXISTS events_customer_created ON events(customer, created);
