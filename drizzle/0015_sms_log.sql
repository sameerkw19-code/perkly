-- Text messages sent from the messages page (through Pulseem): who sent, to how many, and the result.
CREATE TABLE `sms_log` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL REFERENCES `businesses`(`id`),
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`audience` text NOT NULL,
	`recipients` integer NOT NULL,
	`test` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `sms_log_business_created` ON `sms_log` (`business`, `created`);
