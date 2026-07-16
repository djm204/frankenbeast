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
      'fbeast_memory_review_propose',
      'fbeast_memory_query',
      'fbeast_memory_frontload',
      'fbeast_memory_export',
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
      const args = tool === 'fbeast_memory_export'
        ? { redaction: 'safe', input: 'DROP TABLE users; rm -rf /; delete all files', action: 'delete_file' }
        : { input: 'DROP TABLE users; rm -rf /; delete all files', action: 'delete_file' };
      const result = await gate.check({
        tool,
        args,
      });
      expect(result.decision, tool).toBe('approved');
      expect(seen).toHaveLength(0);
    }
  });

  it('routes unredacted memory exports through the shared governor', async () => {
    const { governor, seen } = spyGovernor('review_recommended');
    const gate = createGovernanceGate(governor);

    const result = await gate.check({ tool: 'fbeast_memory_export', args: { redaction: 'none', readScope: 'agent', agentId: 'alice@example.test' } });

    expect(result).toEqual({ decision: 'review_recommended', reason: 'r' });
    expect(seen).toEqual([{ action: 'fbeast_memory_export', context: JSON.stringify({ redaction: 'none', agentId: '[right-to-forget-selector-redacted]' }) }]);
  });

  it('still governs an unclassified tool by payload (fail-closed default)', async () => {
    const { governor, seen } = spyGovernor('denied');
    const gate = createGovernanceGate(governor);
    const result = await gate.check({ tool: 'some_unknown_tool', args: { cmd: 'rm -rf /' } });
    expect(result.decision).toBe('denied');
    expect(seen).toHaveLength(1);
  });

  it('routes right-to-forget mutations through the shared governor with redacted selector evidence', async () => {
    const { governor, seen } = spyGovernor('review_recommended');
    const gate = createGovernanceGate(governor);
    const result = await gate.check({
      tool: 'fbeast_memory_right_to_forget',
      args: { query: 'alice@example.test', category: 'pii', dryRun: false },
    });
    expect(result.decision).toBe('review_recommended');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.action).toBe('fbeast_memory_right_to_forget');
    expect(JSON.parse(seen[0]!.context)).toEqual({
      query: '[right-to-forget-selector-redacted]',
      category: '[right-to-forget-selector-redacted]',
      dryRun: false,
    });
  });

  it('routes ordinary memory stores through the shared governor with selector-only evidence', async () => {
    const { governor, seen } = spyGovernor('review_recommended');
    const gate = createGovernanceGate(governor);

    const result = await gate.check({ tool: 'fbeast_memory_store', args: { key: 'lesson', value: 'secret text', type: 'working' } });

    expect(result).toEqual({ decision: 'review_recommended', reason: 'r' });
    expect(seen).toEqual([{ action: 'fbeast_memory_store', context: JSON.stringify({ key: '[right-to-forget-selector-redacted]' }) }]);
  });

  it('routes right-to-forget dry-runs through the shared governor with structured dryRun evidence', async () => {
    const { governor, seen } = spyGovernor('approved');
    const gate = createGovernanceGate(governor);

    const result = await gate.check({ tool: 'fbeast_memory_right_to_forget', args: { query: 'alice@example.test', dryRun: true } });

    expect(result.decision).toBe('approved');
    expect(seen).toEqual([{ action: 'fbeast_memory_right_to_forget', context: JSON.stringify({ query: '[right-to-forget-selector-redacted]', dryRun: true }) }]);
  });

  it('routes high-risk memory deletes through the shared governor', async () => {
    const { governor, seen } = spyGovernor('review_recommended');
    const gate = createGovernanceGate(governor);
    const result = await gate.check({ tool: 'fbeast_memory_forget', args: { key: 'note' } });
    expect(result.decision).toBe('review_recommended');
    expect(seen).toEqual([{ action: 'fbeast_memory_forget', context: JSON.stringify({ key: '[right-to-forget-selector-redacted]' }) }]);
  });
});
