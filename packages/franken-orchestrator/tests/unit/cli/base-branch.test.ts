import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { resolveBaseBranch, detectCurrentBranch } from '../../../src/cli/base-branch.js';

const mockedExecSync = vi.mocked(execSync);

function mockIO(answers: string[] = []): InterviewIO {
  let idx = 0;
  return {
    ask: vi.fn(async () => answers[idx++] ?? ''),
    display: vi.fn(),
  };
}

describe('detectCurrentBranch', () => {
  beforeEach(() => {
    mockedExecSync.mockReset();
  });

  it('returns a branch name when in a git repo', () => {
    mockedExecSync.mockReturnValue('feat/my-feature\n');
    const branch = detectCurrentBranch('/some/repo');
    expect(branch).toBe('feat/my-feature');
    expect(mockedExecSync).toHaveBeenCalledWith(
      'git rev-parse --abbrev-ref HEAD',
      expect.objectContaining({
        cwd: '/some/repo',
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );
  });

  it('trims whitespace from branch name', () => {
    mockedExecSync.mockReturnValue('  main  \n');
    const branch = detectCurrentBranch('/some/repo');
    expect(branch).toBe('main');
  });

  it('returns undefined when execSync throws (non-git directory)', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });
    const branch = detectCurrentBranch('/tmp');
    expect(branch).toBeUndefined();
  });
});

describe('resolveBaseBranch', () => {
  beforeEach(() => {
    mockedExecSync.mockReset();
  });

  it('uses CLI override without prompting', async () => {
    const io = mockIO();
    const result = await resolveBaseBranch('/tmp', 'develop', io);
    expect(result).toBe('develop');
    expect(io.ask).not.toHaveBeenCalled();
    expect(io.display).not.toHaveBeenCalled();
  });

  it('returns main silently when on main', async () => {
    mockedExecSync.mockReturnValue('main\n');
    const io = mockIO();
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('main');
    expect(io.ask).not.toHaveBeenCalled();
    expect(io.display).not.toHaveBeenCalled();
  });

  it('returns master silently when on master', async () => {
    mockedExecSync.mockReturnValue('master\n');
    const io = mockIO();
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('master');
    expect(io.ask).not.toHaveBeenCalled();
    expect(io.display).not.toHaveBeenCalled();
  });

  it('defaults to main when not in a git repo', async () => {
    mockedExecSync.mockImplementation(() => {
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
    mockedExecSync.mockReturnValue('feat/my-feature\n');
    const io = mockIO(['y']);
    await resolveBaseBranch('/some/dir', undefined, io);
    expect(io.ask).toHaveBeenCalledWith(
      expect.stringContaining('feat/my-feature'),
    );
  });

  it('uses current branch when user confirms with "y"', async () => {
    mockedExecSync.mockReturnValue('feat/my-feature\n');
    const io = mockIO(['y']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('feat/my-feature');
  });

  it('uses current branch when user confirms with "yes"', async () => {
    mockedExecSync.mockReturnValue('develop\n');
    const io = mockIO(['yes']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('develop');
  });

  it('uses current branch when user confirms with "YES" (case-insensitive)', async () => {
    mockedExecSync.mockReturnValue('develop\n');
    const io = mockIO(['YES']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('develop');
  });

  it('falls back to main when user answers "n"', async () => {
    mockedExecSync.mockReturnValue('feat/my-feature\n');
    const io = mockIO(['n']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('main');
  });

  it('falls back to main when user answers anything else', async () => {
    mockedExecSync.mockReturnValue('feat/my-feature\n');
    const io = mockIO(['maybe']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('main');
  });

  it('falls back to main when user answers empty string', async () => {
    mockedExecSync.mockReturnValue('feat/my-feature\n');
    const io = mockIO(['']);
    const result = await resolveBaseBranch('/some/dir', undefined, io);
    expect(result).toBe('main');
  });
});
