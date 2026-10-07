<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Practices for this repo

See `PLAN.md` for the full implementation plan driving this build.

### Test-first, always

Write the test before the code it tests. Run it and confirm it fails for the right reason (missing module/table/function — not a typo), then implement until it passes. This applies at every layer:

- **SQL/RLS**: pgTAP tests in `supabase/tests/*.sql`, run via `supabase test db --local`. For any RLS claim, assert row counts as each role (owner/manager/member) by setting `role authenticated` + `request.jwt.claims` — never infer correctness from reading the policy SQL.
- **Server logic**: vitest integration tests in `tests/server/**`, run against the **real local Supabase instance** (via `createServiceClient()`), not mocks — the one exception is genuinely external paid APIs (Resend, Stripe), which get mocked at that boundary only.
- **UI flows**: Playwright e2e in `tests/e2e/**`. Auth flows use real magic links read back from the local Mailpit inbox (`http://127.0.0.1:54324`), not stubbed sessions.

### The permission boundary lives in the database, not the app

Every visibility rule (private/team/company connected-account visibility, owner/manager/member management matrix, owner-only audit log) is a Postgres RLS policy backed by a `SECURITY DEFINER` SQL function. TypeScript wrappers in `src/server/permissions/*` are thin RPC pass-throughs to those same functions — never a parallel reimplementation — so the TS and SQL layers cannot drift apart. Functions that are internal decision helpers (`get_workspace_role`, `can_manage_member`, `can_see_connected_account`) are explicitly `revoke`d from `anon`/`authenticated`; only functions meant to be called by any role regardless of their own RLS access (`log_agent_request`) are left grantable.

### Full check suite before every commit

`npm run lint && npm run format && npm run typecheck && npm run test`, plus `supabase test db --local` for any migration/RLS change, plus `npm run build` for any change that could affect Next.js's Cache Components static-shell validation (a route reading `cookies()`/dynamic data outside `<Suspense>`, or a client hook like `useSearchParams()` without its own boundary, is a **build error** in this Next.js version, not a lint warning). Run the full Playwright suite too when UI/auth/routing changed.

### Git workflow

One feature branch per task (`feature/<name>`), test-first commits, push, open a PR with a summary and test evidence, merge once the real CI run on GitHub Actions is green (`gh run watch <id> --exit-status` — not just local checks). **Always confirm `git branch --show-current` is a feature branch, never `main`, before committing.** Conventional Commit messages, each ending with the repo's required `Co-Authored-By` trailer.

### Don't guess library APIs

This codebase tracks very recent framework versions (Next.js 16 with Cache Components, React 19, current Supabase/Stripe/Resend SDKs) that routinely diverge from training data — e.g. `middleware.ts` is deprecated in favor of `proxy.ts`, and several Cache Components build errors have no equivalent in older Next.js. Check `node_modules/*/dist/docs` or fetch current docs before relying on memory for any third-party API.

### Never invent external account values

Google Cloud, Microsoft Entra, Slack, Calendly, Anthropic, Stripe, Resend, Vercel, Supabase Cloud credentials are asked for from the user at the exact point a task first needs them (see the "External accounts" table in `PLAN.md`) — never fabricated, never assumed from a different project's values.
