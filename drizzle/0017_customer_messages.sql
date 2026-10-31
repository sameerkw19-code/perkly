-- Wallet messages sent in the background (cron): welcome, birthday and special days.
-- Ids make each message unique: welcome:<customer>, bday:<customer>:<year>, sp:<campaign>:<customer>.
CREATE TABLE `wallet_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`customer` text NOT NULL,
	`kind` text NOT NULL,
	`campaign` text,
	`not_before` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`done` text,
	`result` text
);
--> statement-breakpoint
CREATE INDEX `wallet_outbox_due` ON `wallet_outbox` (`done`, `not_before`);
--> statement-breakpoint
-- A message a business schedules for a special day, sent to every customer with the card in Google Wallet.
CREATE TABLE `special_days` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL REFERENCES `businesses`(`id`),
	`send_at` text NOT NULL,
	`text` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text,
	`queued` text,
	`recipients` integer,
	`canceled` text
);
--> statement-breakpoint
CREATE INDEX `special_days_due` ON `special_days` (`queued`, `send_at`);
--> statement-breakpoint
CREATE INDEX `special_days_business` ON `special_days` (`business`, `send_at`);
--> statement-breakpoint
-- When each background job last ran (e.g. the birthday check, once a day).
CREATE TABLE `job_runs` (
	`name` text PRIMARY KEY NOT NULL,
	`last` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_birthday` ON `customers` (`birthday`);
