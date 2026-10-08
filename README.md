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

| Variable                               | Required for                                      | Where to get it                                                                                                                            |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Everything                                        | `npx supabase status` (local) or your Supabase project's API settings (hosted)                                                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Everything                                        | Same as above                                                                                                                              |
| `SUPABASE_SECRET_KEY`                  | Server-side admin writes (service role)           | Same as above — never expose this one to the browser                                                                                       |
| `RESEND_API_KEY`                       | Teammate-invite emails only (**not** sign-in)     | [resend.com](https://resend.com) — a free account works; sandbox mode only delivers to your own account email until you verify a domain    |
| `RESEND_FROM_EMAIL`                    | Optional, pairs with `RESEND_API_KEY`             | A verified sender on your Resend domain; omit to use Resend's sandbox sender                                                               |
| `STRIPE_SECRET_KEY`                    | `/billing` checkout                               | [dashboard.stripe.com](https://dashboard.stripe.com) test-mode API keys                                                                    |
| `STRIPE_WEBHOOK_SECRET`                | Stripe webhook verification                       | Stripe CLI (`stripe listen`) locally, or the webhook's signing secret in the Stripe dashboard once deployed                                |
| `GOOGLE_OAUTH_CLIENT_ID`               | Connecting a Google account (Gmail+Calendar)      | [console.cloud.google.com](https://console.cloud.google.com) -> APIs & Services -> Credentials -> OAuth client ID (type "Web application") |
| `GOOGLE_OAUTH_CLIENT_SECRET`           | Same as above                                     | Same as above                                                                                                                              |
| `GOOGLE_OAUTH_REDIRECT_URI`            | Same as above                                     | Must exactly match an authorized redirect URI on the OAuth client, e.g. `http://localhost:3000/api/connectors/google/callback`             |
| `MICROSOFT_OAUTH_CLIENT_ID`            | Connecting a Microsoft account (Outlook+Calendar) | [entra.microsoft.com](https://entra.microsoft.com) -> App registrations -> New registration (multi-tenant)                                 |
| `MICROSOFT_OAUTH_CLIENT_SECRET`        | Same as above                                     | Same as above, under "Certificates & secrets"                                                                                              |
| `MICROSOFT_OAUTH_REDIRECT_URI`         | Same as above                                     | Must exactly match a redirect URI registered on the app, e.g. `http://localhost:3000/api/connectors/microsoft/callback`                    |
| `MICROSOFT_OAUTH_AUTHORITY`            | Optional, defaults to the `common` authority      | Only needed if your app registration restricts sign-in to a single tenant or organizations-only                                            |
| `SLACK_CLIENT_ID`                      | Connecting a Slack account (channels + mentions)  | [api.slack.com/apps](https://api.slack.com/apps) -> Create New App -> OAuth & Permissions                                                  |
| `SLACK_CLIENT_SECRET`                  | Same as above                                     | Same as above, under "Basic Information" -> App Credentials                                                                                |
| `SLACK_OAUTH_REDIRECT_URI`             | Same as above                                     | Must exactly match a redirect URL registered under "OAuth & Permissions", e.g. `http://localhost:3000/api/connectors/slack/callback`       |
| `TOKEN_ENCRYPTION_KEY`                 | Encrypting connector OAuth tokens at rest         | Generate your own: `openssl rand -base64 32` -- not a third-party credential                                                               |
| `TOKEN_ENCRYPTION_KEY_VERSION`         | Optional, defaults to `1`                         | Only set when rotating to a new `TOKEN_ENCRYPTION_KEY_V{n}` (see below)                                                                    |

If you leave `RESEND_API_KEY` blank, invites still work — the invite link is logged to the server console instead of emailed. If you leave the Stripe vars blank, `/billing` renders fine but the Subscribe button errors when clicked; you also need at least one `plans` row with a real `stripe_price_id` (`supabase/migrations/0007_plans_feature_switches.sql`) for a plan to be checkout-able at all — the table ships empty. If you leave the Google, Microsoft, or Slack OAuth vars blank, that provider's "Connect" flow redirects back with an error instead of throwing at import/build time -- everything else works without it.

### Google connector

Connecting a Google account creates **two** `connected_accounts` rows from one OAuth grant (`account_type` `email` and `calendar`), each independently visible (Private/Team/Company) and each backfilling 90 days of Gmail messages or Calendar events respectively. Tokens are encrypted at rest (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) in `connected_account_secrets`, a table with no RLS policies at all -- only server-side service-role code ever reads them.

To rotate `TOKEN_ENCRYPTION_KEY`: generate a new key, set it as `TOKEN_ENCRYPTION_KEY_V2` (keep the old `TOKEN_ENCRYPTION_KEY` around -- existing rows still need it to decrypt, tracked per-row via `key_version`), set `TOKEN_ENCRYPTION_KEY_VERSION=2` so new encryptions use it, and deploy both the app (Vercel env) and Supabase Edge Functions (`supabase secrets set`) -- separate stores, both need every active key version.

### Microsoft connector

Same two-sibling-rows shape as Google (one OAuth grant -> an `email` row and a `calendar` row, each independently visible). The stored secret isn't a raw access/refresh token pair, though: MSAL (`@azure/msal-node`) never exposes a refresh token through its public API, so what's encrypted in `connected_account_secrets` is MSAL's own serialized token cache instead, rehydrated on every call via a cache plugin.

Disconnecting a Microsoft account doesn't call a revoke endpoint the way Google's does -- Microsoft Graph has no per-app token revocation API. The closest thing, `POST /me/revokeSignInSessions`, invalidates the user's refresh tokens for _every_ app they've consented to, not just this one, so calling it would sign the user out of every other Microsoft app too. Disconnecting instead just deletes Mimus's own cached credentials and purges that account's content; the user's underlying Microsoft session is untouched until it naturally expires or they revoke it themselves.

### Slack connector

Connecting Slack grants one `connected_accounts` row per member (account_type `slack`), requesting only `channels:history`/`channels:read`/`groups:history`/`groups:read` on the member's own **user** token -- no `im:*`/`mpim:*` scope is ever requested, so Slack never grants this token visibility into DMs or group-DMs at all, and no bot-posting scope is requested either (Mimus never posts to Slack). Unlike Google/Microsoft, Slack's OAuth v2 user grant issues no refresh token and the access token doesn't expire by default, so there's nothing for `refreshToken()` to do (a documented no-op, see `src/server/connectors/slack/oauth.ts`).

Connecting only stores the token today -- backfilling channel history and ingesting real-time messages via Slack's Events API are the next two Milestone 3 tasks, not yet built.

### Push notifications and renewal (code-complete, not live yet)

Both connectors have a push-notification path so new mail/events sync in near-real-time instead of waiting for the next poll, but neither can actually be registered against a real Gmail/Outlook account until a deployed HTTPS URL exists (see "Outstanding setup" below) -- until then, this is tested code with nothing driving it.

- **Google** (`src/server/connectors/google/webhook.ts`): `registerGmailWatch()` calls Gmail's `watch()` against a Cloud Pub/Sub topic (`GOOGLE_PUBSUB_TOPIC`), storing the returned `historyId` as the sync cursor. `POST /api/webhooks/google/pubsub` receives Pub/Sub's push envelope, verifies its OIDC bearer token (audience = `GOOGLE_PUBSUB_AUDIENCE`, optionally also checking `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`) against Google's public certs, then walks `history.list` forward from the stored cursor to pick up only what actually changed.
- **Microsoft** (`src/server/connectors/microsoft/webhook.ts`): `registerGraphSubscription()` creates a Graph change-notification subscription (`/me/messages` or `/me/events`) pointed at `MICROSOFT_GRAPH_NOTIFICATION_URL`, with `MICROSOFT_GRAPH_CLIENT_STATE` as the shared secret Graph echoes back on every notification -- Graph has no cryptographic request signature, so matching that echoed value is the entire authentication check. `POST /api/webhooks/microsoft/graph` answers Graph's validation handshake (`?validationToken=...`) and, for real notifications, re-syncs the matching account via a delta query (`/me/mailFolders('inbox')/messages/delta` or `/me/calendarView/delta`), storing the returned `@odata.deltaLink` as the next sync cursor.
- **Renewal** (`app/api/cron/renew-watches`): Gmail watches expire in <=7 days and Graph subscriptions in <=3 days (tracked per-row in `connected_accounts.watch_expires_at`, added by migration 0013). This route re-registers anything due, guarded by a `CRON_SECRET` bearer check. Nothing calls it on a schedule yet -- wiring that up (Vercel Cron via `vercel.json`, or Supabase `pg_cron`+`pg_net` calling the deployed URL) is itself blocked on the same missing deployed URL.

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

## Outstanding setup (needs the repo owner)

Code-complete work the repo owner still needs to act on — nothing here blocks further development, but each is needed before the corresponding feature can be used end-to-end:

1. **Merge the open Milestone 2 PRs, in order** — each branch is based on the previous one's tip, so merging out of order will conflict: `#30 → #31 → #32 → #33 → #34 → #35 → #36`.
2. **Google Cloud OAuth client**, for live testing of the Google connector — [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth client ID ("Web application"). Provide `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` and register redirect URI `http://localhost:3000/api/connectors/google/callback` (or your deployed equivalent).
3. **Microsoft Entra app registration**, for live testing of the Microsoft connector — [entra.microsoft.com](https://entra.microsoft.com) → App registrations → New registration → multi-tenant ("Accounts in any organizational directory and personal Microsoft accounts"). Provide `MICROSOFT_OAUTH_CLIENT_ID`/`MICROSOFT_OAUTH_CLIENT_SECRET` and register redirect URI `http://localhost:3000/api/connectors/microsoft/callback`.
4. **Google Cloud Pub/Sub topic**, for live Gmail push notifications (not needed for OAuth or backfill) — a topic plus a publish IAM binding for `gmail-api-push@system.gserviceaccount.com`. Set `GOOGLE_PUBSUB_TOPIC`.
5. **A deployed public HTTPS URL** (e.g. Vercel) — required before either provider's webhook subscription can be registered at all (Gmail `watch()`, Graph `/subscriptions`), and before the renewal cron (`app/api/cron/renew-watches`) can actually be scheduled against anything. The webhook/renewal code itself is done (see "Push notifications and renewal" above) — this is the one thing blocking it from running for real. Once it exists: set `GOOGLE_PUBSUB_AUDIENCE`, `MICROSOFT_GRAPH_NOTIFICATION_URL`, `MICROSOFT_GRAPH_CLIENT_STATE`, and `CRON_SECRET`, then add a scheduler (Vercel Cron via `vercel.json`, or Supabase `pg_cron`+`pg_net`) that `POST`s `/api/cron/renew-watches` with `Authorization: Bearer $CRON_SECRET` on a recurring basis (daily is enough margin for both providers' renewal windows).

## Pages

Sign in to reach the app shell at these routes:

| Route                   | What it's for                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `/sky`                  | Morning-brief landing page -- greeting, KPI tiles, "needs you" items, department rows      |
| `/members`              | Invite teammates, change roles, remove members                                             |
| `/settings/connections` | Connect a Google or Microsoft account and set each row's visibility (private/team/company) |
| `/billing`              | Plans and current subscription, Stripe Checkout button                                     |
| `/feature-switches`     | Owner-only toggles for the four product areas (money/pipeline/projects/canopy)             |
| `/audit-log`            | Placeholder — becomes the AI agent activity log once the agent ships (Milestone 4+)        |

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
