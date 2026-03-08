import { vi } from 'vitest';
import type {
  IFirewallModule,
  ISkillsModule,
  IMemoryModule,
  IPlannerModule,
  IObserverModule,
  ICritiqueModule,
  IGovernorModule,
  IHeartbeatModule,
  ILogger,
  BeastLoopDeps,
  SkillInput,
  SkillResult,
} from '../../src/deps.js';

export function makeFirewall(overrides: Partial<IFirewallModule> = {}): IFirewallModule {
  return {
    runPipeline: vi.fn(async (input: string) => ({
      sanitizedText: input,
      violations: [],
      blocked: false,
    })),
    ...overrides,
  };
}

export function makeSkills(overrides: Partial<ISkillsModule> = {}): ISkillsModule {
  return {
    hasSkill: vi.fn(() => true),
    getAvailableSkills: vi.fn(() => []),
    execute: vi.fn(async (_skillId: string, _input: SkillInput): Promise<SkillResult> => ({
      output: 'mock-output',
      tokensUsed: 0,
    })),
    ...overrides,
  };
}

export function makeMemory(overrides: Partial<IMemoryModule> = {}): IMemoryModule {
  return {
    frontload: vi.fn(async () => {}),
    getContext: vi.fn(async () => ({ adrs: [], knownErrors: [], rules: [] })),
    recordTrace: vi.fn(async () => {}),
    ...overrides,
  };
}

export function makePlanner(overrides: Partial<IPlannerModule> = {}): IPlannerModule {
  return {
    createPlan: vi.fn(async () => ({
      tasks: [
        { id: 'task-1', objective: 'do it', requiredSkills: [], dependsOn: [] },
      ],
    })),
    ...overrides,
  };
}

export function makeObserver(overrides: Partial<IObserverModule> = {}): IObserverModule {
  return {
    startTrace: vi.fn(),
    startSpan: vi.fn(() => ({ end: vi.fn() })),
    getTokenSpend: vi.fn(async () => ({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    })),
    ...overrides,
  };
}

export function makeCritique(overrides: Partial<ICritiqueModule> = {}): ICritiqueModule {
  return {
    reviewPlan: vi.fn(async () => ({
      verdict: 'pass' as const,
      findings: [],
      score: 1.0,
    })),
    ...overrides,
  };
}

export function makeGovernor(overrides: Partial<IGovernorModule> = {}): IGovernorModule {
  return {
    requestApproval: vi.fn(async () => ({
      decision: 'approved' as const,
    })),
    ...overrides,
  };
}

export function makeHeartbeat(overrides: Partial<IHeartbeatModule> = {}): IHeartbeatModule {
  return {
    pulse: vi.fn(async () => ({
      improvements: [],
      techDebt: [],
      summary: 'All clear',
    })),
    ...overrides,
  };
}

export function makeLogger(): ILogger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

export function makeDeps(overrides: Partial<BeastLoopDeps> = {}): BeastLoopDeps {
  return {
    firewall: makeFirewall(),
    skills: makeSkills(),
    memory: makeMemory(),
    planner: makePlanner(),
    observer: makeObserver(),
    critique: makeCritique(),
    governor: makeGovernor(),
    heartbeat: makeHeartbeat(),
    logger: makeLogger(),
    clock: () => new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  };
}
