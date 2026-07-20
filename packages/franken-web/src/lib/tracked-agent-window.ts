import type { TrackedAgentSummary } from '@franken/types';
import type { BeastApiClient } from './beast-api';

interface TrackedAgentPage {
  agents: TrackedAgentSummary[];
  nextCursor?: string;
}

export interface TrackedAgentWindow extends TrackedAgentPage {
  pagesLoaded: number;
}

export async function loadTrackedAgentWindow(
  client: BeastApiClient,
  requestedPages: number,
  selectedAgentId: string | null,
): Promise<TrackedAgentWindow> {
  const listPage = (cursor?: string): Promise<TrackedAgentPage> => {
    if (typeof client.listAgentPage === 'function') {
      return cursor ? client.listAgentPage({ cursor }) : client.listAgentPage();
    }
    return client.listAgents().then((agents) => ({ agents }));
  };
  const firstPage = await listPage();
  const agents = [...firstPage.agents];
  const seenIds = new Set(agents.map((agent) => agent.id));
  let nextCursor = firstPage.nextCursor;
  let pagesLoaded = 1;

  while (pagesLoaded < requestedPages && nextCursor) {
    const page = await listPage(nextCursor);
    for (const agent of page.agents) {
      if (!seenIds.has(agent.id)) {
        agents.push(agent);
        seenIds.add(agent.id);
      }
    }
    nextCursor = page.nextCursor;
    pagesLoaded += 1;
  }

  if (selectedAgentId && !seenIds.has(selectedAgentId)) {
    const selected = await client.getAgent(selectedAgentId).catch(() => null);
    if (selected) agents.push(selected.agent);
  }

  return { agents, nextCursor, pagesLoaded };
}
