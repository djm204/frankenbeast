import { TransportSecurityService } from './security/transport-security.js';

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

const SESSION_SCOPE = 'chat-session';
const transportSecurity = new TransportSecurityService();

export function createSessionTokenSecret(): string {
  return transportSecurity.createSecret();
}

export function issueSessionToken(options: IssueSessionTokenOptions): string {
  return transportSecurity.issueSignedToken({
    secret: options.secret,
    subject: options.sessionId,
    scope: SESSION_SCOPE,
    ...(options.expiresInMs !== undefined ? { expiresInMs: options.expiresInMs } : {}),
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
