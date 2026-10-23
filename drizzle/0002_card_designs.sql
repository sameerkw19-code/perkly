CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`data` blob NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`business`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_business` ON `assets` (`business`);--> statement-breakpoint
CREATE TABLE `card_designs` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`published` text NOT NULL,
	`published_by` text NOT NULL,
	FOREIGN KEY (`business`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_designs_version` ON `card_designs` (`business`,`version`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `design_draft` text;