import { describe, expect, it } from 'vitest';
import {
  detectAvailableSecretBackends,
  getSecretBackendCatalog,
} from '../../../src/network/network-secrets.js';

describe('secret backends', () => {
  it('orders backend detection by recommendation priority', async () => {
    const detected = await detectAvailableSecretBackends({
      commandExists: async (command) => command === 'op' || command === 'bw',
      osStoreAvailable: async () => true,
    });

    expect(detected.map((backend) => backend.id)).toEqual([
      '1password',
      'bitwarden',
      'os-store',
      'local-encrypted',
    ]);
  });

  it('allows the local encrypted fallback but marks it weaker', () => {
    const catalog = getSecretBackendCatalog();
    const local = catalog.find((backend) => backend.id === 'local-encrypted');

    expect(local?.recommended).toBe(false);
    expect(local?.warning).toContain('not the optimal solution');
  });
});
