-- WhatsApp reminders: switched on per business by the admin (off by default); a client can opt out.
ALTER TABLE businesses ADD COLUMN wa_on INTEGER;
ALTER TABLE customers ADD COLUMN wa_off TEXT;
-- Messages waiting to go out (and their result). The id makes each reminder go out once.
CREATE TABLE wa_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  business TEXT NOT NULL,
  customer TEXT NOT NULL,
  phone TEXT NOT NULL,
  template TEXT NOT NULL,
  lang TEXT NOT NULL,
  params TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  tries INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  wa_id TEXT,
  not_before TEXT NOT NULL,
  expires TEXT NOT NULL,
  created TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX wa_outbox_due ON wa_outbox(status, not_before);
CREATE INDEX wa_outbox_business ON wa_outbox(business, created);
CREATE INDEX wa_outbox_waid ON wa_outbox(wa_id);
