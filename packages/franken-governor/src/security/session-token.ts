import { randomUUID } from 'node:crypto';
import type { SessionToken } from '../core/types.js';

export interface CreateSessionTokenParams {
  readonly approvalId: string;
  readonly scope: string;
  readonly grantedBy: string;
  readonly ttlMs: number;
}

export function createSessionToken(params: CreateSessionTokenParams): SessionToken {
  const now = new Date();

  return {
    tokenId: randomUUID(),
    approvalId: params.approvalId,
    scope: params.scope,
    grantedBy: params.grantedBy,
    grantedAt: now,
    expiresAt: new Date(now.getTime() + params.ttlMs),
  };
}
