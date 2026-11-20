# MentorLagbe API

Express, MongoDB, BetterAuth and JWT backend for the MentorLagbe tuition platform.

## Features

Student/tutor signup and persistent sessions; session-bound JWT authorization; public tuition search/filter/pagination; tutor CRUD with an atomic free-plan limit; student applications with a unique compound index; tutor decisions; admin moderation and role management; profile editing and validated ImgBB uploads; Stripe Checkout with signed webhooks and idempotent Pro fulfillment.

## Local development

Node.js 22+ and pnpm 11.25.0 are required. Run `pnpm install`, then `pnpm dev:local`. The local runner downloads an official MongoDB binary, keeps development data in ignored .local/mongo and creates connected demo accounts and twelve tuitions. Password and generated secrets are in ignored .local/config.json. Do not commit this file.

For your own MongoDB, copy .env.example to .env, replace all placeholders, then run `pnpm seed` and `pnpm dev`. The seed requires SEED_PASSWORD of at least 12 characters. Admin: admin@mentorlagbe.demo; tutor: tutor@mentorlagbe.demo; student: student@mentorlagbe.demo. Existing seeded records are preserved.

## Production configuration

Set MONGODB_URI, MONGODB_DB, BETTER_AUTH_SECRET, JWT_SECRET, CLIENT_URL, BETTER_AUTH_URL, PORT, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and IMGBB_API_KEY. Use separate random secrets. CLIENT_URL and BETTER_AUTH_URL should be the frontend origin when using the Next.js /api proxy. Start with `pnpm start`; never use dev:local in production.

Point Stripe events checkout.session.completed and checkout.session.async_payment_succeeded to /api/payments/webhook. Pro currently uses one-time USD payments ($15 tutor, $10 student); monthly tuition fees are separate BDT amounts. Missing Stripe/ImgBB keys return explicit unavailable responses and do not simulate success.

## Database architecture caveat

The business database contains users, tuitions, applications and payments. The official BetterAuth MongoDB adapter persists accounts, sessions and verification records in a companion auth database while routing users to the business database. This needs instructor confirmation if the four-collection constraint applies globally, rather than to the business schema.

## Verification

Run `pnpm test`. Twenty-three tests cover HTTP errors, role escalation, JWT/logout, ownership, concurrent free limits, moderation, applications, idempotent payment fulfillment, production configuration, serverless initialization and connected seed data. Seed verification signs in all five demo accounts, checks twelve listings and three applications, and confirms rerunning preserves edits and passwords. Payment tests use fixtures, not a live Stripe transaction. Actual Stripe checkout/webhooks and ImgBB uploads still require service credentials and end-to-end verification.

## Vercel

Import this repository as an Express project using Node.js 24. The root app.js exports the application without opening a port; warm requests reuse the MongoDB connection pool, and failed initialization can retry. Set the production environment before deployment. The client repository's docs/vercel-deployment.md contains the complete two-project setup and verification steps. Image uploads are limited to 4 MB to fit Vercel's payload limit.

Dependencies: Express, cors, Helmet, MongoDB driver, BetterAuth, jsonwebtoken, Zod, Stripe, Multer, express-rate-limit. mongodb-memory-server is a development/test dependency; tests use Node's built-in runner.

## Links and release status

- Server: https://github.com/MH-git-ui/A09-server
- Client: https://github.com/MH-git-ui/A09
- Live API: not deployed yet.

Do not submit until live integrations and deployment are verified. The client docs/release-checklist.md tracks remaining acceptance criteria.
