-- A second lock-screen line for the evening, the hours each one starts (Israel time),
-- and which one the iPhones were last sent, so the job switches each card once.
ALTER TABLE businesses ADD COLUMN near_text_evening TEXT;
ALTER TABLE businesses ADD COLUMN near_morning_from INTEGER NOT NULL DEFAULT 6;
ALTER TABLE businesses ADD COLUMN near_evening_from INTEGER NOT NULL DEFAULT 16;
ALTER TABLE businesses ADD COLUMN near_phase TEXT;
