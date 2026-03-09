import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface IssueSessionTokenOptions {
  expiresInMs?: number;
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

function encode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signatureFor(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function createSessionTokenSecret(): string {
  return randomBytes(32).toString('hex');
}

export function issueSessionToken(options: IssueSessionTokenOptions): string {
  const expiresAt = Date.now() + (options.expiresInMs ?? 5 * 60 * 1000);
  const payload = `${options.sessionId}.${expiresAt}`;
  const signature = signatureFor(payload, options.secret).toString('base64url');
  return `${encode(payload)}.${signature}`;
}

export function verifySessionToken(options: VerifySessionTokenOptions): boolean {
  const [encodedPayload, encodedSignature] = options.token.split('.');
  if (!encodedPayload || !encodedSignature) {
    return false;
  }

  const payload = decode(encodedPayload);
  const [sessionId, expiresAtRaw] = payload.split('.');
  if (sessionId !== options.sessionId) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const expected = signatureFor(payload, options.secret);
  const received = Buffer.from(encodedSignature, 'base64url');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyChatSocketRequest(options: VerifyChatSocketRequestOptions) {
  const allowedOrigins = options.allowedOrigins ?? [];
  if (allowedOrigins.length > 0) {
    if (!options.origin || !allowedOrigins.includes(options.origin)) {
      return { ok: false as const, status: 403 as const };
    }
  }

  if (!options.token || !verifySessionToken({
    secret: options.secret,
    sessionId: options.sessionId,
    token: options.token,
  })) {
    return { ok: false as const, status: 401 as const };
  }

  return { ok: true as const };
}
