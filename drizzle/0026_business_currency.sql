-- The currency a business pays in: ILS for Israel (and every business from before), USD abroad.
-- Set from the visitor's country when the business is created (lib/server/region.ts).
ALTER TABLE businesses ADD COLUMN currency TEXT NOT NULL DEFAULT 'ILS';
