-- A branch's place on the map: Apple and Google Wallet show the card on the phone when the customer is near it.
ALTER TABLE branches ADD COLUMN lat REAL;
ALTER TABLE branches ADD COLUMN lng REAL;
-- When the place last changed, so iPhones fetch the pass again.
ALTER TABLE branches ADD COLUMN located TEXT;
