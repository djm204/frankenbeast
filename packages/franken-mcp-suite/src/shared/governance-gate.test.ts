import { describe, it, expect } from 'vitest';
import { createGovernanceGate } from './governance-gate.js';
import type { GovernorAdapter } from '../adapters/governor-adapter.js';

describe('createGovernanceGate', () => {
  it('maps a tool call to the governor adapter action/context and returns its decision', async () => {
    const seen: Array<{ action: string; context: string }> = [];
    const governor: GovernorAdapter = {
      async check(input) {
        seen.push(input);
        return { decision: 'denied', reason: 'destructive' };
      },
      async budgetStatus() {
        return { totalSpendUsd: 0, byModel: [] };
      },
    };

    const gate = createGovernanceGate(governor);
    const result = await gate.check({ tool: 'delete_file', args: { path: '/etc' } });

    expect(result).toEqual({ decision: 'denied', reason: 'destructive' });
    expect(seen).toEqual([{ action: 'delete_file', context: JSON.stringify({ path: '/etc' }) }]);
  });

  it('does not open a database until the first check (lazy from dbPath)', () => {
    // Construction with a path must not throw or open a connection eagerly.
    expect(() => createGovernanceGate('/nonexistent/path/should/not/open.db')).not.toThrow();
  });
});
