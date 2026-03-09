import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLoop } from '../../src/beast-loop.js';
import { FileCheckpointStore } from '../../src/checkpoint/file-checkpoint-store.js';
import { PrCreator } from '../../src/closure/pr-creator.js';
import { ChunkFileGraphBuilder } from '../../src/planning/chunk-file-graph-builder.js';
import { BeastLogger } from '../../src/logging/beast-logger.js';
import { FileChunkSessionStore } from '../../src/session/chunk-session-store.js';
import { ChunkSessionRenderer } from '../../src/session/chunk-session-renderer.js';
import { createChunkSession, createChunkTranscriptEntry } from '../../src/session/chunk-session.js';
import { ClaudeProvider } from '../../src/skills/providers/claude-provider.js';
import { CodexProvider } from '../../src/skills/providers/codex-provider.js';
import type {
  BeastLoopDeps,
  IFirewallModule,
  ISkillsModule,
  IMemoryModule,
  IPlannerModule,
  IObserverModule,
  ICritiqueModule,
  IGovernorModule,
  IHeartbeatModule,
  ILogger,
} from '../../src/deps.js';

/**
 * Passthrough stubs — same implementations the build-runner creates.
 * These satisfy the BeastLoopDeps interfaces with minimal behavior:
 * - firewall: returns input unchanged
 * - memory: returns empty context
 * - planner: throws (graphBuilder used instead)
 * - critique: auto-passes
 * - governor: auto-approves
 * - heartbeat: returns empty pulse
 * - skills: no skills available
 * - observer: no-op
 */

function passthroughFirewall(): IFirewallModule {
  return {
    runPipeline: async (input) => ({ sanitizedText: input, violations: [], blocked: false }),
  };
}

function passthroughMemory(): IMemoryModule {
  return {
    frontload: async () => {},
    getContext: async () => ({ adrs: [], knownErrors: [], rules: [] }),
    recordTrace: async () => {},
  };
}

function passthroughPlanner(): IPlannerModule {
  return {
    createPlan: async () => { throw new Error('Planner not available in CLI mode; use graphBuilder'); },
  };
}

function passthroughCritique(): ICritiqueModule {
  return {
    reviewPlan: async () => ({ verdict: 'pass' as const, findings: [], score: 1.0 }),
  };
}

function passthroughGovernor(): IGovernorModule {
  return {
    requestApproval: async () => ({ decision: 'approved' as const }),
  };
}

function passthroughHeartbeat(): IHeartbeatModule {
  return {
    pulse: async () => ({ improvements: [], techDebt: [], summary: '' }),
  };
}

function passthroughSkills(): ISkillsModule {
  return {
    hasSkill: () => false,
    getAvailableSkills: () => [],
    execute: async () => { throw new Error('No skills in CLI mode'); },
  };
}

function passthroughObserver(): IObserverModule {
  return {
    startTrace: () => {},
    startSpan: () => ({ end: () => {} }),
    getTokenSpend: async () => ({
      inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0,
    }),
  };
}

