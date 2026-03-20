# Chunk 07: Concurrency Limits + Git Worktree Isolation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce `maxConcurrentAgents` limit, create per-agent git worktrees for isolation, scope branch namespaces per agent, and handle cleanup on agent deletion.

**Spec section:** Plan 2, Section 5

---

## Pre-conditions

- Chunk 04 complete (routes mounted in daemon, beast services available)
- Chunk 06 complete (HealthMonitor exists, stale process detection works)

---

## Files

- **Create:** `packages/franken-orchestrator/src/beasts/execution/worktree-isolator.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts` (concurrency limit)
- **Modify:** `packages/franken-orchestrator/src/beasts/repository/sqlite-beast-repository.ts` (add `countRunsByStatus()` query)
- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` (worktree setup before spawn)
- **Modify:** `packages/franken-orchestrator/src/beasts/services/agent-service.ts` (worktree cleanup on delete)
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/execution/worktree-isolator.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/services/concurrency-limit.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts` — 179 lines, `createRun()` at line 33
- `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` — `start()` method
- `packages/franken-orchestrator/src/beasts/services/agent-service.ts` — 119 lines, `softDeleteAgent()` at line ~90
- `packages/franken-orchestrator/src/beasts/types.ts` — `BeastRun`, `BeastProcessSpec`

---

## Current State

No concurrency limits — unlimited agents can be spawned simultaneously. No worktree isolation — all agents run in the same working directory. `GitBranchIsolator` uses a fixed `branchPrefix`, risking branch name collisions between concurrent agents.

---

## Tasks

### Task 1: Concurrency limit in BeastDispatchService

- [ ] **Step 1: Write the failing test — rejects when at concurrency limit**

Create `packages/franken-orchestrator/tests/unit/beasts/services/concurrency-limit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BeastDispatchService } from '../../../../src/beasts/services/beast-dispatch-service.js';

describe('concurrency limit', () => {
  let service: BeastDispatchService;
  let mockRepository: Record<string, ReturnType<typeof vi.fn>>;
  let mockCatalog: Record<string, ReturnType<typeof vi.fn>>;
  let mockExecutors: Record<string, unknown>;
  let mockMetrics: Record<string, ReturnType<typeof vi.fn>>;
  let mockLogs: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockRepository = {
      transaction: vi.fn().mockImplementation((fn: Function) => fn(mockRepository)),
      createRun: vi.fn().mockResolvedValue({ id: 'run_1', status: 'created' }),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      countRunsByStatus: vi.fn().mockResolvedValue(5), // At limit
    };
    mockCatalog = {
      getDefinition: vi.fn().mockReturnValue({
        id: 'martin-loop',
        configSchema: { parse: (v: unknown) => v },
        executionMode: 'process',
      }),
    };
    mockExecutors = { process: { start: vi.fn() } };
    mockMetrics = { recordRunCreated: vi.fn() };
    mockLogs = { append: vi.fn() };
  });

  it('rejects createRun when running count equals maxConcurrentAgents', async () => {
    service = new BeastDispatchService(
      mockRepository as any,
      mockCatalog as any,
      mockExecutors as any,
      mockMetrics as any,
      mockLogs as any,
      { maxConcurrentAgents: 5 },
    );

    await expect(
      service.createRun({
        definitionId: 'martin-loop',
        config: {},
        dispatchedBy: 'cli',
        dispatchedByUser: 'test',
        startNow: true,
      }),
    ).rejects.toThrow(/max concurrent agents/i);
  });

  it('allows createRun when under limit', async () => {
    mockRepository.countRunsByStatus.mockResolvedValue(3); // Under limit

    service = new BeastDispatchService(
      mockRepository as any,
      mockCatalog as any,
      mockExecutors as any,
      mockMetrics as any,
      mockLogs as any,
      { maxConcurrentAgents: 5 },
    );

    // Should not throw
    await service.createRun({
      definitionId: 'martin-loop',
      config: {},
      dispatchedBy: 'cli',
      dispatchedByUser: 'test',
      startNow: true,
    });

    expect(mockRepository.createRun).toHaveBeenCalled();
  });

  it('skips concurrency check when startNow is false', async () => {
    service = new BeastDispatchService(
      mockRepository as any,
      mockCatalog as any,
      mockExecutors as any,
      mockMetrics as any,
      mockLogs as any,
      { maxConcurrentAgents: 5 },
    );

    // countRunsByStatus returns 5 (at limit), but startNow is false → should pass
    await service.createRun({
      definitionId: 'martin-loop',
      config: {},
      dispatchedBy: 'cli',
      dispatchedByUser: 'test',
      startNow: false,
    });

    expect(mockRepository.createRun).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/beasts/services/concurrency-limit.test.ts --reporter=verbose`
