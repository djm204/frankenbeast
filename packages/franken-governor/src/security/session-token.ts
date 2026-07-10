import type { SessionToken } from '../core/types.js';
import { randomUUID } from 'node:crypto';

export interface CreateSessionTokenParams {
  readonly approvalId: string;
  readonly scope: string;
  readonly grantedBy: string;
  readonly ttlMs: number;
}

const MAX_DATE_TIME_MS = 8_640_000_000_000_000;

export function assertValidSessionTokenTtl(ttlMs: number, nowMs: number = Date.now()): void {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError('Session token ttlMs must be a positive finite number');
  }

  const expiresAtMs = nowMs + ttlMs;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs > MAX_DATE_TIME_MS) {
    throw new RangeError('Session token ttlMs must produce a valid expiry date');
  }
}

export function createSessionToken(params: CreateSessionTokenParams): SessionToken {
  const now = new Date();
  assertValidSessionTokenTtl(params.ttlMs, now.getTime());

  return {
    tokenId: randomUUID(),
    approvalId: params.approvalId,
    scope: params.scope,
    grantedBy: params.grantedBy,
    grantedAt: now,
    expiresAt: new Date(now.getTime() + params.ttlMs),
  };
}
