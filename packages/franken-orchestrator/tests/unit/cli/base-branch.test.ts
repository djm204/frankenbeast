import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { resolveBaseBranch, detectCurrentBranch } from '../../../src/cli/base-branch.js';

const mockedExecFileSync = vi.mocked(execFileSync);

function mockIO(answers: string[] = []): InterviewIO {
  let idx = 0;
  return {
    ask: vi.fn(async () => answers[idx++] ?? ''),
    display: vi.fn(),
  };
}

describe('detectCurrentBranch', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it('returns a branch name when in a git repo', () => {
    mockedExecFileSync.mockReturnValue('feat/my-feature\n' as never);
    const branch = detectCurrentBranch('/some/repo');
    expect(branch).toBe('feat/my-feature');
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      expect.objectContaining({
        cwd: '/some/repo',
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );
  });

  it('trims whitespace from branch name', () => {
    mockedExecFileSync.mockReturnValue('  main  \n' as never);
    const branch = detectCurrentBranch('/some/repo');
    expect(branch).toBe('main');
  });

  it('returns undefined when git execution throws (non-git directory)', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });
    const branch = detectCurrentBranch('/tmp');
    expect(branch).toBeUndefined();
  });
});

describe('resolveBaseBranch', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it('uses CLI override without prompting', async () => {
    const io = mockIO();
    const result = await resolveBaseBranch('/tmp', 'develop', io);
    expect(result).toBe('develop');
    expect(io.ask).not.toHaveBeenCalled();
    expect(io.display).not.toHaveBeenCalled();
  });

  it('returns main silently when on main', async () => {
    mockedExecFileSync.mockReturnValue('main\n' as never);
    const io = mockIO();
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('main');
    expect(io.ask).not.toHaveBeenCalled();
    expect(io.display).not.toHaveBeenCalled();
  });

  it('returns master silently when on master', async () => {
    mockedExecFileSync.mockReturnValue('master\n' as never);
    const io = mockIO();
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('master');
    expect(io.ask).not.toHaveBeenCalled();
    expect(io.display).not.toHaveBeenCalled();
  });

  it('defaults to main when not in a git repo', async () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });
    const io = mockIO();
    const result = await resolveBaseBranch('/tmp', undefined, io);
    expect(result).toBe('main');
    expect(io.display).toHaveBeenCalledWith(
      expect.stringContaining('Not in a git repository'),
    );
  });

  it('prompts user when on non-main branch', async () => {
    mockedExecFileSync.mockReturnValue('feat/my-feature\n' as never);
    const io = mockIO(['y']);
    await resolveBaseBranch('/some/dir', undefined, io);
    expect(io.ask).toHaveBeenCalledWith(
      expect.stringContaining('feat/my-feature'),
    );
  });

  it('uses current branch when user confirms with "y"', async () => {
    mockedExecFileSync.mockReturnValue('feat/my-feature\n' as never);
    const io = mockIO(['y']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('feat/my-feature');
  });

  it('uses current branch when user confirms with "yes"', async () => {
    mockedExecFileSync.mockReturnValue('develop\n' as never);
    const io = mockIO(['yes']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('develop');
  });

  it('uses current branch when user confirms with "YES" (case-insensitive)', async () => {
    mockedExecFileSync.mockReturnValue('develop\n' as never);
    const io = mockIO(['YES']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('develop');
  });

  it('falls back to main when user answers "n"', async () => {
    mockedExecFileSync.mockReturnValue('feat/my-feature\n' as never);
    const io = mockIO(['n']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('main');
  });

  it('falls back to main when user answers anything else', async () => {
    mockedExecFileSync.mockReturnValue('feat/my-feature\n' as never);
    const io = mockIO(['maybe']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('main');
  });

  it('falls back to main when user answers empty string', async () => {
    mockedExecFileSync.mockReturnValue('feat/my-feature\n' as never);
    const io = mockIO(['']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('main');
  });
});
