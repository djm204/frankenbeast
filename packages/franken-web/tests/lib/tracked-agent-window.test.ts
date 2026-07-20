import { describe, expect, it, vi } from 'vitest';
import type { TrackedAgentSummary } from '@franken/types';
import type { BeastApiClient } from '../../src/lib/beast-api';
import { loadMissingAgentRuns, loadTrackedAgentWindow, sortTrackedAgentsNewestFirst } from '../../src/lib/tracked-agent-window';

function agent(id: string, createdAt = '2026-03-11T00:00:00.000Z'): TrackedAgentSummary {
  return {
    id,
    definitionId: 'chunk-plan',
    status: 'stopped',
    source: 'dashboard',
    createdByUser: 'operator',
    initAction: { kind: 'chunk-plan', command: '/plan', config: {} },
    initConfig: {},
    createdAt,
    updatedAt: createdAt,
  };
}

describe('loadTrackedAgentWindow', () => {
  it('reloads the requested page window from fresh cursors', async () => {
    const listAgentPage = vi.fn()
      .mockResolvedValueOnce({
        agents: [agent('new', '2026-03-12T00:00:00.000Z'), agent('first')],
        nextCursor: 'fresh-page-2',
      })
      .mockResolvedValueOnce({
        agents: [agent('second', '2026-03-10T00:00:00.000Z')],
        nextCursor: 'fresh-page-3',
      });
    const client = { listAgentPage, getAgent: vi.fn() } as unknown as BeastApiClient;

    const window = await loadTrackedAgentWindow(client, 2, null);

    expect(listAgentPage).toHaveBeenNthCalledWith(1);
    expect(listAgentPage).toHaveBeenNthCalledWith(2, { cursor: 'fresh-page-2' });
    expect(window).toEqual({
      agents: [
        agent('new', '2026-03-12T00:00:00.000Z'),
        agent('first'),
        agent('second', '2026-03-10T00:00:00.000Z'),
      ],
      nextCursor: 'fresh-page-3',
      pagesLoaded: 2,
    });
  });

  it('retains a selected agent pushed beyond the refreshed window with fresh detail', async () => {
    const selected = agent('selected', '2026-03-10T00:00:00.000Z');
    const client = {
      listAgentPage: vi.fn().mockResolvedValue({ agents: [agent('first')] }),
      getAgent: vi.fn().mockResolvedValue({ agent: selected, events: [] }),
    } as unknown as BeastApiClient;

    const window = await loadTrackedAgentWindow(client, 1, selected.id);

    expect(client.getAgent).toHaveBeenCalledWith(selected.id);
    expect(window.agents).toEqual([agent('first'), selected]);
  });

  it('keeps linked-run hydration best-effort when a historical run is unavailable', async () => {
    const getRun = vi.fn()
      .mockRejectedValueOnce(new Error('corrupt historical run'))
      .mockResolvedValueOnce({ run: { id: 'run-ok' } });
    const client = { getRun } as unknown as BeastApiClient;
    const agents = [
      { ...agent('first'), dispatchRunId: 'run-bad' },
      { ...agent('second'), dispatchRunId: 'run-ok' },
    ];

    await expect(loadMissingAgentRuns(client, agents, [])).resolves.toEqual([{ id: 'run-ok' }]);
    expect(getRun).toHaveBeenCalledTimes(2);
  });

  it('restores server keyset ordering when retained selections are merged with later pages', () => {
    const rows = [
      agent('newest', '2026-03-12T00:00:00.000Z'),
      agent('m-selected'),
      agent('z-page'),
      agent('a-page'),
    ];

    expect(sortTrackedAgentsNewestFirst(rows).map(({ id }) => id)).toEqual([
      'newest',
      'z-page',
      'm-selected',
      'a-page',
    ]);
  });
});
