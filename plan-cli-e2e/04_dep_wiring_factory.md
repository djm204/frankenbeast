# Chunk 04: Dependency Wiring Factory

## Objective

Create `dep-factory.ts` — extracts the build-runner's manual dep construction into a reusable factory that produces `BeastLoopDeps` from CLI args and project paths. This is the heaviest chunk — it wires observer, CLI executor, checkpoint, stubs, and logger.

## Files

- **Create**: `franken-orchestrator/src/cli/dep-factory.ts`
- **Create**: `franken-orchestrator/tests/unit/cli/dep-factory.test.ts`
- **Modify**: `franken-orchestrator/src/index.ts` — export `createCliDeps`, `CliDepOptions`

## Key Reference Files

- `plan-approach-c/build-runner.ts` lines 69-208 — existing dep wiring to extract from
- `franken-orchestrator/src/deps.ts` — `BeastLoopDeps` interface
- `franken-orchestrator/src/cli/project-root.ts` — `ProjectPaths` (from chunk 02)
- `franken-observer/src/index.ts` — observer exports

## Interface

```typescript
import type { BeastLoopDeps, ILogger } from '../deps.js';
import type { ProjectPaths } from './project-root.js';
import type { GraphBuilder } from '../planning/chunk-file-graph-builder.js';
import type { PlanTask } from '../deps.js';

export interface CliDepOptions {
  paths: ProjectPaths;
  baseBranch: string;
  budget: number;
  provider: 'claude' | 'codex';
  noPr: boolean;
  verbose: boolean;
  reset: boolean;
}

export interface CliDeps {
  deps: BeastLoopDeps;
  logger: ILogger & { getLogEntries(): string[] };
  finalize: () => Promise<void>;
}

export function createCliDeps(options: CliDepOptions): CliDeps;
```

## Implementation

