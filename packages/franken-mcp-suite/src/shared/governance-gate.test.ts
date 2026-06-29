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

  function spyGovernor(decision: 'approved' | 'review_recommended' | 'denied'): {
    governor: GovernorAdapter;
    seen: Array<{ action: string; context: string }>;
  } {
    const seen: Array<{ action: string; context: string }> = [];
    const governor: GovernorAdapter = {
      async check(input) { seen.push(input); return { decision, reason: 'r' }; },
      async budgetStatus() { return { totalSpendUsd: 0, byModel: [] }; },
    };
    return { governor, seen };
  }

  it('exempts read-only safety/meta tools from payload governance (no governor call)', async () => {
    for (const tool of ['fbeast_firewall_scan', 'fbeast_firewall_scan_file', 'fbeast_governor_check', 'search_tools']) {
      const { governor, seen } = spyGovernor('denied');
      const gate = createGovernanceGate(governor);
      // Payload deliberately carries a dangerous word the governor would flag.
      const result = await gate.check({ tool, args: { input: 'delete all files', action: 'delete_file' } });
      expect(result.decision).toBe('approved');
      expect(seen).toHaveLength(0);
    }
  });

  it('escalates a known-destructive fbeast tool the word heuristic misses', async () => {
    const { governor } = spyGovernor('approved');
    const gate = createGovernanceGate(governor);
    const result = await gate.check({ tool: 'fbeast_memory_forget', args: { key: 'note' } });
    expect(result.decision).toBe('review_recommended');
    expect(result.reason).toContain('destructive');
  });

  it('never downgrades a stricter governor decision for destructive tools', async () => {
    const { governor } = spyGovernor('denied');
    const gate = createGovernanceGate(governor);
    const result = await gate.check({ tool: 'fbeast_memory_forget', args: { key: 'note' } });
    expect(result.decision).toBe('denied');
  });
});
