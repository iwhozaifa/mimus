# Mimus

An AI chief of staff for founder-led businesses. It connects a founder's email, calendars, and Slack, surfaces what needs attention, answers questions within strict permission boundaries, and handles email-to-calendar scheduling with approval.

This is **V1, first stage: web app only**. See [`PLAN.md`](./PLAN.md) for the full build plan and milestone status, and [`AGENTS.md`](./AGENTS.md) for the development practices this repo follows.

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack, Cache Components) + TypeScript, React 19
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

## Running

```bash
npm run dev          # dev server at http://127.0.0.1:3000
```

Sign-in emails land in Mailpit at `http://127.0.0.1:54324` (nothing is sent to a real inbox locally). Supabase Studio is at `http://127.0.0.1:54323`.

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
