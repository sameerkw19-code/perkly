CREATE TABLE `subscriptions` (
	`business` text PRIMARY KEY NOT NULL REFERENCES `businesses`(`id`),
	`status` text DEFAULT 'none' NOT NULL,
	`plan` text,
	`stripe_customer` text,
	`stripe_subscription` text,
	`current_period_end` text,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_stripe_subscription` ON `subscriptions` (`stripe_subscription`);
