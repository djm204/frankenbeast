import { SkillTrigger, TriggerRegistry, evaluateHighRiskActionPolicy } from '@franken/governor';
import type { HighRiskActionClass, HighRiskActionEvidence, TriggerResult, TriggerSeverity } from '@franken/governor';
import { CostCalculator, DEFAULT_PRICING } from '@franken/observer';

import { createSqliteStore } from '../shared/sqlite-store.js';

/**
 * fbeast tool/action names that are destructive but whose name the word
 * patterns below do not catch (e.g. `forget` deletes a memory entry). Treated
 * as destructive here, in the *shared* governor, so every caller agrees: the
 * client hook, the public `fbeast_governor_check` tool, the `governor_log`
 * record, and the central MCP dispatch gate all get the same decision for the
 * same action.
 */
const DESTRUCTIVE_ACTIONS = new Set([
  'fbeast_memory_forget',
  'fbeast_memory_right_to_forget',
]);
const MEMORY_REVIEW_PROPOSE_CONTEXT_REDACTION = '[memory-review-proposal-context-redacted]';

const HIGH_RISK_ACTIONS: Readonly<Record<string, HighRiskActionClass>> = {
  fbeast_memory_store: 'memory',
  fbeast_memory_forget: 'memory',
  fbeast_memory_right_to_forget: 'memory',
};

const GIT_GLOBAL_OPTIONS_PATTERN = String.raw`(?:\s+(?:-[A-Za-z](?:\s+\S+)?|--[^\s=]+(?:=\S+)?))*`;
const GH_GLOBAL_OPTIONS_PATTERN = String.raw`(?:\s+(?:-[A-Za-z]\s+\S+|--(?:repo|hostname)(?:=\S+|\s+\S+)|--[^\s=]+(?:=\S+)?))*`;
const GH_MUTATING_RESOURCES_PATTERN = String.raw`(?:api|issue|pr|workflow|repo|release|label|run|secret)`;

