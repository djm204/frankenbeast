import { createBrainAdapter, type BrainAdapter } from '../adapters/brain-adapter.js';
import { createCritiqueAdapter, type CritiqueAdapter } from '../adapters/critique-adapter.js';
import { createFirewallAdapter, type FirewallAdapter } from '../adapters/firewall-adapter.js';
import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';
import { createPlannerAdapter, type PlannerAdapter } from '../adapters/planner-adapter.js';
import { createSkillsAdapter, type SkillsAdapter } from '../adapters/skills-adapter.js';
import { parseObserverCostArgs } from './observer-cost-validation.js';
import type { ToolDef, ToolInputSchema, ToolResult } from './server-factory.js';

export interface AdapterSet {
  brain: BrainAdapter;
  observer: ObserverAdapter;
  governor: GovernorAdapter;
  planner: PlannerAdapter;
  critique: CritiqueAdapter;
  firewall: FirewallAdapter;
  skills: SkillsAdapter;
}

export type ToolServer = 'memory' | 'planner' | 'critique' | 'firewall' | 'observer' | 'governor' | 'skills';

interface ToolStub {
  name: string;
  server: ToolServer;
  description: string;
}

interface ToolFull extends ToolStub {
  inputSchema: ToolInputSchema;
  makeHandler: (adapters: AdapterSet) => (args: Record<string, unknown>) => Promise<ToolResult>;
}

export type ServerAdapterDeps = Partial<AdapterSet>;

function splitCsvArg(value: unknown, fallback?: string[]): string[] | undefined {
  if (value === undefined) return fallback;
  const parsed = String(value).split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

const DEFAULT_MEMORY_QUERY_LIMIT = 20;
const MAX_MEMORY_QUERY_LIMIT = 1000;
const MEMORY_REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'never_store', 'suppressed'] as const;
const MEMORY_REVIEW_ACTIONS = ['approve', 'reject', 'never_store', 'resolve_conflict'] as const;
const MEMORY_CONFLICT_RESOLUTIONS = ['keep_existing', 'replace_existing', 'reject_candidate'] as const;

type MemoryReviewStatus = (typeof MEMORY_REVIEW_STATUSES)[number];
type MemoryReviewAction = (typeof MEMORY_REVIEW_ACTIONS)[number];
type MemoryConflictResolution = (typeof MEMORY_CONFLICT_RESOLUTIONS)[number];

function parseMemoryQueryLimit(value: unknown): { ok: true; value: number } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: DEFAULT_MEMORY_QUERY_LIMIT };
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { ok: false, message: `limit must be a positive integer between 1 and ${MAX_MEMORY_QUERY_LIMIT}` };
  }
  const raw = typeof value === 'string' ? value.trim() : String(value);
  if (raw.length === 0) {
    return { ok: false, message: `limit must be a positive integer between 1 and ${MAX_MEMORY_QUERY_LIMIT}` };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_MEMORY_QUERY_LIMIT) {
    return { ok: false, message: `limit must be a positive integer between 1 and ${MAX_MEMORY_QUERY_LIMIT}` };
  }
  return { ok: true, value: parsed };
}

function parseNonEmptyStringArg(name: string, value: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, message: `${name} must be a non-empty string` };
  }
  return { ok: true, value };
}

function parseMemoryReadScopeArgs(args: Record<string, unknown>): { ok: true; value: { readScope?: 'all' | 'shared' | 'agent'; agentId?: string } } | { ok: false; message: string } {
  const readScope = args['readScope'] === undefined ? undefined : String(args['readScope']);
  if (readScope !== undefined && !['all', 'shared', 'agent'].includes(readScope)) {
    return { ok: false, message: 'readScope must be one of: all, shared, agent' };
  }
  const agentId = args['agentId'] === undefined ? undefined : String(args['agentId']).trim();
  if (readScope === 'agent' && !agentId) {
    return { ok: false, message: 'agentId is required when readScope is agent' };
  }
  return { ok: true, value: { ...(readScope ? { readScope: readScope as 'all' | 'shared' | 'agent' } : {}), ...(agentId ? { agentId } : {}) } };
}

function parseOptionalAgentIdArg(args: Record<string, unknown>): { ok: true; value?: string } | { ok: false; message: string } {
  if (args['agentId'] === undefined) return { ok: true };
  const agentId = String(args['agentId']).trim();
  if (agentId.length === 0) {
    return { ok: false, message: 'agentId must be a non-empty string when provided' };
  }
  return { ok: true, value: agentId };
}

