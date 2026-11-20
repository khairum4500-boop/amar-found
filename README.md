# AMAR FOUND

Production-oriented Telegram bot + backend foundation for AMAR FOUND.

## Included

- Telegram `/start` registration and language selection
- Persistent main menu
- User profile
- Plans/products catalog
- Deposit/withdrawal request records with admin-review workflow
- Referral tracking
- Transaction ledger
- Support tickets
- Notices/broadcast records
- Admin RBAC foundation
- Audit logs
- Maintenance mode
- PostgreSQL schema + migrations
- Validation, idempotency helpers, structured error handling
- Asia/Dhaka timezone configuration

## Important scope

This repository intentionally does **not** implement real-money investment returns, guaranteed profit calculations, or automated financial payouts. The deposit/withdrawal modules are request-and-review interfaces only. Connect any real payment or financial service only after obtaining the required legal/compliance approvals and using an authorized provider.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill `BOT_TOKEN`, `DATABASE_URL`, and `ADMIN_IDS`.
3. Run `npm install`.
4. Run the SQL migration in `db/migrations/001_init.sql`.
5. Run `npm start`.

For Render:
- Build command: `npm install`
- Start command: `npm start`
- Add the environment variables from `.env.example`.

## Admin IDs

`ADMIN_IDS` is a comma-separated list of Telegram user IDs.

Example:
`ADMIN_IDS=123456789,987654321`

The bot's admin controller uses server-side authorization. Do not place admin IDs or bot tokens in frontend code.
