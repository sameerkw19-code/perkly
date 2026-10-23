CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL,
	`archived` text,
	FOREIGN KEY (`business`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `branches_business` ON `branches` (`business`);--> statement-breakpoint
ALTER TABLE `invites` ADD `branch` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `branch` text;--> statement-breakpoint
CREATE INDEX `events_business_branch` ON `events` (`business`,`branch`,`created`);