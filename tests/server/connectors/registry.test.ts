import { getConnector, registerConnector } from '@/src/server/connectors/registry';
import type { Connector } from '@/src/server/connectors/types';
import { describe, expect, it } from 'vitest';

function fakeConnector(provider: Connector['provider']): Connector {
  return {
    provider,
    capabilities: ['email'],
    getAuthUrl: () => 'https://example.com/auth',
    handleOAuthCallback: async () => [],
    backfill: async () => {},
    handleWebhook: async () => new Response(null, { status: 200 }),
    poll: async () => {},
    refreshToken: async () => {},
    disconnect: async () => {},
  };
}

describe('connector registry', () => {
  it('resolves a registered provider', () => {
    const connector = fakeConnector('google');
    registerConnector(connector);
    expect(getConnector('google')).toBe(connector);
  });

  it('throws for a provider with no registered connector', () => {
    expect(() => getConnector('slack')).toThrow(/no connector registered for provider "slack"/);
  });
});
