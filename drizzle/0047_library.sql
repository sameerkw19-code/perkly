-- The library card (fifth kind of card): books on loan, return dates, reminders, extensions.
CREATE TABLE loans (
  id TEXT PRIMARY KEY NOT NULL,
  business TEXT NOT NULL,
  customer TEXT NOT NULL,
  title TEXT NOT NULL,
  -- The return date in Israel ("2026-12-03").
  due TEXT NOT NULL,
  extensions INTEGER NOT NULL DEFAULT 0,
  -- Reminders already sent (or skipped): w = a week before, d1 = the day before, d0 = the return day.
  sent TEXT,
  created TEXT NOT NULL,
  returned TEXT
);
CREATE INDEX loans_open ON loans(customer, returned);
CREATE INDEX loans_due ON loans(due) WHERE returned IS NULL;
CREATE INDEX loans_business ON loans(business, created);
-- The librarian's settings: loan length (days), one extension (days), extensions per book.
ALTER TABLE businesses ADD COLUMN loan_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE businesses ADD COLUMN loan_ext_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE businesses ADD COLUMN loan_max_ext INTEGER NOT NULL DEFAULT 2;
-- The reader's link to see their books and extend them (on the wallet pass). Random, made at the first loan.
ALTER TABLE customers ADD COLUMN loan_key TEXT;
CREATE UNIQUE INDEX customers_loan_key ON customers(loan_key);
