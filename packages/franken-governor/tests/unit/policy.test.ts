import { describe, it, expect } from 'vitest';
import { evaluatePolicy, defaultPolicy } from '../../src/index.js';

describe('policy engine', () => {
  it('allows git-push to a whitelisted remote', () => {
    const decision = evaluatePolicy('git-push', defaultPolicy, { remote: 'origin' });
    expect(decision.allow).toBe(true);
  });

  it('denies git-push to a remote outside the whitelist', () => {
    const decision = evaluatePolicy('git-push', { allowedGitRemotes: ['origin'] }, { remote: 'upstream' });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toContain('not allowed');
  });

  it('fails closed when allowedGitRemotes is not an array', () => {
    // A string whitelist would otherwise degrade .includes into a substring check.
    const decision = evaluatePolicy(
      'git-push',
      { allowedGitRemotes: 'origin' as unknown as readonly string[] },
      { remote: 'gin' },
    );
    expect(decision.allow).toBe(false);
  });

  it('redacts credential-bearing remotes in both allow and deny reasons', () => {
    const remote = 'https://x-access-token:s3cr3t@pass@github.com/org/repo.git';
    const denied = evaluatePolicy('git-push', { allowedGitRemotes: ['origin'] }, { remote });
    const allowed = evaluatePolicy('git-push', { allowedGitRemotes: [remote] }, { remote });
    for (const decision of [denied, allowed]) {
      expect(decision.reason).not.toContain('s3cr3t');
      expect(decision.reason).not.toContain('pass@');
      expect(decision.reason).toContain('//***@github.com');
    }
    expect(denied.allow).toBe(false);
    expect(allowed.allow).toBe(true);
  });

  it('binds whitelisted remote names to expected URLs when allowedGitRemoteUrls is set', () => {
    const config = {
      allowedGitRemotes: ['origin'],
      allowedGitRemoteUrls: ['https://github.com/org/repo.git'],
    };
    expect(evaluatePolicy('git-push', config, { remote: 'origin', remoteUrls: ['https://github.com/org/repo.git'] }).allow).toBe(true);
    // A rewritten .git/config URL for a whitelisted name must be denied.
    expect(evaluatePolicy('git-push', config, { remote: 'origin', remoteUrls: ['ssh://attacker.example/repo.git'] }).allow).toBe(false);
    // Every configured pushurl must be whitelisted, not just the first.
    expect(evaluatePolicy('git-push', config, {
      remote: 'origin',
      remoteUrls: ['https://github.com/org/repo.git', 'ssh://attacker.example/repo.git'],
    }).allow).toBe(false);
    // Missing or empty resolution fails closed.
    expect(evaluatePolicy('git-push', config, { remote: 'origin' }).allow).toBe(false);
    expect(evaluatePolicy('git-push', config, { remote: 'origin', remoteUrls: [] }).allow).toBe(false);
    // Malformed URL whitelist fails closed.
    expect(evaluatePolicy(
      'git-push',
      { allowedGitRemotes: ['origin'], allowedGitRemoteUrls: 'https://github.com/org/repo.git' as unknown as readonly string[] },
      { remote: 'origin', remoteUrls: ['https://github.com/org/repo.git'] },
    ).allow).toBe(false);
  });

  it('redacts credential-bearing values in malformed remoteUrls denial reasons', () => {
    const decision = evaluatePolicy(
      'git-push',
      { allowedGitRemotes: ['origin'], allowedGitRemoteUrls: ['https://github.com/org/repo.git'] },
      { remote: 'origin', remoteUrls: 'https://user:t0k3n@github.com/org/repo.git' },
    );
    expect(decision.allow).toBe(false);
    expect(decision.reason).not.toContain('t0k3n');
    expect(decision.reason).toContain('//***@github.com');
  });

  it('accepts a URL-valued remote listed in allowedGitRemoteUrls without a name match', () => {
    const url = 'https://github.com/org/repo.git';
    const decision = evaluatePolicy(
      'git-push',
      { allowedGitRemotes: ['origin'], allowedGitRemoteUrls: [url] },
      { remote: url, remoteUrls: [url] },
    );
    expect(decision.allow).toBe(true);
  });

  it('denies instead of throwing when the policy config is malformed', () => {
    for (const bad of [null, 'origin', 42, true]) {
      const decision = evaluatePolicy('git-push', bad as never, { remote: 'origin' });
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('Malformed policy config');
    }
  });

  it('denies actions that have no policy rule yet', () => {
    for (const action of ['cron-modify', 'memory-edit', 'cross-profile-write', 'webhook-send'] as const) {
      const decision = evaluatePolicy(action, defaultPolicy);
      expect(decision.allow).toBe(false);
    }
  });
});
