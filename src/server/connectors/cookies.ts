// OAuth CSRF-nonce cookie names, one per provider, shared between each
// provider's start/callback route handlers under app/api/connectors/**.
// Kept here at the connectors root (not inside a provider subfolder) since
// those route handlers are app/** code, which the eslint import-boundary
// rule blocks from reaching into connectors/<provider>/** internals.
export const GOOGLE_OAUTH_NONCE_COOKIE = 'mimus-google-oauth-nonce';
export const MICROSOFT_OAUTH_NONCE_COOKIE = 'mimus-microsoft-oauth-nonce';
export const SLACK_OAUTH_NONCE_COOKIE = 'mimus-slack-oauth-nonce';
