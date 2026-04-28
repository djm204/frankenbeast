import { createBrainAdapter, type BrainAdapter } from '../adapters/brain-adapter.js';
import { createCritiqueAdapter, type CritiqueAdapter } from '../adapters/critique-adapter.js';
import { createFirewallAdapter, type FirewallAdapter } from '../adapters/firewall-adapter.js';
import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';
import { createPlannerAdapter, type PlannerAdapter } from '../adapters/planner-adapter.js';
import { createSkillsAdapter, type SkillsAdapter } from '../adapters/skills-adapter.js';

export type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

export interface AdapterSet {
  brain: BrainAdapter;
  observer: ObserverAdapter;
  governor: GovernorAdapter;
  planner: PlannerAdapter;
  critique: CritiqueAdapter;
  firewall: FirewallAdapter;
  skills: SkillsAdapter;
}

interface ToolStub {
  name: string;
  server: 'memory' | 'planner' | 'critique' | 'firewall' | 'observer' | 'governor' | 'skills';
  description: string;
}

interface ToolFull extends ToolStub {
  inputSchema: Record<string, unknown>;
  makeHandler: (adapters: AdapterSet) => (args: Record<string, unknown>) => Promise<ToolResult>;
}

function splitCsvArg(value: unknown, fallback?: string[]): string[] | undefined {
  if (value === undefined) return fallback;
  const parsed = String(value).split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

export function createAdapterSet(dbPath: string): AdapterSet {
  return {
    brain: createBrainAdapter(dbPath),
    observer: createObserverAdapter(dbPath),
    governor: createGovernorAdapter(dbPath),
    planner: createPlannerAdapter(dbPath),
    critique: createCritiqueAdapter(),
    firewall: createFirewallAdapter(dbPath, 'standard'),
    skills: createSkillsAdapter(dbPath),
  };
}

const TOOLS: ToolFull[] = [
  // --- memory ---
  {
    name: 'fbeast_memory_store',
    server: 'memory',
    description: 'Store key/value in working or episodic memory',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Unique key for this memory entry' },
        value: { type: 'string', description: 'Content to store' },
        type: { type: 'string', description: 'Memory type: working, episodic, or recovery' },
      },
      required: ['key', 'value', 'type'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const key = String(args['key']);
      const value = String(args['value']);
      const type = String(args['type']);
      await brain.store({ key, value, type });
      return { content: [{ type: 'text', text: `Stored memory: ${key}` }] };
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
        type: { type: 'string', description: 'Filter by type: working, episodic, recovery' },
        limit: { type: 'string', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const query = String(args['query']);
      const type = args['type'] ? String(args['type']) : undefined;
      const limit = args['limit'] ? Number(args['limit']) : 20;
      const rows = await brain.query(type ? { query, type, limit } : { query, limit });
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
    description: 'Load all memory entries for project context',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project identifier (for future multi-project support)' },
      },
      required: ['projectId'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const projectId = String(args['projectId']);
      const sections = await brain.frontload(projectId);
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
      },
      required: ['key'],
    },
    makeHandler: ({ brain }) => async (args) => {
      const key = String(args['key']);
      const removed = await brain.forget(key);
      if (!removed) {
        return { content: [{ type: 'text', text: `No memory entry found with key: ${key}` }] };
      }
      return { content: [{ type: 'text', text: `Removed memory: ${key}` }] };
    },
  },

  // --- planner ---
  {
    name: 'fbeast_plan_decompose',
    server: 'planner',
    description: 'Break task into DAG of dependent steps',
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
      const text = [`## Plan created: ${result.planId}`, ``, `**Objective:** ${result.objective}`, constraints ? `**Constraints:** ${constraints}` : '', ``, `**Tasks:**`, taskList, ``, `Use fbeast_plan_validate with planId "${result.planId}" to check for issues.`].filter(Boolean).join('\n');
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
      const mermaid = await planner.visualize(planId);
      if (!mermaid) {
        return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
      }
      const text = [`## Plan: ${planId}`, ``, '```mermaid', mermaid, '```'].join('\n');
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
        evaluators: { type: 'string', description: 'Comma-separated evaluator names (e.g. logic-loop, complexity)' },
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
      const event = String(args['event']);
      const metadata = String(args['metadata']);
      const sessionId = String(args['sessionId']);
      const result = await observer.log({ event, metadata, sessionId });
      return { content: [{ type: 'text', text: `Logged event: ${event} (id: ${result.id}, hash: ${result.hash})` }] };
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
      const sessionId = String(args['sessionId']);
      const model = String(args['model']);
      const promptTokens = Number(args['promptTokens']);
      const completionTokens = Number(args['completionTokens']);
      const costUsdArg = args['costUsd'] != null ? Number(args['costUsd']) : undefined;
      await observer.logCost({ sessionId, model, promptTokens, completionTokens, ...(costUsdArg != null ? { costUsd: costUsdArg } : {}) });
      return { content: [{ type: 'text', text: `Logged cost: ${promptTokens}+${completionTokens} tokens for ${model}` }] };
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
      const lines = [`## Cost Summary${sessionId ? ` (session: ${sessionId})` : ''}`, '', ...summary.byModel.map((row) => `- ${row.model}: ${row.promptTokens} prompt + ${row.completionTokens} completion = $${row.costUsd.toFixed(4)}`), '', `**Total:** ${summary.totalPromptTokens} prompt + ${summary.totalCompletionTokens} completion = $${summary.totalCostUsd.toFixed(4)}`];
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
      const lines = [`## Budget Status`, '', ...summary.byModel.map((row) => `- ${row.model}: $${row.costUsd.toFixed(4)}`), '', `**Total spend:** $${summary.totalSpendUsd.toFixed(4)}`];
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
        enabled: { type: 'string', description: 'Filter: "true" for enabled only, "false" for disabled only' },
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

export function searchTools(query?: string): ToolStub[] {
  if (!query) return TOOL_STUBS;
  const q = query.toLowerCase();
  return TOOL_STUBS.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
}
