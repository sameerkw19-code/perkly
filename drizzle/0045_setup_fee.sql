-- Not used: added for a setup fee that was taken back the same day (the columns stay, empty).
-- The one-time setup fee, only for businesses Perkly sets up and designs (in whole agorot / cents; null = none),
-- and when it was paid (Polar order, or marked by hand), with the Polar order id.
ALTER TABLE businesses ADD COLUMN setup_fee INTEGER;
ALTER TABLE businesses ADD COLUMN setup_paid TEXT;
ALTER TABLE businesses ADD COLUMN setup_order TEXT;
