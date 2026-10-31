-- A customer's history (the card page, free places, the activity list) is read by customer.
CREATE INDEX IF NOT EXISTS `events_customer` ON `events` (`customer`, `created`);
