// Encrypts/decrypts the OAuth tokens stored in connected_account_secrets
// (see supabase/migrations/0005_connected_accounts.sql -- that table has
// no RLS policies at all, so this module and the service-role client are
// the only legitimate way those tokens are ever read or written).
//
// Uses the Web Crypto API (crypto.subtle), not Node's `crypto` module, so
// the exact same encrypt/decrypt code also runs unmodified in the Deno
// Edge Functions (backfill, watch renewal) that need to read these tokens.
//
// Storage format is the 12-byte IV followed by the AES-GCM ciphertext
// (which already includes its auth tag). `key_version` picks which env
// var decrypted/encrypted a given row, so rotating the active key never
// requires re-encrypting existing rows atomically.

const IV_LENGTH = 12;

function activeKeyVersion(): number {
  const raw = process.env.TOKEN_ENCRYPTION_KEY_VERSION;
  return raw ? Number.parseInt(raw, 10) : 1;
}

function envVarForVersion(version: number): string {
  return version === 1 ? 'TOKEN_ENCRYPTION_KEY' : `TOKEN_ENCRYPTION_KEY_V${version}`;
}

async function importKey(version: number): Promise<CryptoKey> {
  const envVar = envVarForVersion(version);
  const base64Key = process.env[envVar];
  if (!base64Key) {
    throw new Error(
      `${envVar} is not set -- cannot encrypt/decrypt tokens at key version ${version}`,
    );
  }
  const rawKey = Buffer.from(base64Key, 'base64');
  return crypto.subtle.importKey('raw', rawKey as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptToken(
  plaintext: string,
): Promise<{ ciphertext: Buffer; keyVersion: number }> {
  const keyVersion = activeKeyVersion();
  const key = await importKey(keyVersion);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  );
  return { ciphertext: Buffer.concat([iv, Buffer.from(encrypted)]), keyVersion };
}

export async function decryptToken(ciphertext: Buffer, keyVersion: number): Promise<string> {
  const key = await importKey(keyVersion);
  const iv = ciphertext.subarray(0, IV_LENGTH) as BufferSource;
  const data = ciphertext.subarray(IV_LENGTH) as BufferSource;
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// PostgREST represents `bytea` columns as a `\x`-prefixed hex string on
// both read and write (verified directly against the local Supabase
// instance rather than assumed) -- these convert connected_account_secrets'
// encrypted_access_token/encrypted_refresh_token columns to and from that.
export function bufferToPgBytea(buffer: Buffer): string {
  return `\\x${buffer.toString('hex')}`;
}

export function pgByteaToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/^\\x/, ''), 'hex');
}
