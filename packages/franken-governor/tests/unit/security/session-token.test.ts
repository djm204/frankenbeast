import { describe, it, expect } from 'vitest';
import { createSessionToken } from '../../../src/security/session-token.js';

describe('createSessionToken', () => {
  it('returns a token with correct approvalId and scope', () => {
    const token = createSessionToken({
      approvalId: 'req-001',
      scope: 'deploy-prod',
      grantedBy: 'human',
      ttlMs: 3_600_000,
    });

    expect(token.approvalId).toBe('req-001');
    expect(token.scope).toBe('deploy-prod');
  });

  it('token has expiresAt in the future', () => {
    const token = createSessionToken({
      approvalId: 'req-001',
      scope: 'deploy',
      grantedBy: 'human',
      ttlMs: 3_600_000,
    });

    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('tokenId is unique per call', () => {
    const t1 = createSessionToken({ approvalId: 'a', scope: 's', grantedBy: 'h', ttlMs: 1000 });
    const t2 = createSessionToken({ approvalId: 'a', scope: 's', grantedBy: 'h', ttlMs: 1000 });
    expect(t1.tokenId).not.toBe(t2.tokenId);
  });

  it('sets grantedBy from params', () => {
    const token = createSessionToken({
      approvalId: 'req-001',
      scope: 'deploy',
      grantedBy: 'alice',
      ttlMs: 1000,
    });

    expect(token.grantedBy).toBe('alice');
  });
});
