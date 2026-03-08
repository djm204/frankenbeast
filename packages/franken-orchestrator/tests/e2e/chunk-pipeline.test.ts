import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLoop } from '../../src/beast-loop.js';
import type { BeastLoopDeps } from '../../src/deps.js';
import type { BeastInput } from '../../src/types.js';
import { NullLogger } from '../../src/logger.js';
import { CliSkillExecutor } from '../../src/skills/cli-skill-executor.js';
import type { ObserverDeps } from '../../src/skills/cli-skill-executor.js';
import type { MartinLoop } from '../../src/skills/martin-loop.js';
import type { GitBranchIsolator } from '../../src/skills/git-branch-isolator.js';
import { ChunkFileGraphBuilder } from '../../src/planning/chunk-file-graph-builder.js';
import { FileCheckpointStore } from '../../src/checkpoint/file-checkpoint-store.js';
import type { PrCreator } from '../../src/closure/pr-creator.js';
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

describe.skipIf(!process.env['E2E'])('E2E: Chunk Pipeline', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

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

  it('single chunk file flows through BeastLoop with checkpoints and PR', async () => {
    // 1. Create tmp directory with one realistic chunk .md file
    tmpDir = mkdtempSync(join(tmpdir(), 'chunk-pipeline-'));

    const chunkContent = [
      '# Chunk 01: Test Feature',
      '',
      '## Objective',
      '',
      'Implement a test feature that validates the full pipeline.',
      '',
      '## Files',
      '',
      '- **Create**: `src/test-feature.ts`',
      '',
      '## Success Criteria',
      '',
      '- [ ] Feature implemented with tests',
      '- [ ] All tests pass',
      '- [ ] `npx tsc --noEmit` passes',
      '',
      '## Verification Command',
      '',
      '```bash',
      'npx vitest run tests/unit/test-feature.test.ts && npx tsc --noEmit',
      '```',
    ].join('\n');

    writeFileSync(join(tmpDir, '01_test_feature.md'), chunkContent);

    // 2. Create ChunkFileGraphBuilder(tmpDir) — real implementation
    const graphBuilder = new ChunkFileGraphBuilder(tmpDir);

    // 3. Mock MartinLoop — invokes onIteration then returns promise-tagged output
    const mockMartin = {
      run: vi.fn().mockImplementation(async (config: { onIteration?: (i: number, r: unknown) => void }) => {
        // Simulate one iteration with onIteration callback (generates per-commit checkpoint entries)
        config.onIteration?.(1, {
          iteration: 1,
          exitCode: 0,
          stdout: 'Implementation complete\n<promise>IMPL_01_test_feature_DONE</promise>',
          stderr: '',
          durationMs: 100,
          rateLimited: false,
          promiseDetected: true,
          tokensEstimated: 50,
        });
        return {
          completed: true,
          iterations: 1,
          output: 'Implementation complete\n<promise>IMPL_01_test_feature_DONE</promise>',
          tokensUsed: 100,
        };
      }),
    } as unknown as MartinLoop;

    // 4. Mock GitBranchIsolator — simulates branch create, autoCommit, merge
    const mockGit = {
      isolate: vi.fn(),
      merge: vi.fn().mockReturnValue({ merged: true, commits: 1 }),
      autoCommit: vi.fn().mockReturnValue(true),
      getCurrentHead: vi.fn().mockReturnValue('abc123'),
      getStatus: vi.fn().mockReturnValue(''),
      getWorkingDir: vi.fn().mockReturnValue(tmpDir),
    } as unknown as GitBranchIsolator;

    // 5. Create FileCheckpointStore with a real tmp file
    const checkpointPath = join(tmpDir, 'checkpoint.txt');
    const checkpoint = new FileCheckpointStore(checkpointPath);

    // 6. Mock PrCreator — records gh command
    const mockPrCreator = {
      create: vi.fn().mockResolvedValue({ url: 'https://github.com/test/pr/1' }),
    } as unknown as PrCreator;

    // 7. Create CliSkillExecutor with mocked deps
    const observerDeps = createMockObserverDeps();
    const cliExecutor = new CliSkillExecutor(mockMartin, mockGit, observerDeps);

    // Skills registry — must include CLI skill matching the chunk
    const skills = new InMemorySkills([
      { id: 'cli:01_test_feature', name: 'Test Feature', requiresHitl: false, executionType: 'cli' },
    ]);

    const observer = new InMemoryObserver();

    const input: BeastInput = {
      projectId: 'test',
      userInput: 'test',
    };

    // 8. Assemble BeastLoopDeps with graphBuilder (bypasses planner/critique)
    const deps: BeastLoopDeps = {
      firewall: new InMemoryFirewall(),
      skills,
      memory: new InMemoryMemory(),
      planner: new InMemoryPlanner(),
      observer,
      critique: new InMemoryCritique(),
      governor: new InMemoryGovernor(),
      heartbeat: new InMemoryHeartbeat(),
      logger: new NullLogger(),
      graphBuilder,
      prCreator: mockPrCreator,
      cliExecutor,
      clock: () => new Date('2025-01-15T10:00:00Z'),
      checkpoint,
    };

    // 9. Run the full BeastLoop pipeline
    const loop = new BeastLoop(deps);
    const result = await loop.run(input);

    // ── Assertions ──

    // result.status === 'completed'
    expect(result.status).toBe('completed');

    // result.taskResults has 2 entries (impl + harden)
    expect(result.taskResults).toBeDefined();
    expect(result.taskResults).toHaveLength(2);

    // Both tasks have status 'success'
    expect(result.taskResults![0]!.status).toBe('success');
    expect(result.taskResults![1]!.status).toBe('success');

    // Task IDs are correct
    expect(result.taskResults![0]!.taskId).toBe('impl:01_test_feature');
    expect(result.taskResults![1]!.taskId).toBe('harden:01_test_feature');

    // tokenSpend.totalTokens > 0
    expect(result.tokenSpend.totalTokens).toBeGreaterThan(0);

    // Checkpoint file contains milestone entries (per-task done)
    const checkpointData = checkpoint.readAll();
    expect(checkpointData.has('impl:01_test_feature:done')).toBe(true);
    expect(checkpointData.has('harden:01_test_feature:done')).toBe(true);

    // Checkpoint file contains per-commit entries (from onIteration callback)
    const rawCheckpoint = readFileSync(checkpointPath, 'utf-8');
    expect(rawCheckpoint).toContain('impl:01_test_feature:impl:iter_1:commit_abc123');
    expect(rawCheckpoint).toContain('harden:01_test_feature:impl:iter_1:commit_abc123');

    // Verify milestone entries also on disk
    expect(rawCheckpoint).toContain('impl:01_test_feature:done');
    expect(rawCheckpoint).toContain('harden:01_test_feature:done');

    // PrCreator.create() was called with the successful BeastResult
    expect(mockPrCreator.create).toHaveBeenCalledOnce();
    const prCallResult = (mockPrCreator.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(prCallResult.status).toBe('completed');

    // MartinLoop was invoked twice (impl + harden)
    expect(mockMartin.run).toHaveBeenCalledTimes(2);

    // Git isolation: branch created and merged twice
    expect(mockGit.isolate).toHaveBeenCalledTimes(2);
    expect(mockGit.merge).toHaveBeenCalledTimes(2);
    expect(mockGit.isolate).toHaveBeenCalledWith('01_test_feature');
    expect(mockGit.merge).toHaveBeenCalledWith('01_test_feature');

    // Observer tracing: task spans were created
    const taskSpans = observer.spans.filter(s => s.name.startsWith('task:'));
    expect(taskSpans.length).toBe(2);
    expect(taskSpans.every(s => s.endedAt !== undefined)).toBe(true);
  });
});
