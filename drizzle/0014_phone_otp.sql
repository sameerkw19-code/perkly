-- Optional phone verification at sign-in. A user with a phone gets a one-time code by SMS after the password.
ALTER TABLE `users` ADD `phone` text;
--> statement-breakpoint
CREATE TABLE `login_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL REFERENCES `users`(`id`),
	`code_hash` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`attempts` integer NOT NULL DEFAULT 0,
	`used` text
);
