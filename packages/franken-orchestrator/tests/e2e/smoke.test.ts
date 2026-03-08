import { describe, it, expect } from 'vitest';
import { createTestOrchestrator } from '../helpers/test-orchestrator-factory.js';
import type { BeastInput } from '../../src/types.js';

describe('E2E smoke test', () => {
  const input: BeastInput = {
    projectId: 'smoke-test',
    userInput: 'Build a hello world app',
  };

  it('creates a test orchestrator with all in-memory ports', () => {
    const { loop, ports } = createTestOrchestrator();
    expect(loop).toBeDefined();
    expect(ports.firewall).toBeDefined();
    expect(ports.skills).toBeDefined();
    expect(ports.memory).toBeDefined();
    expect(ports.planner).toBeDefined();
    expect(ports.observer).toBeDefined();
    expect(ports.critique).toBeDefined();
    expect(ports.governor).toBeDefined();
    expect(ports.heartbeat).toBeDefined();
  });

  it('runs a complete Beast Loop with defaults', async () => {
    const { loop, ports } = createTestOrchestrator();
    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    expect(result.projectId).toBe('smoke-test');
    expect(result.phase).toBe('closure');
    expect(result.taskResults).toBeDefined();
    expect(result.taskResults!.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify ports were exercised
    expect(ports.firewall.processedInputs).toHaveLength(1);
    expect(ports.planner.intents).toHaveLength(1);
    expect(ports.critique.reviewedPlans).toHaveLength(1);
    expect(ports.memory.traces.length).toBeGreaterThan(0);
    expect(ports.observer.traceIds).toHaveLength(1);
    expect(ports.heartbeat.pulseCalled).toBe(true);
  });

  it('accepts config overrides', async () => {
    const { loop } = createTestOrchestrator({
      config: { enableHeartbeat: false },
    });
    const result = await loop.run(input);
    expect(result.status).toBe('completed');
  });
});
