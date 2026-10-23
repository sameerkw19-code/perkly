CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`role` text NOT NULL,
	`label` text,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`used_by` text,
	`used` text,
	`revoked` text,
	FOREIGN KEY (`business`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`user` text NOT NULL,
	`role` text NOT NULL,
	`created` text NOT NULL,
	`revoked` text,
	FOREIGN KEY (`business`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_unique` ON `memberships` (`business`,`user`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`pass_hash` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `join_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `businesses_join_code` ON `businesses` (`join_code`);--> statement-breakpoint
ALTER TABLE `customers` ADD `card_hash` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `scan_code` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `consent_terms` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `consent_marketing` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `source` text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_card_hash` ON `customers` (`card_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_scan_code` ON `customers` (`scan_code`);--> statement-breakpoint
ALTER TABLE `events` ADD `business` text;--> statement-breakpoint
ALTER TABLE `events` ADD `branch` text;--> statement-breakpoint
ALTER TABLE `events` ADD `actor_role` text;--> statement-breakpoint
ALTER TABLE `events` ADD `stamps_after` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `note` text;--> statement-breakpoint
CREATE INDEX `events_business_created` ON `events` (`business`,`created`);--> statement-breakpoint
-- Data upgrade for rows created during the ChatGPT Sites pilot.
UPDATE `customers` SET `scan_code` = `token` WHERE `scan_code` IS NULL;--> statement-breakpoint
UPDATE OR IGNORE `customers` SET `phone` = '+972' || substr(`phone`, 2) WHERE `phone` GLOB '0[0-9]*' AND length(`phone`) IN (9, 10);--> statement-breakpoint
UPDATE OR IGNORE `customers` SET `phone` = '+' || `phone` WHERE `phone` GLOB '972[0-9]*';--> statement-breakpoint
UPDATE `events` SET `business` = (SELECT `business` FROM `customers` WHERE `customers`.`id` = `events`.`customer`) WHERE `business` IS NULL;
