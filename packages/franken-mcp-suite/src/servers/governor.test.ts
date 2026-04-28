import { describe, it, expect, vi } from 'vitest';
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
});
