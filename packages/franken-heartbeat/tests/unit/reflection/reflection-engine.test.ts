import { describe, it, expect, vi } from 'vitest';
import { ReflectionEngine } from '../../../src/reflection/reflection-engine.js';
import type { ILlmClient, Result } from '../../../src/reflection/types.js';
import type { IMemoryModule } from '../../../src/modules/memory.js';
import type { IObservabilityModule } from '../../../src/modules/observability.js';

function makeLlmClient(response: string): ILlmClient {
  return {
    complete: vi.fn().mockResolvedValue({ ok: true, value: response }),
  };
}

function makeFailingLlmClient(): ILlmClient {
  return {
    complete: vi.fn().mockResolvedValue({ ok: false, error: new Error('LLM timeout') }),
  };
}

const VALID_RESPONSE = JSON.stringify({
  patterns: ['repeated failures in API module'],
  improvements: [{ target: 'skills', description: 'add retry logic', priority: 'medium' }],
  techDebt: [{ location: '/src/api', description: 'inline SQL', effort: 'medium' }],
});

function makeMemoryStub(): IMemoryModule {
  return {
    getRecentTraces: vi.fn().mockResolvedValue([
      { id: 'e1', taskId: 't1', status: 'failure', summary: 'API call failed', timestamp: '2026-02-19T01:00:00Z' },
    ]),
    getSuccesses: vi.fn().mockResolvedValue([]),
    getFailures: vi.fn().mockResolvedValue([
      { id: 'f1', content: 'Failed API call', source: 'episodic', timestamp: '2026-02-19T00:00:00Z' },
    ]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function makeObsStub(): IObservabilityModule {
  return {
    getTraces: vi.fn().mockResolvedValue([
      { id: 't1', spanCount: 3, status: 'error', durationMs: 500, timestamp: '2026-02-19T01:00:00Z' },
    ]),
    getTokenSpend: vi.fn().mockResolvedValue({ totalTokens: 1000, totalCostUsd: 1.0, breakdown: [] }),
  };
}

describe('ReflectionEngine', () => {
  it('queries IMemoryModule for recent failures', async () => {
    const memory = makeMemoryStub();
    const engine = new ReflectionEngine({
      llm: makeLlmClient(VALID_RESPONSE),
      memory,
      observability: makeObsStub(),
      maxReflectionTokens: 4096,
    });

    await engine.reflect('test-project');
    expect(memory.getFailures).toHaveBeenCalledWith('test-project');
  });

  it('queries IObservabilityModule for recent traces', async () => {
    const obs = makeObsStub();
    const engine = new ReflectionEngine({
      llm: makeLlmClient(VALID_RESPONSE),
      memory: makeMemoryStub(),
      observability: obs,
      maxReflectionTokens: 4096,
    });

    await engine.reflect('test-project');
    expect(obs.getTraces).toHaveBeenCalled();
  });

  it('calls ILlmClient with constructed prompt', async () => {
    const llm = makeLlmClient(VALID_RESPONSE);
    const engine = new ReflectionEngine({
      llm,
      memory: makeMemoryStub(),
      observability: makeObsStub(),
      maxReflectionTokens: 4096,
    });

    await engine.reflect('test-project');
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(llm.complete).toHaveBeenCalledWith(
      expect.stringContaining('patterns'),
      expect.objectContaining({ maxTokens: 4096 }),
    );
  });

  it('parses LLM response into ReflectionResult', async () => {
    const engine = new ReflectionEngine({
      llm: makeLlmClient(VALID_RESPONSE),
      memory: makeMemoryStub(),
      observability: makeObsStub(),
      maxReflectionTokens: 4096,
    });

    const result = await engine.reflect('test-project');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.patterns).toContain('repeated failures in API module');
      expect(result.value.improvements).toHaveLength(1);
    }
  });

  it('handles LLM failure gracefully', async () => {
    const engine = new ReflectionEngine({
      llm: makeFailingLlmClient(),
      memory: makeMemoryStub(),
      observability: makeObsStub(),
      maxReflectionTokens: 4096,
    });

    const result = await engine.reflect('test-project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('LLM');
    }
  });

  it('respects maxReflectionTokens config', async () => {
    const llm = makeLlmClient(VALID_RESPONSE);
    const engine = new ReflectionEngine({
      llm,
      memory: makeMemoryStub(),
      observability: makeObsStub(),
      maxReflectionTokens: 2048,
    });

    await engine.reflect('test-project');
    expect(llm.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTokens: 2048 }),
    );
  });
});
