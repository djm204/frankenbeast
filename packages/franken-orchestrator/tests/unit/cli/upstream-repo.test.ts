import { describe, expect, it } from 'vitest';
import { parseGithubRepoFromRemoteUrl, resolveUpstreamRepo } from '../../../src/cli/upstream-repo.js';

describe('parseGithubRepoFromRemoteUrl', () => {
  it('parses git@github.com remotes', () => {
    expect(parseGithubRepoFromRemoteUrl('git@github.com:owner/repo.git')).toBe('owner/repo');
  });

  it('parses ssh GitHub remotes', () => {
    expect(parseGithubRepoFromRemoteUrl('ssh://git@github.com/owner/repo.git')).toBe('owner/repo');
  });

  it('parses https GitHub remotes', () => {
    expect(parseGithubRepoFromRemoteUrl('https://github.com/owner/repo.git')).toBe('owner/repo');
  });

  it('rejects non-GitHub remotes', () => {
    expect(() => parseGithubRepoFromRemoteUrl('https://gitlab.com/owner/repo.git')).toThrow(/GitHub/i);
  });

  it('rejects malformed remotes', () => {
    expect(() => parseGithubRepoFromRemoteUrl('github.com/owner')).toThrow(/parse/i);
  });
});

describe('resolveUpstreamRepo', () => {
  it('resolves the upstream remote to owner/repo', async () => {
    await expect(resolveUpstreamRepo((file, args, callback) => {
      expect(file).toBe('git');
      expect(args).toEqual(['remote', 'get-url', 'upstream']);
      callback(null, 'git@github.com:owner/repo.git\n', '');
    })).resolves.toBe('owner/repo');
  });

  it('throws a targeted error when upstream is missing', async () => {
    await expect(resolveUpstreamRepo((_file, _args, callback) => {
      callback(new Error('missing upstream'), '', 'error: No such remote \'upstream\'');
    })).rejects.toThrow(/--target-upstream.*upstream/i);
  });
});
