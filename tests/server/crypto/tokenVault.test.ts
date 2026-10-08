import {
  bufferToPgBytea,
  decryptToken,
  encryptToken,
  pgByteaToBuffer,
} from '@/src/server/crypto/tokenVault';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('token vault', () => {
  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('TOKEN_ENCRYPTION_KEY_V2', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a plaintext token through the active key version', async () => {
    const { ciphertext, keyVersion } = await encryptToken('super-secret-refresh-token');
    expect(keyVersion).toBe(1);
    const plaintext = await decryptToken(ciphertext, keyVersion);
    expect(plaintext).toBe('super-secret-refresh-token');
  });

  it('rejects tampered ciphertext', async () => {
    const { ciphertext, keyVersion } = await encryptToken('super-secret-refresh-token');
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] ^= 0xff;
    await expect(decryptToken(tampered, keyVersion)).rejects.toThrow();
  });

  it('still decrypts an old key version after the active version rotates', async () => {
    const { ciphertext, keyVersion } = await encryptToken('token-under-v1');
    expect(keyVersion).toBe(1);

    vi.stubEnv('TOKEN_ENCRYPTION_KEY_VERSION', '2');
    const { keyVersion: newVersion } = await encryptToken('token-under-v2');
    expect(newVersion).toBe(2);

    // the row encrypted under v1 must still decrypt correctly.
    await expect(decryptToken(ciphertext, keyVersion)).resolves.toBe('token-under-v1');
  });

  it('round-trips ciphertext through the Postgres bytea hex-string format', async () => {
    const { ciphertext } = await encryptToken('token-for-pg');
    const pgValue = bufferToPgBytea(ciphertext);
    expect(pgValue).toMatch(/^\\x[0-9a-f]+$/);
    expect(pgByteaToBuffer(pgValue)).toEqual(ciphertext);
  });
});
