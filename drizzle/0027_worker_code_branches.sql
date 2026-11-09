-- A worker's personal code for signing in at the counter (staff memberships only). Stored hashed.
ALTER TABLE memberships ADD COLUMN worker_code TEXT;
CREATE UNIQUE INDEX memberships_worker_code ON memberships(worker_code) WHERE worker_code IS NOT NULL;

-- Every business is organized by branches; a branch has a name and an address.
ALTER TABLE branches ADD COLUMN address TEXT;
-- Businesses without a branch get one, named after the business (Perkly fills in the address).
INSERT INTO branches(id, business, name, created)
  SELECT lower(hex(randomblob(16))), b.id, b.name, b.created FROM businesses b
  WHERE NOT EXISTS (SELECT 1 FROM branches x WHERE x.business = b.id AND x.archived IS NULL);
