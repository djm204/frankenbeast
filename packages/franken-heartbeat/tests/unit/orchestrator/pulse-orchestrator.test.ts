import { describe, it, expect, vi } from 'vitest';
import { PulseOrchestrator } from '../../../src/orchestrator/pulse-orchestrator.js';
import type { IMemoryModule } from '../../../src/modules/memory.js';
import type { IObservabilityModule } from '../../../src/modules/observability.js';
import type { IPlannerModule } from '../../../src/modules/planner.js';
import type { ICritiqueModule } from '../../../src/modules/critique.js';
import type { IHitlGateway } from '../../../src/modules/hitl.js';
import type { ILlmClient } from '../../../src/reflection/types.js';

function makeMemoryStub(): IMemoryModule {
  return {
    getRecentTraces: vi.fn().mockResolvedValue([]),
    getSuccesses: vi.fn().mockResolvedValue([]),
    getFailures: vi.fn().mockResolvedValue([]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function makeObsStub(cost = 0): IObservabilityModule {
  return {
    getTraces: vi.fn().mockResolvedValue([]),
    getTokenSpend: vi.fn().mockResolvedValue({ totalTokens: 0, totalCostUsd: cost, breakdown: [] }),
  };
}

function makePlannerStub(): IPlannerModule {
  return { injectTask: vi.fn().mockResolvedValue(undefined) };
}

function makeCritiqueStub(passed = true): ICritiqueModule {
  return {
    auditConclusions: vi.fn().mockResolvedValue({ passed, reason: passed ? 'ok' : 'hallucination detected', flaggedItems: [] }),
  };
}

function makeHitlStub(): IHitlGateway {
  return {
    sendMorningBrief: vi.fn().mockResolvedValue(undefined),
    notifyAlert: vi.fn().mockResolvedValue(undefined),
  };
}

function makeLlmStub(response: string): ILlmClient {
  return { complete: vi.fn().mockResolvedValue({ ok: true, value: response }) };
}

const VALID_REFLECTION = JSON.stringify({
  patterns: ['test pattern'],
  improvements: [{ target: 'skills', description: 'add handler', priority: 'medium' }],
  techDebt: [],
});

function makeOrchestrator(overrides: {
  obs?: IObservabilityModule;
  critique?: ICritiqueModule;
  llm?: ILlmClient;
  hitl?: IHitlGateway;
  planner?: IPlannerModule;
  checklistContent?: string;
  gitDirty?: boolean;
  clockHour?: number;
} = {}) {
  const hitl = overrides.hitl ?? makeHitlStub();
  const planner = overrides.planner ?? makePlannerStub();

  return {
    orchestrator: new PulseOrchestrator({
      memory: makeMemoryStub(),
      observability: overrides.obs ?? makeObsStub(),
      planner,
      critique: overrides.critique ?? makeCritiqueStub(),
      hitl,
      llm: overrides.llm ?? makeLlmStub(VALID_REFLECTION),
      gitStatusExecutor: vi.fn().mockResolvedValue({ dirty: overrides.gitDirty ?? false, files: [] }),
      clock: () => {
        const d = new Date('2026-02-19T14:00:00Z');
        if (overrides.clockHour !== undefined) d.setUTCHours(overrides.clockHour);
        return d;
      },
      config: {
        deepReviewHour: 2,
        tokenSpendAlertThreshold: 5.0,
        heartbeatFilePath: './HEARTBEAT.md',
        maxReflectionTokens: 4096,
      },
      readFile: vi.fn().mockResolvedValue(overrides.checklistContent ?? ''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      projectId: 'test-project',
    }),
    hitl,
    planner,
  };
}

describe('PulseOrchestrator', () => {
  it('returns HEARTBEAT_OK when checker finds no flags', async () => {
    const { orchestrator } = makeOrchestrator();
    const report = await orchestrator.run();
    expect(report.pulseResult.status).toBe('HEARTBEAT_OK');
  });

  it('does not call LLM when no flags found', async () => {
    const llm = makeLlmStub(VALID_REFLECTION);
    makeOrchestrator({ llm });
    const { orchestrator } = makeOrchestrator({ llm });
    await orchestrator.run();
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('triggers reflection when checker finds flags', async () => {
    const llm = makeLlmStub(VALID_REFLECTION);
    const { orchestrator } = makeOrchestrator({
      checklistContent: '## Active Watchlist\n- [ ] Pending task',
      llm,
    });
    const report = await orchestrator.run();
    expect(report.pulseResult.status).toBe('FLAGS_FOUND');
    expect(llm.complete).toHaveBeenCalled();
    expect(report.reflection).toBeDefined();
  });

  it('sends audit to ICritiqueModule before dispatching actions', async () => {
    const critique = makeCritiqueStub(true);
    const { orchestrator } = makeOrchestrator({
      checklistContent: '## Active Watchlist\n- [ ] Task',
      critique,
    });
    await orchestrator.run();
    expect(critique.auditConclusions).toHaveBeenCalled();
  });

  it('discards reflection when critique fails audit', async () => {
    const critique = makeCritiqueStub(false);
    const hitl = makeHitlStub();
    const { orchestrator } = makeOrchestrator({
      checklistContent: '## Active Watchlist\n- [ ] Task',
      critique,
      hitl,
    });
    const report = await orchestrator.run();
    // Reflection was performed but actions should be empty (audit failed)
    expect(report.actions).toEqual([]);
    expect(hitl.sendMorningBrief).not.toHaveBeenCalled();
  });

  it('dispatches actions via reporter after successful audit', async () => {
    const hitl = makeHitlStub();
    const { orchestrator } = makeOrchestrator({
      checklistContent: '## Active Watchlist\n- [ ] Task',
      hitl,
    });
    const report = await orchestrator.run();
    expect(report.actions.length).toBeGreaterThan(0);
    expect(hitl.sendMorningBrief).toHaveBeenCalled();
  });

  it('produces HeartbeatReport summarizing full run', async () => {
    const { orchestrator } = makeOrchestrator({
      checklistContent: '## Active Watchlist\n- [ ] Task',
    });
    const report = await orchestrator.run();
    expect(report.timestamp).toBeDefined();
    expect(report.pulseResult).toBeDefined();
    expect(report.reflection).toBeDefined();
  });
});
