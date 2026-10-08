import { completeSlackConnection } from '@/src/server/connectors/slack/connect';
import { disconnectSlackAccount } from '@/src/server/connectors/slack/disconnect';
import { getAuthUrl, refreshToken as refreshSlackToken } from '@/src/server/connectors/slack/oauth';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

// backfill/handleWebhook/poll land in the next two M3 tasks (Slack
// backfill + message normalization, Slack Events API webhook ingestion)
// -- the OAuth connect/disconnect round-trip this task delivers doesn't
// need them yet.
function notImplemented(method: string): never {
  throw new Error(`slack connector: ${method}() is not implemented yet`);
}

export const slackConnector: Connector = {
  provider: 'slack',
  capabilities: ['slack'],
  getAuthUrl,
  async handleOAuthCallback(params) {
    return completeSlackConnection({
      workspaceId: params.workspaceId,
      userId: params.userId,
      code: params.code,
    });
  },
  async backfill() {
    notImplemented('backfill');
  },
  async handleWebhook() {
    notImplemented('handleWebhook');
  },
  async poll() {
    notImplemented('poll');
  },
  async refreshToken() {
    await refreshSlackToken();
  },
  async disconnect(connectedAccountId) {
    await disconnectSlackAccount(connectedAccountId);
  },
};

registerConnector(slackConnector);
