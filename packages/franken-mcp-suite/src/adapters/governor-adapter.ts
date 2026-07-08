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
]);

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

function assessAction(action: string, context: string): GovernorCheckResult {
  // Non-executing tools are approved without payload governance, so this
  // exemption holds on every path that reaches the shared governor (hook,
  // public check tool, central gate) — not just the central dispatch gate.
  if (NON_EXECUTING_TOOLS.has(action)) {
    return {
      decision: 'approved',
      reason: `Tool "${action}" is non-executing (its payload is data, not an operation); exempt from payload governance.`,
    };
  }

  const isDestructive = DESTRUCTIVE_ACTIONS.has(action) || matchesDangerousPattern(action, context);

  // Evaluate via governor SkillTrigger with pattern-derived destructiveness
  const triggerResult: TriggerResult = triggerRegistry.evaluateAll({
    skillId: action,
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
      const result = assessAction(input.action, input.context);

      store.db.prepare(`
        INSERT INTO governor_log (action, context, decision, reason)
        VALUES (?, ?, ?, ?)
      `).run(input.action, input.context, result.decision, result.reason);

      return result;
    },

    async budgetStatus() {
      const rows = store.db.prepare(`
        SELECT model, SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens, SUM(cost_usd) as total_cost
        FROM cost_ledger
        GROUP BY model
      `).all() as Array<{ model: string; prompt_tokens: number; completion_tokens: number; total_cost: number }>;

      const byModel = rows.map((row) => {
        const hasPricing = DEFAULT_PRICING[row.model] !== undefined;
        const costUsd = row.total_cost > 0
          ? row.total_cost
          : costCalculator.calculate({
              model: row.model,
              promptTokens: row.prompt_tokens,
              completionTokens: row.completion_tokens,
            });

        return {
          model: row.model,
          costUsd,
          ...(hasPricing || row.total_cost > 0 ? {} : { unknownModel: true }),
        };
      });

      return {
        totalSpendUsd: byModel.reduce((sum, row) => sum + row.costUsd, 0),
        byModel,
      };
    },
  };
}
