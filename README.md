# MentorLagbe API

Express backend for Assignment 9, Category 001. This is the separate server repository; the Next.js client lives in the sibling `A09` directory.

## Current milestone

API foundation only: process health endpoint, configured-origin CORS, security headers, bounded JSON bodies, structured errors, and graceful shutdown. MongoDB, BetterAuth, JWT, tuition/application workflows, and Stripe are **not implemented yet**.

## Local setup

Use Node.js 22 or newer and pnpm 11.25.0.

```sh
pnpm install
```

Copy `.env.example` to `.env` and run:

```sh
pnpm dev
pnpm test
```

The default health URL is `http://localhost:5000/api/health`. A successful health response indicates the process is running; it does not indicate database readiness.

Set `CLIENT_URL` to the exact frontend origin in production, without a trailing slash. Never commit `.env` or real service credentials.

## Packages

- Express: HTTP routes and middleware.
- cors: browser access for the configured client origin.
- Helmet: security response headers.
- Node's built-in test runner: HTTP behavior checks.

## Submission

Live API and GitHub remote: pending. At least 12 meaningful server commits are required. The user makes all commits; implementation checkpoints are tracked in the client's `docs/commit-plan.md`.
