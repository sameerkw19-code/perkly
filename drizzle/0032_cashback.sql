-- A second kind of card: a balance card (cashback). Each purchase adds a percentage of the amount to the customer's
-- balance, and the customer uses the balance at the counter. Amounts are in minor units (agorot / cents).
ALTER TABLE businesses ADD COLUMN program TEXT NOT NULL DEFAULT 'stamps';
--> statement-breakpoint
-- Percentage back in basis points: 200 = 2%.
ALTER TABLE businesses ADD COLUMN cashback_bp INTEGER NOT NULL DEFAULT 200;
--> statement-breakpoint
-- The owner's terms: the balance can be used once it reaches this amount (0 = any time).
ALTER TABLE businesses ADD COLUMN cashback_min INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE customers ADD COLUMN balance INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
-- The purchase amount (earn) or the amount used (spend), and the balance after the action.
ALTER TABLE events ADD COLUMN amount INTEGER;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN balance_after INTEGER;
--> statement-breakpoint
-- A third kind of card: buy N, the next one free at the average of those N purchases ("average").
-- The purchases of the current round add up here (minor units); the reward keeps its value.
ALTER TABLE customers ADD COLUMN round_total INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE rewards ADD COLUMN value INTEGER;
--> statement-breakpoint
-- The owner's cap on the free purchase (0 = no cap).
ALTER TABLE businesses ADD COLUMN avg_cap INTEGER NOT NULL DEFAULT 0;
