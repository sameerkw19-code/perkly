-- Sign-in codes by email, trusted devices, and a verified-email mark.
ALTER TABLE `users` ADD `email_verified` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `login_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL REFERENCES `users`(`id`),
	`code_hash` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`attempts` integer NOT NULL DEFAULT 0,
	`used` text
);
--> statement-breakpoint
ALTER TABLE `login_challenges` ADD `sends` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `login_challenges` ADD `last_sent` text;
--> statement-breakpoint
CREATE TABLE `trusted_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL REFERENCES `users`(`id`),
	`created` text NOT NULL,
	`expires` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trusted_devices_user` ON `trusted_devices` (`user`);
