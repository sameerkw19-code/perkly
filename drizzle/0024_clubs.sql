-- Perkly for Clubs: a separate product from the stamp card. A club keeps a list of members,
-- each with a plan and a date the membership is valid until. Members show a card; nobody scans it.
-- businesses.product: 'stamps' (default, every existing business) or 'club'.
ALTER TABLE businesses ADD COLUMN product TEXT NOT NULL DEFAULT 'stamps';
-- The club's logo (an id in assets). Clubs have no card editor.
ALTER TABLE businesses ADD COLUMN club_logo TEXT;

CREATE TABLE club_members (
  id TEXT PRIMARY KEY,
  business TEXT NOT NULL REFERENCES businesses(id),
  -- Shown on the card. Goes up within a club and is never reused.
  member_no INTEGER NOT NULL,
  name TEXT NOT NULL,
  -- Normalized phone, only so the club can send the card link. Never shown on the card.
  phone TEXT,
  plan TEXT,
  -- Last valid day (YYYY-MM-DD, Israel time).
  valid_until TEXT NOT NULL,
  -- SHA-256 of the secret card link. The secret itself is never stored.
  card_hash TEXT,
  -- When the member last opened "Add to Google Wallet". Only these passes get updates.
  google_wallet TEXT,
  -- Set when a pass still needs the latest details (retried by the cron run).
  wallet_dirty TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  -- Set when the club removes the member. Card link stops working.
  archived TEXT
);
CREATE UNIQUE INDEX club_members_no ON club_members(business, member_no);
CREATE UNIQUE INDEX club_members_card ON club_members(card_hash);
CREATE INDEX club_members_dirty ON club_members(wallet_dirty);
