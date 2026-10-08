import { backfillMicrosoftAccount } from '@/src/server/connectors/microsoft/backfill';
import { completeMicrosoftConnection } from '@/src/server/connectors/microsoft/connect';
import { disconnectMicrosoftAccount } from '@/src/server/connectors/microsoft/disconnect';
import { getAuthUrl, refreshAndStoreTokens } from '@/src/server/connectors/microsoft/oauth';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

// handleWebhook/poll stay stubs -- Graph push subscriptions are deferred,
// same reason the Google equivalent was (handleWebhook: 2.13/2.14; poll
// has no dedicated task since Graph has a push mechanism, but the
// interface requires it as a fallback for accounts that can't register a
// subscription).
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
  async handleWebhook() {
    notImplemented('handleWebhook');
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
