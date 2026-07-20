import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createTestOrchestrator } from '../helpers/test-orchestrator-factory.js';
import { InMemoryLogger } from '../helpers/in-memory-ports.js';
import type { BeastInput } from '../../src/types.js';

describe('E2E: Budget exceeded', () => {
  const input: BeastInput = {
    projectId: 'budget-test',
    userInput: 'Process a large dataset',
  };

  it('completes when token spend is within budget', async () => {
    const { loop } = createTestOrchestrator({
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

  it('heartbeat still runs with high token spend when enabled', async () => {
    const { loop, ports } = createTestOrchestrator({ config: { enableHeartbeat: true } });
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

  it('aborts the full flow when budget is exceeded and preserves phase audit evidence', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'franken-budget-abort-'));
    const logger = new InMemoryLogger();

    try {
      const { loop, ports } = createTestOrchestrator({
        config: {
          enableHeartbeat: true,
          enableTracing: true,
          maxTotalTokens: 1_000,
          stateDir,
        },
        logger,
      });
      ports.observer.setTokenSpend({
        inputTokens: 800,
        outputTokens: 400,
        totalTokens: 1_200,
        estimatedCostUsd: 0.02,
      });

      const result = await loop.run(input);

      expect(result).toMatchObject({
        status: 'aborted',
        abortReason: 'Token budget exceeded: 1200/1000',
        tokenSpend: {
          inputTokens: 800,
          outputTokens: 400,
          totalTokens: 1_200,
          estimatedCostUsd: 0.02,
        },
      });
      expect(ports.observer.traceIds).toEqual([result.sessionId]);

      // The abort happens after hydration, before planning/execution/closure can
      // create additional state or side effects.
      expect(ports.planner.intents).toEqual([]);
      expect(ports.skills.executions).toEqual([]);
      expect(ports.governor.requests).toEqual([]);
      expect(ports.memory.traces).toEqual([]);
      expect(ports.heartbeat.pulseCalled).toBe(false);

      const snapshots = (await readFile(join(stateDir, `${result.sessionId}.jsonl`), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { phase: string });
      expect(snapshots.map(({ phase }) => phase)).toEqual(['ingestion', 'hydration']);
      expect(logger.entries).toContainEqual({
        level: 'error',
        msg: 'BeastLoop: error',
        data: { error: 'Token budget exceeded: 1200/1000' },
      });
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});
