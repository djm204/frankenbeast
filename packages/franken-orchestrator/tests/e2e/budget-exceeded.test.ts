import { describe, it, expect } from 'vitest';
import { createTestOrchestrator } from '../helpers/test-orchestrator-factory.js';
import type { BeastInput } from '../../src/types.js';

describe('E2E: Budget exceeded', () => {
  const input: BeastInput = {
    projectId: 'budget-test',
    userInput: 'Process a large dataset',
  };

  it('completes when token spend is within budget', async () => {
    const { loop, ports } = createTestOrchestrator({
      config: { maxTotalTokens: 10_000 },
    });
    // Default observer returns 700 tokens
    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    expect(result.tokenSpend.totalTokens).toBe(700);
  });

  it('reports token spend in result even when within budget', async () => {
    const { loop, ports } = createTestOrchestrator();
    ports.observer.setTokenSpend({
      inputTokens: 5000,
      outputTokens: 3000,
      totalTokens: 8000,
      estimatedCostUsd: 0.12,
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    expect(result.tokenSpend.totalTokens).toBe(8000);
    expect(result.tokenSpend.estimatedCostUsd).toBe(0.12);
  });

  it('heartbeat still runs even with high token spend', async () => {
    const { loop, ports } = createTestOrchestrator();
    ports.observer.setTokenSpend({
      inputTokens: 40000,
      outputTokens: 40000,
      totalTokens: 80000,
      estimatedCostUsd: 1.20,
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    expect(ports.heartbeat.pulseCalled).toBe(true);
  });
});
