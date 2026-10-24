ALTER TABLE `businesses` ADD `suspended` text;
--> statement-breakpoint
ALTER TABLE `businesses` ADD `suspend_reason` text;
--> statement-breakpoint
ALTER TABLE `businesses` ADD `comp_until` text;
--> statement-breakpoint
CREATE TABLE `admin_log` (
	`id` text PRIMARY KEY NOT NULL,
	`admin` text NOT NULL,
	`business` text,
	`action` text NOT NULL,
	`detail` text,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_log_business` ON `admin_log` (`business`,`created`);
