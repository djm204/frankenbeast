import type { SessionToken } from '../core/types.js';

export class SessionTokenStore {
  private readonly tokens = new Map<string, SessionToken>();

  store(token: SessionToken): void {
    this.tokens.set(token.tokenId, token);
  }

  get(tokenId: string): SessionToken | undefined {
    const token = this.tokens.get(tokenId);
    if (token === undefined) return undefined;

    if (this.isExpired(token)) {
      this.tokens.delete(tokenId);
      return undefined;
    }

    return token;
  }

  revoke(tokenId: string): void {
    this.tokens.delete(tokenId);
  }

  isValid(tokenId: string): boolean {
    return this.get(tokenId) !== undefined;
  }

  private isExpired(token: SessionToken): boolean {
    return Date.now() >= token.expiresAt.getTime();
  }
}
