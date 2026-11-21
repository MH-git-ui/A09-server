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

## Database architecture

The live application uses exactly four physical MongoDB collections: users, tuitions, applications and payments. The official BetterAuth MongoDB adapter stores its account/session/verification logical models as tagged records inside users. Mandatory model filters keep those records out of application user queries and counts; authentication joins are disabled. An automated test verifies isolation and the physical collection count. The previous companion database is retained only as an offline migration backup; the application no longer reads or writes it.

For installations using the old companion database, scripts/migrate-auth-storage.js copies authentication records without deleting the source. Run with the existing server environment before deploying this storage implementation. Fresh databases need no migration.

## Verification

Run pnpm test. The 24 tests cover role escalation, JWT/logout, ownership, concurrent free limits, moderation, applications, payment idempotency, auth-record isolation, four physical collections, serverless initialization and connected seeding.

Verification completed November 21, 2026:

- All 24 backend tests passed; the client production build passed all 22 routes and TypeScript checks.
- Hosted admin, tutor and student signin, session persistence, JWT authorization, dashboards, role restrictions and logout revocation passed.
- Browser checks covered public search, dashboard reloads, mobile navigation at 375px and tablet layout at 768px, with no document-level horizontal overflow in the checked views.
- Both profile and tuition banner upload controls returned real ImgBB previews. Authenticated upload and hosted image retrieval passed.
- Stripe sandbox payments succeeded for student $10 USD and tutor $15 USD. Success pages confirmed Pro upgrades; repeated verification passed for both. Student webhook delivery and manual resend returned HTTP 200 without duplicate payment records.
- Tutor checkout cancellation returned to the cancel page and left the free plan unchanged before the subsequent successful test.
- Twelve approved tuitions and connected demonstration users/applications are seeded in MongoDB Atlas.
- Footer email, phone and Facebook use the supplied public contact details. The X logo links to sharing the site on X.

Stripe remains in test mode; no real money was charged. Pro is a one-time upgrade because the assignment specifies prices but no recurring interval. Tuition fees are separate monthly BDT amounts. Optional features selected: server-side pagination and realistic connected seeding.

Repeat hosted role checks with: node --env-file=.env scripts/verify-live.js https://mentorlagbe-mh.vercel.app

scripts/verify-integrations.js verifies authenticated ImgBB uploads and creates a checkout, or checks an existing session twice when given its session ID. Set INTEGRATION_EMAIL for the desired demo role; SEED_PASSWORD is required. Payment completion occurs in Stripe's sandbox browser form.

## Vercel and dependencies

Both projects deploy with Node.js 26. Root app.js exports Express without opening a port. Warm requests reuse MongoDB connections; failed initialization can retry. Uploads are capped at 4 MB. See the client docs/vercel-deployment.md for configuration.

Dependencies: Express, cors, Helmet, MongoDB driver, BetterAuth, jsonwebtoken, Zod, Stripe, Multer and express-rate-limit. mongodb-memory-server is used for development/tests with Node's built-in test runner.

## Submission links and demo accounts

- Live website: https://mentorlagbe-mh.vercel.app
- Client repository: https://github.com/MH-git-ui/A09
- Server repository: https://github.com/MH-git-ui/A09-server
- Live API: https://mentorlagbe-api-mh.vercel.app

These are dedicated assignment demonstration accounts, not infrastructure credentials.

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@mentorlagbe.demo | 3UG2aX8GbPtzeDYmMhAT_I0Aa5U |
| Tutor | tutor@mentorlagbe.demo | 3UG2aX8GbPtzeDYmMhAT_I0Aa5U |
| Student | student@mentorlagbe.demo | 3UG2aX8GbPtzeDYmMhAT_I0Aa5U |
