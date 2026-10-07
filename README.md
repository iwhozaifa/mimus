# Mimus

An AI chief of staff for founder-led businesses. It connects a founder's email, calendars, and Slack, surfaces what needs attention, answers questions within strict permission boundaries, and handles email-to-calendar scheduling with approval.

This is **V1, first stage: web app only**. See [`PLAN.md`](./PLAN.md) for the full build plan and milestone status, and [`AGENTS.md`](./AGENTS.md) for the development practices this repo follows.

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack, Cache Components) + TypeScript, React 19
- **Styling:** Tailwind CSS v4 (CSS-first config)
- **Database/Auth:** Supabase (Postgres, Row-Level Security, magic-link Auth) — the permission boundary lives in RLS policies, not application code
- **Billing:** Stripe (checkout + webhooks)
- **Email:** Resend
- **AI:** Claude API (Anthropic), via a swappable provider interface (not yet wired up — Milestone 4)
- **Testing:** Vitest (unit/integration), pgTAP (RLS/SQL), Playwright (e2e)
- **Tooling:** ESLint, Prettier, Husky + lint-staged + commitlint
- **CI/Hosting:** GitHub Actions (required on every PR) · Supabase Cloud · Vercel (not yet connected)

## Prerequisites

- Node.js (version pinned in [`.nvmrc`](./.nvmrc))
- Docker (for the local Supabase stack)
- A Supabase CLI — invoked via `npx supabase`, no global install needed

## Setup

```bash
npm install

# Start the local Supabase stack (Postgres, Auth, Mailpit, Studio)
npx supabase start

# Copy the printed PUBLISHABLE_KEY/SECRET_KEY from the output above into .env.local
cp .env.example .env.local
```

`npx supabase status` reprints those values any time. `NEXT_PUBLIC_SUPABASE_URL` is `http://127.0.0.1:54321` for local dev.

## Environment variables

Copy `.env.example` to `.env.local` and fill these in — all are server-only except the two `NEXT_PUBLIC_*` ones:

| Variable                               | Required for                                  | Where to get it                                                                                                                         |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Everything                                    | `npx supabase status` (local) or your Supabase project's API settings (hosted)                                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Everything                                    | Same as above                                                                                                                           |
| `SUPABASE_SECRET_KEY`                  | Server-side admin writes (service role)       | Same as above — never expose this one to the browser                                                                                    |
| `RESEND_API_KEY`                       | Teammate-invite emails only (**not** sign-in) | [resend.com](https://resend.com) — a free account works; sandbox mode only delivers to your own account email until you verify a domain |
| `RESEND_FROM_EMAIL`                    | Optional, pairs with `RESEND_API_KEY`         | A verified sender on your Resend domain; omit to use Resend's sandbox sender                                                            |
| `STRIPE_SECRET_KEY`                    | `/billing` checkout                           | [dashboard.stripe.com](https://dashboard.stripe.com) test-mode API keys                                                                 |
| `STRIPE_WEBHOOK_SECRET`                | Stripe webhook verification                   | Stripe CLI (`stripe listen`) locally, or the webhook's signing secret in the Stripe dashboard once deployed                             |

If you leave `RESEND_API_KEY` blank, invites still work — the invite link is logged to the server console instead of emailed. If you leave the Stripe vars blank, `/billing` renders fine but the Subscribe button errors when clicked; you also need at least one `plans` row with a real `stripe_price_id` (`supabase/migrations/0007_plans_feature_switches.sql`) for a plan to be checkout-able at all — the table ships empty.

## Running

```bash
npm run dev          # dev server at http://127.0.0.1:3000
```

Supabase Studio is at `http://127.0.0.1:54323`.

### Auth email delivery

Sign-in uses Supabase Auth's own magic-link mailer (`supabase.auth.signInWithOtp`) — this is **completely separate from Resend/`RESEND_API_KEY`**, which is only used for teammate-invite emails. Locally, every auth email (magic links, OTPs) is intercepted by the Supabase CLI's built-in test mailer and never leaves your machine — check **Mailpit at `http://127.0.0.1:54324`**, not a real inbox, to find it.

If a sign-in email doesn't show up in Mailpit:

- Confirm the local stack is actually running: `npx supabase status`.
- Check the local rate limit — `supabase/config.toml`'s `auth.rate_limit.email_sent` caps you at 2 per hour by default, so repeated test sign-ins can silently throttle.
- Restart the stack if it was left in a stale state: `npx supabase stop && npx supabase start`.

For a real deployment, Supabase Cloud's default mailer is also rate-limited and meant for testing only — configure a custom SMTP provider under your Supabase project's Auth settings (`supabase/config.toml`'s commented-out `[auth.email.smtp]` block shows the shape) to have magic links actually land in users' real inboxes in production.

## Pages

Sign in to reach the app shell at these routes:

| Route                   | What it's for                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `/dashboard`            | Workspace name, your role, read-only banner when billing is past due                |
| `/members`              | Invite teammates, change roles, remove members                                      |
| `/settings/connections` | Connect a (stub) account and set its visibility (private/team/company)              |
| `/billing`              | Plans and current subscription, Stripe Checkout button                              |
| `/feature-switches`     | Owner-only toggles for the four product areas (money/pipeline/projects/canopy)      |
| `/audit-log`            | Placeholder — becomes the AI agent activity log once the agent ships (Milestone 4+) |

`/billing`'s checkout button calls real Stripe Checkout code but has no test-mode keys configured yet (`STRIPE_SECRET_KEY` is blank in `.env.example`) — it will error until those are added.

## Testing

```bash
npm run lint && npm run format && npm run typecheck
npm run test                      # vitest (unit + integration against local Supabase)
npx supabase test db --local      # pgTAP (schema/RLS)
npm run test:e2e                  # Playwright, against a local dev server
npm run build                     # also catches Cache Components static-shell errors
```

All of the above run on every PR via GitHub Actions (`.github/workflows/ci.yml`); `main` requires it green.

To smoke-test against the real staging Supabase project instead of local, see `npm run test:e2e:staging` (needs a `.env.staging` file, not committed).
