import { defineConfig } from '@playwright/test';

// Separate from playwright.config.ts (which ignores this file) because this
// targets the real staging Supabase project via .env.staging, not local
// Mailpit -- run with `npm run test:e2e:staging`.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/smoke-staging.spec.ts'],
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
  },
});
