import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import eslintConfigPrettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
  {
    // Route/UI code must go through src/server service functions, never
    // reach into a connector module directly (keeps the permission engine
    // and RLS the only enforcement points — see the implementation plan).
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/connectors/*/**'],
              message:
                'Import connector functionality through a src/server service module, not the connector internals directly.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'supabase/.branches/**',
    'supabase/.temp/**',
    // Deno runtime, not part of the Next.js app's lint/type scope.
    'supabase/functions/**',
  ]),
]);

export default eslintConfig;
