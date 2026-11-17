-- Cashier (POS) connection: an API key per business (or per branch). Only the hash of the key is kept.
CREATE TABLE IF NOT EXISTS `pos_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL REFERENCES `businesses`(`id`),
	`key_hash` text NOT NULL,
	`label` text NOT NULL,
	`branch` text,
	`created` text NOT NULL,
	`created_by` text,
	`last_used` text,
	`revoked` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `pos_keys_hash` ON `pos_keys` (`key_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pos_keys_business` ON `pos_keys` (`business`);
--> statement-breakpoint
-- Cards change only through the cashier: the staff station shows the card but does not add stamps, purchases or uses.
ALTER TABLE businesses ADD COLUMN pos_only INTEGER NOT NULL DEFAULT 0;
