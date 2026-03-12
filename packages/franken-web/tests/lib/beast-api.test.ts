import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BeastApiClient } from '../../src/lib/beast-api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('BeastApiClient', () => {
  const client = new BeastApiClient('http://localhost:3000', 'operator-token');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the Beast catalog with operator auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { id: 'martin-loop', label: 'Martin Loop', interviewPrompts: [] },
        ],
      }),
    });

    const catalog = await client.getCatalog();
    expect(catalog[0]?.id).toBe('martin-loop');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/beasts/catalog',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer operator-token',
        }),
      }),
    );
  });

  it('creates tracked agents and loads tracked agent detail', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'agent-1',
          status: 'initializing',
        },
      }),
    });

    await client.createAgent({
      definitionId: 'chunk-plan',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/design.md',
        config: { designDocPath: 'docs/plans/design.md' },
        chatSessionId: 'sess-1',
      },
      initConfig: { designDocPath: 'docs/plans/design.md' },
      chatSessionId: 'sess-1',
    });
    await client.listAgents();
    await client.getAgent('agent-1');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/beasts/agents',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          definitionId: 'chunk-plan',
          initAction: {
            kind: 'chunk-plan',
            command: '/plan --design-doc docs/plans/design.md',
            config: { designDocPath: 'docs/plans/design.md' },
            chatSessionId: 'sess-1',
          },
          initConfig: { designDocPath: 'docs/plans/design.md' },
          chatSessionId: 'sess-1',
        }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/beasts/agents',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/v1/beasts/agents/agent-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('controls existing beast runs once dispatch has happened', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'run-1',
          status: 'running',
        },
      }),
    });

    await client.stopRun('run-1');
    await client.killRun('run-1');
    await client.restartRun('run-1');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/beasts/runs/run-1/stop',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/beasts/runs/run-1/kill',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/v1/beasts/runs/run-1/restart',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
