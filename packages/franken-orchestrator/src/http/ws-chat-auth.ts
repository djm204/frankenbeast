import { TransportSecurityService } from './security/transport-security.js';
import { createHash } from 'node:crypto';
import { now as deterministicNow } from '@franken/types';
export const CHAT_SOCKET_TOKEN_TTL_MS = 5 * 60 * 1000;

export interface IssueSessionTokenOptions {
  expiresInMs: number;
  secret: string;
  sessionId: string;
}

export interface VerifySessionTokenOptions {
  secret: string;
  sessionId: string;
  token: string;
}

export interface VerifyChatSocketRequestOptions {
  allowedOrigins?: string[];
  origin: string | null;
  sessionId: string;
  token: string | null;
  secret: string;
}

const SESSION_SCOPE = 'chat-session';
const transportSecurity = new TransportSecurityService();

function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenExpiresAt(token: string): number | null {
  const [encodedPayload] = token.split('.');
  if (!encodedPayload) {
    return null;
  }
  try {
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const [, , expiresAtRaw] = payload.split('.');
    const expiresAt = Number(expiresAtRaw);
    return Number.isFinite(expiresAt) ? expiresAt : null;
  } catch {
    return null;
  }
}

export class ChatSocketSessionTicketStore {
  private readonly consumed = new Map<string, number>();

  isConsumed(token: string): boolean {
    this.cleanup();
    return this.consumed.has(tokenFingerprint(token));
  }

  consume(token: string): boolean {
    this.cleanup();
    const fingerprint = tokenFingerprint(token);
    if (this.consumed.has(fingerprint)) {
      return false;
    }
    this.consumed.set(fingerprint, tokenExpiresAt(token) ?? deterministicNow() + CHAT_SOCKET_TOKEN_TTL_MS);
    return true;
  }

  private cleanup(): void {
    const now = deterministicNow();
    for (const [fingerprint, expiresAt] of this.consumed) {
      if (expiresAt < now) {
        this.consumed.delete(fingerprint);
      }
    }
  }
}

export function createSessionTokenSecret(): string {
  return transportSecurity.createSecret();
}

export function issueSessionToken(options: IssueSessionTokenOptions): string {
  if (!Number.isFinite(options.expiresInMs) || options.expiresInMs <= 0) {
    throw new Error('expiresInMs must be a positive finite number');
  }

  return transportSecurity.issueSignedToken({
    secret: options.secret,
    subject: options.sessionId,
    scope: SESSION_SCOPE,
    expiresInMs: options.expiresInMs,
  });
}

export function verifySessionToken(options: VerifySessionTokenOptions): boolean {
  return transportSecurity.verifySignedToken({
    secret: options.secret,
    subject: options.sessionId,
    scope: SESSION_SCOPE,
    token: options.token,
  });
}

export function verifyChatSocketRequest(options: VerifyChatSocketRequestOptions) {
  return transportSecurity.verifySocketRequest({
    origin: options.origin,
    subject: options.sessionId,
    scope: SESSION_SCOPE,
    secret: options.secret,
    token: options.token,
    ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
  });
}
