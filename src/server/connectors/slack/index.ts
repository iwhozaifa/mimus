import { backfillSlackAccount } from '@/src/server/connectors/slack/backfill';
import { completeSlackConnection } from '@/src/server/connectors/slack/connect';
import { disconnectSlackAccount } from '@/src/server/connectors/slack/disconnect';
import { handleSlackEvent } from '@/src/server/connectors/slack/events';
import { getAuthUrl, refreshToken as refreshSlackToken } from '@/src/server/connectors/slack/oauth';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

// poll() has no fallback implementation -- Slack has no per-account
// polling equivalent to Gmail's; the single app-wide Events API
// subscription (handleWebhook, above) is the only ingestion path for
// real-time messages, backed up by backfill() for history.
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
  async handleWebhook(req) {
    return handleSlackEvent(req);
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
