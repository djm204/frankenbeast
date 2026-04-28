import { describe, it, expect, vi } from 'vitest';
import { createPlannerServer } from './planner.js';

describe('Planner Server', () => {
  it('exposes 3 tools', () => {
    const server = createPlannerServer({
      planner: {
        decompose: vi.fn(),
        visualize: vi.fn(),
        validate: vi.fn(),
      },
    });

    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_plan_decompose', 'fbeast_plan_status', 'fbeast_plan_validate']);
  });

  it('delegates decompose and validate to the planner adapter', async () => {
    const planner = {
      decompose: vi.fn().mockResolvedValue({
        planId: 'p1',
        objective: 'ship',
        tasks: [{ id: 't1', title: 'wire adapter', deps: [], status: 'pending' }],
      }),
      visualize: vi.fn().mockResolvedValue('graph TD\n  t1["wire adapter"]'),
      validate: vi.fn().mockResolvedValue({ verdict: 'valid', issues: [] }),
    };

    const server = createPlannerServer({ planner });
    const decomposeTool = server.tools.find((t) => t.name === 'fbeast_plan_decompose')!;
    const visualizeTool = server.tools.find((t) => t.name === 'fbeast_plan_status')!;
    const validateTool = server.tools.find((t) => t.name === 'fbeast_plan_validate')!;

    const decomposeResult = await decomposeTool.handler({ objective: 'ship', constraints: 'small PRs' });
    expect(planner.decompose).toHaveBeenCalledWith({ objective: 'ship', constraints: 'small PRs' });
    expect(decomposeResult.content[0]!.text).toContain('p1');

    const visualizeResult = await visualizeTool.handler({ planId: 'p1' });
    expect(planner.visualize).toHaveBeenCalledWith('p1');
    expect(visualizeResult.content[0]!.text).toContain('graph TD');

    const validateResult = await validateTool.handler({ planId: 'p1' });
    expect(planner.validate).toHaveBeenCalledWith('p1');
    expect(validateResult.content[0]!.text).toContain('valid');
  });
});
