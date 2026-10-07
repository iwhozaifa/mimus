import { describe, expect, it } from 'vitest';
import { getAppName } from '../../src/config/app';

describe('app config', () => {
  it('exposes the product name from a single config value', () => {
    expect(getAppName()).toBe('Mimus');
  });
});
