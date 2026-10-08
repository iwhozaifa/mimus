import { backfillMicrosoftAccount } from '@/src/server/connectors/microsoft/backfill';
import { completeMicrosoftConnection } from '@/src/server/connectors/microsoft/connect';
import { getAuthUrl } from '@/src/server/connectors/microsoft/oauth';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

// Methods not yet backed by a real implementation -- each is replaced in
// its own later Milestone 2c task, mirroring google/index.ts's comment:
// refreshToken/disconnect land next; handleWebhook/poll stay stubs (Graph
// push subscriptions are deferred, same reason the Google equivalent was --
// no deployed public URL to register a notificationUrl against yet).
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
  async refreshToken() {
    notImplemented('refreshToken');
  },
  async disconnect() {
    notImplemented('disconnect');
  },
};

registerConnector(microsoftConnector);
