import { SkillTrigger, TriggerRegistry } from '@franken/governor';
import type { TriggerResult, TriggerSeverity } from '@franken/governor';

import { createSqliteStore } from '../shared/sqlite-store.js';

/** Fallback patterns for CLI-level dangers the SkillTrigger doesn't cover. */
const DANGEROUS_PATTERNS = [
  /delete/i,
  /drop/i,
  /truncate/i,
  /destroy/i,
  /remove.*all/i,
  /force.*push/i,
  /reset.*hard/i,
  /rm\s+-rf/i,
  /format/i,
  /wipe/i,
  /purge/i,
];

export interface GovernorCheckResult {
  decision: 'approved' | 'review_recommended' | 'denied';
  reason: string;
}

export interface GovernorBudgetStatus {
  totalSpendUsd: number;
  byModel: Array<{ model: string; costUsd: number }>;
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
  if (severity === 'critical') return 'denied';
  return 'review_recommended';
}

function matchesDangerousPattern(text: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(text));
}

function assessAction(action: string, context: string): GovernorCheckResult {
  const combined = `${action} ${context}`;
  const isDestructive = matchesDangerousPattern(combined);

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
        SELECT model, SUM(cost_usd) as total_cost
        FROM cost_ledger
        GROUP BY model
      `).all() as Array<{ model: string; total_cost: number }>;

      return {
        totalSpendUsd: rows.reduce((sum, row) => sum + row.total_cost, 0),
        byModel: rows.map((row) => ({ model: row.model, costUsd: row.total_cost })),
      };
    },
  };
}
