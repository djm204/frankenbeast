import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeastApiClient, BeastApiError } from './beast-api';

const createAgentInput = {
  definitionId: 'design-interview',
  initAction: { kind: 'design-interview', command: 'fbeast run agent', config: {} },
  initConfig: {},
} as const;

describe('BeastApiClient error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces structured API error messages with status, code, and details', async () => {
    const details = { field: 'initConfig.provider' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: 'Provider is required before launching an agent.',
        code: 'VALIDATION_FAILED',
        details,
      },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })));

    const client = new BeastApiClient('http://beast.test');

    await expect(client.createAgent(createAgentInput)).rejects.toMatchObject({
      name: 'BeastApiError',
      message: 'Provider is required before launching an agent. (HTTP 400, VALIDATION_FAILED)',
      status: 400,
      code: 'VALIDATION_FAILED',
      details,
    } satisfies Partial<BeastApiError>);
  });

  it('surfaces direct message/error fields and plain text backend errors', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Agent name is already in use.', code: 'DUPLICATE_AGENT' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('Container runtime is unavailable.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }));
    vi.stubGlobal('fetch', fetch);

    const client = new BeastApiClient('http://beast.test');

    await expect(client.createAgent(createAgentInput)).rejects.toMatchObject({
      message: 'Agent name is already in use. (HTTP 409, DUPLICATE_AGENT)',
      status: 409,
      code: 'DUPLICATE_AGENT',
    });
    await expect(client.createAgent(createAgentInput)).rejects.toMatchObject({
      message: 'Container runtime is unavailable. (HTTP 503)',
      status: 503,
    });
  });

  it('falls back to status-only errors when the response has no usable body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    const client = new BeastApiClient('http://beast.test');

    await expect(client.createAgent(createAgentInput)).rejects.toMatchObject({
      message: 'HTTP 500',
      status: 500,
    });
  });
});