function parseStringArg(name: string, value: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== 'string') {
    return { ok: false, message: `${name} must be a string` };
  }
  return { ok: true, value };
}

function parseMemoryReviewConfidence(value: unknown): { ok: true; value: number } | { ok: false; message: string } {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { ok: false, message: 'confidence must be a number between 0 and 1' };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return { ok: false, message: 'confidence must be a number between 0 and 1' };
  }
  return { ok: true, value: parsed };
}

function parseMemoryReviewStatus(value: unknown): { ok: true; value: MemoryReviewStatus } | { ok: false; message: string } {
  const status = value === undefined ? 'pending' : String(value);
  if (MEMORY_REVIEW_STATUSES.includes(status as MemoryReviewStatus)) {
    return { ok: true, value: status as MemoryReviewStatus };
  }
  return { ok: false, message: `status must be one of: ${MEMORY_REVIEW_STATUSES.join(', ')}` };
}

function parseMemoryReviewAction(value: unknown): { ok: true; value: MemoryReviewAction } | { ok: false; message: string } {
  const action = String(value);
  if (MEMORY_REVIEW_ACTIONS.includes(action as MemoryReviewAction)) {
    return { ok: true, value: action as MemoryReviewAction };
  }
  return { ok: false, message: `action must be one of: ${MEMORY_REVIEW_ACTIONS.join(', ')}` };
}

function parseMemoryConflictResolution(value: unknown): { ok: true; value: MemoryConflictResolution } | { ok: false; message: string } {
  const resolution = String(value);
  if (MEMORY_CONFLICT_RESOLUTIONS.includes(resolution as MemoryConflictResolution)) {
    return { ok: true, value: resolution as MemoryConflictResolution };
  }
  return { ok: false, message: `resolution must be one of: ${MEMORY_CONFLICT_RESOLUTIONS.join(', ')}` };
}

export function createAdapterSet(dbPath: string, options: { root?: string | undefined; configPath?: string | undefined } = {}): AdapterSet {
  return {
    brain: createBrainAdapter(dbPath),
    observer: createObserverAdapter(dbPath),
    governor: createGovernorAdapter(dbPath),
    planner: createPlannerAdapter(dbPath),
    critique: createCritiqueAdapter(),
    firewall: createFirewallAdapter(dbPath, 'standard', { root: options.root, configPath: options.configPath }),
    skills: createSkillsAdapter(dbPath),
  };
}

