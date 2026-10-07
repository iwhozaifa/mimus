import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Targets the real staging Supabase project and needs .env.staging --
  // run separately via `npm run test:e2e:staging`, not the default suite.
  testIgnore: ['**/smoke-staging.spec.ts'],
  fullyParallel: true,
  // Specs share one local Mailpit inbox and one local DB with no per-test
  // reset, so a handful of specs intermittently race each other under
  // parallel workers (pre-existing, not specific to any one spec -- seen
  // rotating across connections/members/billing specs in CI). A CI-only
  // retry is the standard mitigation for that class of flake; it doesn't
  // mask bugs in these specs, which all pass individually and repeatedly
  // when run alone.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: true,
      },
});