Expected: FAIL — constructor doesn't accept options, no concurrency check

- [ ] **Step 3: Add concurrency limit to BeastDispatchService**

In `packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts`:

1. Add `options` parameter to constructor:
   ```typescript
   constructor(
     repository, catalog, executors, metrics, logs,
     private readonly options: { maxConcurrentAgents: number } = { maxConcurrentAgents: 5 },
   )
   ```

2. In `createRun()`, before starting the executor (only when `request.startNow` is true):
   ```typescript
   if (request.startNow) {
     const runningCount = await this.repository.countRunsByStatus('running');
     if (runningCount >= this.options.maxConcurrentAgents) {
       throw new Error(
         `Max concurrent agents reached (${runningCount}/${this.options.maxConcurrentAgents}). ` +
         `Stop a running agent or increase beasts.maxConcurrentAgents in config.`
       );
     }
   }
   ```

3. Add `countRunsByStatus(status: string): Promise<number>` to the repository interface and implement it:
   ```sql
   SELECT COUNT(*) as count FROM beast_runs WHERE status = ?
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/beasts/services/concurrency-limit.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts packages/franken-orchestrator/tests/unit/beasts/services/concurrency-limit.test.ts
git commit -m "feat(orchestrator): enforce maxConcurrentAgents limit in BeastDispatchService"
```

---

### Task 2: WorktreeIsolator — create and cleanup worktrees

- [ ] **Step 1: Write the failing test — creates worktree**

Create `packages/franken-orchestrator/tests/unit/beasts/execution/worktree-isolator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorktreeIsolator } from '../../../../src/beasts/execution/worktree-isolator.js';

describe('WorktreeIsolator', () => {
  let isolator: WorktreeIsolator;
  let mockExec: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    isolator = new WorktreeIsolator({
      projectRoot: '/home/user/project',
      exec: mockExec,
    });
  });

  it('creates a worktree for an agent', async () => {
    const result = await isolator.create('agent_a1');

    expect(mockExec).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', '/home/user/project/.frankenbeast/.worktrees/agent_a1', '-b', 'beast/agent_a1'],
      expect.objectContaining({ cwd: '/home/user/project' }),
    );
    expect(result).toEqual({
      worktreePath: '/home/user/project/.frankenbeast/.worktrees/agent_a1',
      branch: 'beast/agent_a1',
      branchPrefix: 'beast/agent_a1/',
    });
  });

  it('removes a worktree and branch on cleanup', async () => {
    await isolator.remove('agent_a1');

    expect(mockExec).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', '/home/user/project/.frankenbeast/.worktrees/agent_a1', '--force'],
      expect.any(Object),
    );
    expect(mockExec).toHaveBeenCalledWith(
      'git',
      ['branch', '-D', 'beast/agent_a1'],
      expect.any(Object),
    );
  });

  it('returns branchPrefix scoped to agent', async () => {
    const result = await isolator.create('agent_b2');
    expect(result.branchPrefix).toBe('beast/agent_b2/');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/beasts/execution/worktree-isolator.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement WorktreeIsolator**

Create `packages/franken-orchestrator/src/beasts/execution/worktree-isolator.ts`:

```typescript
import { join } from 'node:path';

export interface WorktreeIsolatorOptions {
  projectRoot: string;
  exec: (cmd: string, args: string[], opts: { cwd: string }) => Promise<{ stdout: string; stderr: string }>;
}

export interface WorktreeInfo {
  worktreePath: string;
  branch: string;
  branchPrefix: string;
}

export class WorktreeIsolator {
  private readonly projectRoot: string;
  private readonly exec: WorktreeIsolatorOptions['exec'];

