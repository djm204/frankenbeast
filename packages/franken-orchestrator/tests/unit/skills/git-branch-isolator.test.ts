import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitIsolationConfig } from '../../../src/skills/cli-types.js';

const { execCompatMock } = vi.hoisted(() => ({
  execCompatMock: vi.fn(),
}));

function renderGitArg(arg: string): string {
  if (/[\s"]/u.test(arg)) {
    return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return arg;
}

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((bin: string, args: readonly string[], opts?: Record<string, unknown>) =>
    execCompatMock(`${bin} ${args.map(renderGitArg).join(' ')}`, opts),
  ),
}));

import { execFileSync } from 'node:child_process';
import { GitBranchIsolator, parseDirtySubmodules, detectAffectedPackages, buildCommitScope } from '../../../src/skills/git-branch-isolator.js';

const mockExecFileSync = execFileSync as unknown as ReturnType<typeof vi.fn>;
const mockExecSync = execCompatMock;

function expectGit(args: string[], cwd = '/fake/repo'): void {
  expect(mockExecFileSync).toHaveBeenCalledWith(
    'git',
    args,
    expect.objectContaining({ cwd, encoding: 'utf-8' }),
  );
}

function makeConfig(overrides?: Partial<GitIsolationConfig>): GitIsolationConfig {
  return {
    baseBranch: 'main',
    branchPrefix: 'chunk/',
    autoCommit: true,
    workingDir: '/fake/repo',
    ...overrides,
  };
}

