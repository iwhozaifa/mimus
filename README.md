# Mimus

An AI chief of staff for founder-led businesses. It connects a founder's email, calendars, and Slack, surfaces what needs attention, answers questions within strict permission boundaries, and handles email-to-calendar scheduling with approval.

This is **V1, first stage: web app only**. See [`PLAN.md`](./PLAN.md) for the full build plan and milestone status, and [`AGENTS.md`](./AGENTS.md) for the development practices this repo follows.

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack, Cache Components) + TypeScript, React 19
- **Styling:** Tailwind CSS v4 (CSS-first config)
- **Database/Auth:** Supabase (Postgres, Row-Level Security, magic-link Auth) — the permission boundary lives in RLS policies, not application code
- **Billing:** Stripe (checkout + webhooks)
- **Email:** Resend
- **AI:** Claude API (Anthropic, `@anthropic-ai/sdk`) behind a swappable `AiProvider` interface — Haiku 5.5 / Sonnet 5.5 / Opus 5.5 tiers
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
| `GOOGLE_OAUTH_REDIRECT_URI`            | Same as above                                     | Must exactly match an authorized redirect URI on the OAuth client, e.g. `http://127.0.0.1:3000/api/connectors/google/callback`             |
| `MICROSOFT_OAUTH_CLIENT_ID`            | Connecting a Microsoft account (Outlook+Calendar) | [entra.microsoft.com](https://entra.microsoft.com) -> App registrations -> New registration (multi-tenant)                                 |
| `MICROSOFT_OAUTH_CLIENT_SECRET`        | Same as above                                     | Same as above, under "Certificates & secrets"                                                                                              |
| `MICROSOFT_OAUTH_REDIRECT_URI`         | Same as above                                     | Must exactly match a redirect URI registered on the app, e.g. `http://127.0.0.1:3000/api/connectors/microsoft/callback`                    |
| `MICROSOFT_OAUTH_AUTHORITY`            | Optional, defaults to the `common` authority      | Only needed if your app registration restricts sign-in to a single tenant or organizations-only                                            |
| `SLACK_CLIENT_ID`                      | Connecting a Slack account (channels + mentions)  | [api.slack.com/apps](https://api.slack.com/apps) -> Create New App -> OAuth & Permissions                                                  |
| `SLACK_CLIENT_SECRET`                  | Same as above                                     | Same as above, under "Basic Information" -> App Credentials                                                                                |
| `SLACK_OAUTH_REDIRECT_URI`             | Same as above                                     | Must exactly match a redirect URL registered under "OAuth & Permissions", e.g. `http://127.0.0.1:3000/api/connectors/slack/callback`       |
| `CALENDLY_CLIENT_ID`                   | Connecting a Calendly account (scheduled events)  | [calendly.com](https://calendly.com) -> Integrations -> API & Webhooks -> OAuth                                                            |
| `CALENDLY_CLIENT_SECRET`               | Same as above                                     | Same as above                                                                                                                              |
| `CALENDLY_OAUTH_REDIRECT_URI`          | Same as above                                     | Must exactly match the app's registered redirect URI, e.g. `http://127.0.0.1:3000/api/connectors/calendly/callback`                        |
| `TOKEN_ENCRYPTION_KEY`                 | Encrypting connector OAuth tokens at rest         | Generate your own: `openssl rand -base64 32` -- not a third-party credential                                                               |
| `TOKEN_ENCRYPTION_KEY_VERSION`         | Optional, defaults to `1`                         | Only set when rotating to a new `TOKEN_ENCRYPTION_KEY_V{n}` (see below)                                                                    |
| `GMAIL_BACKFILL_UNITS_PER_MINUTE`      | Optional, defaults to `3000`                      | Gmail quota units per minute the backfill may spend (see "Google connector")                                                               |
| `ANTHROPIC_API_KEY`                    | Ask Mimus (the AI)                                | [platform.claude.com](https://platform.claude.com) -> API keys                                                                             |

**Use `http://127.0.0.1:3000`, not `localhost`, for local development** — both in the browser and in every OAuth redirect URI you register. Cookies are bound to the exact host, so starting a connect flow on `localhost` and returning to `127.0.0.1` (or the reverse) loses the session and fails with `?error=google_invalid_state`. **`TOKEN_ENCRYPTION_KEY` is required before connecting any provider**; without it the callback fails with `?error=google_connect_failed` (or the equivalent for that provider).

If you leave `RESEND_API_KEY` blank, invites still work — the invite link is logged to the server console instead of emailed. If you leave the Stripe vars blank, `/billing` renders fine but the Subscribe button errors when clicked; you also need at least one `plans` row with a real `stripe_price_id` (`supabase/migrations/0007_plans_feature_switches.sql`) for a plan to be checkout-able at all — the table ships empty. If you leave the Google, Microsoft, or Slack OAuth vars blank, that provider's "Connect" flow redirects back with an error instead of throwing at import/build time -- everything else works without it.

### Google connector

Connecting a Google account creates **two** `connected_accounts` rows from one OAuth grant (`account_type` `email` and `calendar`), each independently visible (Private/Team/Company) and each backfilling 90 days of Gmail messages or Calendar events respectively.

For users this is click-and-connect: on `/settings/connections` they click **Connect Google account**, pick an account in Google's chooser (the auth URL uses `prompt=select_account consent`), approve read-only Gmail and Calendar access, and the page lists that address with a **Google Gmail** and a **Google Calendar** row. **Add another Google account** connects further addresses for the same user, each with its own pair of rows. Reconnecting an address that's already connected (e.g. one marked "Needs reconnect") refreshes its tokens in place instead of adding duplicates, keeping each row's visibility and synced content.

Users never handle keys. The `GOOGLE_OAUTH_*` variables are the app's own OAuth client, set **once per deployment** by whoever runs Mimus. Google has no dynamic client registration, so every app that reads Gmail needs one (MCP-style connectors work the same way). When they're missing, the connections page says Google isn't set up instead of showing a Connect button. To enable Google for users:

1. Create an OAuth client ("Web application") in Google Cloud → APIs & Services → Credentials, with the Gmail and Google Calendar APIs enabled.
2. Add authorised redirect URIs: `http://127.0.0.1:3000/api/connectors/google/callback` for dev and `https://<your-domain>/api/connectors/google/callback` for production.
3. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_OAUTH_REDIRECT_URI`, in `.env.local` locally and in the Vercel project's environment variables in production.
4. While the OAuth consent screen is in **Testing**, add each Google account that should connect as a test user. They'll see an "unverified app" warning, and their refresh tokens expire after 7 days.
5. To open it to anyone: set the consent screen to **In production** and complete Google's verification. `gmail.readonly` is a restricted scope, so this includes a CASA Tier 2 assessment, and there's a 100-user cap until it's verified.

The Gmail backfill is built around Gmail's per-user quota (6,000 units/min for Cloud projects created on/after 2026-05-01): it fetches whole threads (`threads.get`, 40 units for every message in the conversation) rather than one `messages.get` (20 units) per message; skips spam, trash, Promotions and Social; skips threads whose stored `historyId` shows they're already imported and unchanged, so re-running it after an interruption resumes cheaply; and paces every call through `QuotaPacer` (`src/server/connectors/google/pacer.ts`) at `GMAIL_BACKFILL_UNITS_PER_MINUTE` (default 3,000), halving the rate on any rate-limit hit before retrying with backoff. Tokens are encrypted at rest (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) in `connected_account_secrets`, a table with no RLS policies at all -- only server-side service-role code ever reads them.

To rotate `TOKEN_ENCRYPTION_KEY`: generate a new key, set it as `TOKEN_ENCRYPTION_KEY_V2` (keep the old `TOKEN_ENCRYPTION_KEY` around -- existing rows still need it to decrypt, tracked per-row via `key_version`), set `TOKEN_ENCRYPTION_KEY_VERSION=2` so new encryptions use it, and deploy both the app (Vercel env) and Supabase Edge Functions (`supabase secrets set`) -- separate stores, both need every active key version.

### Microsoft connector

Same two-sibling-rows shape as Google (one OAuth grant -> an `email` row and a `calendar` row, each independently visible). The stored secret isn't a raw access/refresh token pair, though: MSAL (`@azure/msal-node`) never exposes a refresh token through its public API, so what's encrypted in `connected_account_secrets` is MSAL's own serialized token cache instead, rehydrated on every call via a cache plugin.

Disconnecting a Microsoft account doesn't call a revoke endpoint the way Google's does -- Microsoft Graph has no per-app token revocation API. The closest thing, `POST /me/revokeSignInSessions`, invalidates the user's refresh tokens for _every_ app they've consented to, not just this one, so calling it would sign the user out of every other Microsoft app too. Disconnecting instead just deletes Mimus's own cached credentials and purges that account's content; the user's underlying Microsoft session is untouched until it naturally expires or they revoke it themselves.

### Slack connector

Settings → Connections has a **Slack** card. A member clicks **Connect Slack workspace**, picks a workspace with the switcher on Slack's consent page, approves, and lands back on the page with that workspace listed by name and domain. **Add another Slack workspace** repeats the flow, so one member can connect several Slack workspaces. Reconnecting a workspace that's already connected (e.g. after it needs reauth) refreshes the existing connection in place, keeping its visibility, instead of adding a duplicate.

Each connection is one `connected_accounts` row (account_type `slack`), requesting only `channels:history`/`channels:read`/`groups:history`/`groups:read` on the member's own **user** token -- no `im:*`/`mpim:*` scope is ever requested, so Slack never grants this token visibility into DMs or group-DMs at all, and no posting scope is requested either (Mimus never posts to Slack). The same click also installs the app's bot in that Slack workspace with only `channels:read`/`groups:read`, used solely to look up channel members during ingestion (below). Unlike Google/Microsoft, Slack's OAuth v2 user grant issues no refresh token and the access token doesn't expire by default, so there's nothing for `refreshToken()` to do (a documented no-op, see `src/server/connectors/slack/oauth.ts`).

Connecting backfills 90 days of history from every `public_channel`/`private_channel` the member is actually a member of (`users.conversations`, not `conversations.list` -- the latter would also surface public channels the member never joined).

Real-time ingestion (`src/server/connectors/slack/events.ts`, `POST /api/webhooks/slack/events`) covers everything after that: one Events API subscription for the whole Slack app installation delivers `message`/`app_mention` notifications team-wide, and ingestion resolves which of our own connected members can actually see the channel a notification came from via that Slack workspace's own bot token (`conversations.members`) before writing anything -- a message only ever lands in a connected member's own rows if that member's Slack user id came back in that channel's member list. `im`/`mpim` channel types are dropped unconditionally, same "no DMs" posture as the OAuth scopes. Unlike Gmail's `watch()` or Graph's `/subscriptions`, there's no per-account registration call to make here -- the subscription itself is configured once, statically, in the Slack app's own dashboard (Event Subscriptions -> Request URL), which needs this route's deployed HTTPS URL to exist first (same prerequisite as the push-notification section below).

Bot tokens are stored per Slack workspace in `slack_installations` (`src/server/connectors/slack/installations.ts`), encrypted with the same token vault as member tokens and readable only by the service role. They are captured automatically on connect, so there's no `SLACK_BOT_TOKEN` env var, and the one app works for any number of Slack workspaces. The stored token is dropped once the last Mimus member connected to that Slack workspace disconnects; it isn't revoked at Slack, since that would uninstall the app for everyone in that workspace. One limitation: Slack only lets a bot list the members of a **private** channel it has been added to, so private-channel events are ingested only after someone adds the Mimus app to that channel. Public channels need nothing extra.

**Enabling Slack for users (operator, once per deployment):**

1. Create the Slack app (api.slack.com/apps). Under OAuth & Permissions, add the user scopes `channels:history`, `channels:read`, `groups:history` and `groups:read`, the bot scopes `channels:read` and `groups:read`, and the redirect URLs for dev (`http://127.0.0.1:3000/api/connectors/slack/callback`) and production.
2. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_OAUTH_REDIRECT_URI` and `SLACK_SIGNING_SECRET` locally and in Vercel. If an older `SLACK_BOT_TOKEN` is still set, remove it; it's no longer read.
3. Point Event Subscriptions at `<deployed-url>/api/webhooks/slack/events`, and under **Subscribe to events on behalf of users** add `message.channels` and `message.groups`. Those are covered by the user scopes above; bot events would need bot `*:history` scopes, which Mimus doesn't request.
4. Under **Manage Distribution**, activate public distribution so Slack workspaces other than the app's own can install it. Slack requires HTTPS redirect URLs for that, so connecting a second workspace needs the deployed URL (or an HTTPS tunnel).
5. Some Slack workspaces require an admin to approve new apps. That's the customer's setting, not ours.

Until a deployment has the Slack OAuth vars, the card shows a "not set up on this deployment" note instead of a Connect button.

`src/server/connectors/slack/tool.ts` (`listVisibleSlackMessages()`) is the narrow surface the AI's `slackSearch` tool calls instead of ever touching Slack's API or a stored token directly. It queries under the asker's own Supabase session (so RLS applies) and also re-checks every candidate connected account against the same `can_see_connected_account()` predicate RLS enforces, the same defense-in-depth pattern as the rest of `src/server/permissions/`.

### Calendly connector

Connecting Calendly grants one `connected_accounts` row per member (account_type `scheduling`), requesting only `scheduled_events:read` and `webhooks:write` -- no scope that can create, reschedule, or cancel a booking is ever requested. `src/server/connectors/calendly/client.ts`'s `calendlyGet()` reinforces that structurally, not just by convention: it has no `method` parameter at all, so there is no way to construct a write call against `scheduled_events`/`invitees` through the module that reads booking content, independent of what any test happens to check. Unlike Slack, Calendly access tokens expire after 2 hours and refresh tokens rotate on every use (a new one is issued, and the old one revoked, on every refresh) -- `refreshAndStoreTokens()` always persists both the new access _and_ new refresh token, never falling back to the old one the way Google's refresh does.

Connecting backfills every scheduled event from 90 days ago through a year out (`GET /scheduled_events?user=<their-uri>`, paginated), fetching each event's invitees separately (Calendly's own API shape -- an event's invitee list isn't embedded in the listing response) and normalizing both into the shared `events`/`people` tables.

Real-time updates (`src/server/connectors/calendly/webhook.ts`, `POST /api/webhooks/calendly`) re-sync just the one event an `invitee.created`/`invitee.canceled` notification refers to, the same "re-fetch via GET, don't trust the push payload's own content" posture as Microsoft Graph's webhook. Unlike Slack's one app-wide subscription, Calendly needs a subscription **per connected account** (`registerCalendlyWebhook()`) -- all of them pointed at the same deployed URL, disambiguated by a `?account=<connectedAccountId>` query parameter this function appends itself, since Calendly's webhook payload carries no caller-supplied context that would otherwise identify which subscription fired. Unlike Gmail's watch()/Graph's subscription (which expire and ride the renewal cron even for brand-new accounts), a Calendly subscription doesn't expire, so this is called once, automatically, right after connect (`app/api/connectors/calendly/callback/route.ts`) rather than needing the renewal cron at all. `poll.ts` exists for the Calendly plans that don't have webhooks at all (Free tier, per the "Platform limits flagged" note in `PLAN.md`) -- it's the exact same sync as backfill, just invoked on a schedule instead of once.

### Mimus AI (Ask Mimus)

Type a question into the search box in the top nav. It goes to `POST /api/agent/ask` (the same endpoint future native apps will use), which runs `askMimus()` in `src/server/agent/ask.ts`:

1. **Who:** the asker's own Supabase session. Every tool queries with it, never the service role, so RLS decides what the AI can see. A test in `tests/server/agent/tools/tools.test.ts` points the AI at another Member's Private account with prompt-injection text and proves the database returns nothing.
2. **Router** (`src/server/agent/router/`): picks one of four skill modules (`src/server/agent/modules/`): `lookup`, `briefing`, `draft` or `schedule`. It uses a quick classification on the fast tier (Haiku 5.5), then the module's default tier (fast = Haiku 5.5, standard = Sonnet 5.5, deep = Opus 5.5). Low classifier confidence bumps the tier up one.
3. **Spend cap** (`src/server/billing/spendCaps.ts`): spend is summed per calendar month (UTC) against the workspace plan's `ai_spend_cap_usd`. At 80% of the cap answers drop one tier; at 100% they're blocked. No cap set means no limit.
4. **Tools** (`src/server/agent/tools/`): `searchMessages`, `searchEvents`, `slackSearch`, `draftEmail` (drafts only, never sends) and `proposeMeetingTimes` (the asker's own calendars, weekdays 9–5). The model is offered, and can run, only the tools its module lists.
5. **Answer:** if an answer comes back empty or unfinished, it retries once, one tier up. Sources are returned with the answer; clicking one opens `/sources/message/<id>` or `/sources/event/<id>`, read under the viewer's own session, so anything they can't see is "not found".

Every request is logged to `agent_logs` (tokens and cost across all model calls, source ids, status) and added to `agent_spend_counters`. Without `ANTHROPIC_API_KEY` the Ask bar shows "Mimus AI is not configured yet"; every test mocks the API, so none of them needs a key.

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

1. **Anthropic API key**, for live testing of Ask Mimus — set `ANTHROPIC_API_KEY` in `.env.local`.
2. **AI spend-cap amounts** — set real `plans.ai_spend_cap_usd` values per plan (USD per calendar month). The enforcement is built; the numbers are still placeholders.
3. ✅ **Google Cloud OAuth client** — done for local development (live-tested 2026-10-09: Gmail + Calendar connected and backfilled). For a new environment: [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth client ID ("Web application"). Provide `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` and register redirect URI `http://127.0.0.1:3000/api/connectors/google/callback` (or your deployed equivalent).
4. **Microsoft Entra app registration**, for live testing of the Microsoft connector — [entra.microsoft.com](https://entra.microsoft.com) → App registrations → New registration → multi-tenant ("Accounts in any organizational directory and personal Microsoft accounts"). Provide `MICROSOFT_OAUTH_CLIENT_ID`/`MICROSOFT_OAUTH_CLIENT_SECRET` and register redirect URI `http://127.0.0.1:3000/api/connectors/microsoft/callback`.
5. **Slack app**, for live testing of the Slack connector — see "Enabling Slack for users" under "Slack connector" above for the scopes, redirect URLs and distribution setting. Provide `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`, plus the Signing Secret from Basic Information for `SLACK_SIGNING_SECRET`. No bot token is needed: each Slack workspace's bot token is captured when someone connects it.
6. **Calendly OAuth app**, for live testing of the Calendly connector — [calendly.com](https://calendly.com) → Integrations → API & Webhooks → OAuth. Provide `CALENDLY_CLIENT_ID`/`CALENDLY_CLIENT_SECRET` and register redirect URI `http://127.0.0.1:3000/api/connectors/calendly/callback`.
7. **Google Cloud Pub/Sub topic**, for live Gmail push notifications (not needed for OAuth or backfill) — a topic plus a publish IAM binding for `gmail-api-push@system.gserviceaccount.com`. Set `GOOGLE_PUBSUB_TOPIC`.
8. **A deployed public HTTPS URL** (e.g. Vercel) — required before any provider's webhook subscription can be registered or configured at all (Gmail `watch()`, Graph `/subscriptions`, Slack's Event Subscriptions Request URL set once in the Slack app dashboard from item 5, and Calendly's per-account subscriptions registered automatically after connect), and before the renewal cron (`app/api/cron/renew-watches`) can actually be scheduled against anything. The webhook/renewal code itself is done (see "Push notifications and renewal" and the Calendly connector section above) — this is the one thing blocking all of it from running for real. Once it exists: set `GOOGLE_PUBSUB_AUDIENCE`, `MICROSOFT_GRAPH_NOTIFICATION_URL`, `MICROSOFT_GRAPH_CLIENT_STATE`, `CALENDLY_WEBHOOK_URL`, and `CALENDLY_WEBHOOK_SIGNING_KEY` and `CRON_SECRET`, point the Slack app's Event Subscriptions at `<your-url>/api/webhooks/slack/events`, then add a scheduler (Vercel Cron via `vercel.json`, or Supabase `pg_cron`+`pg_net`) that `POST`s `/api/cron/renew-watches` with `Authorization: Bearer $CRON_SECRET` on a recurring basis (daily is enough margin for Gmail/Graph's renewal windows). Calendly's subscriptions don't expire, so they're registered once automatically right after connect (`app/api/connectors/calendly/callback/route.ts`) rather than needing this cron at all — see the note under "Calendly connector" above.

## Pages

Sign in to reach the app shell at these routes:

| Route                            | What it's for                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/sky`                           | Morning-brief landing page -- greeting, KPI tiles, "needs you" items, department rows (mock data until M6)                         |
| `/canopy`, `/ground`             | Department kanban and per-deal detail views (mock data until M6)                                                                   |
| Ask bar (top nav)                | Ask Mimus a question; answers come with clickable sources                                                                          |
| `/sources/{message\|event}/{id}` | Where a clicked source opens -- the email or calendar event, if you're allowed to see it                                           |
| `/members`                       | Invite teammates, change roles, remove members                                                                                     |
| `/settings/connections`          | Connect one or more Google accounts (Gmail & Calendar) and Slack workspaces, plus Microsoft or Calendly; set each row's visibility |
| `/billing`                       | Plans and current subscription, Stripe Checkout button                                                                             |
| `/feature-switches`              | Owner-only toggles for the four product areas (money/pipeline/projects/canopy)                                                     |
| `/audit-log`                     | Placeholder — becomes the AI agent activity log once the agent ships (Milestone 4+)                                                |

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
