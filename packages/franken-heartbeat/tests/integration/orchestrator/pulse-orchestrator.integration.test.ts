import { describe, it, expect, vi } from 'vitest';
import { PulseOrchestrator } from '../../../src/orchestrator/pulse-orchestrator.js';

const VALID_REFLECTION = JSON.stringify({
  patterns: ['test pattern'],
  improvements: [{ target: 'skills', description: 'add handler', priority: 'medium' }],
  techDebt: [],
});

function buildOrchestrator(opts: {
  checklistContent: string;
  llmResponse?: string;
  auditPassed?: boolean;
  clockHour?: number;
}) {
  const hitl = {
    sendMorningBrief: vi.fn().mockResolvedValue(undefined),
    notifyAlert: vi.fn().mockResolvedValue(undefined),
  };
  const planner = { injectTask: vi.fn().mockResolvedValue(undefined) };
  const llm = {
    complete: vi.fn().mockResolvedValue({ ok: true, value: opts.llmResponse ?? VALID_REFLECTION }),
  };
  const critique = {
    auditConclusions: vi.fn().mockResolvedValue({
      passed: opts.auditPassed ?? true,
      reason: 'ok',
      flaggedItems: [],
    }),
  };
  const writeFile = vi.fn().mockResolvedValue(undefined);

  const orchestrator = new PulseOrchestrator({
    memory: {
      getRecentTraces: vi.fn().mockResolvedValue([]),
      getSuccesses: vi.fn().mockResolvedValue([]),
      getFailures: vi.fn().mockResolvedValue([{ id: 'f1', content: 'error', source: 'ep', timestamp: '2026-02-19T00:00:00Z' }]),
      recordLesson: vi.fn().mockResolvedValue(undefined),
    },
    observability: {
      getTraces: vi.fn().mockResolvedValue([]),
      getTokenSpend: vi.fn().mockResolvedValue({ totalTokens: 0, totalCostUsd: 0, breakdown: [] }),
    },
    planner,
    critique,
    hitl,
    llm,
    gitStatusExecutor: vi.fn().mockResolvedValue({ dirty: false, files: [] }),
    clock: () => {
      const d = new Date('2026-02-19T14:00:00Z');
      if (opts.clockHour !== undefined) d.setUTCHours(opts.clockHour);
      return d;
    },
    config: {
      deepReviewHour: 2,
      tokenSpendAlertThreshold: 5.0,
      heartbeatFilePath: './HEARTBEAT.md',
      maxReflectionTokens: 4096,
    },
    readFile: vi.fn().mockResolvedValue(opts.checklistContent),
    writeFile,
    projectId: 'test-project',
  });

  return { orchestrator, hitl, planner, llm, critique, writeFile };
}

describe('PulseOrchestrator integration', () => {
  it('full happy path: flags → reflect → audit passes → morning brief sent', async () => {
    const { orchestrator, hitl, llm, critique } = buildOrchestrator({
      checklistContent: '## Active Watchlist\n- [ ] Pending task',
    });

    const report = await orchestrator.run();

    expect(report.pulseResult.status).toBe('FLAGS_FOUND');
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(critique.auditConclusions).toHaveBeenCalledTimes(1);
    expect(hitl.sendMorningBrief).toHaveBeenCalledTimes(1);
    expect(report.reflection).toBeDefined();
    expect(report.actions.length).toBeGreaterThan(0);
  });

  it('cheap path: no flags → HEARTBEAT_OK → no LLM calls', async () => {
    const { orchestrator, llm, critique, hitl } = buildOrchestrator({
      checklistContent: '',
    });

    const report = await orchestrator.run();

    expect(report.pulseResult.status).toBe('HEARTBEAT_OK');
    expect(llm.complete).not.toHaveBeenCalled();
    expect(critique.auditConclusions).not.toHaveBeenCalled();
    expect(hitl.sendMorningBrief).not.toHaveBeenCalled();
    expect(report.actions).toEqual([]);
  });

  it('audit rejection: flags → reflect → audit fails → no actions dispatched', async () => {
    const { orchestrator, hitl, planner } = buildOrchestrator({
      checklistContent: '## Active Watchlist\n- [ ] Pending task',
      auditPassed: false,
    });

    const report = await orchestrator.run();

    expect(report.pulseResult.status).toBe('FLAGS_FOUND');
    expect(report.reflection).toBeDefined();
    expect(report.actions).toEqual([]);
    expect(hitl.sendMorningBrief).not.toHaveBeenCalled();
    expect(planner.injectTask).not.toHaveBeenCalled();
  });
});
