import { createSqliteStore } from '../shared/sqlite-store.js';

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

function assessAction(action: string, context: string): GovernorCheckResult {
  const combined = `${action} ${context}`;

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        decision: 'review_recommended',
        reason: `Action "${action}" matches dangerous pattern. Human review recommended before proceeding.`,
      };
    }
  }

  return {
    decision: 'approved',
    reason: `Action "${action}" does not match any dangerous patterns.`,
  };
}
