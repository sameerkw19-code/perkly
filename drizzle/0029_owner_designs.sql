-- Perkly designs every card by default; a platform admin can let one business's owner edit their own design.
ALTER TABLE businesses ADD COLUMN owner_designs INTEGER NOT NULL DEFAULT 0;
