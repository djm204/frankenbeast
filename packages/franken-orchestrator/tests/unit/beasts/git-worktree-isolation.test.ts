import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cleanupAbandonedBeastWorktrees,
  createBeastWorktree,
  parseGitWorktreePorcelain,
  planAbandonedBeastWorktreeCleanup,
} from '../../../src/beasts/execution/git-worktree-isolation.js';
import type { BeastRun } from '../../../src/beasts/types.js';
import type { TrackedAgent } from '../../../src/beasts/agent-types.js';

function trackedAgent(id: string, status: TrackedAgent['status'] = 'idle'): TrackedAgent {
  return {
    id,
    definitionId: 'test-beast',
    source: 'dashboard',
    status,
    createdByUser: 'pfk',
    initAction: { kind: 'martin-loop', command: 'test', config: {} },
    initConfig: {},
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
  };
}

function beastRun(input: Partial<BeastRun> & Pick<BeastRun, 'id' | 'status'>): BeastRun {
  return {
    definitionId: 'test-beast',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: {},
    dispatchedBy: 'dashboard',
    dispatchedByUser: 'pfk',
    createdAt: '2026-03-10T00:00:00.000Z',
    attemptCount: 0,
    ...input,
  };
}

describe('git worktree isolation', () => {
  it('creates an isolated worktree with a deterministic agent branch', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'franken-worktree-isolation-'));
    const runGit = vi.fn((args: readonly string[]): string => {
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true';
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return projectRoot;
      return '';
    });

    const allocation = createBeastWorktree({ enabled: true, projectRoot, runGit }, 'agent:one', projectRoot);

    expect(allocation).toMatchObject({
      agentId: 'agent-one',
      branchName: 'beast/agent-one',
      worktreePath: join(projectRoot, '.frankenbeast', '.worktrees', 'agent-one'),
      created: true,
      branchCreated: true,
    });
    expect(runGit).toHaveBeenCalledWith(
      ['worktree', 'add', '-b', 'beast/agent-one', join(projectRoot, '.frankenbeast', '.worktrees', 'agent-one')],
      projectRoot,
    );
  });

  it('parses git worktree porcelain records with branch refs', () => {
    expect(parseGitWorktreePorcelain([
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo/.frankenbeast/.worktrees/agent-a',
      'HEAD def456',
      'branch refs/heads/beast/agent-a',
      '',
      'worktree /repo/.frankenbeast/.worktrees/detached',
      'detached',
    ].join('\n'))).toEqual([
      { path: '/repo', branch: 'main' },
      { path: '/repo/.frankenbeast/.worktrees/agent-a', branch: 'beast/agent-a' },
      { path: '/repo/.frankenbeast/.worktrees/detached' },
    ]);
  });

  it('plans deterministic cleanup only for abandoned or orphaned beast worktrees', () => {
    const projectRoot = '/repo';
    const worktreesDir = '.frankenbeast/.worktrees';
    const activeAgent = trackedAgent('agent-active', 'running');
    const stoppedAgent = trackedAgent('agent-stopped', 'stopped');
    const deletedAgent = trackedAgent('agent-deleted', 'deleted');
    const runs = [
      beastRun({ id: 'run-active', trackedAgentId: activeAgent.id, status: 'running' }),
      beastRun({ id: 'run-stopped', trackedAgentId: stoppedAgent.id, status: 'stopped', finishedAt: '2026-03-10T00:01:00.000Z' }),
      beastRun({ id: 'run-deleted', trackedAgentId: deletedAgent.id, status: 'failed', finishedAt: '2026-03-10T00:01:00.000Z' }),
    ];
    const worktrees = [
      { path: join(projectRoot, '.frankenbeast', '.worktrees', activeAgent.id), branch: `beast/${activeAgent.id}` },
      { path: join(projectRoot, '.frankenbeast', '.worktrees', stoppedAgent.id), branch: `beast/${stoppedAgent.id}` },
      { path: join(projectRoot, '.frankenbeast', '.worktrees', deletedAgent.id), branch: `beast/${deletedAgent.id}` },
      { path: join(projectRoot, '.frankenbeast', '.worktrees', 'agent-orphan'), branch: 'beast/agent-orphan' },
      { path: join(projectRoot, '.frankenbeast', '.worktrees', 'foreign'), branch: 'feature/foreign' },
      { path: '/tmp/outside', branch: 'beast/outside' },
    ];

    const plan = planAbandonedBeastWorktreeCleanup({
      agents: [activeAgent, stoppedAgent, deletedAgent],
      branchPrefix: 'beast/',
      projectRoot,
      runs,
      worktrees,
      worktreesDir,
    });

    expect(plan.map((entry) => entry.agentId)).toEqual([deletedAgent.id, 'agent-orphan']);
    expect(plan.map((entry) => entry.reason)).toEqual(['agent-deleted', 'orphaned-worktree']);
    expect(plan.map((entry) => entry.branchName)).toEqual([`beast/${deletedAgent.id}`, 'beast/agent-orphan']);
  });

  it('keeps cleanup dry-run by default', () => {
    const projectRoot = '/repo';
    const runGit = vi.fn((args: readonly string[]): string => {
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true';
      if (args[0] === 'worktree' && args[1] === 'list') {
        return [
          'worktree /repo/.frankenbeast/.worktrees/agent-z',
          'HEAD abc',
          'branch refs/heads/beast/agent-z',
          '',
        ].join('\n');
      }
      return '';
    });

    const cleaned = cleanupAbandonedBeastWorktrees({
      agents: [],
      branchPrefix: 'beast/',
      projectRoot,
      runGit,
      runs: [],
      worktreesDir: '.frankenbeast/.worktrees',
    });

    expect(cleaned).toHaveLength(1);
    expect(runGit).not.toHaveBeenCalledWith(['worktree', 'remove', '--force', '/repo/.frankenbeast/.worktrees/agent-z'], projectRoot);
  });

  it('executes the abandoned-worktree cleanup plan in sorted order and deletes owned branches', () => {
    const projectRoot = '/repo';
    const runGit = vi.fn((args: readonly string[]): string => {
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true';
      if (args[0] === 'worktree' && args[1] === 'list') {
        return [
          'worktree /repo/.frankenbeast/.worktrees/agent-z',
          'branch refs/heads/beast/agent-z',
          '',
          'worktree /repo/.frankenbeast/.worktrees/agent-a',
          'branch refs/heads/beast/agent-a',
        ].join('\n');
      }
      if (args[0] === 'branch' && args[1] === '--list') return String(args[2] ?? '');
      return '';
    });

    const result = cleanupAbandonedBeastWorktrees({
      agents: [],
      branchPrefix: 'beast/',
      projectRoot,
      runGit,
      dryRun: false,
      runs: [],
      worktreesDir: '.frankenbeast/.worktrees',
    });

    expect(result.map((entry) => entry.agentId)).toEqual(['agent-a', 'agent-z']);
    expect(runGit).toHaveBeenCalledWith(
      ['worktree', 'remove', '--force', '/repo/.frankenbeast/.worktrees/agent-a'],
      projectRoot,
    );
    expect(runGit).toHaveBeenCalledWith(['branch', '-D', 'beast/agent-a'], projectRoot);
    expect(runGit).toHaveBeenCalledWith(
      ['worktree', 'remove', '--force', '/repo/.frankenbeast/.worktrees/agent-z'],
      projectRoot,
    );
    expect(runGit).toHaveBeenCalledWith(['branch', '-D', 'beast/agent-z'], projectRoot);
  });
});
