import { createHash } from 'node:crypto';

import { hiveMindAgentTypeNamespace, type HiveMindEntry, type HiveMindStore } from '@franken/brain';
import {
  HiveStatusResponseSchema,
  type HiveAgentStatus,
  type HiveRecentActivity,
  type HiveStatusResponse,
} from '@franken/types';

import type { BeastRun, TrackedAgent } from '../types.js';
import type { AgentService } from './agent-service.js';
import type { BeastRunService } from './beast-run-service.js';

export const DEFAULT_HIVE_STATUS_LIMIT = 25;
export const MAX_HIVE_STATUS_LIMIT = 100;
export const HIVE_STATUS_STALE_AFTER_MS = 5 * 60 * 1_000;
const MAX_ACTIVITY_SUMMARY_BYTES = 1_024;
const MAX_AGENT_ROWS_SCANNED = 1_000;
const AGENT_SCAN_PAGE_SIZE = 100;
const MAX_HIVE_ENTRIES_SCANNED_PER_TYPE = 100;
const MAX_SUBJECT_ID_BYTES = 256;
const ACTIVE_STATUSES = new Set([
  'initializing',
  'awaiting_approval',
  'dispatching',
  'queued',
  'interviewing',
  'pending_approval',
  'running',
]);

export interface HiveStatusQueryOptions {
  readonly subjectId: string;
  readonly limit?: number;
}

export function workspaceHiveId(projectRoot: string): string {
  return `workspace:${createHash('sha256').update(projectRoot).digest('hex').slice(0, 16)}`;
}

function latestTimestamp(...values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => value !== undefined)
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time)[0]?.value;
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoded = Buffer.from(value);
  if (encoded.byteLength <= maxBytes) return { value, truncated: false };
  return { value: encoded.subarray(0, maxBytes).toString('utf8'), truncated: true };
}

function mapActivity(entry: HiveMindEntry): HiveRecentActivity {
  const rawSummary = entry.kind === 'episode' ? entry.event.summary : entry.lesson.pattern;
  const summary = truncateUtf8(rawSummary, MAX_ACTIVITY_SUMMARY_BYTES);
  return {
    agentTypeId: entry.namespace === 'global'
      ? 'global'
      : entry.namespace.slice('agent-type:'.length),
    publisherId: entry.publisherId,
    kind: entry.kind,
    summary: summary.value,
    publishedAt: entry.publishedAt,
    ...(summary.truncated ? { truncated: true as const } : {}),
  };
}

function mapAgent(
  agent: TrackedAgent,
  run: BeastRun | undefined,
  nowMs: number,
): HiveAgentStatus {
  const reconciledRun = run?.trackedAgentId === agent.id
    && run.definitionId === agent.definitionId
    ? run
    : undefined;
  const lastObservedAt = reconciledRun
    ? latestTimestamp(
      reconciledRun.lastHeartbeatAt,
      reconciledRun.finishedAt,
      reconciledRun.startedAt,
      reconciledRun.createdAt,
    ) ?? reconciledRun.createdAt
    : latestTimestamp(agent.updatedAt, agent.createdAt) ?? agent.updatedAt;
  const observedMs = Date.parse(lastObservedAt);
  const status = reconciledRun?.status ?? agent.status;
  let observation: HiveAgentStatus['observation'] = 'current';
  let errorCode: HiveAgentStatus['errorCode'];
  if (agent.dispatchRunId && !run) {
    observation = 'unavailable';
    errorCode = 'LINKED_RUN_NOT_FOUND';
  } else if (run && !reconciledRun) {
    observation = 'unavailable';
    errorCode = 'LINKED_RUN_MISMATCH';
  } else if (!Number.isFinite(observedMs)) {
    observation = 'unavailable';
    errorCode = 'INVALID_OBSERVATION_TIME';
  } else if (ACTIVE_STATUSES.has(status) && nowMs - observedMs > HIVE_STATUS_STALE_AFTER_MS) {
    observation = 'stale';
  }

  const summary = observation === 'current'
    ? `${agent.definitionId} is ${status}.`
    : observation === 'stale'
      ? `${agent.definitionId} last reported ${status} at ${lastObservedAt}; this observation is stale.`
      : `${agent.definitionId} status could not be fully reconciled from persisted run state.`;
  return {
    agentId: agent.id,
    agentTypeId: agent.definitionId,
    status,
    ...(agent.dispatchRunId ? { runId: agent.dispatchRunId } : {}),
    lastObservedAt,
    observation,
    summary,
    ...(errorCode ? { errorCode } : {}),
  };
}

