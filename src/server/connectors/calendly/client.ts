import { createServiceClient } from '@/src/db/service';
import { decryptToken, pgByteaToBuffer } from '@/src/server/crypto/tokenVault';

const API_BASE = 'https://api.calendly.com';

// Deliberately has no `method` parameter -- there is no way to construct
// a write call (POST/PATCH/DELETE against scheduled_events/invitees)
// through this function, by construction. This is what backs sync.ts's
// "no outbound write call exists in this module" guarantee: it isn't
// just that nothing currently calls a write endpoint, it's that nothing
// *can*, short of bypassing this module and calling fetch() directly.
export async function calendlyGet<T>(
  accessToken: string,
  path: string,
  searchParams?: Record<string, string>,
): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Calendly API request to ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getDecryptedAccessToken(connectedAccountId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data: secret, error } = await supabase
    .from('connected_account_secrets')
    .select('encrypted_access_token, key_version')
    .eq('connected_account_id', connectedAccountId)
    .single();
  if (error) throw error;
  if (!secret.encrypted_access_token || secret.key_version == null) {
    throw new Error(`No stored Calendly credentials for connected account ${connectedAccountId}`);
  }

  return decryptToken(pgByteaToBuffer(secret.encrypted_access_token as string), secret.key_version);
}