const HIGH_RISK_ACTION_NAME_PATTERNS: ReadonlyArray<readonly [RegExp, HighRiskActionClass]> = [
  [new RegExp(String.raw`\bgit\b${GIT_GLOBAL_OPTIONS_PATTERN}\s+push\b`, 'i'), 'git-remote-write'],
  [new RegExp(String.raw`\bgh\b${GH_GLOBAL_OPTIONS_PATTERN}\s+${GH_MUTATING_RESOURCES_PATTERN}\b`, 'i'), 'github-mutation'],
  [/\b(?:curl|fetch)\b[^\n]*api\.github\.com\b/i, 'github-mutation'],
  [/\b(?:cron|crontab|cronjob|schedule|scheduled\s+job)\b/i, 'cron'],
  [/\b(?:profile|skill|plugin|credential|config)\b[^\n]*(?:write|edit|patch|create|delete|remove|install|set)\b/i, 'profile-write'],
  [/\b(?:webhook|discord_webhook_url|slack_webhook_url)\b|https:\/\/hooks\.slack\.com\/services\/|https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\//i, 'webhook'],
  [/\b(?:kill|pkill|killall|nohup|disown|systemctl|service\s+\S+\s+(?:start|stop|restart|reload|enable|disable)|docker\s+(?:stop|kill|rm|restart)|process\s+(?:kill|start|stop))\b/i, 'shell-process-control'],
];

/**
 * fbeast tools whose payload is *data to query/analyze/store/log*, not an
 * operation to authorize. Their input frequently contains dangerous words (the
 * text being critiqued, the value being stored, the event being logged), so
 * running the word heuristic over it produces false-positive denials on
 * legitimate risky content. They are exempt here in the *shared* governor so the
 * exemption applies identically whether a call is judged by the client hook
 * (`fbeast-hook pre-tool`), the public `fbeast_governor_check` tool, or the
 * central MCP dispatch gate — no path can diverge.
 */
export const NON_EXECUTING_TOOLS: ReadonlySet<string> = new Set([
  'search_tools',
  'fbeast_firewall_scan',
  'fbeast_firewall_scan_file',
  'fbeast_governor_check',
  'fbeast_governor_budget',
  'fbeast_memory_review_propose',
  'fbeast_memory_query',
  'fbeast_memory_frontload',
  'fbeast_plan_decompose',
  'fbeast_plan_status',
  'fbeast_plan_validate',
  'fbeast_critique_evaluate',
  'fbeast_critique_compare',
  'fbeast_observer_log',
  'fbeast_observer_log_cost',
  'fbeast_observer_cost',
  'fbeast_observer_trail',
  'fbeast_observer_verify',
  'fbeast_skills_list',
  'fbeast_skills_discover',
  'fbeast_skills_load',
]);

/**
 * Fallback patterns for CLI-level dangers the SkillTrigger doesn't cover.
 * Action/tool names are tokenized separately so destructive verbs in snake_case
 * or camelCase names (`delete_file`, `dropTable`) still fail closed, while
 * payload text uses word/command boundaries so benign paths or identifiers such
 * as `src/dropdown.tsx` and `formatMessage()` do not get denied.
 */
const DANGEROUS_ACTION_VERBS = new Set([
  'delete',
  'drop',
  'truncate',
  'destroy',
  'format',
  'wipe',
  'purge',
]);

const DANGEROUS_CONTEXT_PATTERNS = [
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\bdestroy\b/i,
  /\bremove\b[^\n;|&]*\ball\b/i,
  /\b(?:force\b[\s_-]+\bpush|push\b[^\n;|&]*\s--force\b)/i,
  /\breset\b[^\n;|&]*\b(?:hard|--hard)\b/i,
  /\brm\b(?=[^\n;|&]*\s(?:-[A-Za-z]*r[A-Za-z]*|--recursive)\b)(?=[^\n;|&]*\s(?:-[A-Za-z]*f[A-Za-z]*|--force)\b)/i,
  /\bformat\b/i,
  /\bwipe\b/i,
  /\bpurge\b/i,
];

export interface GovernorCheckResult {
  decision: 'approved' | 'review_recommended' | 'denied';
  reason: string;
}

export interface GovernorBudgetStatus {
  totalSpendUsd: number;
  byModel: Array<{ model: string; costUsd: number; unknownModel?: boolean }>;
}

export interface GovernorAdapter {
  check(input: { action: string; context: string }): Promise<GovernorCheckResult>;
  budgetStatus(): Promise<GovernorBudgetStatus>;
}

const skillTrigger = new SkillTrigger();
const triggerRegistry = new TriggerRegistry([skillTrigger]);

function mapSeverityToDecision(
  severity: TriggerSeverity | undefined,
): GovernorCheckResult['decision'] {
  // SkillTrigger emits 'critical' for destructive matches (dangerous patterns
  // and DESTRUCTIVE_ACTIONS), so destructive actions map to a hard 'denied';
  // lower severities (e.g. HITL-only 'high') stay 'review_recommended'.
  if (severity === 'critical') return 'denied';
  return 'review_recommended';
}

function tokenizeActionName(action: string): string[] {
  return action
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function matchesDangerousActionName(action: string): boolean {
  const tokens = tokenizeActionName(action);
  return (
    tokens.some((token) => DANGEROUS_ACTION_VERBS.has(token))
    || (tokens.includes('remove') && tokens.includes('all'))
    || (tokens.includes('force') && tokens.includes('push'))
    || (tokens.includes('reset') && tokens.includes('hard'))
  );
}

function matchesDangerousPattern(action: string, context: string): boolean {
  const combined = `${action} ${context}`;
  return matchesDangerousActionName(action) || DANGEROUS_CONTEXT_PATTERNS.some((p) => p.test(combined));
}

function unqualifyMcpActionName(action: string): string {
  const marker = '__';
  if (!action.startsWith('mcp__')) return action;
  const index = action.lastIndexOf(marker);
  return index >= 0 ? action.slice(index + marker.length) : action;
}

function contextValueTargetsTool(value: unknown, toolName: string): boolean {
  return typeof value === 'string' && unqualifyMcpActionName(value) === toolName;
}

function contextTargetsTool(context: string, toolName: string): boolean {
  try {
    const parsed = JSON.parse(context) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    const direct = record['tool'] ?? record['tool_name'] ?? record['name'];
    if (contextValueTargetsTool(direct, toolName)) return true;
    const toolInput = record['tool_input'];
    if (toolInput !== null && typeof toolInput === 'object' && !Array.isArray(toolInput)) {
      const nested = (toolInput as Record<string, unknown>)['tool'];
      return contextValueTargetsTool(nested, toolName);
    }
  } catch {
    return false;
  }
  return false;
}

function contextLooksLikeMemoryReviewProposalArgs(context: string): boolean {
  try {
    const parsed = JSON.parse(context) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    return typeof record['key'] === 'string'
      && typeof record['value'] === 'string'
      && typeof record['source'] === 'string'
      && (typeof record['reason'] === 'string' || record['confidence'] !== undefined);
  } catch {
    return false;
  }
}

function contextLooksLikeMemoryReviewDecisionArgs(context: string): boolean {
  try {
    const parsed = JSON.parse(context) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    return typeof record['id'] === 'string'
      && typeof record['action'] === 'string'
      && ['approve', 'reject', 'never_store'].includes(record['action']);
  } catch {
    return false;
  }
}

function memoryReviewDecisionArgsFromContext(context: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(context) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    const directArgs = record['args'];
    if (contextValueTargetsTool(record['tool'] ?? record['tool_name'] ?? record['name'], 'fbeast_memory_review_decide')
      && directArgs !== null
      && typeof directArgs === 'object'
      && !Array.isArray(directArgs)) {
      return directArgs as Record<string, unknown>;
    }
    const toolInput = record['tool_input'];
    if (toolInput !== null && typeof toolInput === 'object' && !Array.isArray(toolInput)) {
      const nested = toolInput as Record<string, unknown>;
      const nestedArgs = nested['args'];
      if (contextValueTargetsTool(nested['tool'], 'fbeast_memory_review_decide')
        && nestedArgs !== null
        && typeof nestedArgs === 'object'
        && !Array.isArray(nestedArgs)) {
        return nestedArgs as Record<string, unknown>;
      }
    }
    if (typeof record['id'] === 'string' && typeof record['action'] === 'string') return record;
  } catch {
    return undefined;
  }
  return undefined;
}

function redactRightToForgetGovernanceContext(action: string, context: string): string {
  if (unqualifyMcpActionName(action) !== 'fbeast_memory_right_to_forget') return context;
  return '[right-to-forget-context-redacted]';
}

function redactMemoryReviewProposalGovernanceContext(action: string, context: string): string {
  const unqualified = unqualifyMcpActionName(action);
  if (unqualified !== 'fbeast_memory_review_propose'
    && !(unqualified === 'execute_tool'
      && (contextTargetsTool(context, 'fbeast_memory_review_propose')
        || contextLooksLikeMemoryReviewProposalArgs(context)))) {
    return context;
  }
  return MEMORY_REVIEW_PROPOSE_CONTEXT_REDACTION;
}

function redactMemoryReviewDecisionGovernanceContext(action: string, context: string): string {
  const unqualified = unqualifyMcpActionName(action);
  const decisionArgs = memoryReviewDecisionArgsFromContext(context);
  if (unqualified === 'execute_tool'
    && (contextTargetsTool(context, 'fbeast_memory_review_decide')
      || decisionArgs !== undefined
      || contextLooksLikeMemoryReviewDecisionArgs(context))) {
    return JSON.stringify({
      tool: 'fbeast_memory_review_decide',
      ...(typeof decisionArgs?.['id'] === 'string' ? { id: decisionArgs['id'] } : {}),
      ...(typeof decisionArgs?.['action'] === 'string' ? { action: decisionArgs['action'] } : {}),
      ...(decisionArgs !== undefined && Object.prototype.hasOwnProperty.call(decisionArgs, 'reviewer') ? { reviewer: '[memory-review-decision-metadata-redacted]' } : {}),
      ...(decisionArgs !== undefined && Object.prototype.hasOwnProperty.call(decisionArgs, 'note') ? { note: '[memory-review-decision-metadata-redacted]' } : {}),
    });
  }
  if (unqualified !== 'fbeast_memory_review_decide') return context;
  try {
    const parsed = JSON.parse(context) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return context;
    const record = parsed as Record<string, unknown>;
    return JSON.stringify({
      ...(typeof record['id'] === 'string' ? { id: record['id'] } : {}),
      ...(typeof record['action'] === 'string' ? { action: record['action'] } : {}),
      ...(Object.prototype.hasOwnProperty.call(record, 'reviewer') ? { reviewer: '[memory-review-decision-metadata-redacted]' } : {}),
      ...(Object.prototype.hasOwnProperty.call(record, 'note') ? { note: '[memory-review-decision-metadata-redacted]' } : {}),
    });
  } catch {
    return context;
  }
}

function redactGovernanceContext(action: string, context: string): string {
  return redactMemoryReviewDecisionGovernanceContext(
    action,
    redactMemoryReviewProposalGovernanceContext(action, redactRightToForgetGovernanceContext(action, context)),
  );
}

function isRightToForgetDryRun(action: string, context: string): boolean {
  if (unqualifyMcpActionName(action) !== 'fbeast_memory_right_to_forget') return false;
  try {
    const parsed = JSON.parse(context) as unknown;
    return parsed !== null
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && (parsed as { dryRun?: unknown }).dryRun === true;
  } catch {
    return false;
  }
}

function parseContextObject(context: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(context) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Missing structured evidence intentionally falls through to fail-closed policy.
  }
  return {};
}

