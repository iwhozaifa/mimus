import { backfillSlackAccount } from '@/src/server/connectors/slack/backfill';
import { completeSlackConnection } from '@/src/server/connectors/slack/connect';
import { disconnectSlackAccount } from '@/src/server/connectors/slack/disconnect';
import { getAuthUrl, refreshToken as refreshSlackToken } from '@/src/server/connectors/slack/oauth';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

// handleWebhook/poll land in the next M3 task (Slack Events API webhook
// ingestion) -- real-time ingestion isn't needed yet; backfill() covers
// the 90-day history window on its own.
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
  async backfill(connectedAccountId) {
    await backfillSlackAccount(connectedAccountId);
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
