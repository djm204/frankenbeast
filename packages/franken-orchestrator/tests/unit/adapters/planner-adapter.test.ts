import { describe, it, expect, vi } from 'vitest';
import { PlannerPortAdapter } from '../../../src/adapters/planner-adapter.js';

const intent = {
  goal: 'Ship the release',
  strategy: 'Keep it small',
  context: { repo: 'frankenbeast' },
};

describe('PlannerPortAdapter', () => {
  it('parses the LLM response into a plan graph', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          tasks: [
            { id: 't1', objective: 'Prep', requiredSkills: ['plan'], dependsOn: [] },
            { id: 't2', objective: 'Ship', requiredSkills: ['deploy'], dependsOn: ['t1'] },
          ],
        }),
      ),
    };

    const adapter = new PlannerPortAdapter(llmClient);
    const plan = await adapter.createPlan(intent);

    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]).toEqual({
      id: 't1',
      objective: 'Prep',
      requiredSkills: ['plan'],
      dependsOn: [],
    });
    expect(llmClient.complete).toHaveBeenCalledWith(expect.stringContaining('Ship the release'));
  });

  it('falls back to a single task plan on malformed LLM output', async () => {
    const llmClient = { complete: vi.fn().mockResolvedValue('not-json') };
    const adapter = new PlannerPortAdapter(llmClient);

    const plan = await adapter.createPlan(intent);

    expect(plan).toEqual({
      tasks: [
        {
          id: 'task-1',
          objective: 'Ship the release',
          requiredSkills: [],
          dependsOn: [],
        },
      ],
    });
  });
});
