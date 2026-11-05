-- Apple Wallet: the iPhones that saved a customer's pass, so the pass can be refreshed (and pushed later).
-- device: Apple's device library id. serial: the customer id (the pass serial number).
CREATE TABLE IF NOT EXISTS apple_registrations (
  device TEXT NOT NULL,
  serial TEXT NOT NULL,
  push_token TEXT NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (device, serial)
);
CREATE INDEX IF NOT EXISTS apple_registrations_serial ON apple_registrations(serial);
