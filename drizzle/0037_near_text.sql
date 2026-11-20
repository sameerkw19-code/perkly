-- The business's own lock-screen line near a branch (Apple Wallet); empty uses the automatic one.
ALTER TABLE businesses ADD COLUMN near_text TEXT;
-- When it last changed, so iPhones fetch the pass again.
ALTER TABLE businesses ADD COLUMN near_updated TEXT;