```typescript
import { existsSync, unlinkSync, readdirSync, appendFileSync } from 'node:fs';
import {
  BeastLogger, ANSI,
  RalphLoop, GitBranchIsolator, CliSkillExecutor,
  FileCheckpointStore, PrCreator,
} from '../index.js';
import type {
  BeastLoopDeps, IFirewallModule, ISkillsModule, IMemoryModule,
  IPlannerModule, IObserverModule, ICritiqueModule, IGovernorModule,
  IHeartbeatModule, ILogger,
} from '../deps.js';
import type { ProjectPaths } from './project-root.js';
import {
  TraceContext, SpanLifecycle, TokenCounter, CostCalculator, CircuitBreaker,
  LoopDetector, SQLiteAdapter, TraceServer, DEFAULT_PRICING,
} from 'franken-observer';
// NOTE: The actual import path depends on whether franken-observer is
// a workspace dep or file: dep. Use the same pattern as build-runner.ts:
// import { ... } from '../../franken-observer/src/index.js';

export interface CliDepOptions {
  paths: ProjectPaths;
  baseBranch: string;
  budget: number;
  provider: 'claude' | 'codex';
  noPr: boolean;
  verbose: boolean;
  reset: boolean;
}

export interface CliDeps {
  deps: BeastLoopDeps;
  logger: BeastLogger;
  finalize: () => Promise<void>;
}

// ── Passthrough Stubs ──
const stubFirewall: IFirewallModule = {
  runPipeline: async (input) => ({ sanitizedText: input, violations: [], blocked: false }),
};
const stubMemory: IMemoryModule = {
  frontload: async () => {},
  getContext: async () => ({ adrs: [], knownErrors: [], rules: [] }),
  recordTrace: async () => {},
};
const stubPlanner: IPlannerModule = {
  createPlan: async () => { throw new Error('Planner not available in CLI mode; use graphBuilder'); },
};
const stubCritique: ICritiqueModule = {
  reviewPlan: async () => ({ verdict: 'pass', findings: [], score: 1.0 }),
};
const stubGovernor: IGovernorModule = {
  requestApproval: async () => ({ decision: 'approved' }),
};
const stubHeartbeat: IHeartbeatModule = {
  pulse: async () => ({ improvements: [], techDebt: [], summary: '' }),
};

function createStubSkills(planDir: string): ISkillsModule {
  return {
    hasSkill: (id: string) => id.startsWith('cli:'),
    getAvailableSkills: () => {
      try {
        return readdirSync(planDir)
          .filter((f) => f.endsWith('.md') && !f.startsWith('00_') && /^\d{2}/.test(f))
          .map((f) => ({
            id: `cli:${f.replace('.md', '')}`,
            name: f.replace('.md', ''),
            executionType: 'cli' as const,
            requiresHitl: false,
          }));
      } catch { return []; }
    },
    execute: async () => { throw new Error('No skills in CLI mode'); },
  };
}

export function createCliDeps(options: CliDepOptions): CliDeps {
  const { paths, baseBranch, budget, verbose, noPr, reset } = options;

  // Reset if requested
  if (reset) {
    for (const f of [paths.checkpointFile, paths.tracesDb]) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
  }

  const logger = new BeastLogger({ verbose, captureForFile: true });

  // Observer stack
  const counter = new TokenCounter();
  const costCalc = new CostCalculator(DEFAULT_PRICING);
  const breaker = new CircuitBreaker({ limitUsd: budget });
  const loopDet = new LoopDetector({ windowSize: 3, repeatThreshold: 3 });
  const sqlite = new SQLiteAdapter(paths.tracesDb);
  const trace = TraceContext.createTrace('FRANKENBEAST Build');

  const observer: IObserverModule = {
    startTrace: () => {},
    startSpan: (name) => {
      const s = TraceContext.startSpan(trace, { name });
      return { end: () => TraceContext.endSpan(s, { status: 'completed' }, loopDet) };
    },
    getTokenSpend: async () => {
      const entries = counter.allModels().map((m) => {
        const t = counter.totalsFor(m);
        return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
      });
      const g = counter.grandTotal();
      return {
        inputTokens: g.promptTokens,
        outputTokens: g.completionTokens,
        totalTokens: g.totalTokens,
        estimatedCostUsd: costCalc.totalCost(entries),
      };
    },
  };

  // Trace server (verbose only)
  let server: TraceServer | null = null;
  if (verbose) {
    server = new TraceServer({ adapter: sqlite, port: 4040 });
    // Server started asynchronously by caller if needed
  }

  // CLI execution stack
  const checkpoint = new FileCheckpointStore(paths.checkpointFile);
  const ralph = new RalphLoop();
  const gitIso = new GitBranchIsolator({
    baseBranch,
    branchPrefix: 'feat/',
    autoCommit: true,
    workingDir: paths.root,
  });
  const cliExecutor = new CliSkillExecutor(ralph, gitIso, {
    trace, counter, costCalc, breaker, loopDetector: loopDet,
    startSpan: TraceContext.startSpan, endSpan: TraceContext.endSpan,
    recordTokenUsage: SpanLifecycle.recordTokenUsage, setMetadata: SpanLifecycle.setMetadata,
  } as never, undefined, logger);

  // PR creator
  const prCreator = noPr ? undefined : new PrCreator({
    targetBranch: 'main',
    disabled: false,
    remote: 'origin',
  });

  const finalize = async () => {
    TraceContext.endTrace(trace);
    await sqlite.flush(trace);
    if (server) await server.stop();
    sqlite.close();
    for (const e of logger.getLogEntries()) {
      appendFileSync(paths.logFile, e + '\n');
    }
  };

  const deps: BeastLoopDeps = {
    firewall: stubFirewall,
    skills: createStubSkills(paths.plansDir),
    memory: stubMemory,
    planner: stubPlanner,
    observer,
    critique: stubCritique,
    governor: stubGovernor,
    heartbeat: stubHeartbeat,
    logger,
    clock: () => new Date(),
    cliExecutor,
    checkpoint,
    prCreator,
  };

  return { deps, logger, finalize };
}
```

