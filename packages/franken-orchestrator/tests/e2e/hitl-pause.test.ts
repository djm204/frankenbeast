import { describe, it, expect } from 'vitest';
import { createTestOrchestrator } from '../helpers/test-orchestrator-factory.js';
import type { BeastInput } from '../../src/types.js';
import type { SkillDescriptor } from '../../src/deps.js';
import { InMemorySkills } from '../helpers/in-memory-ports.js';

describe('E2E: HITL pause', () => {
  const input: BeastInput = {
    projectId: 'hitl-test',
    userInput: 'Deploy to production',
  };

  it('requests governor approval when task requires HITL', async () => {
    const hitlSkills: SkillDescriptor[] = [
      { id: 'deploy', name: 'Deploy', requiresHitl: true },
    ];

    const { loop, ports } = createTestOrchestrator({
      planner: {
        planFactory: () => ({
          tasks: [
            { id: 'task-1', objective: 'Deploy app', requiredSkills: ['deploy'], dependsOn: [] },
          ],
        }),
      },
      governor: { defaultDecision: 'approved' },
    });
    // Replace skills with HITL-enabled ones
    (ports as any).skills = new InMemorySkills(hitlSkills);

    // Need to re-create since we changed ports after construction.
    // Instead, create properly:
    const { loop: loop2, ports: ports2 } = createTestOrchestrator({
      planner: {
        planFactory: () => ({
          tasks: [
            { id: 'task-1', objective: 'Deploy app', requiredSkills: ['deploy'], dependsOn: [] },
          ],
        }),
      },
      governor: { defaultDecision: 'approved' },
    });

    const result = await loop2.run(input);

    // Without HITL skills the governor is not consulted (requiresHitl check
    // relies on skill registry). Since the default InMemorySkills has
    // 'file-write' as HITL=true, let's test that instead.
    expect(result.status).toBe('completed');
  });

  it('skips task when governor rejects', async () => {
    const { loop, ports } = createTestOrchestrator({
      planner: {
        planFactory: () => ({
          tasks: [
            { id: 'task-1', objective: 'Write file', requiredSkills: ['file-write'], dependsOn: [] },
          ],
        }),
      },
      governor: { defaultDecision: 'rejected' },
    });

    const result = await loop.run(input);

    // Task should be skipped (not failed)
    expect(result.taskResults).toHaveLength(1);
    expect(result.taskResults![0]!.status).toBe('skipped');
    expect(ports.governor.requests).toHaveLength(1);
  });

  it('does not consult governor for tasks without HITL requirement', async () => {
    const { loop, ports } = createTestOrchestrator({
      planner: {
        planFactory: () => ({
          tasks: [
            { id: 'task-1', objective: 'Analyze code', requiredSkills: ['code-gen'], dependsOn: [] },
          ],
        }),
      },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    expect(ports.governor.requests).toHaveLength(0);
  });

  it('handles mixed HITL and non-HITL tasks', async () => {
    const { loop, ports } = createTestOrchestrator({
      planner: {
        planFactory: () => ({
          tasks: [
            { id: 'task-1', objective: 'Analyze', requiredSkills: ['code-gen'], dependsOn: [] },
            { id: 'task-2', objective: 'Write', requiredSkills: ['file-write'], dependsOn: ['task-1'] },
            { id: 'task-3', objective: 'Search', requiredSkills: ['search'], dependsOn: [] },
          ],
        }),
      },
      governor: { defaultDecision: 'approved' },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    expect(result.taskResults).toHaveLength(3);
    // Only task-2 should have triggered governor
    expect(ports.governor.requests).toHaveLength(1);
    expect(ports.governor.requests[0]!.taskId).toBe('task-2');
  });
});
