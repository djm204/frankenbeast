import { SkillTrigger, TriggerRegistry } from '@franken/governor';
import type { TriggerResult, TriggerSeverity } from '@franken/governor';
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
  'fbeast_memory_store',
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

function redactRightToForgetGovernanceContext(action: string, context: string): string {
  if (unqualifyMcpActionName(action) !== 'fbeast_memory_right_to_forget') return context;
  return '[right-to-forget-context-redacted]';
}

function redactMemoryReviewProposalGovernanceContext(action: string, context: string): string {
  const unqualified = unqualifyMcpActionName(action);
  if (unqualified !== 'fbeast_memory_review_propose'
    && !(unqualified === 'execute_tool' && contextTargetsTool(context, 'fbeast_memory_review_propose'))) {
    return context;
  }
  return MEMORY_REVIEW_PROPOSE_CONTEXT_REDACTION;
}

function redactGovernanceContext(action: string, context: string): string {
  return redactMemoryReviewProposalGovernanceContext(action, redactRightToForgetGovernanceContext(action, context));
}

function isRightToForgetDryRun(action: string, context: string): boolean {
  if (action !== 'fbeast_memory_right_to_forget') return false;
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

  const isDestructive = DESTRUCTIVE_ACTIONS.has(unqualifiedAction) || matchesDangerousPattern(unqualifiedAction, context);

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