describe('GitBranchIsolator', () => {
  let isolator: GitBranchIsolator;

  beforeEach(() => {
    vi.resetAllMocks();
    mockExecSync.mockReturnValue('');
    isolator = new GitBranchIsolator(makeConfig());
  });

  describe('isolate()', () => {
    it('creates a new branch from baseBranch and checks it out', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git branch --list main') return '  main\n';
        if (cmd === 'git branch --list chunk/03_my_chunk') return '';
        return '';
      });
      isolator.isolate('03_my_chunk');

      expectGit(['branch', '--list', 'main']);
      expectGit(['checkout', 'main']);
      expectGit(['branch', '--list', 'chunk/03_my_chunk']);
      expectGit(['checkout', '-b', 'chunk/03_my_chunk']);
    });

    it('recovers from dirty index (leftover merge) and retries checkout', () => {
      let checkoutAttempts = 0;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git branch --list main') return '  main\n';
        if (cmd === 'git checkout main') {
          checkoutAttempts++;
          if (checkoutAttempts === 1) {
            throw new Error('error: you need to resolve your current index first');
          }
          return '';
        }
        if (cmd === 'git merge --abort') return '';
        if (cmd === 'git branch --list chunk/03_my_chunk') return '';
        return '';
      });

      isolator.isolate('03_my_chunk');

      expect(checkoutAttempts).toBe(2);
      expectGit(['merge', '--abort']);
    });

    it('creates baseBranch from current HEAD when it does not exist', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git branch --list feat/monorepo-migration') return '';
        if (cmd === 'git branch --list chunk/03_my_chunk') return '';
        return '';
      });

      const iso = new GitBranchIsolator(makeConfig({ baseBranch: 'feat/monorepo-migration' }));
      iso.isolate('03_my_chunk');

      expectGit(['checkout', '-b', 'feat/monorepo-migration']);
      expectGit(['checkout', '-b', 'chunk/03_my_chunk']);
    });

    it('checks out existing baseBranch when it already exists', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git branch --list main') return '  main\n';
        if (cmd === 'git branch --list chunk/03_my_chunk') return '';
        return '';
      });
      isolator.isolate('03_my_chunk');

      expectGit(['checkout', 'main']);
    });

    it('checks out existing branch when it already exists', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git branch --list main') return '  main\n';
        if (cmd === 'git branch --list chunk/03_my_chunk') return '  chunk/03_my_chunk\n';
        return '';
      });

      isolator.isolate('03_my_chunk');

      expectGit(['checkout', 'chunk/03_my_chunk']);
      expect(mockExecFileSync).not.toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'chunk/03_my_chunk'],
        expect.anything(),
      );
    });
  });

  describe('autoCommit()', () => {
    it('commits dirty files and returns true', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git status --porcelain') return ' M src/foo.ts\n';
        if (cmd === 'git diff --cached --name-only') return 'src/foo.ts';
        return '';
      });

      const committed = isolator.autoCommit('03_my_chunk', 'impl', 2);

      expect(committed).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        'git add -A',
        expect.objectContaining({ cwd: '/fake/repo' }),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'git commit -m "auto: impl 03_my_chunk iter 2"',
        expect.objectContaining({ cwd: '/fake/repo' }),
      );
    });

    it('returns false with clean working tree (no-op)', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git status --porcelain') return '';
        return '';
      });

      const committed = isolator.autoCommit('03_my_chunk', 'impl', 1);

      expect(committed).toBe(false);
    });

    it('returns false on commit failure without throwing', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git status --porcelain') return ' M file.ts\n';
        if (cmd === 'git add -A') return '';
        if (cmd.startsWith('git commit')) throw new Error('commit failed');
        return '';
      });

      const committed = isolator.autoCommit('03_my_chunk', 'impl', 1);

      expect(committed).toBe(false);
    });
  });

  describe('merge()', () => {
    it('merges chunk branch back to baseBranch and returns commit count', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '3\n';
        return '';
      });

      const result = isolator.merge('03_my_chunk');

      expect(result).toEqual({ merged: true, commits: 3 });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git checkout main',
        expect.objectContaining({ cwd: '/fake/repo' }),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'git merge chunk/03_my_chunk --no-edit',
        expect.objectContaining({ cwd: '/fake/repo' }),
      );
    });

    it('skips merge for empty branches (0 commits)', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '0\n';
        return '';
      });

      const result = isolator.merge('03_my_chunk');

      expect(result).toEqual({ merged: false, commits: 0 });
    });

    it('returns conflicted state on merge conflict instead of aborting', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '2\n';
        if (cmd === 'git checkout main') return '';
        if (cmd === 'git merge chunk/03_my_chunk --no-edit') {
          throw new Error('CONFLICT (content): Merge conflict');
        }
        if (cmd === 'git diff --name-only --diff-filter=U') return 'file.ts\n';
        return '';
      });

      const result = isolator.merge('03_my_chunk');

      expect(result.merged).toBe(false);
      expect(result.commits).toBe(2);
      expect(result.conflicted).toBe(true);
    });

    it('uses squash merge when commitMessage is provided', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '3\n';
        return '';
      });

      const result = isolator.merge('03_my_chunk', 'feat(types): add shared type definitions');

      expect(result).toEqual({ merged: true, commits: 3 });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git merge --squash chunk/03_my_chunk',
        expect.objectContaining({ cwd: '/fake/repo' }),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'git commit -m "feat(types): add shared type definitions"',
        expect.objectContaining({ cwd: '/fake/repo' }),
      );
    });

    it('falls back to regular merge when no commitMessage provided', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '3\n';
        return '';
      });

      const result = isolator.merge('03_my_chunk');

      expect(result).toEqual({ merged: true, commits: 3 });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git merge chunk/03_my_chunk --no-edit',
        expect.objectContaining({ cwd: '/fake/repo' }),
      );
    });

    it('returns conflicted state on squash merge conflict', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '2\n';
        if (cmd === 'git checkout main') return '';
        if (cmd === 'git merge --squash chunk/03_my_chunk') {
          throw new Error('CONFLICT');
        }
        if (cmd === 'git diff --name-only --diff-filter=U') return 'src/types.ts\n';
        return '';
      });

      const result = isolator.merge('03_my_chunk', 'feat(types): add types');

      expect(result.merged).toBe(false);
      expect(result.commits).toBe(2);
      expect(result.conflicted).toBe(true);
      expect(result.conflictFiles).toEqual(['src/types.ts']);
    });

    it('sanitizes commitMessage to prevent shell injection', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.startsWith('git rev-list')) return '1\n';
        return '';
      });

      isolator.merge('03_my_chunk', 'feat(types): add "shared" types');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('feat(types): add \\"shared\\" types'),
        expect.objectContaining({ cwd: '/fake/repo' }),
      );
    });
  });

  describe('hasMeaningfulChange()', () => {
    it('returns true when working tree is dirty', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git status --porcelain') return ' M changed.ts\n';
        if (cmd === 'git rev-parse HEAD') return 'abc123';
        return '';
      });

      expect(isolator.hasMeaningfulChange('abc123')).toBe(true);
    });

    it('returns true when HEAD has advanced past previousHead', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git status --porcelain') return '';
        if (cmd === 'git rev-parse HEAD') return 'def456';
        return '';
      });

      expect(isolator.hasMeaningfulChange('abc123')).toBe(true);
    });

    it('returns false when clean and HEAD unchanged', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git status --porcelain') return '';
        if (cmd === 'git rev-parse HEAD') return 'abc123';
        return '';
      });

      expect(isolator.hasMeaningfulChange('abc123')).toBe(false);
    });
  });

  describe('getCurrentHead()', () => {
    it('returns the current HEAD commit hash', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-parse HEAD') return '  abc123def456  \n';
        return '';
      });

      expect(isolator.getCurrentHead()).toBe('abc123def456');
    });
  });

  describe('getDiffStat()', () => {
    it('returns diff stat between base branch and chunk branch', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git diff --stat main..chunk/03_my_chunk') {
          return ' src/foo.ts | 10 +++\n 1 file changed\n';
        }
        return '';
      });

      expect(isolator.getDiffStat('03_my_chunk')).toBe('src/foo.ts | 10 +++\n 1 file changed');
    });
  });

  describe('merge() with conflict resolution', () => {
    it('returns conflicted state with file list when merge has conflicts', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '2\n';
        if (cmd === 'git checkout main') return '';
        if (cmd === 'git merge chunk/03_my_chunk --no-edit') {
          throw new Error('CONFLICT (content): Merge conflict in docs/ARCHITECTURE.md');
        }
        if (cmd === 'git diff --name-only --diff-filter=U') return 'docs/ARCHITECTURE.md\n';
        return '';
      });

      const result = isolator.merge('03_my_chunk');

      expect(result.merged).toBe(false);
      expect(result.commits).toBe(2);
      expect(result.conflicted).toBe(true);
      expect(result.conflictFiles).toEqual(['docs/ARCHITECTURE.md']);
      // Should NOT have called merge --abort (leave conflicts for resolution)
      expect(mockExecSync).not.toHaveBeenCalledWith(
        'git merge --abort',
        expect.anything(),
      );
    });

    it('returns conflicted with multiple files', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '3\n';
        if (cmd === 'git checkout main') return '';
        if (cmd === 'git merge chunk/03_my_chunk --no-edit') {
          throw new Error('CONFLICT');
        }
        if (cmd === 'git diff --name-only --diff-filter=U') {
          return 'docs/ARCHITECTURE.md\nsrc/cli/run.ts\n';
        }
        return '';
      });

      const result = isolator.merge('03_my_chunk');

      expect(result.conflicted).toBe(true);
      expect(result.conflictFiles).toEqual(['docs/ARCHITECTURE.md', 'src/cli/run.ts']);
    });

    it('falls back to abort when conflict detection finds no files (non-conflict error)', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '2\n';
        if (cmd === 'git checkout main') return '';
        if (cmd === 'git merge chunk/03_my_chunk --no-edit') {
          throw new Error('fatal: some other git error');
        }
        if (cmd === 'git diff --name-only --diff-filter=U') return '';
        return '';
      });

      const result = isolator.merge('03_my_chunk');

      expect(result.merged).toBe(false);
      expect(result.conflicted).toBeUndefined();
      expect(mockExecSync).toHaveBeenCalledWith(
        'git merge --abort',
        expect.anything(),
      );
    });
  });

  describe('getConflictedFiles()', () => {
    it('returns list of files with unresolved conflicts', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git diff --name-only --diff-filter=U') {
          return 'docs/ARCHITECTURE.md\nsrc/foo.ts\n';
        }
        return '';
      });

      expect(isolator.getConflictedFiles()).toEqual(['docs/ARCHITECTURE.md', 'src/foo.ts']);
    });

    it('returns empty array when no conflicts', () => {
      mockExecSync.mockReturnValue('');
      expect(isolator.getConflictedFiles()).toEqual([]);
    });
  });

  describe('getConflictDiff()', () => {
    it('returns the diff showing conflict markers', () => {
      const conflictDiff = '<<<<<<< HEAD\nMartinLoop\n=======\nRalphLoop\n>>>>>>> feat/06\n';
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git diff') return conflictDiff;
        return '';
      });

      expect(isolator.getConflictDiff()).toBe(conflictDiff.trim());
    });
  });

  describe('completeMerge()', () => {
    it('stages all files and commits with provided message', () => {
      const calls: string[] = [];
      mockExecSync.mockImplementation((cmd: string) => {
        calls.push(cmd);
        return '';
      });

      isolator.completeMerge('feat: merge chunk 03');

      expect(calls).toContain('git add -A');
      expect(calls).toContain('git commit -m "feat: merge chunk 03"');
    });

    it('sanitizes commit message', () => {
      mockExecSync.mockReturnValue('');
      isolator.completeMerge('feat: add "shared" types');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('feat: add \\"shared\\" types'),
        expect.anything(),
      );
    });
  });

  describe('abortMerge()', () => {
    it('aborts the merge', () => {
      mockExecSync.mockReturnValue('');
      isolator.abortMerge();

      expect(mockExecSync).toHaveBeenCalledWith(
        'git merge --abort',
        expect.anything(),
      );
    });

    it('falls back to reset --hard HEAD when abort fails', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git merge --abort') throw new Error('MERGE_HEAD missing');
        return '';
      });

      isolator.abortMerge();

      expect(mockExecSync).toHaveBeenCalledWith(
        'git reset --hard HEAD',
        expect.anything(),
      );
    });
  });

  describe('shell safety', () => {
    it('rejects chunkIds with shell-unsafe characters', () => {
      expect(() => isolator.isolate('chunk; rm -rf /')).toThrow();
      expect(() => isolator.autoCommit('chunk$(evil)', 'impl', 1)).toThrow();
      expect(() => isolator.merge('chunk`whoami`')).toThrow();
    });
  });

  describe('autoCommit() submodule awareness', () => {
    it('commits inside dirty submodules before root commit', () => {
      const calls: Array<{ cmd: string; cwd: string }> = [];
      mockExecSync.mockImplementation((cmd: string, opts?: Record<string, unknown>) => {
        const cwd = (opts?.cwd as string) ?? '?';
        calls.push({ cmd, cwd });
        if (cmd === 'git status --porcelain') return ' m franken-orchestrator\n';
        return '';
      });

      isolator.autoCommit('03_my_chunk', 'impl', 1);

      // Should have committed inside the submodule first
      const subAdd = calls.find(c => c.cmd === 'git add -A' && c.cwd.includes('franken-orchestrator'));
      const subCommit = calls.find(c => c.cmd.startsWith('git commit') && c.cwd.includes('franken-orchestrator'));
      expect(subAdd).toBeDefined();
      expect(subCommit).toBeDefined();

      // Then root repo commit
      const rootAdd = calls.find(c => c.cmd === 'git add -A' && c.cwd === '/fake/repo');
      const rootCommit = calls.find(c => c.cmd.startsWith('git commit -m') && c.cwd === '/fake/repo');
      expect(rootAdd).toBeDefined();
      expect(rootCommit).toBeDefined();

      // Submodule commits happen before root commits
      const subAddIdx = calls.indexOf(subAdd!);
      const rootAddIdx = calls.indexOf(rootAdd!);
      expect(subAddIdx).toBeLessThan(rootAddIdx);
    });

    it('handles multiple dirty submodules', () => {
      const subCwds: string[] = [];
      mockExecSync.mockImplementation((cmd: string, opts?: Record<string, unknown>) => {
        const cwd = (opts?.cwd as string) ?? '';
        if (cmd === 'git add -A' && cwd !== '/fake/repo') {
          subCwds.push(cwd);
        }
        if (cmd === 'git status --porcelain') {
          return ' m franken-orchestrator\n m franken-types\n';
        }
        return '';
      });

      isolator.autoCommit('03_my_chunk', 'impl', 1);

      expect(subCwds).toContain('/fake/repo/franken-orchestrator');
      expect(subCwds).toContain('/fake/repo/franken-types');
    });

    it('skips submodule commit when submodule has nothing to commit', () => {
      mockExecSync.mockImplementation((cmd: string, opts?: { cwd?: string }) => {
        if (cmd === 'git status --porcelain') return ' m franken-orchestrator\n';
        if (cmd.startsWith('git commit') && opts?.cwd?.includes('franken-orchestrator')) {
          throw new Error('nothing to commit');
        }
        return '';
      });

      // Should not throw — submodule failure is caught
      const result = isolator.autoCommit('03_my_chunk', 'impl', 1);
      expect(result).toBe(true);
    });

    it('does not attempt submodule commits when status has no submodule lines', () => {
      const calls: string[] = [];
      mockExecSync.mockImplementation((cmd: string, opts?: { cwd?: string }) => {
        calls.push(`${cmd} @ ${opts?.cwd ?? '?'}`);
        if (cmd === 'git status --porcelain') return ' M src/foo.ts\n';
        return '';
      });

      isolator.autoCommit('03_my_chunk', 'impl', 1);

      // No calls to submodule directories
      const subCalls = calls.filter(c => !c.endsWith('@ /fake/repo') && !c.endsWith('@ ?'));
      expect(subCalls).toEqual([]);
    });
  });
});

