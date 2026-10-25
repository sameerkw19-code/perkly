CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL REFERENCES `users`(`id`),
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`expires` text NOT NULL,
	`used` text
);
