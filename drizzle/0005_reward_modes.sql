CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`customer` text NOT NULL,
	`earned` text NOT NULL,
	`earned_event` text NOT NULL,
	`expires` text,
	`redeemed` text,
	`redeem_event` text,
	FOREIGN KEY (`business`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rewards_customer` ON `rewards` (`customer`,`redeemed`);--> statement-breakpoint
CREATE INDEX `rewards_business` ON `rewards` (`business`,`redeemed`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `reward_mode` text DEFAULT 'block' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `reward_expiry_days` integer DEFAULT 0 NOT NULL;