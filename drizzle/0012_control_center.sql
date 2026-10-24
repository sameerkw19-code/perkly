CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
ALTER TABLE `users` ADD `blocked` text;
--> statement-breakpoint
ALTER TABLE `businesses` ADD `archived` text;
