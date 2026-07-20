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

describe('BeastApiClient log paging', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps getLogs compatible while accepting the paged response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        logs: ['one', 'two'],
        page: { offset: 0, nextOffset: 2, hasMore: false, tail: true, bytes: 13 },
      },
    })));
    vi.stubGlobal('fetch', fetch);

    await expect(new BeastApiClient('http://beast.test').getLogs('run/id')).resolves.toEqual(['one', 'two']);
    expect(fetch).toHaveBeenCalledWith('http://beast.test/v1/beasts/runs/run%2Fid/logs', expect.anything());
  });

  it('generates typed log page query parameters and returns metadata', async () => {
    const payload = {
      logs: ['two', 'three'],
      page: { offset: 1, nextOffset: 3, hasMore: true, tail: false, bytes: 15 },
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: payload })));
    vi.stubGlobal('fetch', fetch);

    const page = await new BeastApiClient('http://beast.test').getLogsPage('run 1', {
      offset: 1,
      limit: 2,
      tail: false,
      maxBytes: 4_096,
    });

    expect(page).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      'http://beast.test/v1/beasts/runs/run%201/logs?offset=1&limit=2&tail=false&maxBytes=4096',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
