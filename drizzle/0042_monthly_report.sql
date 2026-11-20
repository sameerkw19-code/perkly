-- The monthly report email: on unless the owner turns it off, and the last month sent (each month once).
ALTER TABLE businesses ADD COLUMN report_email INTEGER NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN report_month TEXT;
