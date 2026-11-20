-- "Bring a friend": stamps each side gets when an invited friend makes a first visit (0 = off).
ALTER TABLE businesses ADD COLUMN referral_stamps INTEGER NOT NULL DEFAULT 0;
-- The customer's own invite code, the customer who invited them (referred_by is the staff member who signed them up), and when the invite was rewarded.
ALTER TABLE customers ADD COLUMN ref_code TEXT;
ALTER TABLE customers ADD COLUMN invited_by TEXT;
ALTER TABLE customers ADD COLUMN referral_paid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS customers_ref_code ON customers(business, ref_code);
