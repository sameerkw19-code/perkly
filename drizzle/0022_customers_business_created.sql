-- The customer list is read newest first per business.
CREATE INDEX IF NOT EXISTS `customers_business_created` ON `customers` (`business`, `created`);