## Test Cases

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import { createCliDeps } from '../../../src/cli/dep-factory.js';

describe('createCliDeps', () => {
  const testDir = resolve(tmpdir(), 'fb-test-dep-factory');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates deps with all required modules', () => {
    const paths = getProjectPaths(testDir);
    const { deps } = createCliDeps({
      paths, baseBranch: 'main', budget: 10,
      provider: 'claude', noPr: false, verbose: false, reset: false,
    });
    expect(deps.firewall).toBeDefined();
    expect(deps.skills).toBeDefined();
    expect(deps.memory).toBeDefined();
    expect(deps.planner).toBeDefined();
    expect(deps.observer).toBeDefined();
    expect(deps.critique).toBeDefined();
    expect(deps.governor).toBeDefined();
    expect(deps.heartbeat).toBeDefined();
    expect(deps.logger).toBeDefined();
    expect(deps.cliExecutor).toBeDefined();
    expect(deps.checkpoint).toBeDefined();
  });

  it('omits prCreator when noPr is true', () => {
    const paths = getProjectPaths(testDir);
    const { deps } = createCliDeps({
      paths, baseBranch: 'main', budget: 10,
      provider: 'claude', noPr: true, verbose: false, reset: false,
    });
    expect(deps.prCreator).toBeUndefined();
  });

  it('provides a finalize function', () => {
    const paths = getProjectPaths(testDir);
    const { finalize } = createCliDeps({
      paths, baseBranch: 'main', budget: 10,
      provider: 'claude', noPr: true, verbose: false, reset: false,
    });
    expect(typeof finalize).toBe('function');
  });

  it('stub firewall passes input through', async () => {
    const paths = getProjectPaths(testDir);
    const { deps } = createCliDeps({
      paths, baseBranch: 'main', budget: 10,
      provider: 'claude', noPr: true, verbose: false, reset: false,
    });
    const result = await deps.firewall.runPipeline('test input');
    expect(result.sanitizedText).toBe('test input');
    expect(result.blocked).toBe(false);
  });

  it('stub critique auto-passes', async () => {
    const paths = getProjectPaths(testDir);
    const { deps } = createCliDeps({
      paths, baseBranch: 'main', budget: 10,
      provider: 'claude', noPr: true, verbose: false, reset: false,
    });
    const result = await deps.critique.reviewPlan({} as never);
    expect(result.verdict).toBe('pass');
  });
});
```

## Success Criteria

- [ ] `createCliDeps()` returns `{ deps, logger, finalize }`
- [ ] `deps` satisfies `BeastLoopDeps` with all 8 module stubs
- [ ] Observer module wires TokenCounter, CostCalculator, CircuitBreaker, LoopDetector
- [ ] CliSkillExecutor is wired with RalphLoop + GitBranchIsolator
- [ ] FileCheckpointStore points to `.frankenbeast/.build/.checkpoint`
- [ ] PrCreator is undefined when `--no-pr`
- [ ] `--reset` clears checkpoint and traces DB
- [ ] `finalize()` flushes traces, stops server, writes log
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/cli/dep-factory.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/cli/dep-factory.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- Import path for franken-observer: use the same relative path pattern as `plan-approach-c/build-runner.ts` (`../../franken-observer/src/index.js`). Adjust based on actual workspace setup.
- Stubs must match the exact interface signatures in `deps.ts` — check return types
- `createStubSkills` must read from `paths.plansDir` (`.frankenbeast/plans/`), not a CLI arg
- Do NOT start the TraceServer in `createCliDeps` — return it and let the caller start it
- The `as never` cast on observer deps for CliSkillExecutor is intentional — same pattern as build-runner
- Use `.js` extensions in all import paths
