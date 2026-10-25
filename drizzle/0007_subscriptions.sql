CREATE TABLE `subscriptions` (
	`business` text PRIMARY KEY NOT NULL REFERENCES `businesses`(`id`),
	`status` text DEFAULT 'none' NOT NULL,
	`plan` text,
	`external_customer` text,
	`external_subscription` text,
	`current_period_end` text,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_external_subscription` ON `subscriptions` (`external_subscription`);
