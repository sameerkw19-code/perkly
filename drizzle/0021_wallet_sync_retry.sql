-- Pass refreshes (a failed update, or a new card design) also go through the outbox; they need the site address for images.
ALTER TABLE `wallet_outbox` ADD `origin` text;