describe('parseDirtySubmodules()', () => {
  it('extracts submodule paths from porcelain output', () => {
    const status = ' m franken-orchestrator\n M README.md\n?? new-file.ts\n';
    expect(parseDirtySubmodules(status)).toEqual(['franken-orchestrator']);
  });

  it('returns empty array when no dirty submodules', () => {
    expect(parseDirtySubmodules(' M src/foo.ts\n')).toEqual([]);
    expect(parseDirtySubmodules('')).toEqual([]);
  });

  it('handles multiple dirty submodules', () => {
    const status = ' m franken-orchestrator\n m franken-types\n M file.ts\n';
    expect(parseDirtySubmodules(status)).toEqual(['franken-orchestrator', 'franken-types']);
  });

  it('handles trimmed output where first line loses leading space', () => {
    // this.git() calls .trim() which strips the leading space from the first line
    const trimmed = 'm franken-orchestrator\n m franken-types';
    expect(parseDirtySubmodules(trimmed)).toEqual(['franken-orchestrator', 'franken-types']);
  });

  it('does not match regular modified files (capital M)', () => {
    expect(parseDirtySubmodules('M  src/foo.ts\n')).toEqual([]);
    expect(parseDirtySubmodules(' M src/foo.ts\n')).toEqual([]);
  });
});

