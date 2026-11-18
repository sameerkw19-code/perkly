-- New businesses work without limits for their first 30 days, then subscribe. Businesses opened in the last
-- 30 days that have no live subscription get the same: free access until 30 days after they were opened.
UPDATE businesses
SET comp_until = strftime('%Y-%m-%dT%H:%M:%fZ', created, '+30 days')
WHERE archived IS NULL
  AND created > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
  AND (comp_until IS NULL OR comp_until < strftime('%Y-%m-%dT%H:%M:%fZ', created, '+30 days'))
  AND id NOT IN (SELECT business FROM subscriptions WHERE status IN ('active', 'trialing'));
