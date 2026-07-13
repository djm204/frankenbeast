import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeastApiClient, BeastApiError } from './beast-api';

const BASE_URL = 'http://localhost:3737';

describe('BeastApiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('surfaces structured backend error messages and codes for create-agent failures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Definition id is required.',
        details: { field: 'definitionId' },
      },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }));

    const client = new BeastApiClient(BASE_URL);

    await expect(client.createAgent({
      definitionId: '',
      initAction: { kind: 'design-interview', command: 'start', config: {} },
      initConfig: {},
    })).rejects.toMatchObject({
      name: 'BeastApiError',
      message: 'Definition id is required. (HTTP 400, VALIDATION_FAILED)',
      status: 400,
      code: 'VALIDATION_FAILED',
      details: { field: 'definitionId' },
    } satisfies Partial<BeastApiError>);
  });

  it('surfaces text backend error bodies instead of only HTTP status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Container runtime guard rejected launch', {
      status: 409,
      headers: { 'Content-Type': 'text/plain' },
    }));

    const client = new BeastApiClient(BASE_URL);

    await expect(client.startAgent('agent-1')).rejects.toThrow('Container runtime guard rejected launch (HTTP 409)');
  });

  it('falls back to HTTP status when a failed response has no body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    const client = new BeastApiClient(BASE_URL);

    await expect(client.listAgents()).rejects.toThrow('HTTP 500');
  });
});