describe('detectAffectedPackages()', () => {
  it('extracts package names from file paths', () => {
    const files = [
      'packages/franken-brain/src/index.ts',
      'packages/franken-brain/src/store.ts',
      'packages/franken-types/src/types.ts',
    ];
    expect(detectAffectedPackages(files)).toEqual(['franken-brain', 'franken-types']);
  });

  it('returns empty array for root-only changes', () => {
    const files = ['CLAUDE.md', '.gitignore', 'docs/ARCHITECTURE.md'];
    expect(detectAffectedPackages(files)).toEqual([]);
  });

  it('deduplicates packages', () => {
    const files = [
      'packages/franken-brain/src/a.ts',
      'packages/franken-brain/src/b.ts',
      'packages/franken-brain/tests/a.test.ts',
    ];
    expect(detectAffectedPackages(files)).toEqual(['franken-brain']);
  });

  it('sorts package names alphabetically', () => {
    const files = [
      'packages/frankenfirewall/src/index.ts',
      'packages/franken-brain/src/index.ts',
      'packages/franken-mcp/src/index.ts',
    ];
    expect(detectAffectedPackages(files)).toEqual(['franken-brain', 'franken-mcp', 'frankenfirewall']);
  });

  it('handles mixed root and package files', () => {
    const files = [
      'CLAUDE.md',
      'packages/franken-orchestrator/src/cli/run.ts',
    ];
    expect(detectAffectedPackages(files)).toEqual(['franken-orchestrator']);
  });
});

