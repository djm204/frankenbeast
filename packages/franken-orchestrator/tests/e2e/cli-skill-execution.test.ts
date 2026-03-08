import { describe, it, expect, vi } from 'vitest';
import { BeastLoop } from '../../src/beast-loop.js';
import type { BeastLoopDeps } from '../../src/deps.js';
import type { BeastInput } from '../../src/types.js';
import { NullLogger } from '../../src/logger.js';
import { CliSkillExecutor } from '../../src/skills/cli-skill-executor.js';
import type { ObserverDeps } from '../../src/skills/cli-skill-executor.js';
import type { MartinLoop } from '../../src/skills/martin-loop.js';
import type { GitBranchIsolator } from '../../src/skills/git-branch-isolator.js';
import {
  InMemoryFirewall,
  InMemorySkills,
  InMemoryMemory,
  InMemoryPlanner,
  InMemoryObserver,
  InMemoryCritique,
  InMemoryGovernor,
  InMemoryHeartbeat,
} from '../helpers/in-memory-ports.js';

describe.skipIf(!process.env['E2E'])('E2E: CLI Skill Execution', () => {
  const PROMISE_TAG = 'IMPL_test-chunk_DONE';
  const PROMISE_OUTPUT = `Implementation complete\n<promise>${PROMISE_TAG}</promise>`;

  function createMockObserverDeps(): ObserverDeps {
    let totalTokens = 0;

    const counter = {
      grandTotal: () => ({ promptTokens: 0, completionTokens: 0, totalTokens }),
      allModels: () => ['mock-model'],
      totalsFor: () => ({ promptTokens: 0, completionTokens: 0, totalTokens }),
    };

    return {
      trace: { id: 'test-trace' },
      counter,
      costCalc: { totalCost: () => 0 },
      breaker: { check: () => ({ tripped: false, limitUsd: 100, spendUsd: 0 }) },
      loopDetector: { check: () => ({ detected: false }) },
      startSpan: vi.fn().mockReturnValue({ id: 'mock-span' }),
      endSpan: vi.fn(),
      recordTokenUsage: vi.fn().mockImplementation(() => {
        totalTokens += 100;
      }),
      setMetadata: vi.fn(),
    };
  }

  it('single chunk flows through BeastLoop via CliSkillExecutor', async () => {
    // Mock MartinLoop — returns success with promise tag on first iteration
    const mockMartin = {
      run: vi.fn().mockResolvedValue({
        completed: true,
        iterations: 1,
        output: PROMISE_OUTPUT,
        tokensUsed: 100,
      }),
    } as unknown as MartinLoop;

    // Mock GitBranchIsolator — simulates branch creation and merge
    const mockGit = {
      isolate: vi.fn(),
      merge: vi.fn().mockReturnValue({ merged: true, commits: 1 }),
    } as unknown as GitBranchIsolator;

    const observerDeps = createMockObserverDeps();
    const cliExecutor = new CliSkillExecutor(mockMartin, mockGit, observerDeps);

    // Skills registry includes the CLI skill
    const skills = new InMemorySkills([
      { id: 'cli:test-chunk', name: 'Test Chunk', requiresHitl: false, executionType: 'cli' },
    ]);

    const observer = new InMemoryObserver();

    const input: BeastInput = {
      projectId: 'test',
      userInput: 'test chunk',
    };

    const deps: BeastLoopDeps = {
      firewall: new InMemoryFirewall(),
      skills,
      memory: new InMemoryMemory(),
      planner: new InMemoryPlanner({
        planFactory: () => ({
          tasks: [{
            id: 'cli-task-1',
            objective: 'Execute test chunk',
            requiredSkills: ['cli:test-chunk'],
            dependsOn: [],
          }],
        }),
      }),
      observer,
      critique: new InMemoryCritique(),
      governor: new InMemoryGovernor(),
      heartbeat: new InMemoryHeartbeat(),
      logger: new NullLogger(),
      cliExecutor,
      clock: () => new Date('2025-01-15T10:00:00Z'),
    };

    const loop = new BeastLoop(deps);
    const result = await loop.run(input);

    // Pipeline completed successfully
    expect(result.status).toBe('completed');

    // 1 task with status success
    expect(result.taskResults).toBeDefined();
    expect(result.taskResults).toHaveLength(1);
    expect(result.taskResults![0]!.status).toBe('success');

    // Token spend is recorded (non-zero)
    expect(result.tokenSpend.totalTokens).toBeGreaterThan(0);

    // MartinLoop was invoked
    expect(mockMartin.run).toHaveBeenCalledOnce();

    // Git isolation: branch created and merged
    expect(mockGit.isolate).toHaveBeenCalledWith('test-chunk');
    expect(mockGit.merge).toHaveBeenCalledWith('test-chunk');

    // Observer tracing: task span was created
    const taskSpans = observer.spans.filter(s => s.name.startsWith('task:'));
    expect(taskSpans.length).toBeGreaterThan(0);
    expect(taskSpans.every(s => s.endedAt !== undefined)).toBe(true);
  });
});
