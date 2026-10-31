-- When Polar last changed the stored subscription, so a late or retried webhook cannot undo a newer one.
ALTER TABLE `subscriptions` ADD `changed_at` text;
