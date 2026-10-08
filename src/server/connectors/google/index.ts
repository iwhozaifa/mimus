import { backfillGoogleAccount } from '@/src/server/connectors/google/backfill';
import { completeGoogleConnection } from '@/src/server/connectors/google/connect';
import { disconnectGoogleAccount } from '@/src/server/connectors/google/disconnect';
import { getAuthUrl, refreshAndStoreTokens } from '@/src/server/connectors/google/oauth';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

// Methods not yet backed by a real implementation -- each is replaced in
// its own later Milestone 2 task (handleWebhook: 2.13; poll has no
// dedicated task since Google has a push mechanism, but the interface
// requires it as a fallback for accounts that can't register a watch).
function notImplemented(method: string): never {
  throw new Error(`google connector: ${method}() is not implemented yet`);
}

export const googleConnector: Connector = {
  provider: 'google',
  capabilities: ['email', 'calendar'],
  getAuthUrl,
  async handleOAuthCallback(params) {
    return completeGoogleConnection({
      workspaceId: params.workspaceId,
      userId: params.userId,
      code: params.code,
    });
  },
  async backfill(connectedAccountId) {
    await backfillGoogleAccount(connectedAccountId);
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
    await disconnectGoogleAccount(connectedAccountId);
  },
};

registerConnector(googleConnector);