const TOOLS: ToolFull[] = [
  // --- memory ---
  {
    name: 'fbeast_memory_store',
    server: 'memory',
    description: 'Store memory; optional TTL for temporary working facts',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Unique key for this memory entry' },
        value: { type: 'string', description: 'Content to store' },
        type: { type: 'string', description: 'Memory type: working or episodic', enum: ['working', 'episodic'] },
        agentId: { type: 'string', description: 'Optional agent id; when provided, the stored entry is namespaced for that agent and visible through readScope=agent for the same agent' },
        ttlMs: { type: 'integer', description: 'Optional positive millisecond TTL for temporary operational working-memory facts' },
      },
      required: ['key', 'value', 'type'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const key = String(args['key']);
      const value = String(args['value']);
      const type = String(args['type']);
      const agentId = parseOptionalAgentIdArg(args);
      if (!agentId.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_store ${agentId.message}` }], isError: true };
      }
      const ttlMs = args['ttlMs'] === undefined ? undefined : Number(args['ttlMs']);
      if (ttlMs !== undefined && (!Number.isFinite(ttlMs) || !Number.isSafeInteger(ttlMs) || ttlMs < 1)) {
        return { content: [{ type: 'text', text: 'Error: fbeast_memory_store ttlMs must be a positive integer number of milliseconds' }], isError: true };
      }
      if (ttlMs !== undefined && type !== 'working') {
        return { content: [{ type: 'text', text: 'Error: fbeast_memory_store ttlMs is only supported for working memory entries' }], isError: true };
      }
      await brain.store({
        key,
        value,
        type,
        ...(agentId.value ? { agentId: agentId.value } : {}),
        ...(ttlMs === undefined ? {} : { ttlMs }),
      });
      return { content: [{ type: 'text', text: ttlMs === undefined ? `Stored memory: ${key}` : `Stored temporary memory: ${key} (ttlMs=${ttlMs})` }] };
    },
  },
  {
    name: 'fbeast_memory_query',
    server: 'memory',
    description: 'Search memory entries by keyword substring',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (substring match on key and value)' },
        type: { type: 'string', description: 'Filter by type: working or episodic', enum: ['working', 'episodic'] },
        limit: { type: 'string', description: 'Max results (default 20)' },
        readScope: { type: 'string', description: 'Read scope: all (legacy), shared (hide agent-scoped entries), or agent (shared plus entries for agentId)', enum: ['all', 'shared', 'agent'] },
        agentId: { type: 'string', description: 'Agent id required when readScope is agent' },
      },
      required: ['query'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const query = String(args['query']);
      const type = args['type'] ? String(args['type']) : undefined;
      const parsedLimit = parseMemoryQueryLimit(args['limit']);
      if (!parsedLimit.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_query ${parsedLimit.message}` }], isError: true };
      }
      const scopeArgs = parseMemoryReadScopeArgs(args);
      if (!scopeArgs.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_query ${scopeArgs.message}` }], isError: true };
      }
      const limit = parsedLimit.value;
      const rows = await brain.query({ query, ...(type ? { type } : {}), limit, ...scopeArgs.value });
      if (rows.length === 0) {
        return { content: [{ type: 'text', text: `No memory entries found for query: "${query}"` }] };
      }
      const text = rows.map((row) => {
        if (row.createdAt) return `[${row.type}] ${row.key}: ${row.value} (${row.createdAt})`;
        return `[${row.type}] ${row.key}: ${row.value}`;
      }).join('\n');
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'fbeast_memory_frontload',
    server: 'memory',
    description: 'Load all memory entries from this database',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional legacy project identifier; frontload is database-scoped' },
        readScope: { type: 'string', description: 'Read scope: all (legacy), shared (hide agent-scoped entries), or agent (shared plus entries for agentId)', enum: ['all', 'shared', 'agent'] },
        agentId: { type: 'string', description: 'Agent id required when readScope is agent' },
      },
    },
    makeHandler: ({ brain }) => async (args) => {
      const scopeArgs = parseMemoryReadScopeArgs(args);
      if (!scopeArgs.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_frontload ${scopeArgs.message}` }], isError: true };
      }
      const sections = await brain.frontload(scopeArgs.value);
      if (sections.length === 0) {
        return { content: [{ type: 'text', text: 'No memory entries stored yet.' }] };
      }
      const text = sections.map((section) => `## ${section.type}\n${section.entries.map((entry) => `  ${entry}`).join('\n')}`).join('\n\n');
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'fbeast_memory_forget',
    server: 'memory',
    description: 'Delete working memory entry by key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key of the memory entry to remove' },
        agentId: { type: 'string', description: 'Optional agent id used when removing an agent-scoped working memory entry' },
      },
      required: ['key'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const key = String(args['key']);
      const agentId = parseOptionalAgentIdArg(args);
      if (!agentId.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_forget ${agentId.message}` }], isError: true };
      }
      const removed = await brain.forget(key, agentId.value ? { agentId: agentId.value } : {});
      if (!removed) {
        return { content: [{ type: 'text', text: `No memory entry found with key: ${key}` }] };
      }
      return { content: [{ type: 'text', text: `Removed memory: ${key}` }] };
    },
  },
  {
    name: 'fbeast_memory_right_to_forget',
    server: 'memory',
    description: 'Delete selected memory entries and derived artifacts, then return non-sensitive deletion evidence',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Exact working-memory key to delete' },
        category: { type: 'string', description: 'Category metadata or key prefix to delete' },
        sourceScope: { type: 'string', description: 'Source/sourceScope metadata or key prefix to delete' },
        query: { type: 'string', description: 'Sensitive fact substring to delete without echoing in the report' },
        agentId: { type: 'string', description: 'Optional agent id used when deleting an exact agent-scoped working-memory key' },
        type: { type: 'string', description: 'Memory scope: working, episodic, or all', enum: ['working', 'episodic', 'all'] },
        dryRun: { type: 'boolean', description: 'Report counts without deleting or writing audit evidence' },
      },
    },
    makeHandler: ({ brain }) => async (args) => {
      const agentId = parseOptionalAgentIdArg(args);
      if (!agentId.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_right_to_forget ${agentId.message}` }], isError: true };
      }
      const input = {
        ...(args['key'] !== undefined ? { key: String(args['key']) } : {}),
        ...(args['category'] !== undefined ? { category: String(args['category']) } : {}),
        ...(args['sourceScope'] !== undefined ? { sourceScope: String(args['sourceScope']) } : {}),
        ...(args['query'] !== undefined ? { query: String(args['query']) } : {}),
        ...(agentId.value ? { agentId: agentId.value } : {}),
        ...(args['type'] !== undefined ? { type: String(args['type']) as 'working' | 'episodic' | 'all' } : {}),
        ...(args['dryRun'] !== undefined ? { dryRun: args['dryRun'] === true || String(args['dryRun']) === 'true' } : {}),
      };
      const report = await brain.rightToForget(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            selectorHash: report.selectorHash,
            dryRun: report.dryRun,
            deleted: report.deleted,
            remainingReferences: report.remainingReferences,
            ...(report.auditEventId === undefined ? {} : { auditEventId: report.auditEventId }),
          }, null, 2),
        }],
      };
    },
  },
  {
    name: 'fbeast_memory_review_propose',
    server: 'memory',
    description: 'Queue a proposed working-memory promotion for operator review instead of storing it immediately',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Working-memory key proposed for promotion' },
        value: { type: 'string', description: 'Proposed memory value' },
        source: { type: 'string', description: 'Where the proposed memory came from, such as chat:turn-42 or repo-config' },
        evidenceId: { type: 'string', description: 'Optional stable evidence identifier for deduplication/audit' },
        confidence: { type: 'number', description: 'Confidence from 0 to 1 that the memory should be promoted' },
        reason: { type: 'string', description: 'Operator-visible reason for promotion' },
      },
      required: ['key', 'value', 'source', 'confidence', 'reason'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const key = parseNonEmptyStringArg('key', args['key']);
      const value = parseStringArg('value', args['value']);
      const source = parseNonEmptyStringArg('source', args['source']);
      const reason = parseNonEmptyStringArg('reason', args['reason']);
      const confidence = parseMemoryReviewConfidence(args['confidence']);
      if (key.ok === false) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_propose ${key.message}` }], isError: true };
      }
      if (value.ok === false) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_propose ${value.message}` }], isError: true };
      }
      if (source.ok === false) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_propose ${source.message}` }], isError: true };
      }
      if (reason.ok === false) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_propose ${reason.message}` }], isError: true };
      }
      if (confidence.ok === false) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_propose ${confidence.message}` }], isError: true };
      }
      const evidenceId = args['evidenceId'] === undefined ? undefined : parseNonEmptyStringArg('evidenceId', args['evidenceId']);
      if (evidenceId && !evidenceId.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_propose ${evidenceId.message}` }], isError: true };
      }
      const candidate = await brain.proposeMemory({
        key: key.value,
        value: value.value,
        source: source.value,
        reason: reason.value,
        confidence: confidence.value,
        ...(evidenceId?.value ? { evidenceId: evidenceId.value } : {}),
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: candidate.id,
            status: candidate.status,
            createdAt: candidate.createdAt,
            updatedAt: candidate.updatedAt,
          }, null, 2),
        }],
      };
    },
  },
  {
    name: 'fbeast_memory_review_list',
    server: 'memory',
    description: 'List queued memory promotion candidates by review status',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Review status to list; defaults to pending', enum: [...MEMORY_REVIEW_STATUSES] },
      },
    },
    makeHandler: ({ brain }) => async (args) => {
      const status = parseMemoryReviewStatus(args['status']);
      if (!status.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_list ${status.message}` }], isError: true };
      }
      const candidates = await brain.listMemoryReview(status.value);
      return { content: [{ type: 'text', text: JSON.stringify({ status: status.value, count: candidates.length, candidates }, null, 2) }] };
    },
  },
  {
    name: 'fbeast_memory_review_decide',
    server: 'memory',
    description: 'Approve, reject, mark never-store, or resolve a conflicting queued memory promotion',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Candidate id returned by fbeast_memory_review_propose/list' },
        action: { type: 'string', description: 'Decision to apply', enum: [...MEMORY_REVIEW_ACTIONS] },
        resolution: { type: 'string', description: 'Conflict resolution to apply when action is resolve_conflict', enum: [...MEMORY_CONFLICT_RESOLUTIONS] },
        reviewer: { type: 'string', description: 'Optional reviewer/operator id' },
        note: { type: 'string', description: 'Optional reviewer note' },
      },
      required: ['id', 'action'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const id = parseNonEmptyStringArg('id', args['id']);
      const action = parseMemoryReviewAction(args['action']);
      if (!id.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_decide ${id.message}` }], isError: true };
      }
      if (!action.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_decide ${action.message}` }], isError: true };
      }
      const resolution = action.value === 'resolve_conflict' ? parseMemoryConflictResolution(args['resolution']) : undefined;
      if (resolution && !resolution.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_decide ${resolution.message}` }], isError: true };
      }
      const reviewer = args['reviewer'] === undefined ? undefined : parseNonEmptyStringArg('reviewer', args['reviewer']);
      if (reviewer && !reviewer.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_decide ${reviewer.message}` }], isError: true };
      }
      const note = args['note'] === undefined ? undefined : parseStringArg('note', args['note']);
      if (note && !note.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_memory_review_decide ${note.message}` }], isError: true };
      }
      const candidate = await brain.decideMemoryReview({
        id: id.value,
        action: action.value,
        ...(resolution?.ok ? { resolution: resolution.value } : {}),
        options: {
          ...(reviewer?.value ? { reviewer: reviewer.value } : {}),
          ...(note?.value !== undefined ? { note: note.value } : {}),
        },
      });
      return { content: [{ type: 'text', text: JSON.stringify(candidate, null, 2) }] };
    },
  },

  // --- planner ---
  {
    name: 'fbeast_plan_decompose',
    server: 'planner',
    description: 'Create generic scaffold DAG; not objective-specific decomposition',
    inputSchema: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: 'What needs to be accomplished' },
        constraints: { type: 'string', description: 'Constraints or requirements (optional)' },
      },
      required: ['objective'],
    },
    makeHandler: ({ planner }) => async (args) => {
      const objective = String(args['objective']);
      const constraints = args['constraints'] ? String(args['constraints']) : undefined;
      const result = await planner.decompose(constraints ? { objective, constraints } : { objective });
      const taskList = result.tasks.map((t) => `  ${t.id}: ${t.title}${t.deps.length > 0 ? ` (after: ${t.deps.join(', ')})` : ''}`).join('\n');
      const text = [
        `## Plan created: ${result.planId}`,
        ``,
        `**Objective:** ${result.objective}`,
        constraints ? `**Constraints:** ${constraints}` : '',
        `**Provenance:** ${result.provenance}`,
        `**Provenance note:** ${result.provenanceNote}`,
        ``,
        `**Tasks:**`,
        taskList,
        ``,
        `Use fbeast_plan_status with planId "${result.planId}" to view the DAG.`,
        `Use fbeast_plan_validate with planId "${result.planId}" to check for issues.`,
      ]
        .filter(Boolean)
        .join('\n');
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'fbeast_plan_status',
    server: 'planner',
    description: 'Get status of all steps in current plan',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID returned by fbeast_plan_decompose' },
      },
      required: ['planId'],
    },
    makeHandler: ({ planner }) => async (args) => {
      const planId = String(args['planId']);
      const visualization = await planner.visualize(planId);
      if (!visualization) {
        return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
      }
      if (visualization.kind === 'corrupt') {
        return { content: [{ type: 'text', text: `Plan data is invalid/corrupt: ${visualization.reason}` }], isError: true };
      }
      const text = [`## Plan: ${planId}`, ``, '```mermaid', visualization.mermaid, '```'].join('\n');
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'fbeast_plan_validate',
    server: 'planner',
    description: 'Validate plan DAG for cycles and missing deps',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID to validate' },
      },
      required: ['planId'],
    },
    makeHandler: ({ planner }) => async (args) => {
      const planId = String(args['planId']);
      const validation = await planner.validate(planId);
      if (!validation) {
        return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
      }
      const text = [`## Validation: ${validation.verdict}`, ``, `**Plan:** ${planId}`, `**Issues:** ${validation.issues.length}`, '', validation.issues.length > 0 ? validation.issues.map((i) => `- ${i}`).join('\n') : 'No issues found.'].join('\n');
      return { content: [{ type: 'text', text }] };
    },
  },

  // --- critique ---
  {
    name: 'fbeast_critique_evaluate',
    server: 'critique',
    description: 'Score output quality 0–1, suggest improvements',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Code or text to evaluate' },
        criteria: { type: 'string', description: 'Comma-separated criteria: correctness, readability, security, complexity' },
        evaluators: { type: 'string', description: 'Comma-separated evaluator names. Supported values: logic-loop, complexity, conciseness. Unknown names are rejected.' },
      },
      required: ['content'],
    },
    makeHandler: ({ critique }) => async (args) => {
      const content = String(args['content']);
      const criteria = splitCsvArg(args['criteria']) ?? ['correctness', 'readability', 'security', 'complexity'];
      const evaluators = splitCsvArg(args['evaluators']);
      const result = await critique.evaluate(evaluators ? { content, criteria, evaluators } : { content, criteria });
      const findingsText = result.findings.length > 0 ? result.findings.map((f) => `  [${f.severity}] ${f.message}`).join('\n') : '  None';
      const text = [`## Critique Result`, ``, `**verdict:** ${result.verdict}`, `**score:** ${result.score.toFixed(2)}`, `**findings:**`, findingsText].join('\n');
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'fbeast_critique_compare',
    server: 'critique',
    description: 'Compare two outputs, return better one with rationale',
    inputSchema: {
      type: 'object',
      properties: {
        original: { type: 'string', description: 'Original content' },
        revised: { type: 'string', description: 'Revised content' },
      },
      required: ['original', 'revised'],
    },
    makeHandler: ({ critique }) => async (args) => {
      const original = String(args['original']);
      const revised = String(args['revised']);
      const result = await critique.compare({ original, revised });
      const text = [`## Comparison`, ``, `**original score:** ${result.originalScore.toFixed(2)}`, `**revised score:** ${result.revisedScore.toFixed(2)}`, `**delta:** ${result.delta >= 0 ? '+' : ''}${result.delta.toFixed(2)} (${result.direction})`, ``, `### Original findings (${result.originalFindings.length})`, ...result.originalFindings.map((f) => `- [${f.severity}] ${f.message}`), ``, `### Revised findings (${result.revisedFindings.length})`, ...result.revisedFindings.map((f) => `- [${f.severity}] ${f.message}`)].join('\n');
      return { content: [{ type: 'text', text }] };
    },
  },

  // --- firewall ---
  {
    name: 'fbeast_firewall_scan',
    server: 'firewall',
    description: 'Detect prompt injection in text input',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Text to scan for injection patterns' },
      },
      required: ['input'],
    },
    makeHandler: ({ firewall }) => async (args) => {
      const input = String(args['input']);
      const result = await firewall.scanText(input);
      if (result.verdict === 'clean') {
        return { content: [{ type: 'text', text: 'Scan result: clean. No injection patterns detected.' }] };
      }
      return { content: [{ type: 'text', text: `Scan result: flagged\nMatched patterns: ${result.matchedPatterns.join(', ')}\n\nThis input may contain prompt injection. Review before processing.` }] };
    },
  },
  {
    name: 'fbeast_firewall_scan_file',
    server: 'firewall',
    description: 'Detect prompt injection in file contents',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to scan' },
      },
      required: ['path'],
    },
    makeHandler: ({ firewall }) => async (args) => {
      const filePath = String(args['path']);
      try {
        const result = await firewall.scanFile(filePath);
        if (result.verdict === 'clean') {
          return { content: [{ type: 'text', text: `File scan (${filePath}): clean. No injection patterns detected.` }] };
        }
        return { content: [{ type: 'text', text: `File scan (${filePath}): flagged\nMatched patterns: ${result.matchedPatterns.join(', ')}\n\nThis file may contain prompt injection. Review before processing.` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error reading file: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  },

  // --- observer ---
  {
    name: 'fbeast_observer_log',
    server: 'observer',
    description: 'Append event to session audit trail',
    inputSchema: {
      type: 'object',
      properties: {
        event: { type: 'string', description: 'Event type (e.g., file_edit, tool_call, decision)' },
        metadata: { type: 'string', description: 'JSON metadata for this event' },
        sessionId: { type: 'string', description: 'Session identifier' },
      },
      required: ['event', 'metadata', 'sessionId'],
    },
    makeHandler: ({ observer }) => async (args) => {
      const eventArg = parseNonEmptyStringArg('event', args['event']);
      if (!eventArg.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_observer_log ${eventArg.message}` }], isError: true };
      }
      const metadataArg = parseStringArg('metadata', args['metadata']);
      if (!metadataArg.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_observer_log ${metadataArg.message}` }], isError: true };
      }
      const sessionIdArg = parseNonEmptyStringArg('sessionId', args['sessionId']);
      if (!sessionIdArg.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_observer_log ${sessionIdArg.message}` }], isError: true };
      }
      const result = await observer.log({ event: eventArg.value, metadata: metadataArg.value, sessionId: sessionIdArg.value });
      return { content: [{ type: 'text', text: `Logged event: ${eventArg.value} (id: ${result.id}, hash: ${result.hash})` }] };
    },
  },
  {
    name: 'fbeast_observer_log_cost',
    server: 'observer',
    description: 'Record LLM token usage and cost for a call',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session identifier' },
        model: { type: 'string', description: 'Model name (e.g. gpt-4o, claude-opus-4-5)' },
        promptTokens: { type: 'number', description: 'Input/prompt token count' },
        completionTokens: { type: 'number', description: 'Output/completion token count' },
        costUsd: { type: 'number', description: 'Actual cost in USD if known — omit to auto-calculate from pricing table' },
      },
      required: ['sessionId', 'model', 'promptTokens', 'completionTokens'],
    },
    makeHandler: ({ observer }) => async (args) => {
      const parsedArgs = parseObserverCostArgs(args);
      if (!parsedArgs.ok) {
        return { content: [{ type: 'text', text: `Error: fbeast_observer_log_cost ${parsedArgs.message}` }], isError: true };
      }
      const { sessionId, model, promptTokens, completionTokens } = parsedArgs.value;
      const result = await observer.logCost(parsedArgs.value);
      const pricingNote = result.unknownModel ? ' (unknown model — not priced)' : '';
      return { content: [{ type: 'text', text: `Logged cost: ${promptTokens}+${completionTokens} tokens for ${model} = $${result.costUsd.toFixed(4)}${pricingNote}` }] };
    },
  },
  {
    name: 'fbeast_observer_cost',
    server: 'observer',
    description: 'Get token/cost summary by model for session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to filter (omit for all sessions)' },
      },
    },
    makeHandler: ({ observer }) => async (args) => {
      const sessionId = args['sessionId'] ? String(args['sessionId']) : undefined;
      const summary = await observer.cost(sessionId ? { sessionId } : {});
      if (summary.byModel.length === 0) {
        return { content: [{ type: 'text', text: 'No cost data recorded.' }] };
      }
      const lines = [`## Cost Summary${sessionId ? ` (session: ${sessionId})` : ''}`, '', ...summary.byModel.map((row) => `- ${row.model}: ${row.promptTokens} prompt + ${row.completionTokens} completion = $${row.costUsd.toFixed(4)}${row.unknownModel ? ' (unknown model — not priced)' : ''}`), '', `**Total:** ${summary.totalPromptTokens} prompt + ${summary.totalCompletionTokens} completion = $${summary.totalCostUsd.toFixed(4)}`];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  },
  {
    name: 'fbeast_observer_trail',
    server: 'observer',
    description: 'Retrieve full ordered audit trail for session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session identifier' },
      },
      required: ['sessionId'],
    },
    makeHandler: ({ observer }) => async (args) => {
      const sessionId = String(args['sessionId']);
      const rows = await observer.trail(sessionId);
      if (rows.length === 0) {
        return { content: [{ type: 'text', text: `No audit trail for session: ${sessionId}` }] };
      }
      const text = rows.map((row, index) => `${index + 1}. [${row.createdAt}] ${row.eventType} (${row.hash ?? 'no-hash'})\n   ${row.payload}`).join('\n');
      return { content: [{ type: 'text', text: `## Audit Trail (${rows.length} events)\n\n${text}` }] };
    },
  },
  {
    name: 'fbeast_observer_verify',
    server: 'observer',
    description: 'Verify the full audit hash chain for a session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session identifier' },
      },
      required: ['sessionId'],
    },
    makeHandler: ({ observer }) => async (args) => {
      const sessionId = String(args['sessionId']);
      const result = await observer.verify(sessionId);
      if (result.ok) {
        return { content: [{ type: 'text', text: `Audit chain verified for session ${sessionId}: ${result.checked} events checked.` }] };
      }
      return { content: [{ type: 'text', text: `Audit chain verification failed for session ${sessionId} at index ${result.firstInvalid?.index ?? 'unknown'}.` }], isError: true };
    },
  },

  // --- governor ---
  {
    name: 'fbeast_governor_check',
    server: 'governor',
    description: 'Check if action is safe to proceed',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action name or description (e.g., delete_file, push_to_main)' },
        context: { type: 'string', description: 'JSON context about the action (target, scope, etc.)' },
      },
      required: ['action', 'context'],
    },
    makeHandler: ({ governor }) => async (args) => {
      const action = String(args['action']);
      const context = String(args['context']);
      const { decision, reason } = await governor.check({ action, context });
      return { content: [{ type: 'text', text: `**Decision:** ${decision}\n**Reason:** ${reason}` }] };
    },
  },
  {
    name: 'fbeast_governor_budget',
    server: 'governor',
    description: 'Get current spend vs budget status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    makeHandler: ({ governor }) => async (_args) => {
      const summary = await governor.budgetStatus();
      if (summary.byModel.length === 0) {
        return { content: [{ type: 'text', text: 'No cost data recorded yet.' }] };
      }
      const lines = [`## Budget Status`, '', ...summary.byModel.map((row) => `- ${row.model}: $${row.costUsd.toFixed(4)}${row.unknownModel ? ' (unknown model — not priced)' : ''}`), '', `**Total spend:** $${summary.totalSpendUsd.toFixed(4)}`];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  },

  // --- skills ---
  {
    name: 'fbeast_skills_list',
    server: 'skills',
    description: 'List available skills by category',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'string', description: 'Filter: "true" for enabled only, "false" for disabled only', enum: ['true', 'false'] },
      },
    },
    makeHandler: ({ skills }) => async (args) => {
      const enabled = args['enabled'] !== undefined ? String(args['enabled']) === 'true' : undefined;
      const rows = await skills.list(enabled === undefined ? {} : { enabled });
      if (rows.length === 0) {
        return { content: [{ type: 'text', text: 'No skills registered.' }] };
      }
      const lines = rows.map((r) => {
        const status = r.enabled ? 'enabled' : 'disabled';
        return `- **${r.name}** [${status}] (updated: ${r.updatedAt ?? 'unknown'})`;
      });
      return { content: [{ type: 'text', text: `## Skills (${rows.length})\n\n${lines.join('\n')}` }] };
    },
  },
  {
    name: 'fbeast_skills_discover',
    server: 'skills',
    description: 'Search skills by keyword or capability',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword (matches name and config description)' },
      },
    },
    makeHandler: ({ skills }) => async (args) => {
      const query = args['query'] ? String(args['query']) : '';
      const rows = await skills.list({});
      const normalizedQuery = query.trim().toLowerCase();
      const matches = normalizedQuery.length === 0 ? rows : rows.filter((row) => row.name.toLowerCase().includes(normalizedQuery) || row.description.toLowerCase().includes(normalizedQuery));
      if (matches.length === 0) {
        return { content: [{ type: 'text', text: query ? `No skills matching "${query}".` : 'No skills registered.' }] };
      }
      const lines = matches.map((row) => `- **${row.name}**: ${row.description}`);
      return { content: [{ type: 'text', text: `## Discovered Skills (${matches.length})\n\n${lines.join('\n')}` }] };
    },
  },
  {
    name: 'fbeast_skills_load',
    server: 'skills',
    description: 'Load full skill content by name',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: { type: 'string', description: 'Skill name/ID' },
      },
      required: ['skillId'],
    },
    makeHandler: ({ skills }) => async (args) => {
      const skillId = String(args['skillId']);
      const info = await skills.info(skillId);
      if (!info) {
        return { content: [{ type: 'text', text: `Skill not found: ${skillId}` }], isError: true };
      }
      const lines = [`## Skill: ${skillId}`, '', `**Status:** ${info['enabled'] ? 'enabled' : 'disabled'}`, `**Updated:** ${typeof info['updatedAt'] === 'string' ? info['updatedAt'] : 'unknown'}`, '', '**Config:**', '```json', JSON.stringify(info, null, 2), '```'];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  },
];

export const TOOL_STUBS: ToolStub[] = TOOLS.map(({ name, server, description }) => ({ name, server, description }));

export const TOOL_REGISTRY: Map<string, ToolFull> = new Map(TOOLS.map((t) => [t.name, t]));

export function createToolDefsForServer(server: ToolServer, adapters: ServerAdapterDeps): ToolDef[] {
  return TOOLS
    .filter((tool) => tool.server === server)
    .map(({ name, description, inputSchema, makeHandler }) => ({
      name,
      description,
      inputSchema,
      handler: makeHandler(adapters as AdapterSet),
    }));
}

export function searchTools(query?: string): ToolStub[] {
  if (!query) return TOOL_STUBS;
  const q = query.toLowerCase();
  return TOOL_STUBS.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
}
