CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`reward` text NOT NULL,
	`target` integer NOT NULL,
	`color` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`token` text NOT NULL,
	`stamps` integer DEFAULT 0 NOT NULL,
	`target` integer NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`business`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_token_unique` ON `customers` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `business_phone` ON `customers` (`business`,`phone`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`customer` text NOT NULL,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`delta` integer NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`customer`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
