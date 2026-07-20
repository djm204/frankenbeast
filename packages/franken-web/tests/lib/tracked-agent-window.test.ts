import { describe, expect, it, vi } from 'vitest';
import type { TrackedAgentSummary } from '@franken/types';
import type { BeastApiClient } from '../../src/lib/beast-api';
import { loadTrackedAgentWindow } from '../../src/lib/tracked-agent-window';

function agent(id: string): TrackedAgentSummary {
  return {
    id,
    definitionId: 'chunk-plan',
    status: 'stopped',
    source: 'dashboard',
    createdByUser: 'operator',
    initAction: { kind: 'chunk-plan', command: '/plan', config: {} },
    initConfig: {},
    createdAt: '2026-03-11T00:00:00.000Z',
    updatedAt: '2026-03-11T00:00:00.000Z',
  };
}

describe('loadTrackedAgentWindow', () => {
  it('reloads the requested page window from fresh cursors', async () => {
    const listAgentPage = vi.fn()
      .mockResolvedValueOnce({ agents: [agent('new'), agent('first')], nextCursor: 'fresh-page-2' })
      .mockResolvedValueOnce({ agents: [agent('second')], nextCursor: 'fresh-page-3' });
    const client = { listAgentPage, getAgent: vi.fn() } as unknown as BeastApiClient;

    const window = await loadTrackedAgentWindow(client, 2, null);

    expect(listAgentPage).toHaveBeenNthCalledWith(1);
    expect(listAgentPage).toHaveBeenNthCalledWith(2, { cursor: 'fresh-page-2' });
    expect(window).toEqual({
      agents: [agent('new'), agent('first'), agent('second')],
      nextCursor: 'fresh-page-3',
      pagesLoaded: 2,
    });
  });

  it('retains a selected agent pushed beyond the refreshed window with fresh detail', async () => {
    const selected = agent('selected');
    const client = {
      listAgentPage: vi.fn().mockResolvedValue({ agents: [agent('first')] }),
      getAgent: vi.fn().mockResolvedValue({ agent: selected, events: [] }),
    } as unknown as BeastApiClient;

    const window = await loadTrackedAgentWindow(client, 1, selected.id);

    expect(client.getAgent).toHaveBeenCalledWith(selected.id);
    expect(window.agents).toEqual([agent('first'), selected]);
  });
});
