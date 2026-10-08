// The standard interface every provider connector implements, per the
// architecture doc -- a swappable boundary so Slack/Calendly (M3) and the
// AI tool layer (M4) never need to know which provider they're talking to.

export type Provider = 'google' | 'microsoft' | 'slack' | 'calendly';
export type AccountType = 'email' | 'calendar' | 'slack' | 'scheduling';
export type ConnectedAccountStatus = 'connected' | 'needs_reauth' | 'error' | 'disconnected';

export interface ConnectedAccountRow {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  provider: Provider;
  account_type: AccountType;
  visibility: 'private' | 'team' | 'company';
  external_account_id: string | null;
  // Which provider-side workspace/tenant this account belongs to, distinct
  // from external_account_id (which identifies the person, not the
  // workspace). Slack populates it to find every member connected to the
  // same Slack workspace an Events API notification came from; Calendly
  // populates it with the organization URI its webhook-subscription
  // creation call requires. See
  // supabase/migrations/0015_connected_accounts_provider_team_id.sql.
  provider_team_id: string | null;
  status: ConnectedAccountStatus;
}

export interface OAuthCallbackParams {
  workspaceId: string;
  userId: string;
  code: string;
  state: string;
}

export interface SendResult {
  providerMessageId: string;
}

export interface Connector {
  provider: Provider;
  capabilities: AccountType[];
  // Async because Microsoft's MSAL client has to look up the authority's
  // endpoint metadata before it can build the URL -- Google's doesn't.
  getAuthUrl(state: string): Promise<string>;
  handleOAuthCallback(params: OAuthCallbackParams): Promise<ConnectedAccountRow[]>;
  backfill(connectedAccountId: string): Promise<void>;
  handleWebhook(req: Request): Promise<Response>;
  poll(connectedAccountId: string): Promise<void>;
  refreshToken(connectedAccountId: string): Promise<void>;
  send?(connectedAccountId: string, draft: unknown): Promise<SendResult>;
  // Per-account webhook subscription setup, for providers where that's a
  // one-time registration call rather than Google/Microsoft's
  // renewal-cron-driven watch() (which treats a brand-new account's null
  // watch_expires_at as already "due" and registers it on the next run)
  // or Slack's single static app-wide subscription (no per-account call
  // at all). Optional because those three providers have no use for it.
  registerWebhook?(connectedAccountId: string): Promise<void>;
  disconnect(connectedAccountId: string): Promise<void>;
}