function testLogger(): ILogger {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function baseDeps(overrides: Partial<BeastLoopDeps> = {}): BeastLoopDeps {
  return {
    firewall: passthroughFirewall(),
    skills: passthroughSkills(),
    memory: passthroughMemory(),
    planner: passthroughPlanner(),
    observer: passthroughObserver(),
    critique: passthroughCritique(),
    governor: passthroughGovernor(),
    heartbeat: passthroughHeartbeat(),
    logger: testLogger(),
    clock: () => new Date('2025-01-15T10:00:00Z'),
    graphBuilder: { build: vi.fn(async () => ({ tasks: [] })) },
    ...overrides,
  };
}

// ── Tests ──

describe('build-runner integration — dep construction wiring', () => {
  describe('passthrough stub behaviors', () => {
    it('firewall returns input unchanged', async () => {
      const fw = passthroughFirewall();
      const result = await fw.runPipeline('hello <script>alert(1)</script>');
      expect(result.sanitizedText).toBe('hello <script>alert(1)</script>');
      expect(result.violations).toEqual([]);
      expect(result.blocked).toBe(false);
    });

    it('planner throws directing to graphBuilder', async () => {
      const planner = passthroughPlanner();
      await expect(planner.createPlan({ goal: 'test' })).rejects.toThrow('graphBuilder');
    });

    it('critique auto-passes with perfect score', async () => {
      const critique = passthroughCritique();
      const result = await critique.reviewPlan({ tasks: [] });
      expect(result.verdict).toBe('pass');
      expect(result.score).toBe(1.0);
      expect(result.findings).toEqual([]);
    });

    it('governor auto-approves all requests', async () => {
      const governor = passthroughGovernor();
      const result = await governor.requestApproval({
        taskId: 'test', summary: 'deploy nukes', requiresHitl: true,
      });
      expect(result.decision).toBe('approved');
    });

    it('heartbeat returns empty pulse', async () => {
      const hb = passthroughHeartbeat();
      const result = await hb.pulse();
      expect(result.improvements).toEqual([]);
      expect(result.techDebt).toEqual([]);
      expect(result.summary).toBe('');
    });

    it('memory returns empty context and no-ops on record', async () => {
      const mem = passthroughMemory();
      await mem.frontload('proj'); // should not throw
      const ctx = await mem.getContext('proj');
      expect(ctx).toEqual({ adrs: [], knownErrors: [], rules: [] });
      await mem.recordTrace({ taskId: 't', summary: 's', outcome: 'success', timestamp: '' });
    });

    it('skills reports no available skills and throws on execute', async () => {
      const skills = passthroughSkills();
      expect(skills.hasSkill('anything')).toBe(false);
      expect(skills.getAvailableSkills()).toEqual([]);
      await expect(
        skills.execute('nope', {
          objective: '', context: { adrs: [], knownErrors: [], rules: [] },
          dependencyOutputs: new Map(), sessionId: '', projectId: '',
        }),
      ).rejects.toThrow('CLI mode');
    });

    it('observer no-ops on all methods', async () => {
      const obs = passthroughObserver();
      obs.startTrace('session-1'); // should not throw
      const span = obs.startSpan('test-span');
      span.end(); // should not throw
      const spend = await obs.getTokenSpend('session-1');
      expect(spend.totalTokens).toBe(0);
      expect(spend.estimatedCostUsd).toBe(0);
    });
  });

  describe('BeastLoop accepts build-runner deps', () => {
    it('runs with passthrough deps and mock graphBuilder', async () => {
      const graphBuilder = {
        build: vi.fn(async () => ({
          tasks: [
            { id: 'task-1', objective: 'test task', requiredSkills: [], dependsOn: [] },
          ],
        })),
      };
      const deps = baseDeps({ graphBuilder });

      const loop = new BeastLoop(deps);
      const result = await loop.run({
        projectId: 'test-project',
        userInput: 'process chunks',
      });

      expect(result.status).toBe('completed');
      expect(result.projectId).toBe('test-project');
      expect(graphBuilder.build).toHaveBeenCalledOnce();
    });

    it('runs with real FileCheckpointStore', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'br-test-'));
      try {
        const checkpoint = new FileCheckpointStore(join(tmpDir, '.checkpoint'));
        const deps = baseDeps({ checkpoint });

        const loop = new BeastLoop(deps);
        const result = await loop.run({ projectId: 'test', userInput: 'test' });

        expect(result.status).toBe('completed');
        // Verify checkpoint is functional
        checkpoint.write('task-1:done');
        expect(checkpoint.has('task-1:done')).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('runs with real PrCreator (disabled)', async () => {
      const prCreator = new PrCreator({
        targetBranch: 'main', disabled: true, remote: 'origin',
      });
      const deps = baseDeps({ prCreator });

      const loop = new BeastLoop(deps);
      const result = await loop.run({ projectId: 'test', userInput: 'test' });

      expect(result.status).toBe('completed');
    });

    it('constructs ChunkFileGraphBuilder with plan directory', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'br-chunks-'));
      try {
        writeFileSync(
          join(tmpDir, '01_test_chunk.md'),
          '# Test\n\n## Verification Command\n\n```bash\necho ok\n```\n',
        );
        const builder = new ChunkFileGraphBuilder(tmpDir);
        const plan = await builder.build({ goal: 'test' });

        expect(plan.tasks.length).toBeGreaterThan(0);
        expect(plan.tasks[0]!.id).toContain('01_test_chunk');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('assembles all optional deps together', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'br-all-'));
      try {
        const deps = baseDeps({
          graphBuilder: {
            build: vi.fn(async () => ({
              tasks: [
                { id: 'task-1', objective: 'first task', requiredSkills: [], dependsOn: [] },
                { id: 'task-2', objective: 'second task', requiredSkills: [], dependsOn: ['task-1'] },
              ],
            })),
          },
          checkpoint: new FileCheckpointStore(join(tmpDir, '.checkpoint')),
          prCreator: new PrCreator({ targetBranch: 'main', disabled: true, remote: 'origin' }),
        });

        const loop = new BeastLoop(deps);
        const result = await loop.run({ projectId: 'frankenbeast', userInput: 'build all' });

        expect(result.status).toBe('completed');
        expect(result.phase).toBe('closure');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.taskResults).toHaveLength(2);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('replays canonical chunk session state when switching providers', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'br-failover-'));
      try {
        const store = new FileChunkSessionStore(join(tmpDir, 'chunk-sessions'));
        const renderer = new ChunkSessionRenderer();
        const session = {
          ...createChunkSession({
            planName: 'demo-plan',
            taskId: 'impl:01_test_chunk',
            chunkId: '01_test_chunk',
            promiseTag: 'IMPL_01_test_chunk_DONE',
            workingDir: tmpDir,
            provider: 'claude',
            maxTokens: 200000,
          }),
          iterations: 2,
          activeProvider: 'claude',
          transcript: [
            createChunkTranscriptEntry('objective', 'Implement chunk'),
            createChunkTranscriptEntry('assistant', 'Existing canonical state'),
          ],
        };
        store.save(session);

        const loaded = store.load('demo-plan', '01_test_chunk');
        const codexRendered = renderer.render(loaded!, new CodexProvider());
        const claudeRendered = renderer.render(loaded!, new ClaudeProvider());

        expect(codexRendered.sessionContinue).toBe(false);
        expect(codexRendered.prompt).toContain('Existing canonical state');
        expect(codexRendered.prompt).toContain('Promise tag: IMPL_01_test_chunk_DONE');
        expect(claudeRendered.sessionContinue).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('BeastLogger wiring', () => {
    it('BeastLogger satisfies ILogger and works with BeastLoop', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const logger = new BeastLogger({ verbose: false });
        const deps = baseDeps({ logger });

        const loop = new BeastLoop(deps);
        const result = await loop.run({ projectId: 'test', userInput: 'test' });

        expect(result.status).toBe('completed');
        // BeastLoop should have called logger.info at least once
        expect(spy).toHaveBeenCalled();
        const calls = spy.mock.calls.map(c => c[0] as string);
        const hasInfo = calls.some(c => c.includes('INFO'));
        expect(hasInfo).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });

    it('BeastLogger captures log entries for file output', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const logger = new BeastLogger({ verbose: true, captureForFile: true });
        const deps = baseDeps({ logger });

        const loop = new BeastLoop(deps);
        await loop.run({ projectId: 'test', userInput: 'test' });

        const entries = logger.getLogEntries();
        expect(entries.length).toBeGreaterThan(0);
        // Entries should be plain text
        for (const entry of entries) {
          expect(entry).not.toContain('\x1b[');
        }
      } finally {
        spy.mockRestore();
      }
    });
  });
});