function stringContext(context: Record<string, unknown>, key: string): string | undefined {
  const value = context[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function booleanContext(context: Record<string, unknown>, key: string): boolean | undefined {
  const value = context[key];
  return typeof value === 'boolean' ? value : undefined;
}

function optionalTarget(target: string | undefined): Pick<HighRiskActionEvidence, 'target'> | Record<string, never> {
  return target !== undefined ? { target } : {};
}

function memoryTarget(context: Record<string, unknown>): string | undefined {
  const selectors = ['key', 'category', 'sourceScope', 'query']
    .map((key) => stringContext(context, key))
    .filter((value): value is string => value !== undefined);
  return selectors.length > 0 ? selectors.join(',') : undefined;
}

function contextCommand(action: string, context: string): string {
  const parsed = parseContextObject(context);
  for (const key of ['command', 'cmd', 'script']) {
    const value = stringContext(parsed, key);
    if (value !== undefined) return value;
  }
  for (const key of ['args', 'argv', 'commands']) {
    const value = parsed[key];
    if (Array.isArray(value)) return value.map(String).join(' ');
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return `${action} ${context}`.trim();
}

function extractGitPushTarget(command: string): string | undefined {
  const match = /\bgit\b(?:\s+(?:-[A-Za-z](?:\s+\S+)?|--[^\s=]+(?:=\S+)?))*\s+push\b(?:\s+--[^\s]+)*(?:\s+(?<remote>[^\s]+))?(?:\s+(?<ref>[^\s]+))?/i.exec(command);
  if (!match?.groups) return undefined;
  const remote = match.groups.remote;
  const ref = match.groups.ref;
  return [remote, ref].filter((part): part is string => part !== undefined && !part.startsWith('-')).join(' ') || undefined;
}

function inferGithubOperation(command: string, fallback: string): string {
  const match = new RegExp(String.raw`\bgh\b${GH_GLOBAL_OPTIONS_PATTERN}\s+(?<resource>${GH_MUTATING_RESOURCES_PATTERN})\b(?:\s+(?<verb>[A-Za-z][\w-]*))?`, 'i').exec(command);
  const resource = match?.groups?.resource?.toLowerCase();
  const verb = match?.groups?.verb?.toLowerCase();
  if (resource === undefined) return fallback;
  if (resource === 'api') return fallback;
  if (verb === undefined || ['view', 'list', 'status', 'checks', 'diff'].includes(verb)) return 'read';
  return verb;
}

function inferCronOperation(command: string, fallback: string): string {
  if (/\bcrontab\s+-l\b/i.test(command)) return 'list';
  if (/\bcrontab\s+-r\b/i.test(command)) return 'remove';
  if (/\bcrontab\s+-e\b/i.test(command)) return 'update';
  if (/\bcrontab\s+\S+/i.test(command)) return 'install';
  return fallback;
}

function extractUrl(text: string): string | undefined {
  return /https?:\/\/[^\s'"`<>]+/i.exec(text)?.[0];
}

function inferHighRiskActionClass(action: string, context: string): HighRiskActionClass | undefined {
  const explicit = HIGH_RISK_ACTIONS[action];
  if (explicit !== undefined) return explicit;
  const combined = `${action} ${context}`;
  return HIGH_RISK_ACTION_NAME_PATTERNS.find(([pattern]) => pattern.test(combined))?.[1];
}

function highRiskEvidence(action: string, context: string): HighRiskActionEvidence {
  const parsed = parseContextObject(context);
  const memoryEvidence = (operation: string): HighRiskActionEvidence => {
    const evidence: HighRiskActionEvidence = { operation };
    const target = memoryTarget(parsed);
    const profile = stringContext(parsed, 'profile');
    const activeProfile = stringContext(parsed, 'activeProfile');
    const crossProfile = booleanContext(parsed, 'crossProfile');
    const dryRun = booleanContext(parsed, 'dryRun');
    if (target !== undefined) Object.assign(evidence, { target });
    if (profile !== undefined) Object.assign(evidence, { profile });
    if (activeProfile !== undefined) Object.assign(evidence, { activeProfile });
    if (crossProfile !== undefined) Object.assign(evidence, { crossProfile });
    if (dryRun !== undefined) Object.assign(evidence, { dryRun });
    return evidence;
  };
  if (action === 'fbeast_memory_store') return memoryEvidence('store');
  if (action === 'fbeast_memory_forget') return memoryEvidence('delete');
  if (action === 'fbeast_memory_right_to_forget') return memoryEvidence('right-to-forget');
  const command = contextCommand(action, context);
  if (new RegExp(String.raw`\bgit\b${GIT_GLOBAL_OPTIONS_PATTERN}\s+push\b`, 'i').test(command)) {
    return {
      command,
      ...optionalTarget(extractGitPushTarget(command)),
      force: /(?:\s--force(?:-with-lease)?\b|\s-f\b)/i.test(command),
    };
  }
  const actionClass = inferHighRiskActionClass(action, context);
  const parsedOperation = stringContext(parsed, 'operation');
  const operation = parsedOperation
    ?? (actionClass === 'github-mutation' ? inferGithubOperation(command, action)
      : actionClass === 'cron' ? inferCronOperation(command, action)
        : action);
  const target = stringContext(parsed, 'target') ?? extractUrl(command) ?? command;
  const evidence: HighRiskActionEvidence = { command, operation, ...optionalTarget(target) };
  for (const [key, value] of [
    ['profile', stringContext(parsed, 'profile')],
    ['activeProfile', stringContext(parsed, 'activeProfile')],
    ['url', extractUrl(command)],
  ] as const) {
    if (value !== undefined) Object.assign(evidence, { [key]: value });
  }
  for (const [key, value] of [
    ['allowlisted', booleanContext(parsed, 'allowlisted')],
    ['dryRun', booleanContext(parsed, 'dryRun')],
    ['readOnly', booleanContext(parsed, 'readOnly')],
    ['destructive', booleanContext(parsed, 'destructive')],
    ['force', booleanContext(parsed, 'force')],
    ['crossProfile', booleanContext(parsed, 'crossProfile')],
  ] as const) {
    if (value !== undefined) Object.assign(evidence, { [key]: value });
  }
  return evidence;
}

function assessHighRiskAction(action: string, context: string): GovernorCheckResult | undefined {
  const actionClass = inferHighRiskActionClass(action, context);
  if (actionClass === undefined) return undefined;
  const result = evaluateHighRiskActionPolicy({ actionClass, evidence: highRiskEvidence(action, context) });
  if (result.decision === 'allow') {
    return { decision: 'approved', reason: `High-risk policy allowed ${action}: ${result.reason}` };
  }
  if (result.decision === 'deny') {
    return { decision: 'denied', reason: `High-risk policy denied ${action}: ${result.reason}` };
  }
  return { decision: 'review_recommended', reason: `High-risk policy requires approval for ${action}: ${result.reason}` };
}

function shouldRepriceStoredCost(row: { cost_source: string; cost_usd: number; model: string }): boolean {
  if (row.cost_usd > 0 || row.cost_source === 'explicit') {
    return false;
  }
  if (row.cost_source === 'legacy') {
    return DEFAULT_PRICING[row.model] === undefined;
  }
  return true;
}

function assessAction(action: string, context: string): GovernorCheckResult {
  const unqualifiedAction = unqualifyMcpActionName(action);
  const highRiskResult = assessHighRiskAction(unqualifiedAction, context);
  if (highRiskResult !== undefined) return highRiskResult;

  const isMemoryReviewDecision = unqualifiedAction === 'fbeast_memory_review_decide'
    || (unqualifiedAction === 'execute_tool'
      && unqualifyMcpActionName(stringContext(parseContextObject(context), 'tool') ?? '') === 'fbeast_memory_review_decide');
  if (isMemoryReviewDecision) {
    const parsed = parseContextObject(context);
    const reviewAction = stringContext(parsed, 'action');
    if (reviewAction === 'approve') {
      return {
        decision: 'approved',
        reason: 'Memory review approval is the explicit operator promotion decision; candidate content remains governed by the review queue.',
      };
    }
    if (reviewAction === 'never_store') {
      const result = evaluateHighRiskActionPolicy({
        actionClass: 'memory',
        evidence: {
          operation: 'review-never-store',
          ...optionalTarget(stringContext(parsed, 'id')),
        },
      });
      if (result.decision === 'allow') {
        return { decision: 'approved', reason: `High-risk policy allowed memory review never-store: ${result.reason}` };
      }
      if (result.decision === 'deny') {
        return { decision: 'denied', reason: `High-risk policy denied memory review never-store: ${result.reason}` };
      }
      return { decision: 'review_recommended', reason: `High-risk policy requires approval for memory review never-store: ${result.reason}` };
    }
    if (reviewAction === 'reject') {
      return {
        decision: 'approved',
        reason: 'Memory review reject decision does not persist or delete candidate content; allowed while audit metadata remains redacted.',
      };
    }
  }

  // Non-executing tools are approved without payload governance, so this
  // exemption holds on every path that reaches the shared governor (hook,
  // public check tool, central gate) — not just the central dispatch gate.
  if (NON_EXECUTING_TOOLS.has(unqualifiedAction)) {
    return {
      decision: 'approved',
      reason: `Tool "${action}" is non-executing (its payload is data, not an operation); exempt from payload governance.`,
    };
  }

  if (unqualifiedAction === 'fbeast_memory_right_to_forget') {
    return {
      decision: 'approved',
      reason: 'Tool "fbeast_memory_right_to_forget" is an explicit privacy deletion workflow; execution is allowed through the central gate while audit context remains redacted.',
    };
  }

  const isDestructive = DESTRUCTIVE_ACTIONS.has(unqualifiedAction)
    || matchesDangerousPattern(action, context)
    || matchesDangerousPattern(unqualifiedAction, context);

  // Evaluate via governor SkillTrigger with pattern-derived destructiveness
  const triggerResult: TriggerResult = triggerRegistry.evaluateAll({
    skillId: unqualifiedAction,
    requiresHitl: false,
    isDestructive,
  });

  if (triggerResult.triggered) {
    return {
      decision: mapSeverityToDecision(triggerResult.severity),
      reason: triggerResult.reason ?? `Trigger '${triggerResult.triggerId}' fired for action "${action}".`,
    };
  }

  return {
    decision: 'approved',
    reason: `Action "${action}" does not match any dangerous patterns.`,
  };
}

export function createGovernorAdapter(dbPath: string): GovernorAdapter {
  const store = createSqliteStore(dbPath);
  const costCalculator = new CostCalculator(DEFAULT_PRICING, {
    onUnknownModel: (model) => {
      process.stderr.write(`[fbeast-governor] Unknown model "${model}" — budget status will report $0.0000 until pricing is configured.\n`);
    },
  });

  return {
    async check(input) {
      const isDryRunForget = isRightToForgetDryRun(input.action, input.context);
      const context = redactGovernanceContext(input.action, input.context);
      const result = isDryRunForget
        ? {
            decision: 'approved' as const,
            reason: 'Right-to-forget dryRun is non-mutating and allowed so users can inspect deletion counts before approval.',
          }
        : assessAction(input.action, context);

      store.db.prepare(`
        INSERT INTO governor_log (action, context, decision, reason)
        VALUES (?, ?, ?, ?)
      `).run(input.action, context, result.decision, result.reason);

      return result;
    },

    async budgetStatus() {
      const rows = store.db.prepare(`
        SELECT model, prompt_tokens, completion_tokens, cost_usd, cost_source
        FROM cost_ledger
      `).all() as Array<{ model: string; prompt_tokens: number; completion_tokens: number; cost_usd: number; cost_source: string }>;

      const grouped = new Map<string, { model: string; costUsd: number; unknownModel?: boolean }>();

      for (const row of rows) {
        const hasPricing = DEFAULT_PRICING[row.model] !== undefined;
        const costUsd = shouldRepriceStoredCost(row)
          ? costCalculator.calculate({
              model: row.model,
              promptTokens: row.prompt_tokens,
              completionTokens: row.completion_tokens,
            })
          : row.cost_usd;
        const current = grouped.get(row.model) ?? { model: row.model, costUsd: 0 };

        current.costUsd += costUsd;
        if (row.cost_source !== 'explicit' && row.cost_usd <= 0 && !hasPricing) {
          current.unknownModel = true;
        }

        grouped.set(row.model, current);
      }

      const byModel = Array.from(grouped.values());

      return {
        totalSpendUsd: byModel.reduce((sum, row) => sum + row.costUsd, 0),
        byModel,
      };
    },
  };
}
