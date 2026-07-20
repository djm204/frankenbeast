import type { TrackedAgentSummary } from '@franken/types';
import type { BeastApiClient, BeastRunSummary } from './beast-api';

interface TrackedAgentPage {
  agents: TrackedAgentSummary[];
  nextCursor?: string | undefined;
}

export interface TrackedAgentWindow extends TrackedAgentPage {
  pagesLoaded: number;
}

export function isTrackedAgentSortKeyNewer(
  candidate: { id: string; createdAt?: string },
  reference: { id: string; createdAt?: string } | undefined,
): boolean {
  if (!candidate.createdAt || !reference?.createdAt) return false;
  return candidate.createdAt > reference.createdAt
    || (candidate.createdAt === reference.createdAt && candidate.id > reference.id);
}

export function sortTrackedAgentsNewestFirst(agents: TrackedAgentSummary[]): TrackedAgentSummary[] {
  return agents.sort((a, b) => {
    if (isTrackedAgentSortKeyNewer(a, b)) return -1;
    if (isTrackedAgentSortKeyNewer(b, a)) return 1;
    return 0;
  });
}

export function mergeUniqueRuns(current: BeastRunSummary[], additions: BeastRunSummary[]): BeastRunSummary[] {
  const knownRunIds = new Set(current.map((run) => run.id));
  return [...current, ...additions.filter((run) => !knownRunIds.has(run.id))];
}

export async function loadMissingAgentRuns(
  client: BeastApiClient,
  agents: TrackedAgentSummary[],
  knownRuns: BeastRunSummary[],
): Promise<BeastRunSummary[]> {
  const knownRunIds = new Set(knownRuns.map((run) => run.id));
  const missingRunIds = [...new Set(agents.flatMap((agent) => {
    const runId = agent.dispatchRunId;
    return typeof runId === 'string' && !knownRunIds.has(runId) ? [runId] : [];
  }))];
  if (missingRunIds.length === 0) return [];
  const details = await Promise.all(missingRunIds.map((runId) => client.getRun(runId).catch(() => null)));
  return details.flatMap((detail) => detail ? [detail.run] : []);
}

export async function loadTrackedAgentWindow(
  client: BeastApiClient,
  requestedPages: number,
  selectedAgentId: string | null,
): Promise<TrackedAgentWindow> {
  const listPage = (cursor?: string): Promise<TrackedAgentPage> => (
    cursor ? client.listAgentPage({ cursor }) : client.listAgentPage()
  );
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

  return { agents: sortTrackedAgentsNewestFirst(agents), nextCursor, pagesLoaded };
}
