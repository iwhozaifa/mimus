// The one place every provider module is imported, so importing *this*
// file (not registry.ts directly) guarantees every connector has
// self-registered. Lives at the connectors root, not inside a provider
// subfolder, so app/** code (blocked from connectors/<provider>/** by the
// eslint import-boundary rule) can import it freely.
import '@/src/server/connectors/google';
import '@/src/server/connectors/microsoft';
import '@/src/server/connectors/slack';

export { getConnector } from '@/src/server/connectors/registry';
