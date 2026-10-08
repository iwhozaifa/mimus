import { backfillGoogleAccount } from '@/src/server/connectors/google/backfill';
import { completeGoogleConnection } from '@/src/server/connectors/google/connect';
import { disconnectGoogleAccount } from '@/src/server/connectors/google/disconnect';
import { getAuthUrl, refreshAndStoreTokens } from '@/src/server/connectors/google/oauth';
import { handleGooglePubSubPush } from '@/src/server/connectors/google/webhook';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

// poll() has no dedicated task since Google has a push mechanism
// (handleWebhook, above), but the Connector interface requires it as a
// fallback for accounts that can't register a watch -- no such path
// exists yet, so it stays a stub.
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
  async handleWebhook(req) {
    return handleGooglePubSubPush(req);
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
