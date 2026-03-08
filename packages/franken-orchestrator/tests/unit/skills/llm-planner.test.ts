import { describe, it, expect, vi } from 'vitest';
import { LlmPlanner } from '../../../src/skills/llm-planner.js';

const intent = {
  goal: 'Ship the release',
  strategy: 'Keep it small',
  context: { repo: 'frankenbeast' },
};

describe('LlmPlanner', () => {
  it('parses the LLM response into a plan graph', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          tasks: [
            { id: 'prep', objective: 'Prep', requiredSkills: ['plan'], dependsOn: [] },
            { id: 'ship', objective: 'Ship', requiredSkills: ['deploy'], dependsOn: ['prep'] },
          ],
        }),
      ),
    };

    const planner = new LlmPlanner(llmClient);
    const plan = await planner.createPlan(intent);

    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]).toEqual({
      id: 't1',
      objective: 'Prep',
      requiredSkills: ['llm-generate'],
      dependsOn: [],
    });
    expect(plan.tasks[1]).toEqual({
      id: 't2',
      objective: 'Ship',
      requiredSkills: ['llm-generate'],
      dependsOn: ['t1'],
    });

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('{ "tasks": [{ "id": "t1", "objective": "...", "requiredSkills": ["llm-generate"], "dependsOn": [] }] }');
  });

  it('falls back to a single task plan on malformed LLM output', async () => {
    const llmClient = { complete: vi.fn().mockResolvedValue('not-json') };
    const planner = new LlmPlanner(llmClient);

    const plan = await planner.createPlan(intent);

    expect(plan).toEqual({
      tasks: [
        {
          id: 't1',
          objective: 'Ship the release',
          requiredSkills: ['llm-generate'],
          dependsOn: [],
        },
      ],
    });
  });

  it('falls back to a single task plan when tasks contain a cycle', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          tasks: [
            { id: 'a', objective: 'Task A', dependsOn: ['b'] },
            { id: 'b', objective: 'Task B', dependsOn: ['a'] },
          ],
        }),
      ),
    };
    const planner = new LlmPlanner(llmClient);

    const plan = await planner.createPlan(intent);

    expect(plan).toEqual({
      tasks: [
        {
          id: 't1',
          objective: 'Ship the release',
          requiredSkills: ['llm-generate'],
          dependsOn: [],
        },
      ],
    });
  });
});