describe('buildCommitScope()', () => {
  it('returns empty string for no packages', () => {
    expect(buildCommitScope([])).toBe('');
  });

  it('returns single package scope', () => {
    expect(buildCommitScope(['franken-brain'])).toBe('(franken-brain)');
  });

  it('returns comma-separated for 2-3 packages', () => {
    expect(buildCommitScope(['franken-brain', 'franken-types'])).toBe('(franken-brain,franken-types)');
    expect(buildCommitScope(['a', 'b', 'c'])).toBe('(a,b,c)');
  });

  it('returns count for 4+ packages', () => {
    expect(buildCommitScope(['a', 'b', 'c', 'd'])).toBe('(4-packages)');
    expect(buildCommitScope(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('(6-packages)');
  });
});

describe('autoCommit() scoped messages', () => {
  let isolator: GitBranchIsolator;

  beforeEach(() => {
    vi.resetAllMocks();
    mockExecSync.mockReturnValue('');
    isolator = new GitBranchIsolator(makeConfig());
  });

  it('includes package scope in commit message for single-package changes', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git status --porcelain') return ' M packages/franken-brain/src/index.ts\n';
      if (cmd === 'git diff --cached --name-only') return 'packages/franken-brain/src/index.ts';
      return '';
    });

    isolator.autoCommit('03_chunk', 'impl', 1);

    expect(mockExecSync).toHaveBeenCalledWith(
      'git commit -m "auto(franken-brain): impl 03_chunk iter 1"',
      expect.objectContaining({ cwd: '/fake/repo' }),
    );
  });

  it('includes multi-package scope for changes across packages', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git status --porcelain') return ' M packages/franken-brain/src/a.ts\n M packages/franken-types/src/b.ts\n';
      if (cmd === 'git diff --cached --name-only') return 'packages/franken-brain/src/a.ts\npackages/franken-types/src/b.ts';
      return '';
    });

    isolator.autoCommit('03_chunk', 'impl', 1);

    expect(mockExecSync).toHaveBeenCalledWith(
      'git commit -m "auto(franken-brain,franken-types): impl 03_chunk iter 1"',
      expect.objectContaining({ cwd: '/fake/repo' }),
    );
  });

  it('omits scope for root-only changes', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git status --porcelain') return ' M CLAUDE.md\n';
      if (cmd === 'git diff --cached --name-only') return 'CLAUDE.md';
      return '';
    });

    isolator.autoCommit('03_chunk', 'impl', 1);

    expect(mockExecSync).toHaveBeenCalledWith(
      'git commit -m "auto: impl 03_chunk iter 1"',
      expect.objectContaining({ cwd: '/fake/repo' }),
    );
  });
});
