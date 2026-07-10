import type { SessionToken } from '../core/types.js';
import { deterministicUuid, now as deterministicNow } from '@franken/types';

export interface CreateSessionTokenParams {
  readonly approvalId: string;
  readonly scope: string;
  readonly grantedBy: string;
  readonly ttlMs: number;
}

export function createSessionToken(params: CreateSessionTokenParams): SessionToken {
  const now = new Date(deterministicNow());

  return {
    tokenId: deterministicUuid('packages/franken-governor/src/security/session-token.ts'),
    approvalId: params.approvalId,
    scope: params.scope,
    grantedBy: params.grantedBy,
    grantedAt: now,
    expiresAt: new Date(now.getTime() + params.ttlMs),
  };
}
