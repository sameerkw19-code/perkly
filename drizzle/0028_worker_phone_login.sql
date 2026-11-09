-- Staff sign in at the counter with their phone number and date of birth.
-- The phone is the lookup key (one worker per number); the date of birth is kept like a password (PBKDF2 hash).
ALTER TABLE users ADD COLUMN worker_phone TEXT;
ALTER TABLE users ADD COLUMN worker_secret TEXT;
CREATE UNIQUE INDEX users_worker_phone ON users(worker_phone) WHERE worker_phone IS NOT NULL;
