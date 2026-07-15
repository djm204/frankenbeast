import { describe, expect, it } from 'vitest';
import {
  checkGitHubTokenCapabilities,
  type GitHubCapabilityExec,
} from '../../../src/closure/github-token-capability-check.js';

function makeExec(headers: string, repoPayload: unknown): GitHubCapabilityExec {
  return (command, args) => {
    if (command !== 'gh') throw new Error(`unexpected command ${command}`);
    if (args.join(' ') === 'api -i /user') {
      return `${headers}\n\n{"login":"octocat"}\n`;
    }
    if (args.join(' ') === 'api repos/djm204/frankenbeast') {
      return `${JSON.stringify(repoPayload)}\n`;
    }
    throw new Error(`unexpected args ${args.join(' ')}`);
  };
}

describe('GitHub token capability check', () => {
  it('reports scoped evidence for repo, issue, PR, and contents capabilities without leaking token values', () => {
    const result = checkGitHubTokenCapabilities({
      repo: 'djm204/frankenbeast',
      exec: makeExec(
        [
          'HTTP/2 200',
          'x-oauth-scopes: repo, workflow',
          'x-accepted-oauth-scopes: user',
        ].join('\n'),
        { permissions: { pull: true, push: true, admin: false, maintain: false, triage: true } },
      ),
      required: {
        repo: 'read',
        issues: 'write',
        pullRequests: 'write',
        contents: 'write',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.repo).toEqual({ available: true, level: 'write', source: 'repository.permissions.push' });
    expect(result.evidence.issues).toEqual({ available: true, level: 'write', source: 'repository.permissions.push' });
    expect(result.evidence.pullRequests).toEqual({ available: true, level: 'write', source: 'repository.permissions.push' });
    expect(result.evidence.contents).toEqual({ available: true, level: 'write', source: 'repository.permissions.push' });
    expect(result.evidence.oauthScopes).toEqual(['repo', 'workflow']);
    expect(JSON.stringify(result)).not.toContain('ghp_should_not_leak');
  });

  it('fails fast when required GitHub capabilities are missing', () => {
    const result = checkGitHubTokenCapabilities({
      repo: 'djm204/frankenbeast',
      exec: makeExec('HTTP/2 200\nx-oauth-scopes: read:org', {
        permissions: { pull: true, push: false, admin: false, maintain: false, triage: false },
      }),
      required: {
        issues: 'write',
        pullRequests: 'write',
        contents: 'write',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-capability', capability: 'issues' }),
      expect.objectContaining({ code: 'missing-capability', capability: 'pullRequests' }),
      expect.objectContaining({ code: 'missing-capability', capability: 'contents' }),
    ]));
  });

  it('can fail low-risk lanes when the token exposes excessive write permissions', () => {
    const result = checkGitHubTokenCapabilities({
      repo: 'djm204/frankenbeast',
      exec: makeExec('HTTP/2 200\nx-oauth-scopes: repo', {
        permissions: { pull: true, push: true, admin: false, maintain: false, triage: true },
      }),
      required: { repo: 'read' },
      lowRiskPolicy: {
        mode: 'fail',
        allowedWriteCapabilities: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'excessive-write-permission', capability: 'contents' }),
      expect.objectContaining({ code: 'excessive-write-permission', capability: 'issues' }),
      expect.objectContaining({ code: 'excessive-write-permission', capability: 'pullRequests' }),
    ]));
  });

  it('turns GitHub API auth failures into sanitized capability issues', () => {
    const exec: GitHubCapabilityExec = (command, args) => {
      if (command === 'gh' && args.join(' ') === 'api -i /user') {
        const error = new Error('Command failed: gh api -i /user') as Error & { stderr: string; status: number };
        error.stderr = 'HTTP 401: Bad credentials for token ghp_should_not_leak';
        error.status = 1;
        throw error;
      }
      throw new Error('unexpected command');
    };

    const result = checkGitHubTokenCapabilities({
      repo: 'djm204/frankenbeast',
      exec,
      required: { repo: 'read' },
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toEqual(expect.objectContaining({ code: 'github-api-unavailable' }));
    expect(JSON.stringify(result)).not.toContain('ghp_should_not_leak');
    expect(JSON.stringify(result)).toContain('<redacted>');
  });
});
