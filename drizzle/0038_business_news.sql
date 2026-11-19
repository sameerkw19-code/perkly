-- The latest message to the business's customers, shown on Apple Wallet passes (the iPhone notifies on change).
ALTER TABLE businesses ADD COLUMN news_text TEXT;
ALTER TABLE businesses ADD COLUMN news_at TEXT;
