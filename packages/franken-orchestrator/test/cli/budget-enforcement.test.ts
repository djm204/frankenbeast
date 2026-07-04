import { describe, it, expect } from 'vitest';
import { CliObserverBridge } from '../../src/adapters/cli-observer-bridge.js';
import { CliSkillExecutor } from '../../src/skills/cli-skill-executor.js';
import { GitBranchIsolator } from '../../src/skills/git-branch-isolator.js';
import { MartinLoop } from '../../src/skills/martin-loop.js';
import { ProviderRegistry, type ICliProvider } from '../../src/skills/providers/cli-provider.js';

function fakeGit(): GitBranchIsolator {
  return {
    isolate: () => undefined,
    getWorkingDir: () => process.cwd(),
    getStatus: () => '',
    resetHard: () => undefined,
    cleanUntracked: () => undefined,
    autoCommit: () => false,
    getCurrentHead: () => 'HEAD',
    getDiffStat: () => '',
    merge: () => ({ merged: true, commits: 0 }),
    abortMerge: () => undefined,
    getConflictDiff: () => '',
    getConflictedFiles: () => [],
  } as unknown as GitBranchIsolator;
}

function provider(name: string, script: string): ICliProvider {
  return {
    name,
    command: 'node',
    chatModel: name,
    buildArgs: () => ['-e', script],
    normalizeOutput: (raw) => raw,
    estimateTokens: (text) => Math.ceil(text.length / 4),
    isRateLimited: () => false,
    parseRetryAfter: () => undefined,
    filterEnv: (env) => env,
    supportsStreamJson: () => false,
    supportsNativeSessionResume: () => false,
    defaultContextWindowTokens: () => 200_000,
  };
}

describe('Budget enforcement integration', () => {
  it('trips the circuit breaker when recorded cost exceeds budget', async () => {
    // Budget: $0.01, record tokens costing $0.02
    const bridge = new CliObserverBridge({ budgetLimitUsd: 0.01 });
    bridge.startTrace('budget-trip-test');
    const deps = bridge.observerDeps;

    // Record 1000 prompt + 1000 completion tokens as gpt-4o
    // gpt-4o: (1000/1M)*5 + (1000/1M)*15 = $0.005 + $0.015 = $0.02
    const span = deps.startSpan(deps.trace, { name: 'expensive-call' });
    deps.recordTokenUsage(
      span,
      { promptTokens: 1000, completionTokens: 1000, model: 'gpt-4o' },
      deps.counter,
    );
    deps.endSpan(span);

    // Compute actual cost from the counter
    const entries = deps.counter.allModels().map((m) => {
      const t = deps.counter.totalsFor(m);
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    const spendUsd = deps.costCalc.totalCost(entries);

    expect(spendUsd).toBeCloseTo(0.02, 4);

    const result = deps.breaker.check(spendUsd);
    expect(result.tripped).toBe(true);
    expect(result.spendUsd).toBeCloseTo(0.02, 4);
    expect(result.limitUsd).toBe(0.01);
  });

  it('does not trip the circuit breaker when usage is within budget', async () => {
    // Budget: $100, record tokens costing $0.02
    const bridge = new CliObserverBridge({ budgetLimitUsd: 100 });
    bridge.startTrace('budget-safe-test');
    const deps = bridge.observerDeps;

    // Record 1000 prompt + 1000 completion tokens as gpt-4o = $0.02
    const span = deps.startSpan(deps.trace, { name: 'cheap-call' });
    deps.recordTokenUsage(
      span,
      { promptTokens: 1000, completionTokens: 1000, model: 'gpt-4o' },
      deps.counter,
    );
    deps.endSpan(span);

    // Compute actual cost
    const entries = deps.counter.allModels().map((m) => {
      const t = deps.counter.totalsFor(m);
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    const spendUsd = deps.costCalc.totalCost(entries);

    expect(spendUsd).toBeCloseTo(0.02, 4);

    const result = deps.breaker.check(spendUsd);
    expect(result.tripped).toBe(false);
    expect(result.limitUsd).toBe(100);
  });

  it('observerDeps type satisfies CliSkillExecutor ObserverDeps interface', () => {
    const bridge = new CliObserverBridge({ budgetLimitUsd: 1.0 });
    bridge.startTrace('type-compat-test');
    const deps = bridge.observerDeps;

    // Verify all required properties/methods exist with correct shapes
    expect(deps.trace).toBeDefined();
    expect(deps.trace.id).toEqual(expect.any(String));
    expect(typeof deps.counter.grandTotal).toBe('function');
    expect(typeof deps.counter.allModels).toBe('function');
    expect(typeof deps.counter.totalsFor).toBe('function');
    expect(typeof deps.costCalc.totalCost).toBe('function');
    expect(typeof deps.breaker.check).toBe('function');
    expect(typeof deps.loopDetector.check).toBe('function');
    expect(typeof deps.startSpan).toBe('function');
    expect(typeof deps.endSpan).toBe('function');
    expect(typeof deps.recordTokenUsage).toBe('function');
    expect(typeof deps.setMetadata).toBe('function');
  });

  it('checks estimated iteration cost before spawning a provider process', async () => {
    const bridge = new CliObserverBridge({ budgetLimitUsd: 0.000001 });
    bridge.startTrace('budget-preflight-abort');

    const registry = new ProviderRegistry();
    registry.register(provider('gpt-4o', 'process.stdout.write("should not spawn")'));
    const executor = new CliSkillExecutor(
      new MartinLoop(registry),
      fakeGit(),
      bridge.observerDeps,
    );

    const result = await executor.execute(
      'cli:budget-preflight',
      { objective: 'expensive task', context: '', sessionId: 'budget-preflight', dependencyOutputs: new Map() },
      {
        martin: {
          prompt: 'expensive task',
          promiseTag: 'DONE',
          maxIterations: 1,
          maxTurns: 25,
          provider: 'gpt-4o',
          timeoutMs: 5_000,
        },
      },
    );

    expect(result.output).toContain('Budget exceeded:');
  });

  it('aborts an in-flight MartinLoop iteration when budget is exceeded mid-execution', async () => {
    const bridge = new CliObserverBridge({ budgetLimitUsd: 0.02 });
    bridge.startTrace('budget-mid-execution-abort');

    const registry = new ProviderRegistry();
    registry.register(provider('gpt-4o', 'setInterval(() => process.stdout.write("working\\n"), 50)'));
    const executor = new CliSkillExecutor(
      new MartinLoop(registry),
      fakeGit(),
      bridge.observerDeps,
    );

    const startedAt = Date.now();
    const resultPromise = executor.execute(
      'cli:budget-mid-execution',
      { objective: 'long running task', context: '', sessionId: 'budget-mid-execution', dependencyOutputs: new Map() },
      {
        martin: {
          prompt: 'long running task',
          promiseTag: 'DONE',
          maxIterations: 1,
          maxTurns: 1,
          provider: 'gpt-4o',
          timeoutMs: 5_000,
        },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    const span = bridge.observerDeps.startSpan(bridge.observerDeps.trace, { name: 'mid-run-spend' });
    bridge.observerDeps.recordTokenUsage(
      span,
      { promptTokens: 2_000, completionTokens: 2_000, model: 'gpt-4o' },
      bridge.observerDeps.counter,
    );
    bridge.observerDeps.endSpan(span);

    const result = await resultPromise;

    expect(result.output).toContain('Budget exceeded:');
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
