-- When the business last changed something shown on every card (for now: its links).
-- The iPhones' "has the pass changed" check reads it, so saved passes fetch the new version.
ALTER TABLE businesses ADD COLUMN card_updated TEXT;
