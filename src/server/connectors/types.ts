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
  getAuthUrl(state: string): string;
  handleOAuthCallback(params: OAuthCallbackParams): Promise<ConnectedAccountRow[]>;
  backfill(connectedAccountId: string): Promise<void>;
  handleWebhook(req: Request): Promise<Response>;
  poll(connectedAccountId: string): Promise<void>;
  refreshToken(connectedAccountId: string): Promise<void>;
  send?(connectedAccountId: string, draft: unknown): Promise<SendResult>;
  disconnect(connectedAccountId: string): Promise<void>;
}
