import type { SessionToken } from '../core/types.js';
import { randomUUID } from 'node:crypto';

export interface CreateSessionTokenParams {
  readonly approvalId: string;
  readonly scope: string;
  readonly grantedBy: string;
  readonly ttlMs: number;
}

export function assertValidSessionTokenTtl(ttlMs: number): void {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError('Session token ttlMs must be a positive finite number');
  }
}

export function createSessionToken(params: CreateSessionTokenParams): SessionToken {
  assertValidSessionTokenTtl(params.ttlMs);

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
