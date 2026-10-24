CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`created` text NOT NULL,
	`business` text NOT NULL,
	`contact` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`kind` text,
	`city` text,
	`kit` integer DEFAULT 0 NOT NULL,
	`note` text,
	`lang` text NOT NULL,
	`consent_marketing` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'new' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leads_created` ON `leads` (`created`);
