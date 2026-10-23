# Perkly — private loyalty pilot

A mobile-friendly Hebrew, Arabic and English loyalty app, backed by D1.

## Working features
- Create multiple businesses with custom name, card color, reward and stamp threshold.
- Register customers, generate real QR codes, search by name or phone, export CSV.
- Camera scanning using jsQR; scanning selects the customer for an explicit staff action.
- Server-side stamp accumulation and reward redemption, event history and request idempotency.
- Owner-scoped authorization and origin validation for mutations.

## Current access and limits
This deployment is owner-private. All views run under the owner's authenticated identity. Customer cards and the staff station are pilot views, not separately authorized production portals. Cards cannot yet be distributed to external customers. No demo records are inserted. Statistics for stamps and redemptions reflect the latest 100 events across the account.

Apple Wallet and Google Wallet are not connected. This site does not issue .pkpass files or Google Wallet objects. Native-wallet configuration, pass signing and update services are future work. Separate staff identities, customer self-registration and public card access, full reporting, subscription billing, recovery, and production abuse controls are also future work.

## Validation
`node node_modules/typescript/bin/tsc --noEmit`
`python tests/loyalty.py`
Build through the Sites build helper. SQL tests exercise duplicate stamp requests, the reward threshold, early and repeated redemption, tenant-scoped lookups, and duplicate customer phone constraints.
