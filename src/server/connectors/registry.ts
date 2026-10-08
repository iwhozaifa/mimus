import type { Connector, Provider } from '@/src/server/connectors/types';

// Each provider module registers itself here on import (see
// src/server/connectors/google/index.ts once it lands) rather than this
// file importing every provider directly -- keeps the registry agnostic to
// which connectors actually exist yet.
const connectors = new Map<Provider, Connector>();

export function registerConnector(connector: Connector): void {
  connectors.set(connector.provider, connector);
}

export function getConnector(provider: Provider): Connector {
  const connector = connectors.get(provider);
  if (!connector) {
    throw new Error(`no connector registered for provider "${provider}"`);
  }
  return connector;
}
