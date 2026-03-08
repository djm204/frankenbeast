import { describe, it, expect } from 'vitest';
import { createTestOrchestrator } from '../helpers/test-orchestrator-factory.js';
import type { BeastInput } from '../../src/types.js';

describe('E2E: Happy path', () => {
  const input: BeastInput = {
    projectId: 'happy-project',
    userInput: 'Refactor the authentication module',
  };

  it('completes full pipeline: input → plan → critique → tasks → heartbeat → result', async () => {
    const { loop, ports } = createTestOrchestrator();
    const result = await loop.run(input);

    // Final result
    expect(result.status).toBe('completed');
    expect(result.phase).toBe('closure');
    expect(result.projectId).toBe('happy-project');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.planSummary).toContain('task(s) planned');

    // Tasks all succeeded
    expect(result.taskResults).toBeDefined();
    expect(result.taskResults!.every(t => t.status === 'success')).toBe(true);

    // Token spend collected
    expect(result.tokenSpend.totalTokens).toBeGreaterThan(0);
  });

  it('firewall processes input first', async () => {
    const { loop, ports } = createTestOrchestrator();
    await loop.run(input);

    expect(ports.firewall.processedInputs).toEqual([input.userInput]);
  });

  it('memory is hydrated with project context', async () => {
    const { loop, ports } = createTestOrchestrator();
    await loop.run(input);

    // Planner receives enriched intent with context from memory
    const intent = ports.planner.intents[0]!;
    expect(intent.goal).toBe(input.userInput);
    expect(intent.context).toBeDefined();
    expect((intent.context as Record<string, unknown>).adrs).toBeDefined();
  });

  it('plan is created then critiqued', async () => {
    const { loop, ports } = createTestOrchestrator();
    await loop.run(input);

    expect(ports.planner.intents).toHaveLength(1);
    expect(ports.critique.reviewedPlans).toHaveLength(1);
  });

  it('tasks execute in dependency order', async () => {
    const { loop, ports } = createTestOrchestrator({
      planner: {
        planFactory: () => ({
          tasks: [
            { id: 'a', objective: 'First', requiredSkills: [], dependsOn: [] },
            { id: 'b', objective: 'Second', requiredSkills: [], dependsOn: ['a'] },
            { id: 'c', objective: 'Third', requiredSkills: [], dependsOn: ['b'] },
          ],
        }),
      },
    });

    const result = await loop.run(input);
    expect(result.taskResults).toHaveLength(3);
    expect(result.taskResults!.map(t => t.taskId)).toEqual(['a', 'b', 'c']);
  });

  it('episodic traces are recorded for each task', async () => {
    const { loop, ports } = createTestOrchestrator();
    const result = await loop.run(input);

    expect(ports.memory.traces.length).toBe(result.taskResults!.length);
    for (const trace of ports.memory.traces) {
      expect(trace.outcome).toBe('success');
      expect(trace.timestamp).toBeTruthy();
    }
  });

  it('observer spans are created for each task', async () => {
    const { loop, ports } = createTestOrchestrator();
    await loop.run(input);

    const taskSpans = ports.observer.spans.filter(s => s.name.startsWith('task:'));
    expect(taskSpans.length).toBeGreaterThan(0);
    expect(taskSpans.every(s => s.endedAt !== undefined)).toBe(true);
  });

  it('heartbeat pulse runs during closure', async () => {
    const { loop, ports } = createTestOrchestrator();
    await loop.run(input);

    expect(ports.heartbeat.pulseCalled).toBe(true);
  });
});
