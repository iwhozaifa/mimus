import { completeCalendlyConnection } from '@/src/server/connectors/calendly/connect';
import { disconnectCalendlyAccount } from '@/src/server/connectors/calendly/disconnect';
import { getAuthUrl, refreshAndStoreTokens } from '@/src/server/connectors/calendly/oauth';
import { pollCalendlyAccount } from '@/src/server/connectors/calendly/poll';
import { syncCalendlyAccount } from '@/src/server/connectors/calendly/sync';
import { handleCalendlyWebhook } from '@/src/server/connectors/calendly/webhook';
import { registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';

export const calendlyConnector: Connector = {
  provider: 'calendly',
  capabilities: ['scheduling'],
  getAuthUrl,
  async handleOAuthCallback(params) {
    return completeCalendlyConnection({
      workspaceId: params.workspaceId,
      userId: params.userId,
      code: params.code,
    });
  },
  async backfill(connectedAccountId) {
    await syncCalendlyAccount(connectedAccountId);
  },
  async handleWebhook(req) {
    return handleCalendlyWebhook(req);
  },
  async poll(connectedAccountId) {
    await pollCalendlyAccount(connectedAccountId);
  },
  async refreshToken(connectedAccountId) {
    await refreshAndStoreTokens(connectedAccountId);
  },
  async disconnect(connectedAccountId) {
    await disconnectCalendlyAccount(connectedAccountId);
  },
};

registerConnector(calendlyConnector);
