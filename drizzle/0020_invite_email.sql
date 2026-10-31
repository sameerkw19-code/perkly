-- A staff invite is for one email address: only an account with that email can use it.
ALTER TABLE `invites` ADD `email` text;
--> statement-breakpoint
-- When a customer's personal details were erased on request (name, phone, birthday removed for good).
ALTER TABLE `customers` ADD `erased` text;
