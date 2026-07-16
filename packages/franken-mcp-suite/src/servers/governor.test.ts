import { describe, it, expect, vi } from 'vitest';
import { createGovernorAdapter } from '../adapters/governor-adapter.js';
import { createGovernorServer } from './governor.js';

describe('Governor Server', () => {
  it('exposes 2 tools', () => {
    const server = createGovernorServer({
      governor: {
        check: vi.fn(),
        budgetStatus: vi.fn(),
      },
    });

    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_governor_check', 'fbeast_governor_budget']);
  });

  it('uses the governor adapter for approvals', async () => {
    const governor = {
      check: vi.fn().mockResolvedValue({ decision: 'approved', reason: 'safe action' }),
      budgetStatus: vi.fn().mockResolvedValue({
        totalSpendUsd: 1.25,
        byModel: [{ model: 'claude-opus-4', costUsd: 1.25 }],
      }),
    };

    const server = createGovernorServer({ governor });
    const checkTool = server.tools.find((t) => t.name === 'fbeast_governor_check')!;
    const budgetTool = server.tools.find((t) => t.name === 'fbeast_governor_budget')!;

    const checkResult = await checkTool.handler({
      action: 'edit_file',
      context: '{"path":"src/app.ts"}',
    });
    expect(governor.check).toHaveBeenCalledWith({
      action: 'edit_file',
      context: '{"path":"src/app.ts"}',
    });
    expect(checkResult.content[0]!.text).toContain('approved');

    const budgetResult = await budgetTool.handler({});
    expect(governor.budgetStatus).toHaveBeenCalledWith();
    expect(budgetResult.content[0]!.text).toContain('1.25');
  });

  it.each(['keep_both_scoped', 'expire_existing'] as const)(
    'approves %s memory conflict resolutions through the public governor check',
    async (resolution) => {
      const server = createGovernorServer({ governor: createGovernorAdapter(':memory:') });
      const checkTool = server.tools.find((t) => t.name === 'fbeast_governor_check')!;

      const context = JSON.stringify({
        action: 'resolve_conflict',
        id: 'memcand_1',
        resolution,
        ...(resolution === 'keep_both_scoped'
          ? { scopedKey: 'user.preference.response-style.scope.docs' }
          : {}),
      });

      const directResult = await checkTool.handler({
        action: 'fbeast_memory_review_decide',
        context,
      });
      expect(directResult.content[0]!.text).toContain('**Decision:** approved');
      expect(directResult.content[0]!.text).toContain('explicit operator review decision');

      const proxyResult = await checkTool.handler({
        action: 'execute_tool',
        context: JSON.stringify({
          tool: 'fbeast_memory_review_decide',
          args: JSON.parse(context) as Record<string, unknown>,
        }),
      });
      expect(proxyResult.content[0]!.text).toContain('**Decision:** approved');
      expect(proxyResult.content[0]!.text).toContain('explicit operator review decision');
    },
  );
});
