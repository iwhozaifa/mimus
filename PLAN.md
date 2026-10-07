# Mimus V1 (First Stage, Web App) — Implementation Plan

> **Status (2026-10-07):** Milestone 1 (Foundation) is complete — all 16 tasks merged. The Sky/Canopy/Ground front-end redesign (PR #28) also landed ahead of schedule, against client-supplied mockups and mock/sample data — see the note under Milestone 6. Milestone 2 (Google, then Microsoft connectors) is next for backend work. See `AGENTS.md` for the practices this plan established.

## Context

Mimus is an AI chief-of-staff for founder-led businesses ($1M–$20M revenue, 5–100 people): it connects a founder's email, calendars, and Slack, surfaces what needs attention, answers questions within strict permission boundaries, and handles email-to-calendar scheduling with approval. This is **V1, first stage, web only** — macOS/iPhone come later, so business logic, data models, and API clients must stay server-side and API-first so native clients can be added later without rework.

The working directory (`/home/whusan/aliyan`) is currently empty and not a git repo — this is a greenfield build. The plan below is the result of a full interview with the user resolving every open question in the original spec, followed by a detailed architecture/task-breakdown design pass. Two gaps in the original spec were surfaced and resolved during planning (noted inline): the "Team" vs "Company" visibility levels collapse into one scope without a reporting-line concept, and invite emails require a transactional email provider not in the original external-accounts list.

**Note on tooling:** the spec names three skills — Superpowers, grill-me, Context7 — none of which are installed in this environment. Their _intent_ is followed manually throughout this plan: test-first on every task, no filled-in assumptions without confirmation (all resolved below), and current library/API docs should be checked via web search before relying on memory for any third-party API.

---

## Confirmed decisions

- **Stack:** Next.js + TypeScript, Supabase (Postgres + RLS + Auth), Stripe Billing, Claude API (Anthropic) behind a swappable provider interface.
- **Background jobs:** Supabase Edge Functions + pg_cron.
- **Shared layer for future macOS/iOS:** API-first backend, thin future clients. All business logic/permissions/data models live server-side. No monorepo — single Next.js repo with internal module boundaries.
- **"Team" = Workspace.** No separate Team entity for membership purposes.
- **Visibility levels:** keep all three (Private/Team/Company) by introducing a lightweight `manager_id` (reporting-line) field — see Schema section. Team = the connecting member + their direct manager + peers reporting to the same manager. Company = workspace-wide, Owner-curated allow-list.
- **Manager invite/remove scope:** a Manager may invite and remove Members only. Only the Owner may create/remove/promote/demote Managers or change anyone's role.
- **Slack in beta:** Events API now, behind a Mimus-owned Slack tool interface; swapping to Slack's official MCP server later only changes that one module.
- **Data retention:** 90-day backfill on Gmail/Outlook connect; retain while connected, purge on disconnect.
- **Hosting:** Vercel (app, branch-deploy environments) + Supabase Cloud (matching dev/staging/prod projects).
- **Pricing/plan limits/AI spend caps:** placeholders in a `plans` table now; exact numbers before Stripe billing goes live (M1) and before spend-cap enforcement is built (M4).
- **Repo:** single Next.js repo, no monorepo tooling; module boundaries enforced by an eslint import-boundary rule.
- **Connector build order (Milestone 2):** Google (Gmail + Calendar) before Microsoft (Outlook + Graph).
- **Invite emails:** Resend (new dependency surfaced during planning — not in the original external-accounts list).
- **External accounts:** none exist yet. Ask the user for each at the exact point the plan below first needs it — never invent values.

---

## Architecture

### Repo layout

```
/app                          # Next.js App Router routes (UI + API)
  /(auth)/sign-in, sign-up
  /(app)/sky, ground/[personId], settings/*
  /api/workspaces, /api/invites, /api/webhooks/{stripe,google,microsoft,slack,calendly}
/src/server
  /permissions/               # central permission engine
  /connectors/{google,microsoft,slack,calendly,shared}/
  /agent/{router,modules,tools,providers}/
  /billing/
  /events/                    # event-signal emit/consume
  /widgets/
  /crypto/                    # token vault (encrypt/decrypt)
  /db/                        # typed supabase client factories
/supabase
  /migrations/*.sql
  /functions/*                # Edge Functions (Deno)
  /tests/*.sql                # pgTAP
/tests                        # vitest unit/integration
/tests/e2e                    # Playwright
```

### Database schema (Postgres/Supabase)

**Identity/org:** `companies` (one Stripe customer each), `profiles` (mirrors `auth.users`), `workspaces`, `workspace_members` (role: owner/manager/member, self-referencing nullable `manager_id` for the reporting-line/visibility feature, `status`), `invites` (token-based, expiring).

**Connections:** `connected_accounts` (provider, visibility: private/team/company, owner, status, backfill/sync timestamps), `connected_account_secrets` (encrypted tokens, **no RLS policy = default deny**, service-role only — never queryable by any user or AI session), `connected_account_shares` (Owner's allow-list for Company visibility).

**Shared data shapes:** `people`, `messages` (email + Slack, normalized), `events` (all calendar providers, normalized), `event_signals` (durable queue for `message.received`/`event.created`/`meeting.booked`, consumed by a cron-triggered Edge Function — not Postgres LISTEN/NOTIFY, so nothing is lost across cold starts).

**AI:** `agent_logs` (nature, priority, model tier/id, tokens, cost, sources — owner-only read via RLS, written via a `SECURITY DEFINER` function so the audit trail is always complete), `agent_spend_counters` (daily rollup for the 80%-of-cap tier-drop rule), `preferences`.

**Billing/plans:** `plans` (feature-switch defaults, AI spend cap, seat limit — placeholder values), `workspace_subscriptions` (one Stripe subscription item per workspace), `feature_switches` (per-workspace overrides).

**Scheduling (M5):** `scheduling_rules`, `approval_settings` (levels 1–4).

### The AI permission boundary — enforced at the database, not the prompt

**Decision:** Mimus tools execute their content queries (search over `messages`/`events`/`people`/`connected_accounts`) under the _requesting user's own_ Supabase session/JWT — the forwarded access token for interactive requests, or a short-lived server-minted JWT (`sub = user_id`) for background jobs with no live session (morning brief, scheduled triage). RLS then applies identically to however that user would query directly. This means there is exactly one policy set to write and test, not an app-layer copy that can drift from the database copy. The service role is reserved for system writes only (connector ingestion, Stripe webhooks, the `log_agent_request()` audit insert) — **never** for AI content reads.

One `SECURITY DEFINER`, `STABLE` SQL function, `can_see_connected_account(account_id, uid)`, is the single predicate every `SELECT` policy on `connected_accounts`/`messages`/`events` composes with. It encodes: owner always sees their own; Company visibility requires Owner role or an explicit `connected_account_shares` entry; Team visibility requires matching `manager_id` (same manager, or the manager themself). A second function, `get_workspace_role`, backs `WITH CHECK` clauses on writes (e.g. only Owner/Manager may set `visibility='company'`; only Owner may insert a `role='manager'` member row).

### Permission engine (`src/server/permissions/`)

Defense in depth, RLS is the source of truth — every exported TS function is a typed wrapper that calls the _same_ Postgres function via RPC, so the TS and SQL layers cannot diverge. It exists for: fast UI-level affordance checks, building the allowed-scope filter a Mimus tool passes into its own query (narrower queries, not just post-hoc RLS rejection), and a single grep-able call site for every permission decision in the app. Surface: `getWorkspaceRole`, `canManageMember`, `canInviteWithRole`, `canConnectAccount`, `listVisibleConnectedAccountIds`, `canSeeConnectedAccount`, `assertFeatureEnabled`, `canViewAuditLog`. Every API route and every Mimus tool calls this before querying; the query then also runs under the user's own session so RLS is the backstop if the app check is ever wrong.

### Standard connector interface (`src/server/connectors/types.ts`)

```ts
interface Connector {
  provider: 'google' | 'microsoft' | 'slack' | 'calendly';
  capabilities: Array<'email' | 'calendar' | 'slack' | 'scheduling'>;
  getAuthUrl(params): string;
  handleOAuthCallback(params): Promise<ConnectedAccount>;
  backfill(connectedAccountId): Promise<void>; // 90-day window
  handleWebhook(req): Promise<void>;
  poll(connectedAccountId): Promise<void>; // fallback where no push
  refreshToken(connectedAccountId): Promise<void>;
  send?(connectedAccountId, draft): Promise<SendResult>; // email only
  disconnect(connectedAccountId): Promise<void>; // revoke + purge (retention rule)
}
```

Each provider implements this in its own module. Normalization into `message`/`person`/`event` happens once, at the connector boundary (`src/server/shared/normalize.ts`), never downstream. After every insert, the connector emits an event signal via `src/server/events/emit.ts`.

**Slack is the one connector the AI never calls directly.** `src/server/connectors/slack/tool.ts` exposes a narrow Mimus-only surface that resolves visible channels via the permission engine, uses _that user's own_ stored Slack token, and returns normalized messages. When Slack's MCP server becomes usable post-Marketplace-listing, only this module's internals change — its exported interface to the agent tool layer stays identical.

### Agent module spec (`src/server/agent/modules/types.ts`)

Each AI skill declares `{ name, nature, defaultTier, defaultPriority, needs: { sources, crossSource? }, permissions: { requiresApproval? }, tools: string[], run() }`. The model router consumes `defaultTier`/`defaultPriority` as rule-based Step 1; a classifier implements Step 2 (fast-tier classification of free text, escalating a tier on low confidence); an escalation module implements Step 3 (retry one tier up, once, on failed output checks). The tool-calling layer only exposes the tools named in the active module's `tools[]` to the model — each tool independently re-checks permissions and runs under the user-scoped client, so the module spec narrows what's _offered_, RLS still enforces what's _returned_. The AI provider is abstracted (`AiProvider.complete()`) with `providers/anthropic.ts` as the only implementation today.

### Widget manifest (`src/server/widgets/types.ts`)

`{ id, title, size, dataNeeds: { sources, scope }, permissions: { minRole?, featureKey? }, settings? }`. V1 ships four built-in tiles (Needs you/Today/People/Decisions) against this manifest so the future drag-and-drop builder has a real contract to consume — no builder UI ships now.

---

## Build order and tasks

### Milestone 1 — Foundation ✅ complete

| #    | Task                                                                                                            | Tests first                                                                | Key files                                                                    | Definition of done                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1.1  | Repo scaffold: Next.js+TS, Supabase CLI/Docker, eslint/prettier/vitest/playwright, commitlint+husky             | `tests/smoke.test.ts`                                                      | `package.json`, `vitest.config.ts`, `supabase/config.toml`                   | `lint && typecheck && test` green on empty app                                      |
| 1.2  | Core schema migration: companies, profiles, workspaces, workspace_members, invites, RLS deny-by-default         | `supabase/tests/core_schema.sql` (pgTAP)                                   | `supabase/migrations/0001_core_schema.sql`                                   | cross-workspace select returns 0 rows for a non-member                              |
| 1.3  | Auth (Supabase email/magic-link) + session middleware                                                           | `tests/e2e/auth.spec.ts`                                                   | `app/(auth)/sign-in/page.tsx`, `proxy.ts`                                    | sign up/in, session persists                                                        |
| 1.4  | Workspace creation on signup                                                                                    | `tests/server/workspaces/createWorkspace.test.ts`                          | `src/server/workspaces/createWorkspace.ts`                                   | new user lands in exactly one owned workspace                                       |
| 1.5  | Role model: `get_workspace_role`/`can_manage_member` SQL + permission engine wrappers                           | `supabase/tests/permissions.sql`, `tests/server/permissions/roles.test.ts` | `supabase/migrations/0003_role_model.sql`, `src/server/permissions/roles.ts` | full owner/manager/member matrix asserted                                           |
| 1.6  | `manager_id` column + confirmed Manager-scope invite/remove rule                                                | `supabase/tests/manager_id.sql`                                            | `supabase/migrations/0004_manager_id.sql`                                    | Manager cannot touch Manager/Owner rows; can add/remove Members                     |
| 1.7  | Invite flow + Resend transactional email                                                                        | `tests/server/invites/{create,accept}.test.ts`                             | `src/server/invites/*`, `app/invite/[token]/page.tsx`                        | invited email receives link, accept creates correct-role membership                 |
| 1.8  | `connected_accounts`/`connected_account_shares`/`connected_account_secrets` + `can_see_connected_account` + RLS | `supabase/tests/connected_accounts_rls.sql`                                | `supabase/migrations/0005_connected_accounts.sql`                            | private/team/company visibility matrix green across all 3 roles                     |
| 1.9  | Settings → Connections UI skeleton (stub provider)                                                              | `tests/e2e/connections.spec.ts`                                            | `app/(app)/settings/connections/page.tsx`                                    | visibility toggle end-to-end against 1.8's RLS                                      |
| 1.10 | `plans`/`workspace_subscriptions`/`feature_switches` + engine                                                   | `tests/server/featureSwitches.test.ts`                                     | `supabase/migrations/0007_plans_feature_switches.sql`                        | OFF switches (Money/Pipeline/Projects/Canopy) hide nav entries                      |
| 1.11 | Stripe billing skeleton: company=customer, workspace=sub item, checkout + webhook                               | `tests/server/billing/webhook.test.ts` (mocked)                            | `app/api/webhooks/stripe/route.ts`                                           | test-mode subscribe/cancel round-trip updates `workspace_subscriptions`             |
| 1.12 | Kill-switch middleware                                                                                          | `tests/server/billing/killSwitch.test.ts`                                  | `src/server/billing/killSwitch.ts`                                           | lapsed workspace → read-only; company's other workspaces unaffected                 |
| 1.13 | `agent_logs` + `log_agent_request()` + owner-only RLS                                                           | `supabase/tests/agent_logs_rls.sql`                                        | `supabase/migrations/0008_agent_logs.sql`                                    | non-owner select returns 0 rows; insert always works                                |
| 1.14 | `event_signals` + emit/consume scaffold                                                                         | `tests/server/events/emit.test.ts`                                         | `supabase/functions/process-event-signals/index.ts`                          | signal inserted → marked processed within test window                               |
| 1.15 | CI pipeline gating PRs                                                                                          | infra                                                                      | `.github/workflows/ci.yml`                                                   | PR cannot merge red                                                                 |
| 1.16 | Staging deploy + smoke E2E                                                                                      | `tests/e2e/smoke-staging.spec.ts`                                          | staging Supabase project                                                     | sign up → create workspace → invite → toggle connection visibility, live on staging |

### Milestone 2 — Google, then Microsoft connectors

- `src/server/connectors/google/{oauth,gmail,calendar,webhook}.ts` first; `microsoft/{oauth,mail,calendar,webhook}.ts` second; shared `src/server/shared/normalize.ts`.
- Backfill Edge Functions (90-day window) + purge-on-disconnect job; webhook endpoints (`app/api/webhooks/google/pubsub`, `.../microsoft/graph`) + Graph subscription-renewal cron.
- Token encryption via `src/server/crypto/tokenVault.ts` (AES-GCM).
- Tests first: normalize tests, OAuth-callback tests, webhook signature verification, backfill idempotency (unique constraint from §Schema).
- DoD: connecting a real Google account backfills 90 days of mail+calendar visible per the M1 RLS matrix; disconnect purges rows. Repeat for Microsoft.
- **External accounts needed at start:** Google Cloud project (OAuth client, Pub/Sub topic, consent screen → CASA Tier 2 queue) — ask for this first; Microsoft Entra multi-tenant app (admin-consent flow) — ask when Google is demoed and Microsoft work begins.

### Milestone 3 — Slack + Calendly

- `src/server/connectors/slack/{tool.ts,events.ts}` (Events API, MCP-ready interface), `app/api/webhooks/slack/events/route.ts`.
- `src/server/connectors/calendly/{oauth,sync,webhook,poll}.ts` (webhook on paid plans, cron-poll fallback on free).
- Tests first: Slack tool test asserting no DMs, only channels-member-is-in + mentions, always the asking user's own token; Calendly sync test asserting **no outbound write call exists in the module** (read-only, never books through Calendly).
- DoD: Slack messages/mentions and Calendly bookings normalize into `messages`/`events` per RLS.
- **External accounts needed at start:** Slack app (Events API scopes, no bot posting); Calendly OAuth app.

### Milestone 4 — Mimus AI + model router

- `src/server/agent/providers/{types,anthropic}.ts`, `router/{classifier,tiers,escalate}.ts`, `modules/*`, `tools/*` (searchMessages, searchEvents, slackSearch, draftEmail, proposeMeetingTimes), `src/server/billing/spendCaps.ts`.
- Tests first: router classification test; tool test asserting a Member's search call never returns another Member's Private-visibility data even on a crafted prompt-injection attempt (**the test must prove the database rejected the row, not that the model declined**); spend-cap tier-drop test.
- DoD: a free-text question resolves via Who→Router→Tools→Answer with tappable sources, logged to `agent_logs`.
- **External account needed:** Anthropic API key (managed by default; bring-your-own-key stores an encrypted key per workspace).

### Milestone 5 — Scheduling + approvals

- `scheduling_rules`/`approval_settings` migrations; `src/server/scheduling/{freeBusy,draftReply,bookEvent}.ts`; approval levels 1–4 in the `draft` module's `requiresApproval` flag.
- Tests first: free/busy merge across all connected calendars; all 4 approval levels; Calendly-link-vs-offer-times branch.
- DoD: scheduling email → draft reply with 2–3 slots pending approval (level 2 default) → approval creates event + invite.

### Milestone 6 — Sky, Ground, morning brief, Settings; full testing → Web V1 live

> **Sky/Ground UI shell: ✅ already built ahead of schedule (PR #28, merged 2026-10-07)**, superseding the two bullet points below in both scope and shape:
>
> - `app/(app)/sky/page.tsx` is the client's exec-KPI-dashboard concept (cash on hand, revenue, pipeline, team load, a "Needs you" list, today's schedule, a departments grid) — not the originally-planned drag-and-drop widget-tile dashboard against a widget registry. The `src/server/widgets/types.ts` manifest described above was never built; this UI doesn't need it.
> - `app/(app)/ground/[dealId]/page.tsx` is per-**deal** (timeline, people, files, an AI "why it's stalled" panel), not per-**person** as originally spec'd (`[personId]`). A new `app/(app)/canopy/[department]/page.tsx` (department kanban + AI insight rail) was also added — not in the original plan at all.
> - All three run entirely on a typed mock-data module (`src/mock/`) — there is still no real `deals`/`pipeline`/`departments`/`revenue` schema. **Still pending from this milestone:** wiring Sky/Canopy/Ground to real data (once connectors/AI below exist), the morning-brief cron, and full Settings (scheduling rules, owner-only AI usage log beyond the current placeholder).

- `supabase/functions/morning-brief` cron, full Settings (connections, roles, scheduling rules, owner-only AI usage log, billing).
- Tests first: Playwright per screen; widget-permission test (a Member never sees a tile backed by data they can't see, even though the tile renders).
- DoD: feature-complete staging demo covering the full 7-step AI path end to end; full regression suite green.

### Milestone 7 — Stretch

- IMAP/SMTP connector, Cal.com + iCloud CalDAV connectors, each implementing the standard `Connector` interface. No new external-account gating beyond user-supplied IMAP app passwords.

---

## External accounts — when each is first needed

| Credential                             | Needed at        | Status                                                                   |
| -------------------------------------- | ---------------- | ------------------------------------------------------------------------ |
| Vercel project                         | M1.16            | Pending — not yet logged in; app runs locally against staging DB for now |
| Supabase Cloud project                 | M1.16            | ✅ Done — `mimus-staging` project created and migrated                   |
| Resend account                         | M1.7             | ✅ Done — sandbox mode (no verified domain yet)                          |
| Stripe account                         | M1.11            | Pending — skeleton built, no real test-mode keys yet                     |
| Google Cloud project (OAuth + Pub/Sub) | M2 start         | Pending                                                                  |
| Microsoft Entra app (multi-tenant)     | M2, after Google | Pending                                                                  |
| Slack app                              | M3 start         | Pending                                                                  |
| Calendly OAuth app                     | M3 start         | Pending                                                                  |
| Anthropic API key                      | M4 start         | Pending                                                                  |

Ask for each at the point it's first needed — never invent a value.

---

## Platform limits flagged (informational, not blocking)

Google OAuth verification + CASA Tier 2 (100-user cap until verified) · Microsoft publisher verification + tenant admin consent for the multi-tenant app · Slack Marketplace listing required for the official MCP server (hence Events API now) · Calendly webhooks only on paid plans (Free = polling) · browser platform limits (push notification support varies, storage).

---

## Execution rules applied throughout

Test-first on every task (failing test before implementation). Small single-purpose functions/files. No dead code or unlinked TODOs. Lint + format + typecheck + full suite before every commit. Conventional commit messages. One branch per task (`feature/<name>` / `fix/<name>`), PR per task with summary + platforms verified + test evidence. Autonomous merge once the real CI run is green (see `AGENTS.md`). Never hardcode secrets — environment variables only, `.env` out of git. Merge-conflict handling per the user's stated protocol (stop, explain both sides, combine intent, never auto-resolve lock files).

---

## Verification plan

- **Per task:** the task's own test(s) pass locally (`npm run lint && typecheck && test`), plus relevant pgTAP tests for schema/RLS changes (`supabase test db`).
- **Per milestone:** the milestone's DoD demo runs on Vercel staging against a Supabase staging project — a human-followable script (e.g. M1: sign up → create workspace → invite a Manager → toggle a connection's visibility → confirm RLS blocks a Member from seeing a Private account via a direct Supabase query).
- **RLS correctness specifically:** every visibility-boundary claim is verified by a pgTAP test that performs the query as each role (owner/manager/member) and asserts row counts — not by inspecting application code, since the boundary is explicitly meant to hold even if application code is wrong.
- **AI boundary specifically (M4):** a dedicated adversarial test attempts to make the AI retrieve data outside the asker's visibility via tool-call arguments and/or prompt content, and asserts the database — not the model's judgment — is what blocks it.
- **CI:** GitHub Actions runs lint/typecheck/unit/pgTAP/build/e2e on every PR (M1.15); branch protection on `main` requires it green.
