# MentorLagbe API

The Express backend for MentorLagbe, a tuition and mentorship platform for students, tutors and administrators. It manages authentication, tuition listings, applications, image uploads and verified Pro payments.

## Live website and repositories

- **Live website:** [MentorLagbe](https://mentorlagbe-mh.vercel.app)
- **Client repository:** [MH-git-ui/A09](https://github.com/MH-git-ui/A09)
- **Server repository:** [MH-git-ui/A09-server](https://github.com/MH-git-ui/A09-server)
- **Live API:** [MentorLagbe API](https://mentorlagbe-api-mh.vercel.app)

## Demo login credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@mentorlagbe.demo | 3UG2aX8GbPtzeDYmMhAT_I0Aa5U |
| Tutor | tutor@mentorlagbe.demo | 3UG2aX8GbPtzeDYmMhAT_I0Aa5U |
| Student | student@mentorlagbe.demo | 3UG2aX8GbPtzeDYmMhAT_I0Aa5U |

These accounts are provided for evaluating the hosted project. Local development generates a separate password in the server's ignored `.local/config.json` file.

## Key features

- BetterAuth signup/signin, persistent MongoDB sessions and session-bound JWT authorization.
- Server-enforced student, tutor and admin permissions, ownership checks and protected profile updates.
- Approved tuition search, subject/class/mode filtering and pagination.
- Tutor listing management with an atomic two-post free-plan limit.
- Student applications with duplicate protection, pending cancellation and tutor decisions.
- Admin moderation, role management, dashboard statistics and transaction history.
- Validated profile/banner uploads through ImgBB, capped at 4 MB.
- Server-controlled Stripe pricing, signed webhooks and idempotent Pro fulfillment.
- Repeatable seed data with twelve approved tuitions and connected demo accounts/applications.

## Technologies and npm packages

| Package | Purpose |
| --- | --- |
| express | HTTP API and routing |
| mongodb | MongoDB database driver |
| better-auth | Authentication and session management |
| jsonwebtoken | Signed API access tokens |
| zod | Request and configuration validation |
| stripe | Checkout and webhook verification |
| multer | Multipart image uploads |
| cors, helmet, express-rate-limit | Origin controls, security headers and rate limits |
| mongodb-memory-server | Local development and test databases |

Tests use Node.js's built-in test runner.

## Run locally

Use Node.js 22+ and pnpm 11.25.0:

```bash
pnpm install
pnpm dev:local
```

This starts local MongoDB and seeds demo data. Generated credentials are stored in ignored `.local/config.json`. For your own MongoDB, copy `.env.example` to `.env`, configure the variables below, then run `pnpm seed` and `pnpm dev`. Existing seeded records are preserved.

| Command | Purpose |
| --- | --- |
| `pnpm dev:local` | Start API with local MongoDB and seed data |
| `pnpm dev` | Start API with configured MongoDB |
| `pnpm seed` | Create connected demo records |
| `pnpm test` | Run backend tests |
| `pnpm start` | Start production server |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `PORT` | Runtime environment and local API port |
| `MONGODB_URI`, `MONGODB_DB` | Database connection and database name |
| `CLIENT_URL`, `BETTER_AUTH_URL` | Frontend origin used by the same-origin API proxy |
| `BETTER_AUTH_SECRET`, `JWT_SECRET` | Independent random secrets, at least 32 characters each |
| `STRIPE_SECRET_KEY` | Stripe test API key |
| `STRIPE_WEBHOOK_SECRET` | Deployed webhook signing secret |
| `IMGBB_API_KEY` | Image upload service key |
| `SEED_PASSWORD` | Dedicated seed account password, at least 12 characters |

Keep service secrets in local environment files or Vercel environment variables.

## Database and payments

The application uses four physical MongoDB collections: `users`, `tuitions`, `applications` and `payments`. The official BetterAuth MongoDB adapter stores account/session/verification models as tagged records inside `users`; mandatory model filters exclude authentication records from application user queries and counts.

Stripe test-mode Pro upgrades cost **$15 USD for tutors** and **$10 USD for students**, paid once. Monthly tuition fees are separate BDT amounts. Configure `checkout.session.completed` and `checkout.session.async_payment_succeeded` events at `/api/payments/webhook`. Repeated verification and webhook delivery do not create duplicate transactions.

## Testing and deployment

The 24 backend tests cover role restrictions, ownership, free-plan limits, moderation, applications, payment idempotency, authentication-record isolation, database collections, initialization and seeding. Both student and tutor sandbox payments and authenticated ImgBB uploads have also been verified on the deployed application.

`scripts/verify-live.js` checks hosted authentication and role access. `scripts/verify-integrations.js` checks uploads and checkout verification. Both use the configured demo credentials. `scripts/migrate-auth-storage.js` is retained for older installations using a companion authentication database; fresh installations do not need it.

Vercel uses Node.js 26 and the root `app.js` Express export. See the [deployment guide](https://github.com/MH-git-ui/A09/blob/main/docs/vercel-deployment.md) for the two-project setup.
