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
  // workspace) -- currently only populated by Slack, to find every member
  // connected to the same Slack workspace an Events API notification came
  // from. See supabase/migrations/0015_connected_accounts_provider_team_id.sql.
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
  disconnect(connectedAccountId: string): Promise<void>;
}
