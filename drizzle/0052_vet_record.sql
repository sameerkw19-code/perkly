-- A professional pet record (like a vaccination certificate): colour and markings, microchip, neutered/spayed;
-- each vaccine dose's batch (Lot) number and the date it's valid until; each doctor's licence number; the clinic's
-- address and phone for the certificate's header; and the animal's medical history (dated notes).
ALTER TABLE pets ADD COLUMN color TEXT;
ALTER TABLE pets ADD COLUMN chip TEXT;
-- 1 neutered/spayed, 0 not, null unknown
ALTER TABLE pets ADD COLUMN neutered INTEGER;
ALTER TABLE pet_care_log ADD COLUMN lot TEXT;
ALTER TABLE pet_care_log ADD COLUMN valid_until TEXT;
ALTER TABLE booking_staff ADD COLUMN license TEXT;
-- JSON {"address": "...", "phone": "..."}
ALTER TABLE businesses ADD COLUMN vet_info TEXT;

CREATE TABLE pet_notes (
  id TEXT PRIMARY KEY NOT NULL,
  business TEXT NOT NULL,
  pet TEXT NOT NULL,
  date TEXT NOT NULL,
  -- why they came, what was found and done, and what to do at home
  reason TEXT,
  text TEXT NOT NULL,
  staff TEXT,
  -- 1: the owner sees it in the booklet; 0: the clinic only
  shared INTEGER NOT NULL DEFAULT 1,
  actor TEXT,
  created TEXT NOT NULL,
  archived TEXT
);
CREATE INDEX pet_notes_pet ON pet_notes(pet, archived, date);
