-- More than one doctor at a vet clinic. The doctors are the clinic's calendars (booking_staff), shared with online booking.
-- An animal's regular doctor, the doctor of its next appointment, and who gave each vaccine or treatment.
ALTER TABLE pets ADD COLUMN vet TEXT;
ALTER TABLE pets ADD COLUMN appt_staff TEXT;
ALTER TABLE pet_care_log ADD COLUMN staff TEXT;
CREATE INDEX pets_appt_staff ON pets(appt_staff, appt_at) WHERE appt_at IS NOT NULL;
