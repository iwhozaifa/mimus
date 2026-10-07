try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local doesn't exist (e.g. CI) -- env vars are provided another way.
}