  constructor(options: WorktreeIsolatorOptions) {
    this.projectRoot = options.projectRoot;
    this.exec = options.exec;
  }

  async create(agentId: string): Promise<WorktreeInfo> {
    const worktreePath = this.worktreePath(agentId);
    const branch = `beast/${agentId}`;

    await this.exec(
      'git',
      ['worktree', 'add', worktreePath, '-b', branch],
      { cwd: this.projectRoot },
    );

    return {
      worktreePath,
      branch,
      branchPrefix: `beast/${agentId}/`,
    };
  }

  async remove(agentId: string): Promise<void> {
    const worktreePath = this.worktreePath(agentId);
    const branch = `beast/${agentId}`;

    try {
      await this.exec('git', ['worktree', 'remove', worktreePath, '--force'], { cwd: this.projectRoot });
    } catch {
      // Worktree may already be gone
    }

    try {
      await this.exec('git', ['branch', '-D', branch], { cwd: this.projectRoot });
    } catch {
      // Branch may already be gone
    }
  }

  private worktreePath(agentId: string): string {
    return join(this.projectRoot, '.frankenbeast', '.worktrees', agentId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/beasts/execution/worktree-isolator.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/worktree-isolator.ts packages/franken-orchestrator/tests/unit/beasts/execution/worktree-isolator.test.ts
git commit -m "feat(orchestrator): add WorktreeIsolator for per-agent git isolation"
```

---

### Task 3: Wire worktree into ProcessBeastExecutor.start()

- [ ] **Step 1: Update ProcessBeastExecutor to create worktree before spawn**

In `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`, in the `start()` method:

1. Accept optional `worktreeIsolator` in constructor options:
   ```typescript
   // In ProcessBeastExecutorOptions (from Plan 1):
   worktreeIsolator?: WorktreeIsolator;
   ```

2. Before spawning, create a worktree if isolator is available:
   ```typescript
   let cwd = this.projectRoot;
   let branchPrefix: string | undefined;

   if (this.options.worktreeIsolator) {
     const worktree = await this.options.worktreeIsolator.create(run.trackedAgentId ?? run.id);
     cwd = worktree.worktreePath;
     branchPrefix = worktree.branchPrefix;
   }

   // Set cwd on the BeastProcessSpec
   spec.cwd = cwd;

   // Pass branch prefix via env for GitBranchIsolator
   if (branchPrefix) {
     spec.env = { ...spec.env, FRANKENBEAST_BRANCH_PREFIX: branchPrefix };
   }
   ```

- [ ] **Step 2: Wire worktree cleanup into agent deletion**

In `packages/franken-orchestrator/src/beasts/services/agent-service.ts`, in `softDeleteAgent()`:

1. Accept optional `worktreeIsolator` in constructor. Note: the actual constructor uses `SQLiteBeastRepository` and `now: () => string` (ISO string), not `Date`:
   ```typescript
   constructor(
     private readonly repository: SQLiteBeastRepository,
     private readonly now: () => string = () => new Date().toISOString(),
     private readonly worktreeIsolator?: WorktreeIsolator,
   )
   ```

2. After deleting the agent, clean up its worktree:
   ```typescript
   async softDeleteAgent(agentId: string): Promise<void> {
     // Existing delete logic...
     await this.repository.softDeleteAgent(agentId);

     // Cleanup worktree
     if (this.worktreeIsolator) {
       await this.worktreeIsolator.remove(agentId).catch(() => {});
     }
   }
   ```

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `npx turbo run test --filter=franken-orchestrator`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/src/beasts/services/agent-service.ts
git commit -m "feat(orchestrator): wire worktree creation into executor and cleanup into agent deletion"
```

---

### Task 4: Ensure .frankenbeast/.worktrees/ is in .gitignore

- [ ] **Step 1: Check and update .gitignore**

Verify that `.frankenbeast/.worktrees/` is covered by `.gitignore`. The existing `.frankenbeast/` pattern should cover it, but verify explicitly:

```bash
git check-ignore .frankenbeast/.worktrees/test
```

If not ignored, add `.frankenbeast/.worktrees/` to the root `.gitignore`.

- [ ] **Step 2: Commit if changed**

```bash
git add .gitignore
git commit -m "chore: ensure .frankenbeast/.worktrees/ is gitignored"
```