function summarizeAgents(agents: readonly HiveAgentStatus[], truncated: boolean): string {
  if (agents.length === 0) return 'No agents have been dispatched in this workspace.';
  const stale = agents.filter((agent) => agent.observation === 'stale').length;
  const unavailable = agents.filter((agent) => agent.observation === 'unavailable').length;
  const suffix = [
    stale > 0 ? `${stale} stale` : '',
    unavailable > 0 ? `${unavailable} unavailable` : '',
    truncated ? 'more agents omitted by the requested limit' : '',
  ].filter(Boolean);
  return `${agents.length} agent${agents.length === 1 ? '' : 's'} found in this workspace${suffix.length > 0 ? `; ${suffix.join(', ')}` : ''}.`;
}

/** Read-only, workspace-owned query surface for command-center agent status. */
export class HiveStatusQuery {
  constructor(
    private readonly workspaceId: string,
    private readonly agents: AgentService,
    private readonly runs: BeastRunService,
    private readonly hiveMind: HiveMindStore,
    private readonly now: () => Date = () => new Date(),
    private readonly hiveAvailable = true,
  ) {}

  query(options: HiveStatusQueryOptions): HiveStatusResponse {
    const limit = options.limit ?? DEFAULT_HIVE_STATUS_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_HIVE_STATUS_LIMIT) {
      throw new RangeError(`Hive status limit must be between 1 and ${MAX_HIVE_STATUS_LIMIT}`);
    }
    if (!options.subjectId || Buffer.byteLength(options.subjectId) > MAX_SUBJECT_ID_BYTES) {
      throw new RangeError(`Hive status subjectId must contain between 1 and ${MAX_SUBJECT_ID_BYTES} UTF-8 bytes`);
    }

    const selected = this.readAgents(options.subjectId, limit);
    const now = this.now();
    const agentStatuses = selected.agents.map((agent) => mapAgent(
      agent,
      agent.dispatchRunId ? this.runs.getRun(agent.dispatchRunId) : undefined,
      now.getTime(),
    ));
    const hive = this.readActivity(selected.agents, selected.attribution, limit);
    const partial = hive.status !== 'available'
      || agentStatuses.some((agent) => agent.observation !== 'current');

