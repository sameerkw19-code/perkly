-- Changing the sign-in email: a 6-digit code goes to the new address, and the change happens only after it is entered.
CREATE TABLE IF NOT EXISTS `email_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL REFERENCES `users`(`id`),
	`new_email` text NOT NULL,
	`code_hash` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`attempts` integer NOT NULL DEFAULT 0,
	`used` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_changes_user` ON `email_changes` (`user`);
