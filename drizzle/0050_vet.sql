-- The vet's pet file (switched on per business by Perkly, off by default): each client's animals, their weight,
-- vaccines and periodic treatments with reminders, and each animal's next appointment and what it is for.
ALTER TABLE businesses ADD COLUMN vet_on INTEGER NOT NULL DEFAULT 0;
-- The client's own link to their animals' booklet (/p/<key>), random, made with the first animal.
ALTER TABLE customers ADD COLUMN pet_key TEXT;
CREATE UNIQUE INDEX customers_pet_key ON customers(pet_key);

CREATE TABLE pets (
  id TEXT PRIMARY KEY NOT NULL,
  business TEXT NOT NULL,
  customer TEXT NOT NULL,
  name TEXT NOT NULL,
  -- dog, cat, rabbit, bird, rodent, reptile, other
  species TEXT NOT NULL,
  breed TEXT,
  -- "2023-04-10", or only a year and month ("2023-04"), or null
  birth TEXT,
  -- m, f, or null
  sex TEXT,
  -- The latest weight in grams and when it was taken (the history is in pet_weights).
  grams INTEGER,
  weighed TEXT,
  -- The next appointment (UTC ISO), what it is for (vaccine, treatment, visit) and a short note.
  appt_at TEXT,
  appt_kind TEXT,
  appt_note TEXT,
  created TEXT NOT NULL,
  archived TEXT
);
CREATE INDEX pets_customer ON pets(customer, archived);
CREATE INDEX pets_business ON pets(business, archived);
CREATE INDEX pets_appt ON pets(business, appt_at) WHERE appt_at IS NOT NULL;

CREATE TABLE pet_weights (
  id TEXT PRIMARY KEY NOT NULL,
  pet TEXT NOT NULL,
  grams INTEGER NOT NULL,
  date TEXT NOT NULL,
  created TEXT NOT NULL
);
CREATE INDEX pet_weights_pet ON pet_weights(pet, date);

-- Vaccines and periodic treatments: what, when it was last given, every how many months, and when it is due next.
-- Sent: the reminders already sent for this due date (m30 = a month before, d7 = a week before, d1 = the day before).
CREATE TABLE pet_care (
  id TEXT PRIMARY KEY NOT NULL,
  business TEXT NOT NULL,
  pet TEXT NOT NULL,
  -- vaccine or treatment
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  last TEXT,
  months INTEGER,
  next TEXT,
  sent TEXT,
  created TEXT NOT NULL,
  archived TEXT
);
CREATE INDEX pet_care_pet ON pet_care(pet, archived);
CREATE INDEX pet_care_due ON pet_care(next) WHERE archived IS NULL AND next IS NOT NULL;

-- Each time a vaccine or treatment was given (the booklet's history).
CREATE TABLE pet_care_log (
  id TEXT PRIMARY KEY NOT NULL,
  care TEXT NOT NULL,
  pet TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  actor TEXT,
  created TEXT NOT NULL
);
CREATE INDEX pet_care_log_pet ON pet_care_log(pet, date);
