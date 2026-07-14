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

  it('exempts non-executing tools from payload governance (no governor call)', async () => {
    // A representative spread across servers: safety/meta, read, store, plan,
    // critique (content analysis), and append-only audit logging.
    const nonExecuting = [
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
    ];
    for (const tool of nonExecuting) {
      const { governor, seen } = spyGovernor('denied');
      const gate = createGovernanceGate(governor);
      // Payload deliberately carries dangerous words the governor would flag if
      // it scanned the data (DROP TABLE / rm -rf / delete all files).
      const result = await gate.check({
        tool,
        args: { input: 'DROP TABLE users; rm -rf /; delete all files', action: 'delete_file' },
      });
      expect(result.decision).toBe('approved');
      expect(seen).toHaveLength(0);
    }
  });

  it('still governs an unclassified tool by payload (fail-closed default)', async () => {
    const { governor, seen } = spyGovernor('denied');
    const gate = createGovernanceGate(governor);
    const result = await gate.check({ tool: 'some_unknown_tool', args: { cmd: 'rm -rf /' } });
    expect(result.decision).toBe('denied');
    expect(seen).toHaveLength(1);
  });

  it('routes right-to-forget through governance with redacted selector context', async () => {
    const { governor, seen } = spyGovernor('denied');
    const gate = createGovernanceGate(governor);
    const result = await gate.check({
      tool: 'fbeast_memory_right_to_forget',
      args: { query: 'alice@example.test', category: 'pii', dryRun: false },
    });
    expect(result.decision).toBe('denied');
    expect(seen).toEqual([
      {
        action: 'fbeast_memory_right_to_forget',
        context: JSON.stringify({
          query: '[right-to-forget-selector-redacted]',
          category: '[right-to-forget-selector-redacted]',
          dryRun: false,
        }),
      },
    ]);
    expect(seen[0]!.context).not.toContain('alice@example.test');
  });

  it('routes a destructive tool through the shared governor without a gate-level override', async () => {
    // Classification now lives in the governor adapter, not the gate. The gate
    // must NOT exempt or re-decide fbeast_memory_forget: it passes the call to
    // the governor and returns the governor's decision verbatim, so every caller
    // agrees on the same answer.
    const { governor, seen } = spyGovernor('review_recommended');
    const gate = createGovernanceGate(governor);
    const result = await gate.check({ tool: 'fbeast_memory_forget', args: { key: 'note' } });
    expect(result.decision).toBe('review_recommended');
    expect(seen).toEqual([{ action: 'fbeast_memory_forget', context: JSON.stringify({ key: 'note' }) }]);
  });
});
