import { backfillMicrosoftAccount } from '@/src/server/connectors/microsoft/backfill';
import { completeMicrosoftConnection } from '@/src/server/connectors/microsoft/connect';
import { disconnectMicrosoftAccount } from '@/src/server/connectors/microsoft/disconnect';
import { getAuthUrl, refreshAndStoreTokens } from '@/src/server/connectors/microsoft/oauth';
import { handleMicrosoftGraphWebhook } from '@/src/server/connectors/microsoft/webhook';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

// poll() stays a stub -- Graph has a push mechanism (handleWebhook, above),
// but the Connector interface requires poll() as a fallback for accounts
// that can't register a subscription, and no such path exists yet.
function notImplemented(method: string): never {
  throw new Error(`microsoft connector: ${method}() is not implemented yet`);
}

export const microsoftConnector: Connector = {
  provider: 'microsoft',
  capabilities: ['email', 'calendar'],
  getAuthUrl,
  async handleOAuthCallback(params) {
    return completeMicrosoftConnection({
      workspaceId: params.workspaceId,
      userId: params.userId,
      code: params.code,
    });
  },
  async backfill(connectedAccountId) {
    await backfillMicrosoftAccount(connectedAccountId);
  },
  async handleWebhook(req) {
    return handleMicrosoftGraphWebhook(req);
  },
  async poll() {
    notImplemented('poll');
  },
  async refreshToken(connectedAccountId) {
    await refreshAndStoreTokens(connectedAccountId);
  },
  async disconnect(connectedAccountId) {
    await disconnectMicrosoftAccount(connectedAccountId);
  },
};

registerConnector(microsoftConnector);