    return HiveStatusResponseSchema.parse({
      workspaceId: this.workspaceId,
      subjectId: options.subjectId,
      generatedAt: now.toISOString(),
      status: partial ? 'partial' : 'current',
      summary: summarizeAgents(agentStatuses, selected.truncated),
      agents: agentStatuses,
      recentActivity: hive.activity,
      meta: {
        limit,
        totalAgents: selected.truncated ? null : agentStatuses.length,
        truncated: selected.truncated,
        staleAfterMs: HIVE_STATUS_STALE_AFTER_MS,
        hive: {
          status: hive.status,
          ...(hive.errorCodes.length > 0 ? { errorCodes: hive.errorCodes } : {}),
        },
      },
    });
  }

  private readAgents(subjectId: string, limit: number): {
    agents: TrackedAgent[];
    truncated: boolean;
    attribution: ReadonlyMap<string, 'unique' | 'ambiguous' | 'incomplete'>;
  } {
    const matches: TrackedAgent[] = [];
    const subjectsByAgentType = new Map<string, Set<string>>();
    let cursor: string | undefined;
    let scanned = 0;
    let hasMoreRows = false;
    do {
      const page = this.agents.listAgentPage({
        limit: Math.min(AGENT_SCAN_PAGE_SIZE, MAX_AGENT_ROWS_SCANNED - scanned),
        ...(cursor ? { cursor } : {}),
      });
      scanned += page.rowsScanned;
      for (const agent of page.agents) {
        const subjects = subjectsByAgentType.get(agent.definitionId) ?? new Set<string>();
        subjects.add(agent.createdByUser);
        subjectsByAgentType.set(agent.definitionId, subjects);
        if (agent.status === 'deleted') continue;
        if (agent.createdByUser === subjectId) matches.push(agent);
      }
      cursor = page.nextCursor;
      hasMoreRows = cursor !== undefined;
    } while (hasMoreRows && scanned < MAX_AGENT_ROWS_SCANNED);

    const attribution = new Map<string, 'unique' | 'ambiguous' | 'incomplete'>();
    for (const agentTypeId of new Set(matches.map((agent) => agent.definitionId))) {
      const subjects = subjectsByAgentType.get(agentTypeId);
      attribution.set(
        agentTypeId,
        hasMoreRows ? 'incomplete' : subjects?.size === 1 ? 'unique' : 'ambiguous',
      );
    }

    return {
      agents: matches.slice(0, limit),
      truncated: matches.length > limit || (hasMoreRows && scanned >= MAX_AGENT_ROWS_SCANNED),
      attribution,
    };
  }

  private readActivity(
    agents: readonly TrackedAgent[],
    attribution: ReadonlyMap<string, 'unique' | 'ambiguous' | 'incomplete'>,
    limit: number,
  ): {
    activity: HiveRecentActivity[];
    status: 'available' | 'partial' | 'unavailable';
    errorCodes: Array<'ATTRIBUTION_AMBIGUOUS' | 'ATTRIBUTION_INCOMPLETE'>;
  } {
    if (!this.hiveAvailable) {
      return { activity: [], status: 'unavailable', errorCodes: [] };
    }
    const entriesByAgentType = new Map<string, HiveMindEntry[]>();
    const selected: HiveMindEntry[] = [];
    const selectedIds = new Set<number>();
    let status: 'available' | 'partial' | 'unavailable' = 'available';
    const errorCodes = new Set<'ATTRIBUTION_AMBIGUOUS' | 'ATTRIBUTION_INCOMPLETE'>();
    for (const agent of agents) {
      let entries = entriesByAgentType.get(agent.definitionId);
      if (!entries) {
        try {
          entries = this.hiveMind.recent(hiveMindAgentTypeNamespace(agent.definitionId), {
            kind: 'episode',
            limit: MAX_HIVE_ENTRIES_SCANNED_PER_TYPE,
          });
        } catch {
          status = 'unavailable';
          entries = [];
        }
        entriesByAgentType.set(agent.definitionId, entries);
      }
      const publisherIds = new Set([agent.id, agent.dispatchRunId].filter((id): id is string => Boolean(id)));
      const attributed = entries.find((entry) => publisherIds.has(entry.publisherId));
      const attributionState = attribution.get(agent.definitionId);
      const latest = attributed ?? (attributionState === 'unique' ? entries[0] : undefined);
      if (!attributed && entries.length > 0 && attributionState !== 'unique') {
        status = status === 'unavailable' ? status : 'partial';
        errorCodes.add(attributionState === 'incomplete'
          ? 'ATTRIBUTION_INCOMPLETE'
          : 'ATTRIBUTION_AMBIGUOUS');
      }
      if (latest && !selectedIds.has(latest.id)) {
        selected.push(latest);
        selectedIds.add(latest.id);
      }
    }
    selected.sort((left, right) => right.id - left.id);
    return {
      activity: selected.slice(0, limit).map(mapActivity),
      status,
      errorCodes: [...errorCodes],
    };
  }

  close(): void {
    this.hiveMind.close();
  }
}
